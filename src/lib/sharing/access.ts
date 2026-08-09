"use client";

/*
 * access — SISTEMA UNIVERSAL DE PERMISOS Y COMPARTICIÓN (Adenda 63 §5).
 * Un ÚNICO modelo para escritorios, dashboards, pizarras, cerebros y
 * archivos/carpetas/bibliotecas: ámbito + lista de accesos con rol.
 *
 *   Ámbitos (AccessScope):
 *     · profile  — solo un perfil concreto de la cuenta.
 *     · account  — todos los perfiles de la cuenta (por defecto: privado en lo personal).
 *     · custom   — perfiles / cuentas / grupos externos concretos.
 *     · public   — cualquiera en la red (transparente en lo público — Tríada §3).
 *   Roles (AccessRole): view < comment < edit < admin. Un grant puede ser
 *   PARCIAL: `sections` lista las subsecciones permitidas (pestañas de un
 *   escritorio, ramas de un cerebro…); ausente = acceso total.
 *
 * Persistencia (local-first, mismo espíritu que entity-library):
 *   · SIEMPRE: cache localStorage `starseed.sharing.local.v1` (fallback sin
 *     sesión y lectura instantánea) + evento 'starseed:sharing'.
 *   · Fuera de la cuenta (scope profile/custom/public o grants): se asegura un
 *     espacio `os_spaces` para el recurso — su fila lleva el enforcement real
 *     (access/allowed_profiles/group_slug + os_space_editors por cuenta, RLS
 *     ya auditada en spaces.ts) y su `doc.sharing` guarda scope+grants con
 *     fidelidad (roles comment/admin, sections, labels).
 *   · Recursos de biblioteca (file/folder): ADEMÁS se espeja a la ACL embebida
 *     del doc de entity_state (clave 'acl' por ítem/carpeta, vía entity-library
 *     setItemAcl/setFolderAcl) — la que la UI del Finder ya aplica.
 *
 * Mapeo de kind: os_spaces solo admite kind desktop|dashboard|board — los
 * recursos brain/file/folder/library usan 'dashboard' como contenedor genérico
 * (nunca listado hoy por ninguna vista de dashboards) y el tipo REAL viaja en
 * `doc.sharing.resource.type`. Defensivo: se intenta primero el kind natural.
 *
 * Realtime: subscribeResourceAccess reutiliza onTableChange (os_spaces filtrado
 * por id + os_space_editors filtrado por space_id) + eventos locales, de modo
 * que los cambios de grants se reflejan EN VIVO en cualquier diálogo abierto.
 *
 * Nota honesta: el doc colaborativo de escritorios/pizarras se REEMPLAZA al
 * editar en modo espacio (shared-desktop-space/shared-board-space), lo que
 * puede vaciar `doc.sharing` hasta el siguiente cambio de permisos. El
 * enforcement NO se pierde (vive en columnas + os_space_editors); solo la
 * fidelidad extra se re-escribe al mutar de nuevo. Documentado a propósito.
 *
 * Justicia restaurativa (§6): quitar un acceso nunca borra datos del otro —
 * solo deja de compartirse; no hay bloqueos punitivos en este módulo.
 */

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { onTableChange } from "@/lib/realtime/realtime";
import {
    createSpace,
    getSpace,
    updateSpaceMeta,
    updateSpaceDoc,
    listSpaceEditors,
    inviteToSpace,
    removeSpaceEditor,
    type Space,
    type SpaceAccess,
    type SpaceKind,
    type SpaceEditorRole,
} from "@/lib/spaces/spaces";
import {
    setItemAcl,
    setFolderAcl,
    setLibraryAcl,
    readLibrarySnapshot,
    LIBRARY_UPDATED_EVENT,
    type EntityLibraryDoc,
    type ItemACL,
    type ACLEntry,
} from "@/lib/library/entity-library";
// Enforcement REAL por archivo: os_files tiene una fila por archivo (a diferencia
// del doc de biblioteca, que es una sola fila jsonb) → su ACL sí se aplica en la BD.
import { findFileByUrl, updateFileAccess } from "@/lib/files/os-files";
import type { EntityRef } from "@/lib/sync/entity-state";

/* ─────────────────────────── Tipos ─────────────────────────── */

/**
 * Ámbito de un recurso. Vocabulario de la Adenda 66 §3
 * (`private · account · profiles · groups · pages · public`) + los dos ámbitos
 * históricos de la Adenda 63 (`profile`, `custom`), que se conservan para no
 * romper escritorios/pizarras/cerebros ya compartidos.
 *
 *   · private  — CERRADO: solo la cuenta dueña. Los grants NO se aplican.
 *   · account  — la cuenta dueña (todos sus perfiles) + los grants concedidos.
 *   · profile  — (legado) un perfil concreto de la cuenta.
 *   · profiles — perfiles concretos (de cualquier cuenta).
 *   · groups   — grupos concretos (por slug).
 *   · pages    — páginas/comunidades concretas (por slug).
 *   · custom   — (legado) mezcla libre de perfiles/cuentas/grupos.
 *   · public   — cualquiera en la red.
 *
 * profiles/groups/pages/custom son ÁMBITOS DE DESTINATARIO: se comportan igual
 * (los grants mandan) y solo cambian qué buscador ofrece la UI.
 */
export type AccessScope = "private" | "profile" | "account" | "profiles" | "groups" | "pages" | "custom" | "public";
export type AccessRole = "view" | "comment" | "edit" | "admin";
export type GranteeKind = "profile" | "account" | "group" | "page" | "link";

const ALL_SCOPES: AccessScope[] = ["private", "profile", "account", "profiles", "groups", "pages", "custom", "public"];

/** ¿Es un ámbito cuyos destinatarios se listan en `grants`? */
export function isCustomScope(scope: AccessScope): boolean {
    return scope === "custom" || scope === "profiles" || scope === "groups" || scope === "pages";
}

export interface AccessGrant {
    granteeKind: GranteeKind;
    /** uuid de perfil (profile) · uuid de cuenta (account) · slug (group/page) · 'public' (link). */
    granteeId: string;
    role: AccessRole;
    /** Etiqueta legible para la UI (nombre de perfil, @usuario, nombre de grupo…). */
    label?: string;
    /** Acceso PARCIAL: ids de subsecciones permitidas que declara el recurso. Ausente = total. */
    sections?: string[];
}

export type ResourceType = "desktop" | "dashboard" | "board" | "brain" | "file" | "folder" | "library";

export interface ResourceRef {
    type: ResourceType;
    id: string;
    /** Cuenta dueña (uuid) si se conoce — habilita `can()` para el dueño sin red. */
    ownerId?: string;
    title?: string;
    /** Recursos de biblioteca (file/folder/library): entidad dueña de esa biblioteca. */
    libraryRef?: EntityRef;
    /** Espacio os_spaces ya conocido para este recurso (evita búsquedas). */
    spaceId?: string | null;
}

/** ResourceRef del nodo RAÍZ (la biblioteca entera) de una entidad. */
export function libraryResourceRef(libraryRef: EntityRef, title?: string): ResourceRef {
    return {
        type: "library",
        id: `${libraryRef.kind}:${libraryRef.id}`,
        libraryRef,
        title,
        ownerId: libraryRef.kind === "user" ? libraryRef.id : undefined,
    };
}

export interface ResourceAccess {
    scope: AccessScope;
    grants: AccessGrant[];
    /** Espacio os_spaces vinculado (null si aún no se compartió fuera de la cuenta). */
    spaceId: string | null;
    updatedAt: string;
}

/* ─────────────────────────── Constantes ─────────────────────────── */

const LS_KEY = "starseed.sharing.local.v1";
/** Evento window despachado al cambiar permisos de un recurso: detail = { key }. */
export const SHARING_EVENT = "starseed:sharing";

const ROLE_RANK: Record<AccessRole, number> = { view: 1, comment: 2, edit: 3, admin: 4 };

export const ROLE_LABELS: Record<AccessRole, string> = {
    view: "Ver",
    comment: "Comentar",
    edit: "Editar",
    admin: "Administrar",
};

export const SCOPE_LABELS: Record<AccessScope, string> = {
    private: "Privado",
    profile: "Solo un perfil",
    account: "Toda mi cuenta",
    profiles: "Perfiles concretos",
    groups: "Grupos",
    pages: "Páginas",
    custom: "Personalizado",
    public: "Público",
};

/* ══════════ Puente con los PERFILES COMPARTIDOS (Adenda 149) ══════════
 *
 * `src/lib/social/profile-sharing.ts` comparte IDENTIDADES (perfiles, páginas,
 * grupos) entre cuentas con un vocabulario GRADUAL propio:
 *   observador < colaborador < gestor < total
 * Este módulo sigue siendo el único modelo de permisos de RECURSOS
 * (escritorios, pizarras, cerebros, archivos…). Para que ambos hablen el mismo
 * idioma sin duplicar lógica, la traducción vive AQUÍ (así profile-sharing.ts
 * depende de access.ts y no al revés: access.ts no importa nada nuevo).
 *
 *   observador  → view    (ver / usar en lectura)
 *   colaborador → edit    (publicar y editar contenido)
 *   gestor      → admin   (configurar e invitar accesos menores)
 *   total       → admin   (+ cerebros, memorias, configuraciones y logs)
 *
 * `gestor` y `total` comparten `admin` A PROPÓSITO: el modelo universal
 * describe qué se puede hacer con un RECURSO, y ahí ambos mandan por igual. La
 * diferencia (cerebros/memorias/configs/logs de la identidad) es un asunto de
 * la capa de identidad y se consulta con `canActOnProfile(id, "total")` o, en
 * la base, con `public.profile_access_allows(profile_id, 'total')`.
 * Por eso la conversión inversa NUNCA devuelve `total`: no se puede deducir un
 * acceso absoluto a partir de un rol de recurso (sería regalar poder).
 */

/** Rol gradual de una IDENTIDAD compartida (perfil · página · grupo). */
export type ProfileShareRole = "observador" | "colaborador" | "gestor" | "total";

/** Rol gradual de identidad → rol del modelo universal de recursos. */
export function accessRoleFromProfileRole(role: ProfileShareRole): AccessRole {
    if (role === "total" || role === "gestor") return "admin";
    if (role === "colaborador") return "edit";
    return "view";
}

/** Rol universal de recurso → rol gradual de identidad (nunca `total`). */
export function profileRoleFromAccessRole(role: AccessRole): ProfileShareRole {
    if (role === "admin") return "gestor";
    if (role === "edit") return "colaborador";
    return "observador";
}

/* ─────────────────────────── Helpers básicos ─────────────────────────── */

function isClient(): boolean {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function resourceKey(ref: ResourceRef): string {
    return `${ref.type}:${ref.id}`;
}

/** ¿Es un nodo de Biblioteca (biblioteca · folder · archivo), con ACL propia y heredable? */
export function isLibraryResource(ref: ResourceRef): boolean {
    return ref.type === "library" || ref.type === "folder" || ref.type === "file";
}

function nowIso(): string {
    return new Date().toISOString();
}

function defaultAccess(): ResourceAccess {
    // Por defecto: privado en lo personal (toda la cuenta, ningún externo).
    return { scope: "account", grants: [], spaceId: null, updatedAt: "" };
}

async function getUserId(): Promise<string | null> {
    try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        return data?.user?.id ?? null;
    } catch {
        return null;
    }
}

/* ─────────────────────────── Cache local (fallback sin sesión) ─────────────────────────── */

type LocalStore = Record<string, ResourceAccess>;

function readStore(): LocalStore {
    if (!isClient()) return {};
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as LocalStore;
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function writeStore(map: LocalStore, changedKey: string): void {
    if (!isClient()) return;
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(map));
    } catch {
        /* cuota / modo privado: degradamos en silencio */
    }
    try {
        window.dispatchEvent(new CustomEvent(SHARING_EVENT, { detail: { key: changedKey } }));
    } catch {
        /* noop */
    }
}

function readLocalAccess(ref: ResourceRef): ResourceAccess | null {
    const entry = readStore()[resourceKey(ref)];
    return entry && typeof entry === "object" ? normalizeAccess(entry) : null;
}

function writeLocalAccess(ref: ResourceRef, access: ResourceAccess): void {
    const map = readStore();
    map[resourceKey(ref)] = access;
    writeStore(map, resourceKey(ref));
}

/**
 * Escribe SOLO si el valor cambió de verdad. Imprescindible en las rutas de
 * LECTURA (getResourceAccess): sin este guard, cada lectura re-emitiría
 * 'starseed:sharing' y los suscriptores (que releen al recibirlo) entrarían
 * en bucle infinito lectura→evento→lectura.
 */
function writeLocalAccessIfChanged(ref: ResourceRef, access: ResourceAccess): void {
    const current = readStore()[resourceKey(ref)];
    try {
        if (current && JSON.stringify(current) === JSON.stringify(access)) return;
    } catch {
        /* si no se puede comparar, escribimos igualmente */
    }
    writeLocalAccess(ref, access);
}

const GRANTEE_KINDS: GranteeKind[] = ["profile", "account", "group", "page", "link"];

function normalizeAccess(raw: Partial<ResourceAccess> | null | undefined): ResourceAccess {
    if (!raw) return defaultAccess();
    const scope: AccessScope =
        raw.scope && ALL_SCOPES.includes(raw.scope as AccessScope) ? (raw.scope as AccessScope) : "account";
    const grants = Array.isArray(raw.grants)
        ? raw.grants.filter(
              (g): g is AccessGrant =>
                  !!g &&
                  typeof g.granteeId === "string" &&
                  GRANTEE_KINDS.includes(g.granteeKind as GranteeKind) &&
                  (g.role === "view" || g.role === "comment" || g.role === "edit" || g.role === "admin"),
          )
        : [];
    return {
        scope,
        grants,
        spaceId: typeof raw.spaceId === "string" ? raw.spaceId : null,
        updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
    };
}

/* ─────────────────────────── Mapeos a os_spaces ─────────────────────────── */

/** Kind natural del espacio; brain/file/folder/library caen a 'dashboard' (contenedor genérico). */
function spaceKindFor(type: ResourceType): SpaceKind {
    if (type === "desktop" || type === "dashboard" || type === "board") return type;
    return "dashboard";
}

function spaceAccessFor(access: ResourceAccess): SpaceAccess {
    if (access.scope === "public") return "public";
    if (access.scope === "account" || access.scope === "private") return "private";
    if (access.scope === "profile" || access.scope === "profiles") return "profiles";
    // custom/groups/pages: si SOLO hay perfiles → 'profiles'; si hay cuentas/grupos/páginas → 'invite'.
    const hasExternal = access.grants.some(
        (g) => g.granteeKind === "account" || g.granteeKind === "group" || g.granteeKind === "page",
    );
    return hasExternal ? "invite" : "profiles";
}

function editorRoleFor(role: AccessRole): SpaceEditorRole {
    return ROLE_RANK[role] >= ROLE_RANK.edit ? "editor" : "viewer";
}

/** Reconstruye un ResourceAccess desde la fila del espacio (doc.sharing con fidelidad, columnas como respaldo). */
function accessFromSpace(space: Space, editors?: Array<{ account: string; role: SpaceEditorRole }>): ResourceAccess {
    const sharing = (space.doc as { sharing?: Partial<ResourceAccess> } | null)?.sharing;
    if (sharing && (sharing.scope || Array.isArray(sharing.grants))) {
        const normalized = normalizeAccess(sharing as Partial<ResourceAccess>);
        return { ...normalized, spaceId: space.id, updatedAt: normalized.updatedAt || space.updatedAt };
    }
    // Sin fidelidad en el doc (p.ej. espacio legado o doc reescrito por colaboración):
    // derivamos de las columnas — nunca perdemos el enforcement real.
    const scope: AccessScope =
        space.access === "public" ? "public" : space.access === "private" ? "account" : "custom";
    const grants: AccessGrant[] = [];
    for (const pid of space.allowedProfiles) {
        grants.push({ granteeKind: "profile", granteeId: pid, role: "edit" });
    }
    if (space.groupSlug) grants.push({ granteeKind: "group", granteeId: space.groupSlug, role: "edit" });
    for (const ed of editors ?? []) {
        grants.push({ granteeKind: "account", granteeId: ed.account, role: ed.role === "editor" ? "edit" : "view" });
    }
    return { scope, grants, spaceId: space.id, updatedAt: space.updatedAt };
}

/* ─────────────────────────── Espacio del recurso ─────────────────────────── */

async function findSpaceForResource(ref: ResourceRef): Promise<Space | null> {
    try {
        const supabase = createClient();
        const { data, error } = await supabase
            .from("os_spaces")
            .select("*")
            .contains("doc", { sharing: { resource: { type: ref.type, id: ref.id } } })
            .limit(1)
            .maybeSingle();
        if (error || !data) return null;
        const sp = await getSpace(String((data as Record<string, unknown>).id));
        return sp;
    } catch {
        return null;
    }
}

async function resolveSpace(ref: ResourceRef): Promise<Space | null> {
    const cachedId = ref.spaceId ?? readLocalAccess(ref)?.spaceId ?? null;
    if (cachedId) {
        const sp = await getSpace(cachedId);
        if (sp) return sp;
    }
    return findSpaceForResource(ref);
}

export interface EnsureSpaceOptions {
    /** Doc inicial del espacio colaborativo (snapshot del escritorio/pizarra/tablero…). */
    makeDoc?: () => Record<string, unknown>;
}

/**
 * Crea (o encuentra) el espacio os_spaces del recurso y devuelve su id.
 * Devuelve null sin sesión o si el backend rechaza — el modelo local sigue
 * funcionando (fallback `starseed.sharing.local.v1`).
 */
export async function ensureResourceSpace(ref: ResourceRef, opts: EnsureSpaceOptions = {}): Promise<string | null> {
    const uid = await getUserId();
    if (!uid) return null;

    const existing = await resolveSpace(ref);
    const local = readLocalAccess(ref) ?? defaultAccess();
    if (existing) {
        if (local.spaceId !== existing.id) writeLocalAccess(ref, { ...local, spaceId: existing.id });
        return existing.id;
    }

    const sharing = {
        v: 1,
        resource: { type: ref.type, id: ref.id, title: ref.title ?? null },
        scope: local.scope,
        grants: local.grants,
        updatedAt: local.updatedAt || nowIso(),
    };
    const baseDoc = { ...(opts.makeDoc?.() ?? {}), sharing };
    const title = (ref.title ?? "").trim() || "Recurso compartido";

    // spaceKindFor ya mapea todo tipo a un kind admitido por el CHECK del backend
    // (brain/file/folder/library → 'dashboard' genérico; el tipo real va en doc.sharing).
    const space = await createSpace({
        kind: spaceKindFor(ref.type),
        title,
        access: spaceAccessFor(local),
        allowedProfiles: local.grants.filter((g) => g.granteeKind === "profile").map((g) => g.granteeId),
        groupSlug: local.grants.find((g) => g.granteeKind === "group")?.granteeId ?? null,
        doc: baseDoc,
    });
    if (space) {
        writeLocalAccess(ref, { ...local, spaceId: space.id, updatedAt: nowIso() });
        return space.id;
    }
    return null;
}

/* ───────────────── Espejo de enforcement · ACL de nodo (biblioteca · folder · archivo) ───────────────── */

/** ¿Este nodo tiene ACL PROPIA (v3 con scope/grants, o v2 con listas no vacías)? */
export function aclIsOwn(acl: ItemACL | undefined | null): boolean {
    if (!acl) return false;
    if (typeof acl.scope === "string" && acl.scope) return true;
    if (Array.isArray(acl.grants) && acl.grants.length > 0) return true;
    return (acl.read?.length ?? 0) > 0 || (acl.write?.length ?? 0) > 0;
}

/** ACL embebida del nodo (lectura síncrona desde la cache local de la biblioteca). */
function readNodeAcl(ref: ResourceRef): ItemACL | undefined {
    if (!ref.libraryRef) return undefined;
    try {
        const doc = readLibrarySnapshot(ref.libraryRef);
        if (ref.type === "library") return doc.acl;
        if (ref.type === "file") return doc.items.find((it) => it.id === ref.id)?.acl;
        if (ref.type === "folder") return doc.folders.find((f) => f.id === ref.id)?.acl;
    } catch {
        /* sin cache: se resolverá por herencia */
    }
    return undefined;
}

/** ACL de nodo → ResourceAccess (v3 nativo; v2 legado derivado de read/write). */
function aclToAccess(acl: ItemACL | undefined | null): ResourceAccess | null {
    if (!aclIsOwn(acl) || !acl) return null;
    if (acl.scope || (Array.isArray(acl.grants) && acl.grants.length > 0)) {
        return normalizeAccess({
            scope: acl.scope as AccessScope,
            grants: (acl.grants ?? []) as AccessGrant[],
            spaceId: null,
            updatedAt: acl.updatedAt ?? "",
        });
    }
    // v2: listas read/write → grants con rol derivado (write ⇒ edit).
    const writeIds = new Set((acl.write ?? []).map((e) => `${e.kind}:${e.id}`));
    const grants: AccessGrant[] = (acl.read ?? []).map((e) => ({
        granteeKind: e.kind === "user" ? "account" : "group",
        granteeId: e.id,
        label: e.label,
        role: writeIds.has(`${e.kind}:${e.id}`) ? "edit" : "view",
    }));
    for (const e of acl.write ?? []) {
        if (!grants.some((g) => g.granteeId === e.id)) {
            grants.push({
                granteeKind: e.kind === "user" ? "account" : "group",
                granteeId: e.id,
                label: e.label,
                role: "edit",
            });
        }
    }
    return { scope: "custom", grants, spaceId: null, updatedAt: acl.updatedAt ?? "" };
}

/**
 * ResourceAccess → ACL de nodo (v3). Escribe SIEMPRE el modelo rico
 * (scope + grants) y, como ESPEJO, las listas legadas read/write que ya
 * consumen el Finder (finder-types.ts) y las políticas RLS.
 * `showInProfile` (§4) se conserva: es una decisión de publicación, no de acceso.
 */
function accessToNodeAcl(access: ResourceAccess, prev?: ItemACL | null): ItemACL {
    const read: ACLEntry[] = [];
    const write: ACLEntry[] = [];
    // 'private' cierra el nodo y 'public' no necesita listas: el ámbito manda.
    if (access.scope !== "private" && access.scope !== "public") {
        for (const g of access.grants) {
            if (g.granteeKind === "link") continue;
            const entry: ACLEntry = {
                kind: g.granteeKind === "group" || g.granteeKind === "page" ? "group" : "user",
                id: g.granteeId,
                label: g.label,
            };
            read.push(entry);
            if (ROLE_RANK[g.role] >= ROLE_RANK.edit) write.push(entry);
        }
    }
    return {
        read,
        write,
        scope: access.scope,
        grants: access.grants,
        showInProfile: prev?.showInProfile,
        updatedAt: access.updatedAt || nowIso(),
    };
}

/** Escribe la ACL del nodo en el doc de la biblioteca (entity_state · clave `acl`). */
async function writeNodeAcl(ref: ResourceRef, acl: ItemACL | null): Promise<void> {
    if (!ref.libraryRef) return;
    if (ref.type === "library") await setLibraryAcl(ref.libraryRef, acl);
    else if (ref.type === "file") await setItemAcl(ref.libraryRef, ref.id, acl);
    else if (ref.type === "folder") await setFolderAcl(ref.libraryRef, ref.id, acl);
}

/**
 * Espejo del acceso de un ARCHIVO real en `os_files` (la única tabla con una
 * fila por archivo → enforcement REAL por nodo, no solo por documento).
 * Solo aplica a ítems de biblioteca `type:"file"` cuya `url` resuelve una fila
 * de os_files. Best-effort: sin fila, no hace nada.
 */
async function pushFileEnforcement(ref: ResourceRef, access: ResourceAccess): Promise<void> {
    if (ref.type !== "file" || !ref.libraryRef) return;
    try {
        const doc = readLibrarySnapshot(ref.libraryRef);
        const item = doc.items.find((it) => it.id === ref.id);
        const url = item?.url;
        if (!url) return;
        const row = await findFileByUrl(url);
        if (!row) return;

        const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
        const aclRead: string[] = [];
        const aclWrite: string[] = [];
        let groupSlug: string | null = null;
        if (access.scope !== "private") {
            for (const g of access.grants) {
                if (g.granteeKind === "group" || g.granteeKind === "page") {
                    groupSlug = groupSlug ?? g.granteeId;
                    continue;
                }
                // acl_read/acl_write son uuid[]: admiten cuentas Y perfiles — la
                // función `acl_ids_allow` de la BD resuelve perfil→cuenta y cuenta→perfiles.
                if (!isUuid(g.granteeId)) continue;
                aclRead.push(g.granteeId);
                if (ROLE_RANK[g.role] >= ROLE_RANK.edit) aclWrite.push(g.granteeId);
            }
        }
        await updateFileAccess(row.id, {
            isPublic: access.scope === "public",
            aclRead,
            aclWrite,
            groupSlug,
        });
    } catch {
        /* best-effort: la ACL embebida ya quedó escrita */
    }
}

/** ¿El ámbito/los grants requieren un espacio en la nube para que otros lo vean? */
function needsCloudSpace(access: ResourceAccess): boolean {
    if (access.scope === "public" || access.scope === "profile") return true;
    if (isCustomScope(access.scope) && access.grants.some((g) => g.granteeKind !== "link")) return true;
    return false;
}

/**
 * Empuja el estado de permisos al backend (best-effort, nunca lanza):
 *  · biblioteca → ACL embebida (entity-library) y, si hay externos, espacio.
 *  · resto → espacio os_spaces (columnas + doc.sharing + os_space_editors).
 * `prev` permite retirar de os_space_editors SOLO cuentas que este modelo
 * añadió (no pisa invitaciones hechas por flujos previos).
 */
async function pushEnforcement(
    ref: ResourceRef,
    access: ResourceAccess,
    prev: ResourceAccess | null,
    opts: EnsureSpaceOptions = {},
): Promise<void> {
    try {
        // 1) ACL PROPIA del nodo (clave 'acl' del doc de entity_state) — biblioteca,
        //    folder o archivo. Al escribirla, el nodo DEJA DE HEREDAR (§3).
        if (isLibraryResource(ref) && ref.libraryRef) {
            const acl = accessToNodeAcl(access, readNodeAcl(ref));
            await writeNodeAcl(ref, acl);
            // Enforcement REAL por archivo (una fila por archivo en os_files).
            await pushFileEnforcement(ref, access);
        }

        const uid = await getUserId();
        if (!uid) return; // sin sesión: el fallback local ya quedó escrito

        // 2) Espacio del recurso (solo si hace falta o si ya existía).
        let space = await resolveSpace(ref);
        if (!space && needsCloudSpace(access)) {
            const sid = await ensureResourceSpace(ref, opts);
            space = sid ? await getSpace(sid) : null;
        }
        if (!space) return;

        // Columnas de enforcement + doc.sharing con fidelidad (merge, no reemplazo).
        await updateSpaceMeta(space.id, {
            access: spaceAccessFor(access),
            allowedProfiles: access.grants.filter((g) => g.granteeKind === "profile").map((g) => g.granteeId),
            groupSlug: access.grants.find((g) => g.granteeKind === "group")?.granteeId ?? null,
        });
        const sharing = {
            v: 1,
            resource: { type: ref.type, id: ref.id, title: ref.title ?? null },
            scope: access.scope,
            grants: access.grants,
            updatedAt: access.updatedAt,
        };
        await updateSpaceDoc(space.id, { ...space.doc, sharing });

        // 3) os_space_editors: alta/rol por cuenta; retirada solo de cuentas que estaban en `prev`.
        const desired = new Map<string, AccessRole>();
        for (const g of access.grants) {
            if (g.granteeKind === "account") desired.set(g.granteeId, g.role);
        }
        for (const [account, role] of desired) {
            await inviteToSpace(space.id, account, editorRoleFor(role));
        }
        const previously = new Set(
            (prev?.grants ?? []).filter((g) => g.granteeKind === "account").map((g) => g.granteeId),
        );
        for (const account of previously) {
            if (!desired.has(account)) await removeSpaceEditor(space.id, account);
        }

        // Persistimos el spaceId en la cache local si aún no estaba.
        const local = readLocalAccess(ref);
        if (local && local.spaceId !== space.id) writeLocalAccess(ref, { ...local, spaceId: space.id });
    } catch {
        /* best-effort: la copia local es la fuente de verdad offline */
    }
}

/* ─────────────────────────── Lectura ─────────────────────────── */

/** ACL embebida de biblioteca (biblioteca/folder/archivo) → ResourceAccess propio del nodo. */
function accessFromLibraryAcl(ref: ResourceRef): ResourceAccess | null {
    if (!isLibraryResource(ref) || !ref.libraryRef) return null;
    return aclToAccess(readNodeAcl(ref));
}

/**
 * Estado de permisos de un recurso: cache local inmediata + nube (espacio /
 * ACL de biblioteca) en LWW por updatedAt. Nunca lanza.
 */
export async function getResourceAccess(ref: ResourceRef): Promise<ResourceAccess> {
    const local = readLocalAccess(ref);
    let cloud: ResourceAccess | null = null;
    try {
        const space = await resolveSpace(ref);
        if (space) {
            let editors: Array<{ account: string; role: SpaceEditorRole }> = [];
            try {
                editors = (await listSpaceEditors(space.id)).map((e) => ({ account: e.account, role: e.role }));
            } catch {
                /* opcional */
            }
            cloud = accessFromSpace(space, editors);
        }
    } catch {
        cloud = null;
    }
    if (!cloud) cloud = accessFromLibraryAcl(ref);

    if (cloud && local) {
        const cloudAt = Date.parse(cloud.updatedAt || "") || 0;
        const localAt = Date.parse(local.updatedAt || "") || 0;
        const winner = cloudAt > localAt ? cloud : { ...local, spaceId: local.spaceId ?? cloud.spaceId };
        writeLocalAccessIfChanged(ref, winner);
        return winner;
    }
    if (cloud) {
        writeLocalAccessIfChanged(ref, cloud);
        return cloud;
    }
    return local ?? defaultAccess();
}

/** Lista de accesos concedidos (grants) del recurso. */
export async function listGrants(ref: ResourceRef): Promise<AccessGrant[]> {
    return (await getResourceAccess(ref)).grants;
}

/* ─────────────────────────── Mutaciones ─────────────────────────── */

async function mutateAccess(
    ref: ResourceRef,
    fn: (current: ResourceAccess) => ResourceAccess,
    opts: EnsureSpaceOptions = {},
): Promise<ResourceAccess> {
    const prev = readLocalAccess(ref) ?? (await getResourceAccess(ref));
    const next = { ...fn(prev), updatedAt: nowIso() };
    writeLocalAccess(ref, next);
    // Push en segundo plano — local-first, la UI no espera a la red.
    void pushEnforcement(ref, next, prev, opts);
    return next;
}

/** Cambia el ámbito del recurso (los grants se conservan; solo aplican según el ámbito). */
export async function setResourceScope(
    ref: ResourceRef,
    scope: AccessScope,
    opts: EnsureSpaceOptions = {},
): Promise<ResourceAccess> {
    return mutateAccess(ref, (cur) => ({ ...cur, scope }), opts);
}

/** Añade o actualiza un acceso (mismo granteeKind+granteeId ⇒ se sustituye rol/secciones). */
export async function upsertGrant(
    ref: ResourceRef,
    grant: AccessGrant,
    opts: EnsureSpaceOptions = {},
): Promise<ResourceAccess> {
    return mutateAccess(
        ref,
        (cur) => {
            const rest = cur.grants.filter(
                (g) => !(g.granteeKind === grant.granteeKind && g.granteeId === grant.granteeId),
            );
            return { ...cur, grants: [...rest, grant] };
        },
        opts,
    );
}

/** Retira un acceso concedido (no punitivo: no borra nada del otro, solo deja de compartir). */
export async function removeGrant(
    ref: ResourceRef,
    granteeKind: GranteeKind,
    granteeId: string,
    opts: EnsureSpaceOptions = {},
): Promise<ResourceAccess> {
    return mutateAccess(
        ref,
        (cur) => ({
            ...cur,
            grants: cur.grants.filter((g) => !(g.granteeKind === granteeKind && g.granteeId === granteeId)),
        }),
        opts,
    );
}

/* ═══════════════════════ Herencia (biblioteca → folder → archivo) ═══════════════════════
 *
 * Adenda 66 §3: cada nodo tiene ACL PROPIA y HEREDABLE — el hijo hereda la del
 * padre si no define la suya; la ACL propia SIEMPRE gana (no se mezclan).
 * Cadena: archivo → su folder → folders ancestros → biblioteca (nodo raíz).
 * Sin ninguna ACL propia en toda la cadena: `account` (privado en lo personal).
 */

/** Ref del nodo PADRE dentro de la biblioteca (null si es la raíz o no aplica). */
export function parentResourceRef(ref: ResourceRef, doc?: EntityLibraryDoc): ResourceRef | null {
    if (!isLibraryResource(ref) || !ref.libraryRef || ref.type === "library") return null;
    const d = doc ?? readLibrarySnapshot(ref.libraryRef);
    const parentFolderId =
        ref.type === "file"
            ? (d.items.find((it) => it.id === ref.id)?.folderId ?? null)
            : (d.folders.find((f) => f.id === ref.id)?.parentId ?? null);
    if (parentFolderId) {
        const folder = d.folders.find((f) => f.id === parentFolderId);
        return { type: "folder", id: parentFolderId, libraryRef: ref.libraryRef, ownerId: ref.ownerId, title: folder?.name };
    }
    return libraryResourceRef(ref.libraryRef, ref.title);
}

export interface EffectiveAccess extends ResourceAccess {
    /** true si la ACL es PROPIA del nodo; false si la HEREDA de un ancestro. */
    own: boolean;
    /** Nodo del que hereda (null si es propia o si no hay ancestro con ACL). */
    inheritedFrom: ResourceRef | null;
    /** Etiqueta legible del origen ("Biblioteca", nombre del folder…). */
    inheritedFromLabel?: string;
}

/** ¿Este nodo tiene ACL PROPIA (no heredada)? Síncrono (cache local del doc). */
export function hasOwnAcl(ref: ResourceRef): boolean {
    if (!isLibraryResource(ref)) return true; // escritorios/pizarras/cerebros no heredan
    return aclIsOwn(readNodeAcl(ref));
}

/**
 * Acceso EFECTIVO del nodo: su ACL propia si la tiene; si no, la del primer
 * ancestro que la tenga (folder padre → … → biblioteca). Nunca lanza.
 */
export async function getEffectiveAccess(ref: ResourceRef): Promise<EffectiveAccess> {
    if (!isLibraryResource(ref) || !ref.libraryRef) {
        const access = await getResourceAccess(ref);
        return { ...access, own: true, inheritedFrom: null };
    }
    if (hasOwnAcl(ref)) {
        const access = await getResourceAccess(ref);
        return { ...access, own: true, inheritedFrom: null };
    }
    const doc = readLibrarySnapshot(ref.libraryRef);
    const seen = new Set<string>([resourceKey(ref)]);
    let cursor = parentResourceRef(ref, doc);
    while (cursor) {
        if (seen.has(resourceKey(cursor))) break; // ciclo imposible, pero nunca colgamos la UI
        seen.add(resourceKey(cursor));
        if (hasOwnAcl(cursor)) {
            const access = await getResourceAccess(cursor);
            return {
                ...access,
                spaceId: null, // el espacio pertenece al ancestro, no a este nodo
                own: false,
                inheritedFrom: cursor,
                inheritedFromLabel: cursor.type === "library" ? "Biblioteca" : (cursor.title ?? "Folder"),
            };
        }
        cursor = parentResourceRef(cursor, doc);
    }
    return { ...defaultAccess(), own: false, inheritedFrom: null, inheritedFromLabel: "Biblioteca" };
}

/**
 * «Dejar de heredar»: copia el acceso EFECTIVO como ACL propia del nodo. A
 * partir de aquí el nodo decide por sí mismo (los cambios del padre ya no le
 * afectan).
 */
export async function detachInheritance(ref: ResourceRef, opts: EnsureSpaceOptions = {}): Promise<ResourceAccess> {
    const effective = await getEffectiveAccess(ref);
    const next: ResourceAccess = {
        scope: effective.scope,
        grants: effective.grants,
        spaceId: null,
        updatedAt: nowIso(),
    };
    writeLocalAccess(ref, next);
    void pushEnforcement(ref, next, null, opts);
    return next;
}

/**
 * «Volver a heredar»: borra la ACL propia del nodo — vuelve a regirse por la de
 * su padre. No es punitivo: no se borra nada del contenido, solo la excepción
 * de permisos (CLAUDE.md §6).
 */
export async function restoreInheritance(ref: ResourceRef): Promise<EffectiveAccess> {
    if (isLibraryResource(ref) && ref.libraryRef) {
        // Conservamos `showInProfile` (§4): publicar en el perfil no es un permiso.
        const prev = readNodeAcl(ref);
        const keepShow = prev?.showInProfile === true;
        await writeNodeAcl(ref, keepShow ? { read: [], write: [], showInProfile: true } : null);
    }
    // Limpia la cache local del recurso para que no "resucite" la ACL borrada.
    const map = readStore();
    delete map[resourceKey(ref)];
    writeStore(map, resourceKey(ref));
    return getEffectiveAccess(ref);
}

/* ═══════════════════════ Regla CUENTA ↔ PERFILES (§3) ═══════════════════════
 *
 * Conceder acceso a UN perfil concede acceso a TODOS los perfiles de esa cuenta,
 * y a la inversa. Gemelo EXACTO en cliente de la función `acl_ids_allow` de la
 * BD (migración 20260712100100_account_profile_access.sql): la comprobación del
 * cliente y la de la RLS dicen siempre lo mismo.
 */

const IDENTITY_TTL_MS = 60_000;
const identityCache = new Map<string, { at: number; ids: Set<string> }>();

/**
 * Conjunto de identidades EQUIVALENTES a `who` (uuid de cuenta o de perfil):
 * su cuenta + TODOS los perfiles de esa cuenta. Un grant a cualquiera de ellas
 * autoriza a todas las demás. Cacheado 60s; sin red degrada a `{who}`.
 */
export async function identitySetOf(who: string): Promise<Set<string>> {
    const cached = identityCache.get(who);
    if (cached && Date.now() - cached.at < IDENTITY_TTL_MS) return cached.ids;

    const ids = new Set<string>([who]);
    try {
        const supabase = createClient();
        // ¿`who` es una cuenta (sus perfiles tienen account=who) o un perfil (id=who)?
        const { data } = await supabase
            .from("os_account_profiles")
            .select("id, account")
            .or(`id.eq.${who},account.eq.${who}`);
        const rows = (data ?? []) as Array<{ id: string; account: string }>;
        const accounts = new Set<string>();
        for (const r of rows) {
            ids.add(r.id);
            ids.add(r.account);
            accounts.add(r.account);
        }
        // Si `who` era un PERFIL, faltan sus perfiles HERMANOS (misma cuenta).
        const siblingsOf = Array.from(accounts).filter((a) => a !== who);
        if (siblingsOf.length > 0) {
            const { data: sib } = await supabase
                .from("os_account_profiles")
                .select("id, account")
                .in("account", siblingsOf);
            for (const r of (sib ?? []) as Array<{ id: string; account: string }>) {
                ids.add(r.id);
                ids.add(r.account);
            }
        }
    } catch {
        /* sin red / sin sesión: solo la identidad literal */
    }
    identityCache.set(who, { at: Date.now(), ids });
    return ids;
}

/* ─────────────────────────── Comprobación ─────────────────────────── */

/**
 * ¿`who` (uuid de cuenta o de perfil) puede actuar con el rol mínimo pedido?
 *
 * Reglas: se evalúa el acceso EFECTIVO (propio o heredado del padre) ·
 * dueño ⇒ todo · private ⇒ solo el dueño · public ⇒ rol del grant 'link'
 * (view por defecto) · account ⇒ la cuenta dueña (todos sus perfiles) ·
 * grants explícitos ⇒ su rol, aplicando la REGLA CUENTA↔PERFILES (un grant a un
 * perfil vale para toda su cuenta y viceversa).
 * `section` opcional: si el grant es parcial, la subsección debe estar incluida.
 */
export async function can(
    who: string | null | undefined,
    ref: ResourceRef,
    role: AccessRole,
    section?: string,
): Promise<boolean> {
    const need = ROLE_RANK[role];
    const access = await getEffectiveAccess(ref);

    const grantOk = (g: AccessGrant): boolean => {
        if (ROLE_RANK[g.role] < need) return false;
        if (section && Array.isArray(g.sections) && !g.sections.includes(section)) return false;
        return true;
    };

    const isOwner = async (): Promise<boolean> => {
        if (!who) return false;
        if (ref.ownerId && who === ref.ownerId) return true;
        if (!ref.ownerId) return false;
        const uid = await getUserId();
        return !!uid && uid === ref.ownerId;
    };

    // 'private': cerrado con llave — ni los grants aplican. Solo el dueño.
    if (access.scope === "private") return isOwner();

    if (access.scope === "public") {
        const pub = access.grants.find((g) => g.granteeKind === "link");
        if (pub ? grantOk(pub) : need <= ROLE_RANK.view) return true;
    }
    if (!who) return false;
    if (await isOwner()) return true;

    // REGLA CUENTA↔PERFILES: el grant puede nombrar a la cuenta o a CUALQUIER
    // perfil suyo — todas esas identidades son equivalentes.
    const ids = await identitySetOf(who);
    return access.grants.some((g) => g.granteeKind !== "link" && ids.has(g.granteeId) && grantOk(g));
}

/* ═══════════════════════ Biblioteca pública del perfil (§4) ═══════════════════════
 *
 * Cada perfil elige QUÉ bibliotecas/folders/archivos aparecen en su sección
 * pública de Biblioteca. Lo NO seleccionado no se lista aunque sea público.
 */

/** ¿Este nodo está marcado para aparecer en la Biblioteca pública del perfil? */
export function isShownInProfile(ref: ResourceRef): boolean {
    return readNodeAcl(ref)?.showInProfile === true;
}

/**
 * Marca/desmarca un nodo como visible en la Biblioteca pública del perfil.
 * Al MOSTRARLO se asegura además que sea legible por las visitas: si su ámbito
 * efectivo no es `public`, se eleva a `public` (honesto: publicar en el perfil
 * ES hacerlo público; la UI lo advierte). Al ocultarlo NO se toca el ámbito —
 * quitar de la vitrina no revoca lo que ya se compartió a propósito.
 */
export async function setShowInProfile(ref: ResourceRef, show: boolean): Promise<EffectiveAccess> {
    if (!isLibraryResource(ref) || !ref.libraryRef) return getEffectiveAccess(ref);

    if (show) {
        const effective = await getEffectiveAccess(ref);
        // Publicar en el perfil ES hacerlo público (si no, la visita ni podría leerlo).
        const next: ResourceAccess = {
            scope: "public",
            grants: effective.grants,
            spaceId: effective.spaceId,
            updatedAt: nowIso(),
        };
        writeLocalAccess(ref, next);
        const acl = accessToNodeAcl(next, readNodeAcl(ref));
        await writeNodeAcl(ref, { ...acl, showInProfile: true });
        void pushFileEnforcement(ref, next);
    } else {
        const prev = readNodeAcl(ref);
        if (prev) await writeNodeAcl(ref, { ...prev, showInProfile: false });
    }
    return getEffectiveAccess(ref);
}

export interface ProfilePublicNode {
    kind: "folder" | "file";
    id: string;
    title: string;
}

/**
 * Nodos que un perfil ha elegido mostrar en su Biblioteca pública (§4).
 * Lee el doc YA cargado (sin red). Si la BIBLIOTECA ENTERA está marcada, se
 * devuelven todos sus nodos raíz — "mostrar la biblioteca" es mostrarla entera.
 */
export function profilePublicNodes(doc: EntityLibraryDoc): {
    wholeLibrary: boolean;
    folders: ProfilePublicNode[];
    files: ProfilePublicNode[];
} {
    const wholeLibrary = doc.acl?.showInProfile === true;
    if (wholeLibrary) {
        return {
            wholeLibrary: true,
            folders: doc.folders
                .filter((f) => !f.parentId)
                .map((f) => ({ kind: "folder" as const, id: f.id, title: f.name })),
            files: doc.items
                .filter((it) => !it.folderId)
                .map((it) => ({ kind: "file" as const, id: it.id, title: it.title })),
        };
    }
    return {
        wholeLibrary: false,
        folders: doc.folders
            .filter((f) => f.acl?.showInProfile === true)
            .map((f) => ({ kind: "folder" as const, id: f.id, title: f.name })),
        files: doc.items
            .filter((it) => it.acl?.showInProfile === true)
            .map((it) => ({ kind: "file" as const, id: it.id, title: it.title })),
    };
}

/* ─────────────────────────── Enlaces ─────────────────────────── */

/**
 * Enlace de apertura del recurso compartido (patrón ?space= existente).
 * Devuelve null si el tipo no tiene ruta propia (la integración aporta la suya,
 * p.ej. deepLinkFor de la biblioteca).
 */
export function shareLinkFor(ref: ResourceRef, spaceId: string | null): string | null {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    if (ref.type === "desktop") return spaceId ? `${origin}/escritorios?space=${encodeURIComponent(spaceId)}` : null;
    if (ref.type === "board") return spaceId ? `${origin}/pizarra?board-space=${encodeURIComponent(spaceId)}` : null;
    if (ref.type === "dashboard") return spaceId ? `${origin}/dashboard?space=${encodeURIComponent(spaceId)}` : null;
    return null;
}

/* ─────────────────────────── Realtime ─────────────────────────── */

/**
 * Cambios de permisos EN VIVO: eventos locales (misma pestaña/otras pestañas)
 * + Realtime de Supabase sobre os_spaces (fila del espacio) y os_space_editors
 * (grants por cuenta), reutilizando onTableChange. Para recursos de biblioteca
 * escucha además el evento público de entity-library. SSR-safe (no-op).
 */
export function subscribeResourceAccess(ref: ResourceRef, cb: () => void): () => void {
    if (!isClient()) return () => {};
    const key = resourceKey(ref);
    const unsubs: Array<() => void> = [];

    const onLocal = (e: Event) => {
        const detail = (e as CustomEvent<{ key?: string } | undefined>).detail;
        if (!detail || detail.key === key) cb();
    };
    const onStorage = (e: StorageEvent) => {
        if (e.key === LS_KEY || e.key === null) cb();
    };
    window.addEventListener(SHARING_EVENT, onLocal);
    window.addEventListener("storage", onStorage);
    unsubs.push(() => {
        window.removeEventListener(SHARING_EVENT, onLocal);
        window.removeEventListener("storage", onStorage);
    });

    if (ref.libraryRef) {
        const onLib = (e: Event) => {
            const detail = (e as CustomEvent<{ kind?: string; id?: string } | undefined>).detail;
            if (!detail || (detail.kind === ref.libraryRef?.kind && detail.id === ref.libraryRef?.id)) cb();
        };
        window.addEventListener(LIBRARY_UPDATED_EVENT, onLib);
        unsubs.push(() => window.removeEventListener(LIBRARY_UPDATED_EVENT, onLib));
    }

    let cancelled = false;
    void (async () => {
        const spaceId = ref.spaceId ?? readLocalAccess(ref)?.spaceId ?? (await resolveSpace(ref))?.id ?? null;
        if (cancelled || !spaceId) return;
        unsubs.push(onTableChange("os_spaces", { filter: `id=eq.${spaceId}` }, () => cb()));
        unsubs.push(onTableChange("os_space_editors", { filter: `space_id=eq.${spaceId}` }, () => cb()));
    })();

    return () => {
        cancelled = true;
        for (const u of unsubs) {
            try {
                u();
            } catch {
                /* noop */
            }
        }
    };
}

/* ─────────────────────────── Hook ─────────────────────────── */

export interface UseResourceAccess {
    access: ResourceAccess | null;
    loading: boolean;
    reload: () => void;
}

/** Estado reactivo (carga + realtime) de los permisos de un recurso. `ref` null = no-op estable. */
export function useResourceAccess(ref: ResourceRef | null): UseResourceAccess {
    const [access, setAccess] = useState<ResourceAccess | null>(null);
    const [loading, setLoading] = useState<boolean>(!!ref);

    const type = ref?.type ?? "";
    const id = ref?.id ?? "";

    const reload = useCallback(() => {
        if (!ref) return;
        void getResourceAccess(ref).then(setAccess);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- type/id identifican `ref` de forma estable
    }, [type, id]);

    useEffect(() => {
        if (!ref) {
            setAccess(null);
            setLoading(false);
            return;
        }
        let alive = true;
        setLoading(true);
        void getResourceAccess(ref).then((a) => {
            if (alive) {
                setAccess(a);
                setLoading(false);
            }
        });
        const unsub = subscribeResourceAccess(ref, () => {
            void getResourceAccess(ref).then((a) => {
                if (alive) setAccess(a);
            });
        });
        return () => {
            alive = false;
            unsub();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- type/id identifican `ref` de forma estable
    }, [type, id]);

    return { access, loading, reload };
}

"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * profile-sharing — PERFILES (y páginas/grupos/comunidades) COMPARTIDOS
 *                   ENTRE CUENTAS con permisos GRADUALES · Adenda 149
 * ---------------------------------------------------------------------------
 * Petición literal (Alex, 2026-08-09): los perfiles —EXCEPTO el principal—
 * se pueden compartir con cualquier cuenta de la red, con permisos graduales y
 * una opción de ACCESO COMPLETO ABSOLUTO (cerebros, memorias, configuraciones
 * y logs). Lo mismo para páginas, grupos y comunidades.
 *
 * ┌───────────────────────────────────────────────────────────────────────┐
 * │ RELACIÓN CON EL RESTO DEL SISTEMA (qué se REUTILIZA, qué es nuevo)     │
 * └───────────────────────────────────────────────────────────────────────┘
 *  · `src/lib/sharing/access.ts` (Adenda 63 §5 · modelo UNIVERSAL de permisos)
 *    gobierna RECURSOS: escritorios, dashboards, pizarras, cerebros, archivos,
 *    carpetas y bibliotecas — ámbito (`AccessScope`) + lista de `AccessGrant`
 *    con rol `view < comment < edit < admin`, respaldado por `os_spaces`,
 *    `os_space_editors` y las ACL de biblioteca.  **NO SE DUPLICA NI SE
 *    SUSTITUYE.**  Este módulo cubre lo que aquel no modela: quién puede
 *    actuar COMO una IDENTIDAD (un perfil, una página, un grupo).
 *    Puente compatible (añadido AHÍ, no aquí, para no invertir la dependencia):
 *      `accessRoleFromProfileRole()` / `profileRoleFromAccessRole()`
 *    → cualquier recurso anclado a un perfil compartido puede traducir su rol
 *      gradual al vocabulario universal y seguir usando `can()` sin cambios.
 *  · `os_entity_roles` (20260710000000 · RBAC de federación) YA existía para
 *    «varias cuentas gestionan Perfiles, Páginas o Grupos». Para PÁGINAS y
 *    GRUPOS se reutiliza tal cual (su columna `role` es texto libre y admite el
 *    vocabulario gradual). Para PERFILES se usa la tabla nueva
 *    `os_profile_access`, porque sólo ahí se puede garantizar por trigger la
 *    regla dura «el perfil principal NUNCA se comparte» (os_entity_roles es
 *    polimórfica y su `entity_id` no tiene clave foránea).
 *    La migración importa (idempotente) los roles de perfil que ya vivían en
 *    os_entity_roles → un solo origen de verdad.
 *  · `os_memberships` / `group_members` / `page_members` son MEMBRESÍA (unirse,
 *    censo, «una persona, una voz»): self-insert de la fila propia, no sirven
 *    para conceder acceso a otra cuenta. NO se tocan ni se duplican; la UI las
 *    muestra como lo que son (roster) y añade encima la capa de gestión.
 *
 * ┌───────────────────────────────────────────────────────────────────────┐
 * │ PERFIL PRINCIPAL                                                       │
 * └───────────────────────────────────────────────────────────────────────┘
 *  El perfil principal de una cuenta es el que tiene `is_default = true` en
 *  `os_account_profiles` (es además el que el OS sincroniza con la identidad
 *  soberana `os_profiles`). NUNCA es compartible: se rechaza aquí con un error
 *  honesto, en la RLS y en un trigger de la base (defensa en profundidad).
 *
 * ┌───────────────────────────────────────────────────────────────────────┐
 * │ LÍMITE HONESTO del rol `total`                                         │
 * └───────────────────────────────────────────────────────────────────────┘
 *  `total` DECLARA acceso a cerebros, memorias, configuraciones y logs del
 *  perfil. La RLS de esas tablas todavía no consulta esta capa; la migración
 *  deja la pasarela lista (`public.profile_access_allows(profile_id,'total')`)
 *  para que la adopten. Hasta entonces el alcance real es la capa de
 *  aplicación. Se dice en la UI, no se esconde.
 *
 * Defensivo y SSR-safe como todo el repo: ninguna función lanza; sin sesión o
 * sin red degradan a lista vacía / `{ ok:false, needsAuth:true }`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from "@/utils/supabase/client";
import { searchAccountProfiles, type AccountProfile } from "@/lib/profiles/profiles";
import { searchUsers, fetchProfilesByIds } from "@/lib/social/os-profiles";
import {
    accessRoleFromProfileRole,
    profileRoleFromAccessRole,
    type AccessRole,
    type ProfileShareRole,
} from "@/lib/sharing/access";

/* ─────────────────────────────── Tipos ─────────────────────────────────── */

/** Rol GRADUAL sobre una identidad compartida (perfil · página · grupo). */
export type ProfileAccessRole = ProfileShareRole; // "observador" | "colaborador" | "gestor" | "total"

/** Qué identidad se está compartiendo. Comunidades = páginas (`os_pages.kind`). */
export type SharedTargetKind = "profile" | "page" | "group";

export interface ProfileAccessRoleInfo {
    role: ProfileAccessRole;
    /** Etiqueta corta para el selector. */
    label: string;
    /** Una línea: qué puede hacer. */
    hint: string;
    /** Lista explícita de QUÉ INCLUYE este nivel (se muestra en la UI). */
    includes: string[];
    /** Rango numérico (1..4). Mayor = más poder. */
    rank: number;
    /** true ⇒ la UI DEBE pedir confirmación destructiva antes de concederlo. */
    requiresConfirmation: boolean;
    /** Equivalente en el modelo universal de permisos (access.ts). */
    accessRole: AccessRole;
}

/** Una cuenta con acceso concedido a una identidad. */
export interface ProfileAccessEntry {
    id: string;
    targetKind: SharedTargetKind;
    targetId: string;
    /** Cuenta destinataria (auth.users.id). null ⇒ invitación pendiente. */
    granteeUserId: string | null;
    inviteHandle: string | null;
    inviteEmail: string | null;
    role: ProfileAccessRole;
    grantedBy: string | null;
    note: string | null;
    createdAt: string;
    updatedAt: string;
    /* Hidratación legible (best-effort; puede faltar sin red). */
    displayName?: string;
    handle?: string;
    avatarUrl?: string;
    /** true si la fila viene del RBAC legado (os_entity_roles) — páginas/grupos. */
    legacy?: boolean;
}

/** Resultado de una mutación (patrón del repo). */
export interface AccessMutationResult {
    ok: boolean;
    needsAuth?: boolean;
    error?: string;
    entry?: ProfileAccessEntry;
}

/** Cuenta de la red encontrada por el buscador de destinatarios. */
export interface NetworkAccountHit {
    /** Cuenta (auth.users.id) — es a la cuenta a quien se concede el acceso. */
    accountId: string;
    displayName: string;
    handle: string;
    avatarUrl?: string;
    /** De dónde salió: directorio soberano o faceta pública. */
    source: "directorio" | "faceta";
}

/** Perfil ajeno al que TENGO acceso concedido. */
export interface SharedWithMeProfile {
    profileId: string;
    role: ProfileAccessRole;
    name: string;
    handle: string | null;
    avatarUrl: string | null;
    ownerAccountId: string | null;
}

/** Concesión "en cola" mientras el perfil aún no existe (flujo de CREACIÓN). */
export interface PendingAccessGrant {
    accountId: string;
    displayName: string;
    handle?: string;
    avatarUrl?: string;
    role: ProfileAccessRole;
}

/* ───────────────────────── Jerarquía de roles ──────────────────────────── */

export const PROFILE_ACCESS_ROLES: ProfileAccessRole[] = ["observador", "colaborador", "gestor", "total"];

/**
 * Jerarquía GRADUAL con etiquetas y alcance explícito, en español.
 * El nivel `total` declara SIN EUFEMISMOS que incluye cerebros, memorias,
 * configuraciones y logs — es la única forma honesta de pedir esa confianza.
 */
export const PROFILE_ACCESS_ROLE_INFO: Record<ProfileAccessRole, ProfileAccessRoleInfo> = {
    observador: {
        role: "observador",
        label: "Observador",
        hint: "Ve y usa el perfil en modo lectura.",
        includes: [
            "Ver el perfil y su contenido",
            "Usarlo en modo lectura (sin publicar ni editar)",
        ],
        rank: 1,
        requiresConfirmation: false,
        accessRole: "view",
    },
    colaborador: {
        role: "colaborador",
        label: "Colaborador",
        hint: "Publica y edita el contenido del perfil.",
        includes: [
            "Todo lo de Observador",
            "Publicar en nombre del perfil",
            "Editar el contenido del perfil",
        ],
        rank: 2,
        requiresConfirmation: false,
        accessRole: "edit",
    },
    gestor: {
        role: "gestor",
        label: "Gestor",
        hint: "Configura el perfil e invita o retira accesos menores.",
        includes: [
            "Todo lo de Colaborador",
            "Configuración del perfil (nombre, tipo, temas, imágenes)",
            "Invitar y retirar accesos de nivel INFERIOR al suyo",
        ],
        rank: 3,
        requiresConfirmation: false,
        accessRole: "admin",
    },
    total: {
        role: "total",
        label: "Acceso completo absoluto",
        hint: "Todo, incluidos cerebros, memorias, configuraciones y logs.",
        includes: [
            "Todo lo de Gestor",
            "Cerebros vinculados al perfil",
            "Memorias del perfil",
            "Configuraciones del perfil",
            "Registros y logs de actividad del perfil",
        ],
        rank: 4,
        requiresConfirmation: true,
        accessRole: "admin",
    },
};

/** Advertencia de soberanía que la UI DEBE mostrar al conceder `total`. */
export const TOTAL_ACCESS_WARNING =
    "Acceso absoluto: quien lo reciba podrá ver y usar TODO lo de este perfil, incluidos sus cerebros, memorias, configuraciones y logs. Concédelo solo a cuentas en las que confíes plenamente. Podrás revocarlo cuando quieras.";

/**
 * Nota honesta sobre hasta dónde llega HOY el rol `total` (§Límite honesto de
 * la cabecera). La UI la muestra junto a la advertencia: nunca prometemos más
 * de lo que la base de datos aplica.
 */
export const TOTAL_ACCESS_SCOPE_NOTE =
    "Nota: el alcance sobre cerebros, memorias y logs se aplica hoy en la capa de la aplicación; las tablas de cerebros/memorias adoptarán esta misma comprobación progresivamente.";

export function profileRoleRank(role: ProfileAccessRole | string | null | undefined): number {
    const key = String(role ?? "").trim().toLowerCase();
    // Vocabulario legado de os_entity_roles: owner/admin/editor/viewer.
    if (key === "owner") return 4;
    if (key === "admin") return 3;
    if (key === "editor") return 2;
    if (key === "viewer") return 1;
    return PROFILE_ACCESS_ROLE_INFO[key as ProfileAccessRole]?.rank ?? 0;
}

/** ¿`role` alcanza al menos `min`? */
export function isRoleAtLeast(
    role: ProfileAccessRole | string | null | undefined,
    min: ProfileAccessRole,
): boolean {
    return profileRoleRank(role) >= profileRoleRank(min);
}

/** ¿Este rol exige confirmación destructiva antes de concederse? */
export function roleNeedsConfirmation(role: ProfileAccessRole): boolean {
    return PROFILE_ACCESS_ROLE_INFO[role]?.requiresConfirmation === true;
}

/** Normaliza cualquier texto de rol (incluido el legado) al vocabulario gradual. */
export function normalizeProfileRole(raw: unknown): ProfileAccessRole {
    const key = String(raw ?? "").trim().toLowerCase();
    if (PROFILE_ACCESS_ROLES.includes(key as ProfileAccessRole)) return key as ProfileAccessRole;
    if (key === "owner") return "total";
    if (key === "admin") return "gestor";
    if (key === "editor") return "colaborador";
    return "observador";
}

/** Puente con el modelo universal (re-exportado para no obligar a dos imports). */
export { accessRoleFromProfileRole, profileRoleFromAccessRole };
export type { AccessRole };

/* ───────────────────── Catálogo de temas creativos ─────────────────────── */

export interface ProfileCategory {
    id: string;
    label: string;
    /** Emoji orientativo (la UI puede ignorarlo). */
    emoji: string;
}

/**
 * Temas creativos multi-seleccionables de un perfil (o de una página/grupo).
 * AMPLIABLE: añadir aquí es suficiente — la columna es `text[]` sin CHECK, así
 * que ningún perfil existente se rompe al crecer el catálogo.
 */
export const PROFILE_CATEGORIES: ProfileCategory[] = [
    { id: "arte", label: "Arte", emoji: "🎨" },
    { id: "musica", label: "Música", emoji: "🎵" },
    { id: "ciencia", label: "Ciencia", emoji: "🔬" },
    { id: "gobernanza", label: "Gobernanza", emoji: "🏛️" },
    { id: "educacion", label: "Educación", emoji: "📚" },
    { id: "permacultura", label: "Permacultura", emoji: "🌱" },
    { id: "tecnologia", label: "Tecnología", emoji: "🛠️" },
    { id: "sanacion", label: "Sanación", emoji: "💚" },
    { id: "juego", label: "Juego", emoji: "🎲" },
    { id: "cocina", label: "Cocina", emoji: "🍲" },
    { id: "viaje", label: "Viaje", emoji: "🧭" },
    { id: "misticismo", label: "Misticismo", emoji: "🔮" },
];

export function categoryLabel(id: string): string {
    return PROFILE_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

/** Normaliza una lista de categorías (dedupe, minúsculas, sin vacíos). */
export function normalizeCategories(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const v of raw) {
        const id = String(v ?? "").trim().toLowerCase();
        if (id && !out.includes(id)) out.push(id);
    }
    return out;
}

/* ────────────────────────────── Helpers ────────────────────────────────── */

const TABLE_PROFILE = "os_profile_access";
const TABLE_ENTITY = "os_entity_roles";

function isClient(): boolean {
    return typeof window !== "undefined";
}

async function getUserId(): Promise<string | null> {
    if (!isClient()) return null;
    try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        return data?.user?.id ?? null;
    } catch {
        return null;
    }
}

/**
 * Mensaje honesto cuando la migración de la Adenda 149 todavía no se ha
 * aplicado en la base: no se disfraza de fallo genérico ni se finge éxito.
 */
export const MIGRATION_PENDING_ERROR =
    "Compartir perfiles aún no está activo en la base de datos (falta aplicar la migración de la Adenda 149). Tus demás cambios sí se guardan.";

function isMissingTableError(e: unknown): boolean {
    if (!e || typeof e !== "object") return false;
    const code = (e as { code?: string }).code ?? "";
    const msg = ((e as { message?: string }).message ?? "").toLowerCase();
    return (
        code === "42P01" ||
        code === "PGRST205" ||
        (msg.includes("relation") && msg.includes("does not exist")) ||
        (msg.includes("schema cache") && msg.includes("os_profile_access"))
    );
}

function errorMessage(e: unknown, fallback: string): string {
    if (isMissingTableError(e)) return MIGRATION_PENDING_ERROR;
    if (e && typeof e === "object") {
        const msg = (e as { message?: string }).message;
        if (typeof msg === "string" && msg.trim()) {
            if (/principal/i.test(msg)) return "El perfil principal de tu cuenta no se puede compartir.";
            if (/duplicate|unique/i.test(msg)) return "Esa cuenta ya tiene acceso a este perfil.";
            if (/row-level security|violates row-level/i.test(msg)) {
                return "No tienes permiso para conceder ese nivel de acceso.";
            }
            return msg;
        }
    }
    return fallback;
}

interface ProfileAccessRow {
    id: string;
    profile_id: string;
    grantee_user_id?: string | null;
    invite_handle?: string | null;
    invite_email?: string | null;
    role?: string | null;
    granted_by?: string | null;
    note?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
}

interface EntityRoleRow {
    id: string;
    account_id: string;
    entity_type?: string | null;
    entity_id: string;
    role?: string | null;
    granted_by?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
}

function mapProfileRow(row: ProfileAccessRow): ProfileAccessEntry {
    return {
        id: String(row.id),
        targetKind: "profile",
        targetId: String(row.profile_id),
        granteeUserId: row.grantee_user_id ?? null,
        inviteHandle: row.invite_handle ?? null,
        inviteEmail: row.invite_email ?? null,
        role: normalizeProfileRole(row.role),
        grantedBy: row.granted_by ?? null,
        note: row.note ?? null,
        createdAt: row.created_at ?? "",
        updatedAt: row.updated_at ?? row.created_at ?? "",
    };
}

function mapEntityRow(row: EntityRoleRow, kind: SharedTargetKind): ProfileAccessEntry {
    return {
        id: String(row.id),
        targetKind: kind,
        targetId: String(row.entity_id),
        granteeUserId: row.account_id ?? null,
        inviteHandle: null,
        inviteEmail: null,
        role: normalizeProfileRole(row.role),
        grantedBy: row.granted_by ?? null,
        note: null,
        createdAt: row.created_at ?? "",
        updatedAt: row.updated_at ?? row.created_at ?? "",
        legacy: !PROFILE_ACCESS_ROLES.includes(String(row.role ?? "") as ProfileAccessRole),
    };
}

/** Hidrata nombre/@/avatar de las cuentas destinatarias (best-effort). */
async function hydrateGrantees(entries: ProfileAccessEntry[]): Promise<ProfileAccessEntry[]> {
    const ids = Array.from(new Set(entries.map((e) => e.granteeUserId).filter((v): v is string => !!v)));
    if (ids.length === 0) return entries;
    let byId: Record<string, { displayName: string; username: string; avatarUrl?: string }> = {};
    try {
        const profiles = await fetchProfilesByIds(ids);
        byId = Object.fromEntries(
            Object.entries(profiles).map(([id, p]) => [
                id,
                { displayName: p.displayName, username: p.username, avatarUrl: p.avatarUrl },
            ]),
        );
    } catch {
        /* sin directorio: se muestra el id acortado, nunca se rompe la lista */
    }
    return entries.map((e) => {
        const hit = e.granteeUserId ? byId[e.granteeUserId] : undefined;
        if (!hit) return e;
        return { ...e, displayName: hit.displayName, handle: hit.username, avatarUrl: hit.avatarUrl };
    });
}

/* ───────────────────────── Guardas del principal ───────────────────────── */

/**
 * ¿Es el perfil PRINCIPAL de su cuenta (`is_default`)? Sin red devuelve `true`
 * por prudencia SOLO cuando la fila no se puede leer: preferimos bloquear una
 * compartición legítima antes que permitir la del principal por accidente.
 */
export async function isPrimaryProfile(profileId: string): Promise<boolean> {
    if (!profileId) return true;
    try {
        const supabase = createClient();
        const { data, error } = await supabase
            .from("os_account_profiles")
            .select("is_default")
            .eq("id", profileId)
            .maybeSingle();
        if (error || !data) return true;
        return (data as { is_default?: boolean }).is_default === true;
    } catch {
        return true;
    }
}

/** Error honesto y reutilizable cuando alguien intenta compartir el principal. */
export const PRIMARY_PROFILE_ERROR =
    "El perfil PRINCIPAL de tu cuenta no se puede compartir. Es tu identidad soberana: crea o usa otro perfil para compartirlo.";

/* ─────────────────────────────── Lectura ───────────────────────────────── */

/**
 * Lista las cuentas con acceso a una identidad.
 *   · profile → `os_profile_access` (modelo gradual nuevo).
 *   · page/group → `os_entity_roles` (RBAC de federación ya existente).
 * Nunca lanza: [] ante cualquier fallo.
 */
export async function listAccess(kind: SharedTargetKind, targetId: string): Promise<ProfileAccessEntry[]> {
    if (!targetId) return [];
    try {
        const supabase = createClient();
        if (kind === "profile") {
            const { data, error } = await supabase
                .from(TABLE_PROFILE)
                .select("*")
                .eq("profile_id", targetId)
                .order("created_at", { ascending: true });
            if (error || !Array.isArray(data)) return [];
            return hydrateGrantees((data as ProfileAccessRow[]).map(mapProfileRow));
        }
        const { data, error } = await supabase
            .from(TABLE_ENTITY)
            .select("*")
            .eq("entity_id", targetId)
            .order("created_at", { ascending: true });
        if (error || !Array.isArray(data)) return [];
        return hydrateGrantees((data as EntityRoleRow[]).map((r) => mapEntityRow(r, kind)));
    } catch {
        return [];
    }
}

/** Mi rol EFECTIVO sobre un perfil ajeno (null si no tengo ninguno). */
export async function myAccessTo(profileId: string): Promise<ProfileAccessRole | null> {
    const uid = await getUserId();
    if (!uid || !profileId) return null;
    try {
        const supabase = createClient();
        // Dueño de la faceta ⇒ acceso total sobre lo suyo.
        const { data: own } = await supabase
            .from("os_account_profiles")
            .select("account")
            .eq("id", profileId)
            .maybeSingle();
        if ((own as { account?: string } | null)?.account === uid) return "total";

        const { data, error } = await supabase
            .from(TABLE_PROFILE)
            .select("role")
            .eq("profile_id", profileId)
            .eq("grantee_user_id", uid)
            .maybeSingle();
        if (error || !data) return null;
        return normalizeProfileRole((data as { role?: string }).role);
    } catch {
        return null;
    }
}

/** ¿Puedo actuar sobre este perfil con al menos `min`? */
export async function canActOnProfile(profileId: string, min: ProfileAccessRole = "observador"): Promise<boolean> {
    return isRoleAtLeast(await myAccessTo(profileId), min);
}

/**
 * Perfiles AJENOS compartidos conmigo (los míos no entran: esos ya son míos).
 * Devuelve la faceta hidratada para pintar el selector de perfiles.
 */
export async function listProfilesSharedWithMe(): Promise<SharedWithMeProfile[]> {
    const uid = await getUserId();
    if (!uid) return [];
    try {
        const supabase = createClient();
        const { data, error } = await supabase
            .from(TABLE_PROFILE)
            .select("profile_id, role")
            .eq("grantee_user_id", uid);
        if (error || !Array.isArray(data) || data.length === 0) return [];

        const rows = data as Array<{ profile_id: string; role?: string }>;
        const ids = Array.from(new Set(rows.map((r) => r.profile_id).filter(Boolean)));
        if (ids.length === 0) return [];

        const { data: profiles } = await supabase
            .from("os_account_profiles")
            .select("id, account, name, handle, avatar_url")
            .in("id", ids);

        const byId = new Map<string, Record<string, unknown>>();
        for (const p of (profiles as Array<Record<string, unknown>>) ?? []) {
            byId.set(String(p.id), p);
        }

        return rows.map((r) => {
            const p = byId.get(r.profile_id);
            return {
                profileId: r.profile_id,
                role: normalizeProfileRole(r.role),
                name: typeof p?.name === "string" && p.name ? p.name : "Perfil compartido",
                handle: typeof p?.handle === "string" ? p.handle : null,
                avatarUrl: typeof p?.avatar_url === "string" ? p.avatar_url : null,
                ownerAccountId: typeof p?.account === "string" ? p.account : null,
            };
        });
    } catch {
        return [];
    }
}

/* ────────────────────────────── Buscador ───────────────────────────────── */

/**
 * Busca CUENTAS de toda la red por handle o nombre. Combina las dos fuentes
 * legibles que ya existen (no crea una tercera):
 *   · `searchUsers` (os_profiles · directorio soberano, una fila por cuenta)
 *   · `searchAccountProfiles` (os_account_profiles · facetas públicas)
 * Deduplica por CUENTA: el acceso se concede a la cuenta, aunque se elija por
 * su faceta (regla cuenta↔perfiles del OS).
 */
export async function searchNetworkAccounts(q: string, limit = 10): Promise<NetworkAccountHit[]> {
    const term = (q ?? "").trim().replace(/^@/, "");
    if (term.length < 2) return [];
    const me = await getUserId();

    const [users, facets] = await Promise.all([
        searchUsers(term, limit).catch(() => []),
        searchAccountProfiles(term, limit).catch(() => [] as AccountProfile[]),
    ]);

    const byAccount = new Map<string, NetworkAccountHit>();
    for (const u of users) {
        if (!u.userId || u.userId === me) continue;
        byAccount.set(u.userId, {
            accountId: u.userId,
            displayName: u.displayName || u.username,
            handle: u.username,
            avatarUrl: u.avatarUrl,
            source: "directorio",
        });
    }
    for (const f of facets) {
        if (!f.account || f.account === me || byAccount.has(f.account)) continue;
        byAccount.set(f.account, {
            accountId: f.account,
            displayName: f.name,
            handle: f.handle ?? "",
            avatarUrl: f.avatarUrl ?? undefined,
            source: "faceta",
        });
    }
    return Array.from(byAccount.values()).slice(0, limit);
}

/* ────────────────────────────── Mutaciones ─────────────────────────────── */

export interface GrantAccessInput {
    /** Cuenta destinataria (auth.users.id). Preferente. */
    granteeUserId?: string;
    /** Invitación por @handle cuando la cuenta aún no se ha resuelto. */
    inviteHandle?: string;
    /** Invitación por correo (la fila se activa cuando esa cuenta entra). */
    inviteEmail?: string;
    role: ProfileAccessRole;
    note?: string;
}

/**
 * Concede acceso a una cuenta sobre una identidad.
 * GUARDAS:
 *   · el perfil PRINCIPAL nunca se comparte (comprobado aquí, en la RLS y en un
 *     trigger de la base);
 *   · `total` exige confirmación EN LA UI (`roleNeedsConfirmation`) — esta
 *     función no puede confirmar por el usuario, así que solo lo documenta;
 *   · sin destinatario resoluble ⇒ error honesto.
 */
export async function grantAccess(
    kind: SharedTargetKind,
    targetId: string,
    input: GrantAccessInput,
): Promise<AccessMutationResult> {
    const uid = await getUserId();
    if (!uid) return { ok: false, needsAuth: true, error: "Inicia sesión para compartir." };
    if (!targetId) return { ok: false, error: "Falta la identidad a compartir." };

    const role = normalizeProfileRole(input.role);
    const grantee = (input.granteeUserId ?? "").trim();
    const handle = (input.inviteHandle ?? "").trim().replace(/^@/, "").toLowerCase();
    const email = (input.inviteEmail ?? "").trim().toLowerCase();

    if (!grantee && !handle && !email) {
        return { ok: false, error: "Elige una cuenta de la red (o invita por @ o correo)." };
    }
    if (grantee && grantee === uid) {
        return { ok: false, error: "Ya tienes acceso a esta identidad." };
    }

    try {
        const supabase = createClient();

        if (kind === "profile") {
            if (await isPrimaryProfile(targetId)) {
                return { ok: false, error: PRIMARY_PROFILE_ERROR };
            }
            const { data, error } = await supabase
                .from(TABLE_PROFILE)
                .insert({
                    profile_id: targetId,
                    grantee_user_id: grantee || null,
                    invite_handle: handle || null,
                    invite_email: email || null,
                    role,
                    granted_by: uid,
                    note: input.note ?? null,
                })
                .select("*")
                .maybeSingle();
            if (error) return { ok: false, error: errorMessage(error, "No se pudo conceder el acceso.") };
            if (!data) return { ok: false, error: "No se pudo conceder el acceso." };
            const [entry] = await hydrateGrantees([mapProfileRow(data as ProfileAccessRow)]);
            return { ok: true, entry };
        }

        // Páginas / grupos / comunidades → RBAC de federación ya existente.
        if (!grantee) {
            return {
                ok: false,
                error: "Para páginas y grupos hay que elegir una cuenta existente de la red.",
            };
        }
        const { data, error } = await supabase
            .from(TABLE_ENTITY)
            .upsert(
                {
                    account_id: grantee,
                    entity_type: kind,
                    entity_id: targetId,
                    role,
                    granted_by: uid,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "account_id,entity_type,entity_id" },
            )
            .select("*")
            .maybeSingle();
        if (error) return { ok: false, error: errorMessage(error, "No se pudo conceder el acceso.") };
        if (!data) return { ok: false, error: "No se pudo conceder el acceso." };
        const [entry] = await hydrateGrantees([mapEntityRow(data as EntityRoleRow, kind)]);
        return { ok: true, entry };
    } catch (e) {
        return { ok: false, error: errorMessage(e, "No se pudo conceder el acceso.") };
    }
}

/** Cambia el rol de una concesión existente. */
export async function updateAccessRole(
    kind: SharedTargetKind,
    entryId: string,
    role: ProfileAccessRole,
): Promise<AccessMutationResult> {
    const uid = await getUserId();
    if (!uid) return { ok: false, needsAuth: true, error: "Inicia sesión para cambiar permisos." };
    if (!entryId) return { ok: false, error: "Falta la concesión a modificar." };

    const next = normalizeProfileRole(role);
    try {
        const supabase = createClient();
        const table = kind === "profile" ? TABLE_PROFILE : TABLE_ENTITY;
        const patch: Record<string, unknown> = { role: next, updated_at: new Date().toISOString() };
        const { data, error } = await supabase.from(table).update(patch).eq("id", entryId).select("*").maybeSingle();
        if (error) return { ok: false, error: errorMessage(error, "No se pudo cambiar el rol.") };
        if (!data) {
            return {
                ok: false,
                error: "No se pudo cambiar el rol (¿tienes permiso sobre esa cuenta?).",
            };
        }
        const mapped =
            kind === "profile"
                ? mapProfileRow(data as ProfileAccessRow)
                : mapEntityRow(data as EntityRoleRow, kind);
        const [entry] = await hydrateGrantees([mapped]);
        return { ok: true, entry };
    } catch (e) {
        return { ok: false, error: errorMessage(e, "No se pudo cambiar el rol.") };
    }
}

/**
 * Retira un acceso. NO es punitivo (CLAUDE.md §6): no borra nada de la otra
 * cuenta, solo deja de compartirse.
 */
export async function revokeAccess(kind: SharedTargetKind, entryId: string): Promise<AccessMutationResult> {
    const uid = await getUserId();
    if (!uid) return { ok: false, needsAuth: true, error: "Inicia sesión para retirar accesos." };
    if (!entryId) return { ok: false, error: "Falta la concesión a retirar." };
    try {
        const supabase = createClient();
        const table = kind === "profile" ? TABLE_PROFILE : TABLE_ENTITY;
        const { error } = await supabase.from(table).delete().eq("id", entryId);
        if (error) return { ok: false, error: errorMessage(error, "No se pudo retirar el acceso.") };
        return { ok: true };
    } catch (e) {
        return { ok: false, error: errorMessage(e, "No se pudo retirar el acceso.") };
    }
}

/**
 * Aplica las concesiones preparadas durante la CREACIÓN de un perfil (cuando
 * todavía no existía su id). Devuelve cuántas se concedieron y los errores
 * legibles de las que no — nunca lanza.
 */
export async function applyPendingAccess(
    kind: SharedTargetKind,
    targetId: string,
    pending: PendingAccessGrant[],
): Promise<{ granted: number; errors: string[] }> {
    const errors: string[] = [];
    let granted = 0;
    if (!targetId || !Array.isArray(pending) || pending.length === 0) return { granted, errors };
    for (const p of pending) {
        if (!p?.accountId) continue;
        const res = await grantAccess(kind, targetId, { granteeUserId: p.accountId, role: p.role });
        if (res.ok) granted += 1;
        else errors.push(`${p.displayName || p.accountId}: ${res.error ?? "no se pudo conceder"}`);
    }
    return { granted, errors };
}

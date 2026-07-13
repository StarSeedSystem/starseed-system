"use client";

/*
 * share-targets — "Compartir / Enviar a…" UNIVERSAL (Adenda 66 §5).
 * ----------------------------------------------------------------------------
 * Distinto de `src/lib/sharing/access.ts` (que gestiona PERMISOS: quién puede
 * ver/editar un recurso). Aquí resolvemos la ACCIÓN de ENVIAR un recurso
 * {cerebro · biblioteca · folder · archivo · publicación} a un DESTINO:
 *   · publicación → Lienzo Universal (/crear) con el recurso ya integrado
 *   · mensaje     → hilo de /messages (adjunto real)
 *   · entidad     → grupo / página / comunidad / evento (os_posts)
 *   · cerebro     → fuente/memoria del cerebro (memory-files)
 *   · enlace      → enlace profundo copiable
 *   · librería    → copia/referencia en una biblioteca+folder (entity-library)
 *
 * Formato de REFERENCIA (contrato con el Lienzo Universal / SourcePicker del
 * otro agente): no existe aún `source-picker.tsx`, así que definimos aquí el
 * formato canónico `{kind, id, name, url?}` (+ extras opcionales) y lo
 * documentamos. Si más adelante el SourcePicker define el suyo, este superset
 * es compatible (mismos nombres de campo).
 *
 * Todo best-effort y SSR-safe: ninguna función lanza; sin sesión degradan a un
 * resultado `{ ok:false }` legible por la UI. No escribe permisos (eso es
 * access.ts) — solo entrega/duplica el recurso donde el usuario lo pida.
 */

import { createPost, type OsEntityType } from "@/lib/os-social";
import { sendMessage, type DmAttachment } from "@/lib/messages/dm";
import { saveItem, type EntityRef } from "@/lib/library/entity-library";
import { saveMemoryFile } from "@/lib/cerebro/memory-files";

/* ─────────────────────────── Tipos de recurso ─────────────────────────── */

export type ShareResourceKind = "cerebro" | "biblioteca" | "folder" | "archivo" | "publicacion";

/**
 * Referencia universal de un recurso compartible. `kind`/`id`/`name` son
 * obligatorios; el resto describe cómo abrirlo/duplicarlo según el destino.
 */
export interface ShareResourceRef {
    kind: ShareResourceKind;
    id: string;
    name: string;
    /** URL externa del recurso (si aplica: archivo subido, enlace…). */
    url?: string;
    /** Ruta in-app para abrir el recurso (enlace profundo). */
    route?: string;
    /** Nota/descripción corta a arrastrar al destino. */
    note?: string;
    /** MIME (archivos) para elegir icono/preview. */
    mime?: string;
    /** Recursos de biblioteca (biblioteca/folder/archivo): entidad dueña. */
    libraryRef?: EntityRef;
    /** Id del nodo dentro de su biblioteca (archivo/folder). */
    nodeId?: string;
}

/* ───────────── Lienzo Universal (/crear) — store efímero de adjuntos ───────────── */

/**
 * Referencia COMPACTA que el Lienzo Universal (/crear) lee al abrir. Contrato
 * mínimo `{kind, id, name, url?}` + extras opcionales (route/note/mime). El
 * lienzo (otro agente) debe leer `sessionStorage[CREATION_ATTACH_KEY]` (array),
 * integrar cada referencia como bloque y limpiar la clave.
 */
export interface CreationAttachRef {
    kind: string;
    id: string;
    name: string;
    url?: string;
    route?: string;
    note?: string;
    mime?: string;
}

export const CREATION_ATTACH_KEY = "starseed.creation.attach.v1";

/** Convierte un ShareResourceRef al formato compacto del Lienzo. */
export function toCreationAttach(ref: ShareResourceRef): CreationAttachRef {
    return {
        kind: ref.kind,
        id: ref.id,
        name: ref.name,
        url: ref.url,
        route: ref.route,
        note: ref.note,
        mime: ref.mime,
    };
}

/**
 * Deja el/los recurso(s) preparados para el Lienzo Universal y devuelve la ruta
 * a la que navegar (`/crear?attach=1`). Escribe en `sessionStorage` para no
 * volcar payloads grandes en la URL; el flag `attach=1` avisa al lienzo de que
 * hay adjuntos pendientes. No-op seguro en SSR (devuelve la ruta igualmente).
 */
export function stageCreationAttach(refs: CreationAttachRef | CreationAttachRef[]): string {
    const list = Array.isArray(refs) ? refs : [refs];
    try {
        if (typeof window !== "undefined" && "sessionStorage" in window) {
            sessionStorage.setItem(CREATION_ATTACH_KEY, JSON.stringify(list));
        }
    } catch {
        /* cuota / modo privado: el lienzo mostrará su estado normal */
    }
    return "/crear?attach=1";
}

/**
 * Lee (y por defecto limpia) los adjuntos preparados para el Lienzo. Pensado
 * para que /crear lo llame al montar. Nunca lanza; sin nada devuelve [].
 */
export function readCreationAttach(clear = true): CreationAttachRef[] {
    try {
        if (typeof window === "undefined" || !("sessionStorage" in window)) return [];
        const raw = sessionStorage.getItem(CREATION_ATTACH_KEY);
        if (!raw) return [];
        if (clear) sessionStorage.removeItem(CREATION_ATTACH_KEY);
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (r): r is CreationAttachRef => !!r && typeof r.id === "string" && typeof r.name === "string",
        );
    } catch {
        return [];
    }
}

/* ─────────────────────────── Enlace profundo ─────────────────────────── */

/** Enlace profundo (absoluto si hay window) del recurso, para copiar/compartir. */
export function deepLinkFor(ref: ShareResourceRef): string {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    if (ref.route) {
        return ref.route.startsWith("http") ? ref.route : `${origin}${ref.route.startsWith("/") ? "" : "/"}${ref.route}`;
    }
    if (ref.url) return ref.url;
    if (ref.kind === "publicacion") return `${origin}/network#post-${ref.id}`;
    return origin || "/";
}

/* ─────────────────────────── Adaptadores ─────────────────────────── */

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i;

/** Referencia → adjunto de mensaje (DmAttachment: enlace/ref en vivo). */
export function toDmAttachment(ref: ShareResourceRef): DmAttachment {
    if (ref.kind === "archivo" && ref.url) {
        const isImg = IMAGE_EXT.test(ref.url) || (ref.mime ?? "").startsWith("image/");
        return { kind: isImg ? "image" : "file", name: ref.name, url: ref.url, mime: ref.mime };
    }
    return {
        kind: "ref",
        name: ref.name,
        url: ref.url,
        route: ref.route,
        refKind: ref.kind,
        refId: ref.id,
    };
}

/**
 * Cuerpo markdown para publicar el recurso en una entidad. Reutiliza la
 * convención de adjuntos de /publish (`**Adjuntos:**` + `- [name](href)`) que
 * `splitBodyAttachments` (social-posts.ts) ya sabe renderizar como chip/imagen.
 */
export function toShareBody(ref: ShareResourceRef): string {
    const href = deepLinkFor(ref);
    const intro = (ref.note ?? "").trim() || `Compartido: ${ref.name}`;
    const line =
        ref.kind === "archivo" && ref.url && IMAGE_EXT.test(ref.url)
            ? `- ![${ref.name}](${ref.url})`
            : `- [${ref.name}](${href})`;
    return `${intro}\n\n**Adjuntos:**\n${line}`;
}

/* ─────────────────────────── Destinos (efectos reales) ─────────────────────────── */

export interface ShareActionResult {
    ok: boolean;
    /** true si el fallo es por falta de sesión (la UI invita a iniciar sesión). */
    needsAuth?: boolean;
    error?: string;
}

/** Destino MENSAJE: adjunta el recurso a un hilo existente. */
export async function shareToThread(threadId: string, ref: ShareResourceRef): Promise<ShareActionResult> {
    if (!threadId) return { ok: false, error: "Elige un hilo." };
    const msg = await sendMessage(threadId, {
        body: (ref.note ?? "").trim() || `Te comparto: ${ref.name}`,
        attachments: [toDmAttachment(ref)],
    });
    return msg ? { ok: true } : { ok: false, needsAuth: true, error: "No se pudo enviar. ¿Has iniciado sesión?" };
}

export interface EntityDest {
    entityType: OsEntityType;
    entitySlug: string;
    /** Nombre legible del destino (para el toast). */
    label?: string;
}

/** Destino ENTIDAD: publica el recurso como os_post en un grupo/página/comunidad/evento. */
export async function shareToEntity(dest: EntityDest, ref: ShareResourceRef): Promise<ShareActionResult> {
    if (!dest.entitySlug) return { ok: false, error: "Elige un destino." };
    const res = await createPost({
        entityType: dest.entityType,
        entitySlug: dest.entitySlug,
        body: toShareBody(ref),
        mediaUrl: ref.kind === "archivo" ? ref.url : undefined,
    });
    if (res.ok) return { ok: true };
    return { ok: false, needsAuth: res.needsAuth, error: res.error ?? "No se pudo publicar." };
}

/** Destino CEREBRO: añade el recurso como fuente/memoria del cerebro. */
export async function shareToBrain(brainId: string, ref: ShareResourceRef): Promise<ShareActionResult> {
    if (!brainId) return { ok: false, error: "Elige un cerebro." };
    const href = deepLinkFor(ref);
    const content = [
        `# ${ref.name}`,
        "",
        ref.note ? `${ref.note}\n` : "",
        `- Tipo: ${ref.kind}`,
        href ? `- Enlace: ${href}` : "",
        ref.url && ref.url !== href ? `- URL: ${ref.url}` : "",
        "",
        `_Añadido como fuente compartida el ${new Date().toLocaleString("es-ES")}._`,
    ]
        .filter((l) => l !== undefined)
        .join("\n");
    const file = await saveMemoryFile({
        brain_id: brainId,
        name: `Fuente · ${ref.name}`.slice(0, 80),
        content,
        source: "starseed",
        server_config: {},
        meta: { category: "compartido", kind: ref.kind, tags: ["compartido"], sourceUrl: href },
        sync: true,
    });
    return file ? { ok: true } : { ok: false, needsAuth: true, error: "No se pudo añadir al cerebro. ¿Sesión iniciada?" };
}

/** Tipo de ítem de biblioteca según el recurso (route interna vs enlace externo vs archivo). */
function libraryItemTypeFor(ref: ShareResourceRef): "file" | "route" | "external" {
    if (ref.kind === "archivo" && ref.url) return "file";
    if (ref.route) return "route";
    return "external";
}

/** Destino LIBRERÍA: copia/refiere el recurso en una biblioteca+folder. */
export async function shareToLibrary(
    dest: EntityRef,
    folderId: string | null,
    ref: ShareResourceRef,
): Promise<ShareActionResult> {
    if (!dest?.id) return { ok: false, error: "Elige una biblioteca." };
    const res = await saveItem(
        dest,
        {
            type: libraryItemTypeFor(ref),
            url: ref.url,
            route: ref.route,
            title: ref.name,
            note: ref.note,
            mime: ref.mime,
            tags: ["compartido"],
        },
        folderId ?? null,
    );
    // saveItem es local-first (guarda aunque no haya sesión): solo distingue ok.
    return res.ok ? { ok: true } : { ok: false, error: "No se pudo guardar en la biblioteca." };
}

/* ─────────────────────────── SYNCED_KEYS (para reportar) ─────────────────────────── */

/**
 * Clave efímera del store de adjuntos del Lienzo. NO es preferencia de usuario
 * ni debe sincronizarse (es de un solo salto navegador→/crear). Se exporta por
 * transparencia; NO añadir a SYNCED_KEYS.
 */
export const SHARE_EPHEMERAL_KEYS = [CREATION_ATTACH_KEY] as const;

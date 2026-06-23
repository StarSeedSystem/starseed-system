// src/lib/publish/publish.ts
// ─────────────────────────────────────────────────────────────────────────────
// Capa de PUBLICACIÓN UNIVERSAL de StarSeed OS sobre Supabase.
//
// Modela el flujo de creación multi-tipo / multi-perfil / multi-destino:
//   · PUBLICATION_TYPES → qué se publica (texto, artículo, imagen, archivo,
//     enlace, encuesta, propuesta, lienzo/pizarra, app, mixto) + sus formatos.
//   · DESTINATION_KINDS → a dónde se publica (página, perfil, grupo, comunidad,
//     entidad federativa, mensaje, chat IA, biblioteca, carpeta, red/feed).
//   · listProfiles()   → los perfiles del usuario (tabla `profiles`).
//   · listDestinations(kind) → opciones reales de cada tipo de destino.
//   · publish({...})   → escribe en la tabla correcta por destino y devuelve un
//     resultado por destino (HONESTO sobre cuáles entregan vs. solo registran).
//   · previewOf(...)   → modelo de vista previa normalizado para la UI.
//
// Filosofía de fallback (idéntica a `os-social.ts`): si Supabase falla, no está
// configurado o no hay sesión, degradamos con elegancia. Las lecturas devuelven
// listas vacías; las escrituras devuelven `{ ok:false, needsAuth }` o un estado
// "registered" cuando el destino no está respaldado por una tabla de entrega.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@/utils/supabase/client";

// ── IDs estables de tipos y destinos (en español, sin tildes para claves) ──

export type PublicationTypeId =
    | "texto"
    | "articulo"
    | "imagen"
    | "archivo"
    | "enlace"
    | "encuesta"
    | "propuesta"
    | "lienzo"
    | "app"
    | "mixto";

export type DestinationKindId =
    | "pagina"
    | "perfil"
    | "grupo"
    | "comunidad"
    | "entidad_federativa"
    | "mensaje"
    | "chat_ia"
    | "biblioteca"
    | "carpeta"
    | "red";

/** Definición de un tipo de publicación: qué es y qué formatos admite. */
export interface PublicationType {
    id: PublicationTypeId;
    label: string;
    /** Nombre de icono de `lucide-react` (la UI lo resuelve). */
    icon: string;
    blurb: string;
    /** Formatos/plantillas admitidos por este tipo. */
    formats: string[];
}

/** Definición de un tipo de destino: a dónde se entrega y con qué tabla. */
export interface DestinationKind {
    id: DestinationKindId;
    label: string;
    icon: string;
    /** Tabla de Supabase que respalda la ENTREGA (si la hay). */
    table?: string;
    blurb: string;
    /**
     * `delivered` → el destino se escribe en una tabla real de entrega.
     * `registered` → no hay tabla de entrega dedicada; se registra una
     *   referencia (honestidad: no implica difusión real todavía).
     */
    fulfillment: "delivered" | "registered";
}

// ── Catálogo de TIPOS DE PUBLICACIÓN ──

export const PUBLICATION_TYPES: PublicationType[] = [
    {
        id: "texto",
        label: "Texto",
        icon: "Type",
        blurb: "Una nota o publicación breve en texto plano o enriquecido.",
        formats: ["texto-plano", "markdown", "cita"],
    },
    {
        id: "articulo",
        label: "Artículo",
        icon: "Newspaper",
        blurb: "Una pieza larga con título, cuerpo y secciones.",
        formats: ["markdown", "long-form", "ensayo"],
    },
    {
        id: "imagen",
        label: "Imagen",
        icon: "Image",
        blurb: "Una imagen con pie de foto, desde URL o subida.",
        formats: ["single", "galeria", "meme"],
    },
    {
        id: "archivo",
        label: "Archivo",
        icon: "File",
        blurb: "Un documento o recurso adjunto (PDF, doc, dataset…).",
        formats: ["adjunto", "pdf", "dataset"],
    },
    {
        id: "enlace",
        label: "Enlace",
        icon: "Link",
        blurb: "Un enlace externo con previsualización.",
        formats: ["tarjeta", "embed", "marcador"],
    },
    {
        id: "encuesta",
        label: "Encuesta",
        icon: "Vote",
        blurb: "Una pregunta con opciones para votar.",
        formats: ["opcion-multiple", "si-no", "escala"],
    },
    {
        id: "propuesta",
        label: "Propuesta",
        icon: "ScrollText",
        blurb: "Una propuesta de gobernanza o decisión colectiva.",
        formats: ["estandar", "enmienda", "mocion"],
    },
    {
        id: "lienzo",
        label: "Lienzo / Pizarra",
        icon: "LayoutDashboard",
        blurb: "Un lienzo o pizarra visual exportada como publicación.",
        formats: ["snapshot", "embed-interactivo", "imagen"],
    },
    {
        id: "app",
        label: "App",
        icon: "AppWindow",
        blurb: "Una mini-app o widget incrustable.",
        formats: ["embed", "tarjeta", "manifiesto"],
    },
    {
        id: "mixto",
        label: "Mixto",
        icon: "Sparkles",
        blurb: "Contenido combinado: texto + medios + adjuntos.",
        formats: ["compuesto", "hilo", "historia"],
    },
];

// ── Catálogo de TIPOS DE DESTINO ──
//
// HONESTIDAD: las tablas `posts` y `astraura_messages` son destinos de ENTREGA
// reales. Para `biblioteca` y `carpeta` usamos `posts` con un flag (referencia),
// y para el resto que no tiene tabla propia (entidad federativa) se registra como
// publicación con `post_references` indicando el destino — marcado "registered".

export const DESTINATION_KINDS: DestinationKind[] = [
    {
        id: "red",
        label: "Red / Feed",
        icon: "Globe",
        table: "posts",
        blurb: "Tu feed público en la red StarSeed.",
        fulfillment: "delivered",
    },
    {
        id: "pagina",
        label: "Página",
        icon: "FileText",
        table: "pages",
        blurb: "Una página (perfil de proyecto, comunidad, etc.).",
        fulfillment: "delivered",
    },
    {
        id: "perfil",
        label: "Perfil",
        icon: "UserCheck",
        table: "profiles",
        blurb: "Otro perfil (el tuyo u otro al que puedas publicar).",
        fulfillment: "delivered",
    },
    {
        id: "grupo",
        label: "Grupo",
        icon: "Users",
        table: "pages",
        blurb: "Un grupo del que eres miembro.",
        fulfillment: "delivered",
    },
    {
        id: "comunidad",
        label: "Comunidad",
        icon: "Users2",
        table: "pages",
        blurb: "Una comunidad o colectivo.",
        fulfillment: "delivered",
    },
    {
        id: "entidad_federativa",
        label: "Entidad federativa",
        icon: "Flag",
        // Sin tabla de entrega dedicada: se registra como referencia en `posts`.
        blurb: "Una entidad de gobernanza federativa.",
        fulfillment: "registered",
    },
    {
        id: "mensaje",
        label: "Mensaje",
        icon: "Send",
        table: "astraura_messages",
        blurb: "Como mensaje en una conversación.",
        fulfillment: "delivered",
    },
    {
        id: "chat_ia",
        label: "Chat IA",
        icon: "BrainCircuit",
        table: "astraura_messages",
        blurb: "Hacia un chat con la IA (Astraura).",
        fulfillment: "delivered",
    },
    {
        id: "biblioteca",
        label: "Biblioteca",
        icon: "LibraryBig",
        table: "vaults",
        blurb: "Guardar la referencia en una biblioteca / baúl.",
        fulfillment: "registered",
    },
    {
        id: "carpeta",
        label: "Carpeta",
        icon: "Box",
        table: "memories",
        blurb: "Archivar la referencia en una carpeta / memoria.",
        fulfillment: "registered",
    },
];

/** Búsqueda rápida de un tipo de destino por id. */
export function destinationKindById(id: string): DestinationKind | undefined {
    return DESTINATION_KINDS.find((k) => k.id === id);
}

/** Búsqueda rápida de un tipo de publicación por id. */
export function publicationTypeById(id: string): PublicationType | undefined {
    return PUBLICATION_TYPES.find((t) => t.id === id);
}

// ─────────────────────────────────────────────────────────────────────────────
// SESIÓN (SSR-safe; sólo en cliente)
// ─────────────────────────────────────────────────────────────────────────────

/** Devuelve el user id actual o null (sin sesión). No lanza. */
export async function getCurrentUserId(): Promise<string | null> {
    try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        return data.session?.user?.id ?? null;
    } catch {
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PERFILES DEL USUARIO
// ─────────────────────────────────────────────────────────────────────────────

/** Perfil normalizado del usuario (origen de publicación). */
export interface PublishProfile {
    id: string;
    type: string;
    handle: string;
    displayName: string;
}

interface ProfileRow {
    id: string;
    user_id?: string | null;
    type?: string | null;
    handle?: string | null;
    display_name?: string | null;
}

function normalizeProfile(row: ProfileRow): PublishProfile {
    return {
        id: row.id,
        type: row.type || "personal",
        handle: row.handle || "",
        displayName: row.display_name || row.handle || "Perfil",
    };
}

/**
 * Lista los perfiles del usuario actual (tabla `profiles`, filtrando por
 * `user_id`). Si no hay sesión o falla, devuelve `[]` (degradación elegante).
 */
export async function listProfiles(): Promise<PublishProfile[]> {
    const uid = await getCurrentUserId();
    if (!uid) return [];
    try {
        const supabase = createClient();
        const { data, error } = await supabase
            .from("profiles")
            .select("id, user_id, type, handle, display_name")
            .eq("user_id", uid);
        if (error) throw error;
        return ((data as ProfileRow[]) || []).map(normalizeProfile);
    } catch {
        return [];
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// OPCIONES DE DESTINO (por tipo de destino)
// ─────────────────────────────────────────────────────────────────────────────

/** Una opción concreta de destino (p. ej. una página o un chat). */
export interface DestinationOption {
    /** id de la fila destino (page_id, profile_id, chat_id, vault id…). */
    id: string;
    label: string;
    /** Subtítulo opcional (tipo, handle, etc.). */
    sub?: string;
    /** El tipo de destino al que pertenece. */
    kind: DestinationKindId;
}

interface PageRow {
    id: string;
    type?: string | null;
    title?: string | null;
}
interface VaultRow {
    id: string;
    name?: string | null;
}
interface MemoryRow {
    id: string;
    name?: string | null;
}
interface ChatRow {
    chat_id?: string | null;
}

/**
 * Carga las opciones disponibles para un tipo de destino desde la tabla
 * adecuada. Tolerante a fallos: devuelve `[]` si la tabla no existe / no hay
 * sesión / RLS bloquea. Esto permite que la UI se degrade sin romperse.
 *
 *  · pagina / grupo / comunidad → `pages` (filtrando por `type` cuando aplica),
 *    cruzando con `page_members` para mostrar a las que el usuario pertenece.
 *  · perfil → `profiles` (todos los perfiles del usuario actual).
 *  · biblioteca → `vaults`.
 *  · carpeta → `memories`.
 *  · mensaje / chat_ia → chats distintos de `astraura_messages` del usuario.
 *  · red → un único destino implícito ("Feed público").
 *  · entidad_federativa → `pages` de tipo entidad federativa (si existieran).
 */
export async function listDestinations(
    kind: DestinationKindId,
): Promise<DestinationOption[]> {
    const supabase = createClient();
    const uid = await getCurrentUserId();

    try {
        switch (kind) {
            case "red":
                // Feed implícito: no requiere selección de fila concreta.
                return [
                    {
                        id: "feed",
                        label: "Feed público",
                        sub: "Tu red StarSeed",
                        kind,
                    },
                ];

            case "perfil": {
                const profiles = await listProfiles();
                return profiles.map((p) => ({
                    id: p.id,
                    label: p.displayName,
                    sub: p.handle ? "@" + p.handle : p.type,
                    kind,
                }));
            }

            case "pagina":
            case "grupo":
            case "comunidad":
            case "entidad_federativa": {
                // Mapeo del tipo de destino al `type` esperado en `pages`.
                const typeFilter: Record<string, string | undefined> = {
                    pagina: undefined, // cualquier página
                    grupo: "grupo",
                    comunidad: "comunidad",
                    entidad_federativa: "entidad_federativa",
                };
                let query = supabase.from("pages").select("id, type, title");
                const t = typeFilter[kind];
                if (t) query = query.eq("type", t);
                const { data, error } = await query.limit(100);
                if (error) throw error;
                let rows: DestinationOption[] = ((data as PageRow[]) || []).map((r) => ({
                    id: r.id,
                    label: r.title || "Página",
                    sub: r.type || undefined,
                    kind,
                }));

                // Para grupos/comunidades, prioriza aquellas donde el usuario es
                // miembro (page_members). Si no se puede, se queda la lista plena.
                if ((kind === "grupo" || kind === "comunidad") && uid) {
                    try {
                        const { data: mine } = await supabase
                            .from("page_members")
                            .select("page_id, profile_id")
                            .eq("profile_id", uid);
                        const mineIds = new Set(
                            ((mine as { page_id: string }[]) || []).map((m) => m.page_id),
                        );
                        if (mineIds.size > 0) {
                            rows = rows.filter((r) => mineIds.has(r.id));
                        }
                    } catch {
                        /* sin page_members: dejamos la lista completa */
                    }
                }
                return rows;
            }

            case "biblioteca": {
                const { data, error } = await supabase
                    .from("vaults")
                    .select("id, name")
                    .limit(100);
                if (error) throw error;
                return ((data as VaultRow[]) || []).map((r) => ({
                    id: r.id,
                    label: r.name || "Biblioteca",
                    kind,
                }));
            }

            case "carpeta": {
                const { data, error } = await supabase
                    .from("memories")
                    .select("id, name")
                    .limit(100);
                if (error) throw error;
                return ((data as MemoryRow[]) || []).map((r) => ({
                    id: r.id,
                    label: r.name || "Carpeta",
                    kind,
                }));
            }

            case "mensaje":
            case "chat_ia": {
                if (!uid) return [];
                // Chats distintos del usuario en `astraura_messages`.
                const { data, error } = await supabase
                    .from("astraura_messages")
                    .select("chat_id")
                    .eq("user_id", uid)
                    .limit(200);
                if (error) throw error;
                const seen = new Set<string>();
                const opts: DestinationOption[] = [];
                for (const r of (data as ChatRow[]) || []) {
                    const cid = r.chat_id;
                    if (cid && !seen.has(cid)) {
                        seen.add(cid);
                        opts.push({
                            id: cid,
                            label: cid === "default" ? "Chat principal" : "Chat " + cid.slice(0, 8),
                            kind,
                        });
                    }
                }
                // Siempre ofrece un chat por defecto como destino.
                if (!seen.has("default")) {
                    opts.unshift({ id: "default", label: "Chat principal", kind });
                }
                return opts;
            }

            default:
                return [];
        }
    } catch {
        // Degradación: sin opciones reales. La UI mostrará "sin destinos".
        // Para red devolvemos al menos el feed implícito.
        if (kind === "red") {
            return [{ id: "feed", label: "Feed público", kind }];
        }
        return [];
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLICAR
// ─────────────────────────────────────────────────────────────────────────────

/** Un destino seleccionado concreto (tipo + fila). */
export interface SelectedDestination {
    kind: DestinationKindId;
    id: string;
    label?: string;
}

/** Contenido normalizado de la publicación (depende del tipo). */
export interface PublishContent {
    /** Título (artículo, propuesta, encuesta…). */
    title?: string;
    /** Cuerpo de texto / markdown. */
    body?: string;
    /** URL de medio (imagen, archivo, enlace, embed). */
    url?: string;
    /** URLs múltiples (galería). */
    urls?: string[];
    /** Opciones de encuesta. */
    options?: string[];
    /** Metadatos libres adicionales. */
    meta?: Record<string, unknown>;
}

export interface PublishInput {
    type: PublicationTypeId;
    format: string;
    /** Perfiles desde los que se publica (uno o varios). */
    fromProfiles: string[];
    /** Destinos seleccionados. */
    destinations: SelectedDestination[];
    content: PublishContent;
}

/** Resultado de la entrega a UN destino. */
export interface DestinationResult {
    kind: DestinationKindId;
    id: string;
    label?: string;
    ok: boolean;
    /** `delivered` (escrito en tabla de entrega) o `registered` (referencia). */
    status: "delivered" | "registered" | "failed" | "needs_auth";
    /** id de la fila creada, si la hubo. */
    recordId?: string;
    error?: string;
}

/** Resultado global de `publish`. */
export interface PublishResult {
    ok: boolean;
    needsAuth?: boolean;
    results: DestinationResult[];
}

/** Visibilidad por defecto según el tipo de destino. */
function visibilityFor(kind: DestinationKindId): string {
    switch (kind) {
        case "red":
            return "public";
        case "mensaje":
        case "chat_ia":
            return "private";
        case "biblioteca":
        case "carpeta":
            return "private";
        default:
            return "members";
    }
}

/** Aplana el contenido a un texto legible (para mensajes / chats). */
function contentToText(content: PublishContent): string {
    const parts: string[] = [];
    if (content.title) parts.push(content.title);
    if (content.body) parts.push(content.body);
    if (content.url) parts.push(content.url);
    if (Array.isArray(content.urls) && content.urls.length) parts.push(content.urls.join("\n"));
    if (Array.isArray(content.options) && content.options.length) {
        parts.push(content.options.map((o, i) => i + 1 + ". " + o).join("\n"));
    }
    return parts.join("\n\n").trim() || "(sin contenido)";
}

/**
 * Publica el contenido a cada destino con la escritura adecuada:
 *
 *   · red / pagina / perfil / grupo / comunidad / entidad_federativa →
 *       INSERT en `posts`:
 *         { author_id: <perfil>, type, content (jsonb), visibility,
 *           post_references: { destinations, type, format, fromProfiles } }
 *       Para entidad_federativa el resultado se marca "registered" (no hay tabla
 *       de entrega dedicada; queda como referencia en post_references).
 *
 *   · mensaje / chat_ia →
 *       INSERT en `astraura_messages`:
 *         { user_id, chat_id, role:'user', content (texto), source:'publicacion' }
 *
 *   · biblioteca / carpeta →
 *       Guarda una REFERENCIA: INSERT en `posts` etiquetado como library/folder
 *       (visibility privada, post_references.library = destino). Resultado
 *       "registered". Si `posts` falla, intenta `memories` para carpeta.
 *
 * Se publica por CADA (perfil de origen × destino). Devuelve un resultado por
 * cada destino entregado. Tolerante a fallos individuales: un destino que falle
 * no aborta el resto.
 */
export async function publish(input: PublishInput): Promise<PublishResult> {
    const uid = await getCurrentUserId();
    if (!uid) return { ok: false, needsAuth: true, results: [] };

    const supabase = createClient();
    const results: DestinationResult[] = [];

    // Perfil de origen efectivo: usa el primero seleccionado, o el uid como
    // autor por defecto. RLS de `posts` valida author_id; si el perfil no es
    // válido como author_id, el INSERT fallará y se reportará por destino.
    const fromProfiles =
        input.fromProfiles && input.fromProfiles.length > 0 ? input.fromProfiles : [uid];
    const primaryAuthor = fromProfiles[0] || uid;

    const baseReferences = {
        destinations: input.destinations,
        type: input.type,
        format: input.format,
        fromProfiles,
    };

    for (const dest of input.destinations) {
        const kind = dest.kind;
        try {
            // ── Mensajes / Chats IA → astraura_messages ──
            if (kind === "mensaje" || kind === "chat_ia") {
                const { data, error } = await supabase
                    .from("astraura_messages")
                    .insert({
                        user_id: uid,
                        chat_id: dest.id || "default",
                        role: "user",
                        content: contentToText(input.content),
                        source: "publicacion",
                    })
                    .select("id")
                    .maybeSingle();
                if (error) throw error;
                results.push({
                    kind,
                    id: dest.id,
                    label: dest.label,
                    ok: true,
                    status: "delivered",
                    recordId: (data as { id?: string } | null)?.id,
                });
                continue;
            }

            // ── Biblioteca / Carpeta → referencia (posts taggeado), fallback memories ──
            if (kind === "biblioteca" || kind === "carpeta") {
                const refRow = {
                    author_id: primaryAuthor,
                    type: input.type,
                    content: input.content as unknown,
                    visibility: visibilityFor(kind),
                    post_references: {
                        ...baseReferences,
                        library: { kind, id: dest.id, label: dest.label },
                    },
                };
                const { data, error } = await supabase
                    .from("posts")
                    .insert(refRow)
                    .select("id")
                    .maybeSingle();
                if (!error) {
                    results.push({
                        kind,
                        id: dest.id,
                        label: dest.label,
                        ok: true,
                        status: "registered",
                        recordId: (data as { id?: string } | null)?.id,
                    });
                    continue;
                }
                // Fallback para carpeta: registrar en `memories`.
                if (kind === "carpeta") {
                    const { data: mem, error: memErr } = await supabase
                        .from("memories")
                        .insert({
                            name: input.content.title || "Referencia publicada",
                        })
                        .select("id")
                        .maybeSingle();
                    if (!memErr) {
                        results.push({
                            kind,
                            id: dest.id,
                            label: dest.label,
                            ok: true,
                            status: "registered",
                            recordId: (mem as { id?: string } | null)?.id,
                        });
                        continue;
                    }
                }
                throw error;
            }

            // ── Resto (red / pagina / perfil / grupo / comunidad / entidad_federativa)
            //    → INSERT en `posts` por cada perfil de origen. ──
            const isRegisteredOnly = destinationKindById(kind)?.fulfillment === "registered";
            let lastRecordId: string | undefined;
            let anyOk = false;
            let lastErr: string | undefined;

            for (const author of fromProfiles) {
                const row = {
                    author_id: author,
                    type: input.type,
                    content: input.content as unknown,
                    visibility: visibilityFor(kind),
                    post_references: {
                        ...baseReferences,
                        target: { kind, id: dest.id, label: dest.label },
                    },
                };
                const { data, error } = await supabase
                    .from("posts")
                    .insert(row)
                    .select("id")
                    .maybeSingle();
                if (error) {
                    lastErr = error.message;
                    continue;
                }
                anyOk = true;
                lastRecordId = (data as { id?: string } | null)?.id;
            }

            if (anyOk) {
                results.push({
                    kind,
                    id: dest.id,
                    label: dest.label,
                    ok: true,
                    status: isRegisteredOnly ? "registered" : "delivered",
                    recordId: lastRecordId,
                });
            } else {
                results.push({
                    kind,
                    id: dest.id,
                    label: dest.label,
                    ok: false,
                    status: "failed",
                    error: lastErr || "No se pudo insertar la publicación.",
                });
            }
        } catch (e: any) {
            results.push({
                kind,
                id: dest.id,
                label: dest.label,
                ok: false,
                status: "failed",
                error: e?.message || "error",
            });
        }
    }

    const ok = results.some((r) => r.ok);
    return { ok, results };
}

// ─────────────────────────────────────────────────────────────────────────────
// VISTA PREVIA
// ─────────────────────────────────────────────────────────────────────────────

/** Modelo normalizado de vista previa que la UI sabe renderizar. */
export interface PreviewModel {
    type: PublicationTypeId;
    format: string;
    /** Tipo de medio inferido para la previsualización. */
    kind: "text" | "markdown" | "image" | "gallery" | "file" | "link" | "poll" | "embed" | "canvas";
    title?: string;
    body?: string;
    url?: string;
    urls?: string[];
    options?: string[];
    domain?: string;
}

const IMG_RE = /\.(png|jpe?g|gif|webp|avif|svg)(\?[^\s]*)?$/i;

function safeDomain(url: string): string | undefined {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return undefined;
    }
}

/**
 * Devuelve un modelo de vista previa normalizado a partir del tipo, contenido y
 * formato. Determina el `kind` de preview a renderizar (texto, imagen, enlace…).
 */
export function previewOf(
    type: PublicationTypeId,
    content: PublishContent,
    format: string,
): PreviewModel {
    const base: PreviewModel = {
        type,
        format,
        kind: "text",
        title: content.title,
        body: content.body,
        url: content.url,
        urls: content.urls,
        options: content.options,
    };

    switch (type) {
        case "texto":
            return { ...base, kind: format === "markdown" ? "markdown" : "text" };
        case "articulo":
            return { ...base, kind: "markdown" };
        case "imagen":
            if (Array.isArray(content.urls) && content.urls.length > 1) {
                return { ...base, kind: "gallery" };
            }
            return { ...base, kind: "image" };
        case "archivo":
            return { ...base, kind: "file" };
        case "enlace":
            return {
                ...base,
                kind: "link",
                domain: content.url ? safeDomain(content.url) : undefined,
            };
        case "encuesta":
            return { ...base, kind: "poll" };
        case "propuesta":
            return { ...base, kind: "markdown" };
        case "lienzo":
            // Un snapshot de lienzo con URL de imagen se previsualiza como imagen.
            if (content.url && IMG_RE.test(content.url)) return { ...base, kind: "image" };
            return { ...base, kind: "canvas" };
        case "app":
            return { ...base, kind: "embed" };
        case "mixto":
            if (content.url && IMG_RE.test(content.url)) return { ...base, kind: "image" };
            return { ...base, kind: "markdown" };
        default:
            return base;
    }
}

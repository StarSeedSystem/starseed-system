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
    | "mixto"
    // ── Adenda "Publicaciones ricas" (aditivo, retrocompatible) ──
    | "galeria"
    | "codigo"
    | "transmision"
    | "proyecto"
    | "servidor";

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
    | "red"
    // ── Adenda "Lienzo de Creación Universal" (aditivo) ──
    | "evento";

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
    // ── Adenda "Publicaciones ricas" (aditivo, retrocompatible) ──
    {
        id: "galeria",
        label: "Galería",
        icon: "Images",
        blurb: "Varias imágenes o vídeos en un carrusel navegable.",
        formats: ["carrusel", "cuadricula", "antes-despues"],
    },
    {
        id: "codigo",
        label: "Código / Programa",
        icon: "Code2",
        blurb: "Un fragmento de código, repositorio o demo ejecutable.",
        formats: ["snippet", "repositorio", "demo-embed"],
    },
    {
        id: "transmision",
        label: "Transmisión",
        icon: "Radio",
        blurb: "Una emisión en vivo o grabada (audio/vídeo en directo).",
        formats: ["en-vivo", "grabacion", "enlace-stream"],
    },
    {
        id: "proyecto",
        label: "Proyecto",
        icon: "FolderKanban",
        blurb: "Un proyecto colectivo con recursos, hitos y adjuntos.",
        formats: ["resumen", "tablero", "hitos"],
    },
    {
        id: "servidor",
        label: "Servidor",
        icon: "Server",
        blurb: "Un nodo, instancia o servicio de la red para conectarse.",
        formats: ["estado", "invitacion", "panel"],
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
    // ── Adenda "Lienzo de Creación Universal" (aditivo) ──
    {
        id: "evento",
        label: "Evento",
        icon: "CalendarDays",
        // Sin tabla de entrega dedicada (misma honestidad que entidad_federativa):
        // se registra como referencia en `posts`, no hay garantía de difusión en
        // la página del evento todavía (fuera de alcance: no se toca esa página).
        blurb: "Un evento de la red (asistentes, agenda).",
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
interface OsEventRow {
    id: string;
    slug?: string | null;
    title?: string | null;
    owner_id?: string | null;
}

/** Opciones adicionales de `listDestinations` (Adenda "Lienzo de Creación
 *  Universal" · aditivo, retrocompatible — llamadas con un solo argumento
 *  conservan el comportamiento de siempre). */
export interface ListDestinationsOptions {
    /** Filtra a sólo destinos donde el usuario tiene permiso — ver honestidad
     *  más abajo sobre qué cuenta como "permiso" hoy. */
    onlyMine?: boolean;
    /** Filtro de texto (subcadena, sin distinguir mayúsculas) sobre la
     *  etiqueta, aplicado en cliente tras la carga. */
    query?: string;
}

/** Filtro de texto genérico sobre `label` (aditivo; no-op si `q` está vacío). */
function filterByQuery(rows: DestinationOption[], q?: string): DestinationOption[] {
    const term = (q || "").trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => r.label.toLowerCase().includes(term));
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
 *  · evento → `os_events` (Adenda "Lienzo de Creación Universal").
 *
 * `opts.onlyMine` filtra a destinos "donde tengo permiso": para pagina / grupo
 * / comunidad / entidad_federativa, permiso = ser miembro (`page_members`,
 * misma tabla que ya prioriza grupo/comunidad); para evento, permiso = ser
 * organizador (`os_events.owner_id`). HONESTO: no existe un ACL de "permiso de
 * publicación" dedicado en el repo — esta es la mejor señal ya disponible.
 * `opts.query` filtra por texto. Ambos aditivos — sin `opts`, comportamiento
 * idéntico al de siempre (usado hoy por `ReachSelector` y el "Ajuste avanzado").
 */
export async function listDestinations(
    kind: DestinationKindId,
    opts?: ListDestinationsOptions,
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
                return filterByQuery(
                    profiles.map((p) => ({
                        id: p.id,
                        label: p.displayName,
                        sub: p.handle ? "@" + p.handle : p.type,
                        kind,
                    })),
                    opts?.query,
                );
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

                // Membresía (`page_members`): con `onlyMine` es un filtro DURO
                // (para cualquiera de los 4 kinds de esta rama, incl. página y
                // entidad federativa); sin él, sólo PRIORIZA grupo/comunidad
                // cuando hay coincidencias — comportamiento IDÉNTICO al de antes.
                if (uid && (opts?.onlyMine || kind === "grupo" || kind === "comunidad")) {
                    try {
                        const { data: mine } = await supabase
                            .from("page_members")
                            .select("page_id, profile_id")
                            .eq("profile_id", uid);
                        const mineIds = new Set(
                            ((mine as { page_id: string }[]) || []).map((m) => m.page_id),
                        );
                        if (opts?.onlyMine || mineIds.size > 0) {
                            rows = rows.filter((r) => mineIds.has(r.id));
                        }
                    } catch {
                        /* sin page_members: lista completa (o vacía si onlyMine exigía filtrar) */
                        if (opts?.onlyMine) rows = [];
                    }
                }
                return filterByQuery(rows, opts?.query);
            }

            case "evento": {
                let query = supabase.from("os_events").select("id, slug, title, owner_id").limit(100);
                if (opts?.onlyMine && uid) query = query.eq("owner_id", uid);
                const { data, error } = await query;
                if (error) throw error;
                const rows: DestinationOption[] = ((data as OsEventRow[]) || []).map((r) => ({
                    id: r.slug || r.id,
                    label: r.title || "Evento",
                    sub: "evento",
                    kind,
                }));
                return filterByQuery(rows, opts?.query);
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
                const chatOpts: DestinationOption[] = [];
                for (const r of (data as ChatRow[]) || []) {
                    const cid = r.chat_id;
                    if (cid && !seen.has(cid)) {
                        seen.add(cid);
                        chatOpts.push({
                            id: cid,
                            label: cid === "default" ? "Chat principal" : "Chat " + cid.slice(0, 8),
                            kind,
                        });
                    }
                }
                // Siempre ofrece un chat por defecto como destino.
                if (!seen.has("default")) {
                    chatOpts.unshift({ id: "default", label: "Chat principal", kind });
                }
                return chatOpts;
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

// ─────────────────────────────────────────────────────────────────────────────
// ADJUNTOS MULTI-FORMATO (Adenda "Publicaciones ricas" · carrusel + ventana)
// ─────────────────────────────────────────────────────────────────────────────
//
// Un post puede llevar VARIOS adjuntos heterogéneos (imagen + código + PDF +
// app…) que se muestran como un carrusel estilo Instagram y se abren con
// `EmbeddedContentWindow` (ventana incrustada / pantalla completa / pestaña).
// Estructuralmente compatible con `PostAttachment` (network-feed.ts),
// `CommentAttachment` (post-entity.ts) y `UniversalAttachment` (os-files.ts):
// mismos campos base (kind/url/name/mime/title/description/thumbnail), así que
// convertir entre ellos es un simple object-literal, sin mapeos frágiles.

// ── Adenda "Contenido vivo en publicaciones" (aditivo, cero regresión) ──
// Un adjunto puede llevar, además de su forma estática de siempre, un MODO
// vivo: edición colaborativa en tiempo real (os_spaces) o canal en vivo del
// autor (os_app_servers). Ausente/"estatico" = comportamiento EXACTO de hoy.
export type LiveAttachmentMode = "estatico" | "edicion" | "canal";
export type LiveEditPermission = "grupal" | "publico" | "invitacion" | "servidor";

/** Un adjunto individual de un slide del carrusel multi-formato. */
export interface PostContentAttachment {
    id: string;
    /** Categoría amplia: imagen, video, audio, pdf, markdown, codigo, archivo,
     *  enlace, pagina, app, programa, widget, pizarra, servidor, agente, skill… */
    kind: string;
    url?: string;
    name?: string;
    title?: string;
    description?: string;
    mime?: string;
    thumbnail?: string;
    /** Contenido en línea para markdown/código sin URL (p. ej. pegado directo). */
    content?: string;
    /** Lenguaje para bloques de código. */
    language?: string;
    /** NUEVO · Modo vivo del adjunto (por defecto "estatico", ver arriba). */
    liveMode?: LiveAttachmentMode | null;
    /** NUEVO · Permiso de edición cuando liveMode="edicion". */
    livePermission?: LiveEditPermission | null;
    /** NUEVO · os_spaces.id que respalda la edición en vivo (grupal/publico/invitacion). */
    liveSpaceId?: string | null;
    /** NUEVO · os_app_servers.id que respalda el canal en vivo o el permiso "servidor". */
    liveServerId?: string | null;
    /** NUEVO · slug del servidor (para compartir por mensaje, mismo patrón que ServerCard). */
    liveServerSlug?: string | null;
    /** NUEVO · slug de grupo de referencia para el permiso "grupal" (os_memberships.group_slug). */
    liveGroupSlug?: string | null;
}

/** Proporción de la vista principal (adenda "cualquier proporción, tamaño máximo por contexto"). */
export type MainRatio = "auto" | "1:1" | "4:5" | "16:9" | "libre";

/** Catálogo de proporciones para el selector del compositor. */
export const RATIOS: { id: MainRatio; label: string; icon: string }[] = [
    { id: "auto", label: "Auto", icon: "Wand2" },
    { id: "1:1", label: "1:1", icon: "Square" },
    { id: "4:5", label: "4:5", icon: "RectangleVertical" },
    { id: "16:9", label: "16:9", icon: "RectangleHorizontal" },
    { id: "libre", label: "Libre (máx.)", icon: "Maximize2" },
];

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
    /** NUEVO · Adjuntos multi-formato (carrusel + ventana incrustada). */
    attachments?: PostContentAttachment[];
    /** NUEVO · Proporción de la vista principal (por defecto "auto"). */
    mainRatio?: MainRatio;
    /** NUEVO · Si se muestra la vista previa de adjuntos (por defecto true; permite publicaciones solo-texto con adjuntos "silenciosos"). */
    showPreview?: boolean;
}

export interface PublishInput {
    type: PublicationTypeId;
    format: string;
    /** Perfiles desde los que se publica (uno o varios). */
    fromProfiles: string[];
    /** Destinos seleccionados. */
    destinations: SelectedDestination[];
    content: PublishContent;
    // ── Módulo 5 · flujo guiado por intención (todos opcionales) ──
    /** Área principal (politica · educacion · cultura · general). */
    area?: AreaId;
    /** Sub-área (si el área la define): propuesta_legislativa, curso, etc. */
    subArea?: string;
    /** Tipo de publicación: principal (línea de tiempo) o historia. */
    postKind?: PostKindId;
    /** Configuración de votación (Módulo 5 · Votación Avanzada). */
    voting?: VotingConfig;
    /** Ámbito / alcance declarado de la publicación. */
    scope?: string;
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

    // ── Adenda "Lienzo de Creación Universal" (aditivo) · Singularidad del
    // contenido: un mismo `entityId` marca TODAS las filas creadas por ESTE acto
    // de publicar (multi-destino), aunque cada destino siga escribiendo su propia
    // fila en `posts` (necesario hoy: cada destino consulta su feed filtrando por
    // `post_references.target`, y tocar esa hidratación de feed queda fuera de
    // alcance). HONESTO: esto es metadato de correlación para una futura
    // consolidación de lectura — no deduplica todavía a nivel de UI/feed.
    const entityId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `entity_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

    const baseReferences = {
        destinations: input.destinations,
        type: input.type,
        format: input.format,
        fromProfiles,
        entityId,
        // ── Módulo 5 · intención de creación (se almacena en post_references) ──
        area: input.area ?? null,
        subArea: input.subArea ?? null,
        postKind: input.postKind ?? "principal",
        voting: input.voting ?? null,
        scope: input.scope ?? null,
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
    kind: "text" | "markdown" | "image" | "gallery" | "file" | "link" | "poll" | "embed" | "canvas" | "code";
    /** Adjuntos multi-formato (si el contenido los trae), para la vista previa en vivo. */
    attachments?: PostContentAttachment[];
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
        attachments: content.attachments,
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
        // ── Adenda "Publicaciones ricas" (aditivo) ──
        case "galeria":
            return { ...base, kind: "gallery" };
        case "codigo":
            return { ...base, kind: "code" };
        case "transmision":
            return { ...base, kind: "embed" };
        case "proyecto":
            return { ...base, kind: "markdown" };
        case "servidor":
            return { ...base, kind: "embed" };
        default:
            return base;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MÓDULO 5 · EL ACTO CREADOR — FLUJO GUIADO POR INTENCIÓN
// ─────────────────────────────────────────────────────────────────────────────
//
// El composer arranca preguntando por la INTENCIÓN (Área → Sub-Área → Tipo).
// Cada Área puede declarar Sub-Áreas, y cada Sub-Área puede cargar una PLANTILLA
// de campos específicos (p. ej. una Propuesta Legislativa con Exposición de
// Motivos, Articulado, Análisis de Impacto y Ámbito de Aplicación). Estos datos
// se almacenan dentro de `post_references` (area/subArea/postKind/voting/scope)
// para que la publicación —entidad atómica— conserve su intención de origen.
// ─────────────────────────────────────────────────────────────────────────────

/** IDs estables de las Áreas Principales. */
export type AreaId = "politica" | "educacion" | "cultura" | "general";

/** Tipo de publicación según destino: línea de tiempo vs. historias. */
export type PostKindId = "principal" | "historia";

/**
 * Un campo de una plantilla de Sub-Área. La UI lo renderiza como input o área de
 * texto según `kind`. El `id` se usa como clave dentro de `content.meta.template`.
 */
export interface TemplateField {
    id: string;
    label: string;
    /** Tipo de control que renderiza el composer. */
    kind: "text" | "textarea";
    placeholder?: string;
    /** Pista de ayuda contextual. */
    hint?: string;
}

/** Una Sub-Área de un Área (con plantilla de campos opcional). */
export interface SubArea {
    id: string;
    label: string;
    blurb?: string;
    /** Nombre de icono de `lucide-react` (la UI lo resuelve). */
    icon?: string;
    /** Campos de plantilla específicos que el composer muestra al crear. */
    template?: TemplateField[];
}

/** Un Área Principal del acto creador. */
export interface Area {
    id: AreaId;
    label: string;
    blurb: string;
    icon: string;
    /** Sub-áreas disponibles (vacío si el área no se subdivide). */
    sub: SubArea[];
}

/** Catálogo de Tipos de Publicación por destino (Principal / Historia). */
export const POST_KINDS: { id: PostKindId; label: string; icon: string; blurb: string }[] = [
    {
        id: "principal",
        label: "Publicación Principal",
        icon: "LayoutDashboard",
        blurb: "Aparece en la línea de tiempo (feed) de tus destinos.",
    },
    {
        id: "historia",
        label: "Historia",
        icon: "Sparkles",
        blurb: "Aparece en la sección de Historias (efímera / destacada).",
    },
];

// ── Plantillas específicas (Política) ──

/** Plantilla de campos para una Propuesta Legislativa. */
const TEMPLATE_PROPUESTA_LEGISLATIVA: TemplateField[] = [
    {
        id: "exposicion_motivos",
        label: "Exposición de Motivos",
        kind: "textarea",
        placeholder: "Justificación, contexto y finalidad de la propuesta…",
        hint: "El porqué de la norma: problema que resuelve y objetivos.",
    },
    {
        id: "articulado",
        label: "Articulado",
        kind: "textarea",
        placeholder: "Artículo 1. … Artículo 2. …",
        hint: "El texto normativo, estructurado en artículos.",
    },
    {
        id: "analisis_impacto",
        label: "Análisis de Impacto",
        kind: "textarea",
        placeholder: "Efectos sociales, económicos y ambientales esperados…",
        hint: "Consecuencias previstas y a quién afectan.",
    },
    {
        id: "ambito_aplicacion",
        label: "Ámbito de Aplicación",
        kind: "text",
        placeholder: "Territorial / personal / temporal de aplicación",
        hint: "Dónde y a quién aplica la propuesta.",
    },
];

/** Plantilla de campos para un Caso Judicial. */
const TEMPLATE_CASO_JUDICIAL: TemplateField[] = [
    {
        id: "partes",
        label: "Partes",
        kind: "textarea",
        placeholder: "Demandante(s), demandado(s) y representación…",
        hint: "Quiénes intervienen en el caso.",
    },
    {
        id: "hechos",
        label: "Hechos",
        kind: "textarea",
        placeholder: "Relato cronológico de los hechos relevantes…",
        hint: "Qué ocurrió, en orden y con datos verificables.",
    },
    {
        id: "principios_afectados",
        label: "Principios Afectados",
        kind: "textarea",
        placeholder: "Derechos y principios en juego…",
        hint: "Normas, derechos o principios que se discuten.",
    },
    {
        id: "pruebas",
        label: "Pruebas",
        kind: "textarea",
        placeholder: "Documentos, testimonios y evidencias aportadas…",
        hint: "Elementos probatorios del caso.",
    },
];

// ── Catálogo de ÁREAS (Módulo 5 · paso 1 del acto creador) ──

export const AREAS: Area[] = [
    {
        id: "politica",
        label: "Política",
        blurb: "Gobernanza, leyes y decisiones colectivas.",
        icon: "Scale",
        sub: [
            {
                id: "propuesta_legislativa",
                label: "Propuesta Legislativa",
                blurb: "Una norma propuesta para deliberación y voto.",
                icon: "ScrollText",
                template: TEMPLATE_PROPUESTA_LEGISLATIVA,
            },
            {
                id: "caso_judicial",
                label: "Caso Judicial",
                blurb: "Un caso para análisis y resolución.",
                icon: "Gavel",
                template: TEMPLATE_CASO_JUDICIAL,
            },
        ],
    },
    {
        id: "educacion",
        label: "Educación",
        blurb: "Conocimiento, formación y aprendizaje.",
        icon: "GraduationCap",
        sub: [
            {
                id: "curso",
                label: "Curso",
                blurb: "Un itinerario formativo con módulos.",
                icon: "BookOpen",
                template: [
                    { id: "objetivos", label: "Objetivos de Aprendizaje", kind: "textarea", placeholder: "Qué aprenderá el estudiante…" },
                    { id: "temario", label: "Temario", kind: "textarea", placeholder: "Módulos y lecciones…" },
                    { id: "requisitos", label: "Requisitos", kind: "text", placeholder: "Conocimientos previos recomendados" },
                ],
            },
            {
                id: "articulo",
                label: "Artículo",
                blurb: "Una pieza divulgativa o académica.",
                icon: "Newspaper",
                template: [
                    { id: "resumen", label: "Resumen", kind: "textarea", placeholder: "Síntesis del artículo…" },
                    { id: "referencias", label: "Referencias", kind: "textarea", placeholder: "Fuentes y bibliografía…" },
                ],
            },
            {
                id: "espacio",
                label: "Espacio",
                blurb: "Un espacio de estudio o comunidad de aprendizaje.",
                icon: "Users2",
                template: [
                    { id: "proposito", label: "Propósito", kind: "textarea", placeholder: "Para qué sirve este espacio…" },
                    { id: "normas", label: "Normas de Convivencia", kind: "textarea", placeholder: "Reglas del espacio…" },
                ],
            },
        ],
    },
    {
        id: "cultura",
        label: "Cultura",
        blurb: "Arte, expresión, eventos y comunidad.",
        icon: "Palette",
        sub: [
            {
                id: "publicacion",
                label: "Publicación",
                blurb: "Una obra o pieza cultural.",
                icon: "Image",
                template: [
                    { id: "descripcion", label: "Descripción", kind: "textarea", placeholder: "Sobre la obra…" },
                    { id: "creditos", label: "Créditos", kind: "text", placeholder: "Autoría y colaboraciones" },
                ],
            },
            {
                id: "evento",
                label: "Evento",
                blurb: "Una convocatoria con fecha y lugar.",
                icon: "Flag",
                template: [
                    { id: "fecha", label: "Fecha y Hora", kind: "text", placeholder: "Cuándo ocurre" },
                    { id: "lugar", label: "Lugar", kind: "text", placeholder: "Dónde (físico o virtual)" },
                    { id: "programa", label: "Programa", kind: "textarea", placeholder: "Actividades y agenda…" },
                ],
            },
            {
                id: "historia",
                label: "Historia",
                blurb: "Un relato o narración cultural.",
                icon: "BookOpen",
                template: [
                    { id: "sinopsis", label: "Sinopsis", kind: "textarea", placeholder: "De qué trata la historia…" },
                ],
            },
        ],
    },
    {
        id: "general",
        label: "General",
        blurb: "Sin un área específica; publicación libre.",
        icon: "Globe",
        sub: [],
    },
];

/** Búsqueda rápida de un Área por id. */
export function areaById(id: string): Area | undefined {
    return AREAS.find((a) => a.id === id);
}

/** Búsqueda rápida de una Sub-Área dentro de un Área. */
export function subAreaById(areaId: string, subId: string): SubArea | undefined {
    return areaById(areaId)?.sub.find((s) => s.id === subId);
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN DE VOTACIÓN (Módulo 5 · F. Votación Avanzada)
// ─────────────────────────────────────────────────────────────────────────────

/** Configuración de votación asociada a la publicación. */
export interface VotingConfig {
    /** Si la publicación admite votación. */
    enabled: boolean;
    /** Modo de votación (simple por defecto). */
    mode?: "simple" | "ponderada" | "cuadratica";
    /** Umbral de aprobación (0–100 %). */
    threshold?: number;
}

/** Configuración de votación por defecto (desactivada). */
export const DEFAULT_VOTING: VotingConfig = {
    enabled: false,
    mode: "simple",
    threshold: 50,
};

// ─────────────────────────────────────────────────────────────────────────────
// ALCANCE (Módulo 5 · A. visibilidad contextual y alcance transparente)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resume en español DÓNDE vivirá la publicación (su "alcance"): los hogares
 * —perfiles, páginas, grupos, chats, bibliotecas…— donde quedará referenciada
 * la entidad atómica. Pensado para mostrarse en la Vista Previa.
 *
 * No accede a la red: trabaja sólo sobre los destinos ya seleccionados.
 */
export function reachOf(destinations: SelectedDestination[]): string {
    if (!destinations || destinations.length === 0) {
        return "Sin destinos: la publicación no tendrá alcance todavía.";
    }

    // Agrupa por tipo de destino para un resumen legible.
    const counts = new Map<DestinationKindId, number>();
    for (const d of destinations) {
        counts.set(d.kind, (counts.get(d.kind) || 0) + 1);
    }

    // Etiquetas en plural por tipo de destino.
    const plural: Record<DestinationKindId, [string, string]> = {
        red: ["feed", "feeds"],
        pagina: ["página", "páginas"],
        perfil: ["perfil", "perfiles"],
        grupo: ["grupo", "grupos"],
        comunidad: ["comunidad", "comunidades"],
        entidad_federativa: ["entidad federativa", "entidades federativas"],
        mensaje: ["mensaje", "mensajes"],
        chat_ia: ["chat IA", "chats IA"],
        biblioteca: ["biblioteca", "bibliotecas"],
        carpeta: ["carpeta", "carpetas"],
        evento: ["evento", "eventos"],
    };

    const parts: string[] = [];
    for (const [kind, n] of counts) {
        const [sing, plur] = plural[kind] || [kind, kind];
        parts.push(n + " " + (n === 1 ? sing : plur));
    }

    // Une con comas y una "y" final.
    let where: string;
    if (parts.length === 1) {
        where = parts[0];
    } else {
        where = parts.slice(0, -1).join(", ") + " y " + parts[parts.length - 1];
    }

    const total = destinations.length;
    const homes = total === 1 ? "1 hogar" : total + " hogares";
    return (
        "La publicación vivirá como una entidad única, referenciada en " +
        homes +
        ": " +
        where +
        "."
    );
}

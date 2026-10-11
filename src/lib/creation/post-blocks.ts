import { type Marco, normalizarMarco } from "@/lib/profile/marco-foto";

/** Tipos de bloque. Los 5 primeros son LEGADOS (markdown en el cuerpo). */
export type PostBlockType =
    | "texto"
    | "imagen"
    | "archivo"
    | "enlace"
    | "widget"
    // ── Nuevos (Adenda 66 §6): se renderizan desde ss:meta.blocks ──
    | "portada"
    | "codigo"
    | "pagina"
    | "repo"
    | "pizarra"
    | "agente"
    | "mapa"
    | "grafica"
    | "referencia"
    | "entidad"
    // ── Adenda 67 · P4 (jul-2026): dos bloques nuevos, ADITIVOS ──
    /**
     * P4-2 · Diseño de Penpot (open source, MPL-2.0). Guarda el enlace de VISTA
     * («share prototype link») del diseño. HONESTIDAD: la instancia oficial
     * design.penpot.app manda `X-Frame-Options: SAMEORIGIN` (verificado), así
     * que el render por defecto es una TARJETA con enlace; la incrustación solo
     * se ofrece cuando el autor apunta a una instancia PROPIA que la permite
     * (campo `system` = "embed"). Nunca mostramos un iframe que sabemos vacío.
     */
    | "penpot"
    /**
     * P4-3 · Vídeo ya exportado (p. ej. editado con OpenCut). Reproduce el
     * fichero REAL (`url`) con <video>. HONESTIDAD: OpenCut no tiene API hoy
     * (su Editor API/headless/MCP son futuros según su propio README), así que
     * el OS no edita por ti: abre el editor y publica el vídeo que exportes.
     */
    | "video"
    // ── Protomolécula (Ola 1010P): bloque universal de creación y edición ──
    | "protomolecula";

/** Tipo de recurso referenciado por un bloque `referencia` (o por el SourcePicker). */
export type PostBlockRefKind =
    | "brain"
    | "library"
    | "folder"
    | "file"
    | "page"
    | "profile"
    | "group"
    | "community"
    | "event"
    | "neuron"
    | "url";

/** Referencia normalizada a un recurso de la red (Entidad Única enlazada). */
export interface PostBlockRef {
    kind: PostBlockRefKind;
    /** Id/slug/uid del recurso. */
    id: string;
    /** Etiqueta legible para la tarjeta. */
    label?: string;
    /** Ruta interna del OS para abrir el recurso (si aplica). */
    route?: string;
    /** URL externa o de archivo (si aplica). */
    url?: string;
    /** Folder destino dentro de una biblioteca (referencia a folder/archivo). */
    folderId?: string | null;
    /** Id del ítem dentro de una biblioteca (referencia a archivo concreto). */
    itemId?: string;
    /** Vocabulario EntityKind del dueño de la biblioteca (user/page/group…). */
    libraryKind?: string;
}

export interface ChartDatum {
    label: string;
    value: number;
}

export type ChartKind = "bar" | "line" | "area" | "pie";

/** Lenguaje del bloque de código ejecutable. */
export type CodeLang = "html" | "css" | "js" | "jsx";

/**
 * Un bloque del Lienzo. Campos OPCIONALES según el tipo (unión "ancha" a
 * propósito para simplificar el compositor y la serialización). El render y el
 * editor sólo leen los campos relevantes a `type`.
 */
export interface PostBlock {
    id: string;
    type: PostBlockType;
    /** texto: contenido · enlace: etiqueta · portada/genérico: título. */
    text?: string;
    /** imagen/archivo/portada: URL pública · enlace/pizarra: URL · widget: id. */
    url?: string;
    /** imagen/archivo: nombre original. */
    name?: string;
    // ── programa/código y página dinámica ──
    code?: string;
    language?: CodeLang;
    // ── mapa ──
    lat?: number;
    lng?: number;
    place?: string;
    // ── gráfica ──
    chartType?: ChartKind;
    data?: ChartDatum[];
    // ── agente/bot ──
    system?: string;
    persona?: string;
    // ── referencia (cerebro/biblioteca/folder/archivo/entidad/neurona) ──
    ref?: PostBlockRef;
    /**
     * (Adenda 219) imagen/portada/video: MARCO opcional — forma de recorte
     * (círculo, estrella, hexágono…) y encuadre del medio dentro de ella. El
     * mismo modelo que la foto de perfil (src/lib/profile/marco-foto.ts).
     */
    marco?: Marco;
    /** SÓLO compositor (se elimina al serializar): subida en curso. */
    uploading?: boolean;
}

export const LEGACY_BLOCK_TYPES: readonly PostBlockType[] = [
    "texto",
    "imagen",
    "archivo",
    "enlace",
    "widget",
] as const;

export const RICH_BLOCK_TYPES: readonly PostBlockType[] = [
    "portada",
    "codigo",
    "pagina",
    "repo",
    "pizarra",
    "agente",
    "mapa",
    "grafica",
    "referencia",
    "entidad",
    // Adenda 67 · P4 (aditivos: los antiguos siguen exactamente igual).
    "penpot",
    "video",
    // Protomolécula (Ola 1010P)
    "protomolecula"
] as const;

/** ¿Es un bloque RICO (serializado en ss:meta, renderizado por el post-blocks-renderer)? */
export function isRichBlock(t: string | null | undefined): t is PostBlockType {
    return !!t && (RICH_BLOCK_TYPES as readonly string[]).includes(t);
}

/** Genera un id de bloque estable y URL-safe. */
export function newBlockId(): string {
    return `blk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Limpia campos transitorios/vacíos de un bloque para guardarlo en ss:meta. */
export function serializeBlock(b: PostBlock): PostBlock {
    const out: PostBlock = { id: b.id, type: b.type };
    const put = <K extends keyof PostBlock>(k: K, v: PostBlock[K]) => {
        if (v !== undefined && v !== null && v !== "") out[k] = v;
    };
    put("text", b.text);
    put("url", b.url);
    put("name", b.name);
    put("code", b.code);
    put("language", b.language);
    if (typeof b.lat === "number" && Number.isFinite(b.lat)) out.lat = b.lat;
    if (typeof b.lng === "number" && Number.isFinite(b.lng)) out.lng = b.lng;
    put("place", b.place);
    put("chartType", b.chartType);
    if (Array.isArray(b.data) && b.data.length > 0) {
        out.data = b.data
            .map((d) => ({ label: String(d?.label ?? ""), value: Number(d?.value) }))
            .filter((d) => Number.isFinite(d.value));
    }
    put("system", b.system);
    put("persona", b.persona);
    if (b.ref && typeof b.ref === "object" && b.ref.kind && b.ref.id) out.ref = b.ref;
    if (b.marco && typeof b.marco === "object") out.marco = normalizarMarco(b.marco);
    return out;
}

/** Serializa una lista de bloques (para embeber en ss:meta.blocks). */
export function serializeBlocks(list: PostBlock[]): PostBlock[] {
    return (list || []).map(serializeBlock);
}

// (Ola 224) Tope de tamaño para la metadata `ss:meta`. Viaja embebida en el body
// de os_posts sin columna propia, así que limitamos el JSON serializado para que
// un post enorme (código o datos de gráficas gigantes) no corrompa su cuerpo.
export const MAX_SS_META_BYTES = 48 * 1024;

/**
 * (Ola 224) Mide, en bytes (UTF-8), el JSON serializado de una lista de bloques
 * tal y como se embebería en `ss:meta.blocks` (vía serializeBlocks). Devuelve 0
 * si no hay bloques. SSR-safe: usa TextEncoder, global en Node y navegador.
 */
export function ssMetaBytes(blocks: PostBlock[]): number {
    const json = JSON.stringify(serializeBlocks(blocks));
    return new TextEncoder().encode(json).length;
}

/** Parsea, de forma defensiva, un array desconocido de ss:meta a PostBlock[]. */
export function parseBlocks(raw: unknown): PostBlock[] {
    if (!Array.isArray(raw)) return [];
    const out: PostBlock[] = [];
    for (const r of raw) {
        if (!r || typeof r !== "object") continue;
        const o = r as Record<string, unknown>;
        // Compat: la serialización antigua usaba `{ t: "texto" }` (sin datos ricos).
        const type = (typeof o.type === "string" ? o.type : typeof o.t === "string" ? o.t : "") as PostBlockType;
        if (!type) continue;
        const b: PostBlock = { id: typeof o.id === "string" ? o.id : newBlockId(), type };
        if (typeof o.text === "string") b.text = o.text;
        if (typeof o.url === "string") b.url = o.url;
        if (typeof o.name === "string") b.name = o.name;
        if (typeof o.code === "string") b.code = o.code;
        if (o.language === "html" || o.language === "css" || o.language === "js" || o.language === "jsx") {
            b.language = o.language;
        }
        if (typeof o.lat === "number") b.lat = o.lat;
        if (typeof o.lng === "number") b.lng = o.lng;
        if (typeof o.place === "string") b.place = o.place;
        if (o.chartType === "bar" || o.chartType === "line" || o.chartType === "area" || o.chartType === "pie") {
            b.chartType = o.chartType;
        }
        if (Array.isArray(o.data)) {
            b.data = o.data
                .map((d) => {
                    const dd = (d ?? {}) as Record<string, unknown>;
                    return { label: String(dd.label ?? ""), value: Number(dd.value) };
                })
                .filter((d) => Number.isFinite(d.value));
        }
        if (typeof o.system === "string") b.system = o.system;
        if (typeof o.persona === "string") b.persona = o.persona;
        if (o.marco && typeof o.marco === "object") b.marco = normalizarMarco(o.marco);
        if (o.ref && typeof o.ref === "object") {
            const rr = o.ref as Record<string, unknown>;
            if (typeof rr.kind === "string" && typeof rr.id === "string") {
                b.ref = {
                    kind: rr.kind as PostBlockRefKind,
                    id: rr.id,
                    label: typeof rr.label === "string" ? rr.label : undefined,
                    route: typeof rr.route === "string" ? rr.route : undefined,
                    url: typeof rr.url === "string" ? rr.url : undefined,
                    folderId: typeof rr.folderId === "string" ? rr.folderId : rr.folderId === null ? null : undefined,
                    itemId: typeof rr.itemId === "string" ? rr.itemId : undefined,
                    libraryKind: typeof rr.libraryKind === "string" ? rr.libraryKind : undefined,
                };
            }
        }
        out.push(b);
    }
    return out;
}
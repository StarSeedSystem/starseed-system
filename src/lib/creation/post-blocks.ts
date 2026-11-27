// src/lib/creation/post-blocks.ts
// ─────────────────────────────────────────────────────────────────────────────
// MODELO COMPARTIDO de BLOQUES del Lienzo Universal (Adenda 66 §6).
//
// Un mismo tipo `PostBlock` se usa en:
//   · el COMPOSITOR  (src/components/creation/lienzo-composer.tsx + creation-blocks.tsx)
//   · el RENDER       (src/components/social/post-blocks-renderer.tsx)
//   · el PARSER       (src/lib/social-posts.ts → splitBodyAttachments)
//
// Los bloques ricos (código ejecutable, gráfica, agente, mapa, referencias…) se
// SERIALIZAN dentro de la metadata `ss:meta` del cuerpo del post (os_posts solo
// tiene body/media_url), no como markdown — el markdown no puede representarlos.
// Los bloques LEGADOS (texto/imagen/archivo/enlace/widget) siguen viajando como
// markdown en el cuerpo (comportamiento previo intacto); el render los ignora
// aquí para NO duplicarlos.
//
// SSR-safe: TypeScript puro, sin React ni acceso a `window`.
// ─────────────────────────────────────────────────────────────────────────────

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
    /** Referencia a entidad (página/perfil/grupo/comunidad/evento). */
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
    // ── Protomolécula (Ola 1010P): INSTANTÁNEA serializada de una molécula ──
    /**
     * Bloque `protomolecula`: lleva en `code` el texto de `serializarBloque`
     * (`src/lib/protomolecula/bloque-protomolecula.ts`, JSON versionado
     * `{pm: 1, molecula}`). Es una COPIA instantánea (contenido = referencia,
     * no duplicación de entidades), y un cliente viejo lo ignora como ignora
     * `penpot`/`video` al no estar en RICH_BLOCK_TYPES antiguos.
     */
    | "protomolecula"
    // ── OpenUI (Ola 1104R): respuesta viva con interfaz generativa ──
    /**
     * Bloque `respuesta-viva`: guarda el texto OpenUI Lang en `code` y se pinta
     * con `RespuestaViva` (`src/components/openui/respuesta-viva.tsx`).
     * El bloque serializa/deserializa sin perder el texto.
     */
    | "respuesta-viva";

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
    // Protomolécula (Ola 1010P, aditivo: los antiguos siguen exactamente igual).
    "protomolecula",
    // OpenUI (Ola 1104R, aditivo): respuesta viva.
    "respuesta-viva",
] as const;

/** ¿Es un bloque RICO (serializado en ss:meta, renderizado por el post-blocks-renderer)? */
export function isRichBlock(t: string | null | undefined): t is PostBlockType {
    return !!t && (RICH_BLOCK_TYPES as readonly string[]).includes(t);
}

/** Genera un id de bloque estable y URL-safe. */
export function newBlockId(): string {
    return `blk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const REF_KINDS: readonly PostBlockRefKind[] = [
    "brain",
    "library",
    "folder",
    "file",
    "page",
    "profile",
    "group",
    "community",
    "event",
    "neuron",
    "url",
];

const CODE_LANGS: readonly CodeLang[] = ["html", "css", "js", "jsx"];
const CHART_KINDS: readonly ChartKind[] = ["bar", "line", "area", "pie"];

function textoLimpio(v: unknown): string | undefined {
    return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

/**
 * Normaliza una referencia (`referencia`/`entidad`) a una COPIA con sólo los
 * campos conocidos. Descarta referencias sin `kind` válido o sin `id`, para que
 * un ss:meta corrupto no pinte tarjetas rotas ni arrastre campos ajenos.
 */
function normalizarRef(raw: unknown): PostBlockRef | undefined {
    if (!raw || typeof raw !== "object") return undefined;
    const r = raw as Record<string, unknown>;
    if (typeof r.kind !== "string" || !(REF_KINDS as readonly string[]).includes(r.kind)) return undefined;
    const id = textoLimpio(r.id)?.trim();
    if (!id) return undefined;
    const out: PostBlockRef = { kind: r.kind as PostBlockRefKind, id };
    const label = textoLimpio(r.label);
    if (label) out.label = label;
    const route = textoLimpio(r.route);
    if (route) out.route = route;
    const url = textoLimpio(r.url);
    if (url) out.url = url;
    if (r.folderId === null) out.folderId = null;
    else {
        const folderId = textoLimpio(r.folderId);
        if (folderId) out.folderId = folderId;
    }
    const itemId = textoLimpio(r.itemId);
    if (itemId) out.itemId = itemId;
    const libraryKind = textoLimpio(r.libraryKind);
    if (libraryKind) out.libraryKind = libraryKind;
    return out;
}

function numeroValido(v: unknown): number | undefined {
    if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
    if (typeof v === "string" && v.trim() !== "") {
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
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
    if (b.language && (CODE_LANGS as readonly string[]).includes(b.language)) out.language = b.language;
    if (typeof b.lat === "number" && Number.isFinite(b.lat)) out.lat = b.lat;
    if (typeof b.lng === "number" && Number.isFinite(b.lng)) out.lng = b.lng;
    put("place", b.place);
    if (b.chartType && (CHART_KINDS as readonly string[]).includes(b.chartType)) out.chartType = b.chartType;
    if (Array.isArray(b.data) && b.data.length > 0) {
        const data = b.data
            .map((d) => ({ label: String(d?.label ?? ""), value: numeroValido(d?.value) }))
            .filter((d): d is ChartDatum => d.value !== undefined);
        if (data.length > 0) out.data = data;
    }
    put("system", b.system);
    put("persona", b.persona);
    const ref = normalizarRef(b.ref);
    if (ref) out.ref = ref;
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
        if (typeof o.lat === "number" && Number.isFinite(o.lat)) b.lat = o.lat;
        if (typeof o.lng === "number" && Number.isFinite(o.lng)) b.lng = o.lng;
        if (typeof o.place === "string") b.place = o.place;
        if (o.chartType === "bar" || o.chartType === "line" || o.chartType === "area" || o.chartType === "pie") {
            b.chartType = o.chartType;
        }
        if (Array.isArray(o.data)) {
            const data = o.data
                .map((d) => {
                    const dd = (d ?? {}) as Record<string, unknown>;
                    return { label: String(dd.label ?? ""), value: numeroValido(dd.value) };
                })
                .filter((d): d is ChartDatum => d.value !== undefined);
            if (data.length > 0) b.data = data;
        }
        if (typeof o.system === "string") b.system = o.system;
        if (typeof o.persona === "string") b.persona = o.persona;
        if (o.marco && typeof o.marco === "object") b.marco = normalizarMarco(o.marco);
        const ref = normalizarRef(o.ref);
        if (ref) b.ref = ref;
        out.push(b);
    }
    return out;
}

// ─────────────────────────── Código ejecutable AISLADO ───────────────────────
//
// El código de una publicación se ejecuta SIEMPRE dentro de un <iframe> con
// `sandbox="allow-scripts"` y SIN `allow-same-origin`: el navegador le asigna un
// ORIGEN OPACO, sin acceso a cookies, localStorage ni a la sesión de Supabase de
// la app, ni al DOM del documento padre. Aquí sólo construimos el `srcDoc`.

const SANDBOX_BASE_CSS = `
  *,*::before,*::after{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#e7e7ee;background:#0b0b12;padding:12px;line-height:1.5}
  a{color:#7cc4ff}
  button{cursor:pointer}
  img,video,canvas,svg{max-width:100%;height:auto}
  ::-webkit-scrollbar{width:8px;height:8px}
  ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.18);border-radius:8px}
`.trim();

/** Escapa el cierre de </script> para poder incrustar JS del usuario con seguridad. */
function safeScript(code: string): string {
    return (code || "").replace(/<\/(script)/gi, "<\\/$1");
}

/**
 * Construye el documento HTML AISLADO (srcDoc) para un bloque de código/página.
 *  · html  → el código es el cuerpo (puede incluir <style> y <script>).
 *  · css   → se inyecta como <style> sobre un lienzo mínimo.
 *  · js    → se ejecuta dentro de un <script> con un contenedor #app.
 *  · jsx   → carga React + Babel (UMD, CDN) y ejecuta como <script type="text/babel">.
 * Nunca lanza: ante entrada vacía devuelve un documento base.
 */
export function buildSandboxDoc(
    b: Pick<PostBlock, "code" | "language">,
): string {
    const code = b.code || "";
    const lang: CodeLang = b.language || "html";
    const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${SANDBOX_BASE_CSS}</style>`;

    if (lang === "html") {
        // Documento (o fragmento) HTML del usuario. Si ya trae <html>, se respeta.
        if (/<html[\s>]/i.test(code)) return code;
        return `<!doctype html><html><head>${head}</head><body>${code}</body></html>`;
    }
    if (lang === "css") {
        return `<!doctype html><html><head>${head}<style>${code}</style></head><body><div class="preview">Vista previa de estilos.</div></body></html>`;
    }
    if (lang === "js") {
        return `<!doctype html><html><head>${head}</head><body><div id="app"></div><script>${safeScript(code)}</script></body></html>`;
    }
    // jsx (React vía CDN, dentro del propio iframe aislado).
    // SRI (Subresource Integrity) — hashes SHA-384 de las versiones exactas en unpkg.
    // Protege contra compromiso de la cadena de suministro (hallazgo SA102440).
    const react = `https://unpkg.com/react@18/umd/react.production.min.js`;
    const reactDom = `https://unpkg.com/react-dom@18/umd/react-dom.production.min.js`;
    const babel = `https://unpkg.com/@babel/standalone/babel.min.js`;
    const reactIntegrity = `sha384-DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z`;
    const reactDomIntegrity = `sha384-gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1`;
    const babelIntegrity = `sha384-r5Ldzi45mT2cLBHDFFiSsTooTu4rFdkBdx9D50zWqSmJ8FLuJkQQTF7h6ERx/NX0`;
    return [
        `<!doctype html><html><head>${head}`,
        `<script crossorigin integrity="${reactIntegrity}" src="${react}"></script>`,
        `<script crossorigin integrity="${reactDomIntegrity}" src="${reactDom}"></script>`,
        `<script crossorigin integrity="${babelIntegrity}" src="${babel}"></script>`,
        `</head><body><div id="root"></div>`,
        `<script type="text/babel" data-presets="react">`,
        safeScript(code),
        `</script></body></html>`,
    ].join("");
}

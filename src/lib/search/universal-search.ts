// src/lib/search/universal-search.ts
// -----------------------------------------------------------------------------
// BUSCADOR UNIVERSAL de StarSeed OS.
//
// `universalSearch(q)` lanza, EN PARALELO, una batería de consultas `ilike`/
// texto contra las tablas reales de la red (Supabase). Cada consulta va en su
// propio try/catch y está acotada por RLS: el cliente del navegador sólo recibe
// filas que el usuario puede leer. La función NUNCA lanza; ante cualquier fallo
// (tabla inexistente, columna distinta, sin sesión, sin red) degrada a vacío.
//
// Devuelve resultados CATEGORIZADOS, listos para renderizar, con un `href`
// in-app por ítem para que el resultado sea navegable e interconectado:
//   { perfiles, paginas, publicaciones, memorias, temas, cerebros, apps, lienzos }
//
// Rutas in-app (confirmadas en src/app/(app)):
//   · perfil       → /profile/<handle>
//   · publicación  → /post/<id>
//   · página       → /pagina/<slug>            (fallback /pagina/<id>)
//   · memoria      → /memorias
//   · tema/cat.    → /conocimiento
//   · cerebro      → /cerebros
//   · app generada → /apps-ia
//   · lienzo       → /pizarra
//
// Cada categoría se limita a ~10 ítems. SSR-safe: usa el cliente de navegador
// de @/utils/supabase/client (createBrowserClient).
// -----------------------------------------------------------------------------

import { createClient } from "@/utils/supabase/client";

// ------------------------------- Tipos --------------------------------------

/** Un resultado individual, normalizado para el renderizado. */
export interface SearchHit {
    /** Identificador estable de la fila (id, handle…). */
    id: string;
    /** Texto principal mostrado. */
    label: string;
    /** Subtítulo opcional (tipo, handle, blurb…). */
    sub?: string;
    /** Ruta in-app a la que enlaza el resultado. */
    href: string;
}

/** Claves de categoría devueltas por `universalSearch`. */
export type SearchCategoryKey =
    | "perfiles"
    | "paginas"
    | "publicaciones"
    | "memorias"
    | "temas"
    | "cerebros"
    | "apps"
    | "lienzos";

/** Resultados agrupados por categoría. */
export type UniversalSearchResults = Record<SearchCategoryKey, SearchHit[]>;

// ---------------------------- Constantes ------------------------------------

/** Tope de ítems por categoría. */
const CAP = 10;

/** Estructura vacía (se reutiliza como valor por defecto y "sin query"). */
export function emptyResults(): UniversalSearchResults {
    return {
        perfiles: [],
        paginas: [],
        publicaciones: [],
        memorias: [],
        temas: [],
        cerebros: [],
        apps: [],
        lienzos: [],
    };
}

/**
 * Metadatos de cada categoría para el renderizado (etiqueta + nombre de icono
 * de lucide-react). El consumidor mapea `icon` a su componente de icono. El
 * orden del array es el orden de presentación sugerido.
 */
export const SEARCH_CATEGORIES: ReadonlyArray<{
    key: SearchCategoryKey;
    label: string;
    /** Nombre del icono en lucide-react. */
    icon: string;
}> = [
    { key: "perfiles", label: "Perfiles", icon: "User" },
    { key: "paginas", label: "Páginas", icon: "Globe" },
    { key: "publicaciones", label: "Publicaciones", icon: "MessageSquare" },
    { key: "temas", label: "Conocimiento", icon: "BookOpen" },
    { key: "memorias", label: "Memorias", icon: "Library" },
    { key: "cerebros", label: "Cerebros", icon: "Cpu" },
    { key: "apps", label: "Apps IA", icon: "Sparkles" },
    { key: "lienzos", label: "Lienzos", icon: "Terminal" },
];

// ----------------------------- Utilidades -----------------------------------

/** Escapa los comodines de PostgREST `ilike` (`%` y `_`) en la entrada libre. */
function escapeLike(q: string): string {
    return q.replace(/[%_]/g, (m) => `\\${m}`);
}

/** slug URL-safe (mismo criterio que entity-links.slugify, sin importar nada). */
function slugify(input: string): string {
    return (input || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-{2,}/g, "-");
}

/** Devuelve un string legible para usar como `label`, con recorte de longitud. */
function toLabel(value: unknown, fallback: string, max = 90): string {
    let s = "";
    if (typeof value === "string") s = value;
    else if (value != null) {
        try {
            s = String(value);
        } catch {
            s = "";
        }
    }
    s = s.replace(/\s+/g, " ").trim();
    if (!s) return fallback;
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Extrae un texto legible de un `content` jsonb de `posts`, tolerando varias
 * formas habituales: string plano, { text }, { title }, { body }, bloques, etc.
 */
function extractPostText(content: any): string {
    if (content == null) return "";
    if (typeof content === "string") return content;
    if (typeof content !== "object") return String(content);

    // Campos directos más comunes.
    const direct =
        content.text ??
        content.title ??
        content.body ??
        content.caption ??
        content.summary ??
        content.markdown ??
        content.html;
    if (typeof direct === "string" && direct.trim()) return direct;

    // Bloques tipo editor: { blocks: [{ text }] } o array de bloques.
    const blocks = Array.isArray(content) ? content : content.blocks;
    if (Array.isArray(blocks)) {
        const joined = blocks
            .map((b: any) =>
                typeof b === "string" ? b : b?.text ?? b?.content ?? "",
            )
            .filter(Boolean)
            .join(" ");
        if (joined.trim()) return joined;
    }

    // Último recurso: serializar de forma compacta.
    try {
        return JSON.stringify(content);
    } catch {
        return "";
    }
}

/**
 * Ejecuta una "sonda" de búsqueda aislada. Si algo falla (tabla/columna
 * inexistente, RLS, red), devuelve `[]` sin propagar el error.
 */
async function probe(
    label: string,
    fn: () => Promise<SearchHit[]>,
): Promise<SearchHit[]> {
    try {
        const res = await fn();
        return Array.isArray(res) ? res.slice(0, CAP) : [];
    } catch (err) {
        // Silencioso por diseño: el buscador es best-effort.
        if (typeof console !== "undefined") {
            // eslint-disable-next-line no-console
            console.debug?.(`[universalSearch] sonda "${label}" falló:`, err);
        }
        return [];
    }
}

// --------------------------- Búsqueda universal -----------------------------

/**
 * Busca `q` a lo largo de la red y devuelve resultados categorizados.
 * Nunca lanza. Para `q` vacío/corto devuelve la estructura vacía.
 */
export async function universalSearch(q: string): Promise<UniversalSearchResults> {
    const out = emptyResults();

    const term = (q ?? "").trim();
    if (term.length < 2) return out;

    // Cliente de navegador (RLS aplica). Si no se puede crear, devolvemos vacío.
    let supabase: ReturnType<typeof createClient>;
    try {
        supabase = createClient();
    } catch {
        return out;
    }

    const like = `%${escapeLike(term)}%`;

    // Cada sonda es independiente y acotada por RLS + CAP. Se lanzan en paralelo.
    const [
        perfiles,
        paginas,
        publicaciones,
        memorias,
        temas,
        categorias,
        cerebros,
        vaults,
        apps,
        lienzos,
    ] = await Promise.all([
        // ── PERFILES ──────────────────────────────────────────────────────
        probe("profiles", async () => {
            const { data } = await supabase
                .from("profiles")
                .select("id, handle, display_name")
                .or(`display_name.ilike.${like},handle.ilike.${like}`)
                .limit(CAP);
            return (data ?? []).map((r: any): SearchHit => {
                const handle = (r.handle ?? "").toString().replace(/^@+/, "");
                return {
                    id: String(r.id ?? handle),
                    label: toLabel(r.display_name ?? r.handle, "Perfil"),
                    sub: handle ? `@${handle}` : undefined,
                    href: handle
                        ? `/profile/${encodeURIComponent(handle)}`
                        : `/profile/${encodeURIComponent(String(r.id ?? ""))}`,
                };
            });
        }),

        // ── PÁGINAS ───────────────────────────────────────────────────────
        probe("pages", async () => {
            const { data } = await supabase
                .from("pages")
                .select("id, title, type")
                .ilike("title", like)
                .limit(CAP);
            return (data ?? []).map((r: any): SearchHit => {
                const title = toLabel(r.title, "Página");
                const slug = slugify(r.title || "") || String(r.id ?? "");
                return {
                    id: String(r.id ?? slug),
                    label: title,
                    sub: r.type ? String(r.type) : undefined,
                    href: `/pagina/${encodeURIComponent(slug)}`,
                };
            });
        }),

        // ── PUBLICACIONES ─────────────────────────────────────────────────
        probe("posts", async () => {
            // `content` es jsonb; en Postgres se puede castear a texto e `ilike`.
            const { data } = await supabase
                .from("posts")
                .select("id, content, type")
                .ilike("content::text", like)
                .limit(CAP);
            return (data ?? []).map((r: any): SearchHit => {
                const text = extractPostText(r.content);
                return {
                    id: String(r.id ?? ""),
                    label: toLabel(text, "Publicación"),
                    sub: r.type ? String(r.type) : "Publicación",
                    href: `/post/${encodeURIComponent(String(r.id ?? ""))}`,
                };
            });
        }),

        // ── MEMORIAS ──────────────────────────────────────────────────────
        probe("memories", async () => {
            const { data } = await supabase
                .from("memories")
                .select("id, name, owner")
                .ilike("name", like)
                .limit(CAP);
            return (data ?? []).map((r: any): SearchHit => ({
                id: String(r.id ?? ""),
                label: toLabel(r.name, "Memoria"),
                sub: "Memoria",
                href: `/memorias`,
            }));
        }),

        // ── TEMAS DE CONOCIMIENTO ─────────────────────────────────────────
        probe("knowledge_topics", async () => {
            const { data } = await supabase
                .from("knowledge_topics")
                .select("id, name, blurb")
                .or(`name.ilike.${like},blurb.ilike.${like}`)
                .limit(CAP);
            return (data ?? []).map((r: any): SearchHit => ({
                id: String(r.id ?? ""),
                label: toLabel(r.name, "Tema"),
                sub: r.blurb ? toLabel(r.blurb, "", 60) : "Tema",
                href: `/conocimiento`,
            }));
        }),

        // ── CATEGORÍAS DE CONOCIMIENTO (se fusionan con "temas") ──────────
        probe("knowledge_categories", async () => {
            const { data } = await supabase
                .from("knowledge_categories")
                .select("id, name")
                .ilike("name", like)
                .limit(CAP);
            return (data ?? []).map((r: any): SearchHit => ({
                id: `cat-${String(r.id ?? "")}`,
                label: toLabel(r.name, "Categoría"),
                sub: "Categoría",
                href: `/conocimiento`,
            }));
        }),

        // ── CEREBROS ──────────────────────────────────────────────────────
        probe("brains", async () => {
            const { data } = await supabase
                .from("brains")
                .select("id, name")
                .ilike("name", like)
                .limit(CAP);
            return (data ?? []).map((r: any): SearchHit => ({
                id: String(r.id ?? ""),
                label: toLabel(r.name, "Cerebro"),
                sub: "Cerebro",
                href: `/cerebros`,
            }));
        }),

        // ── BÓVEDAS (vaults) — se fusionan con "memorias" ─────────────────
        probe("vaults", async () => {
            const { data } = await supabase
                .from("vaults")
                .select("id, name")
                .ilike("name", like)
                .limit(CAP);
            return (data ?? []).map((r: any): SearchHit => ({
                id: `vault-${String(r.id ?? "")}`,
                label: toLabel(r.name, "Bóveda"),
                sub: "Bóveda",
                href: `/baules`,
            }));
        }),

        // ── APPS GENERADAS ────────────────────────────────────────────────
        probe("generated_apps", async () => {
            const { data } = await supabase
                .from("generated_apps")
                .select("id, name")
                .ilike("name", like)
                .limit(CAP);
            return (data ?? []).map((r: any): SearchHit => ({
                id: String(r.id ?? ""),
                label: toLabel(r.name, "App"),
                sub: "App IA",
                href: `/apps-ia`,
            }));
        }),

        // ── LIENZOS (canvases) ────────────────────────────────────────────
        probe("canvases", async () => {
            const { data } = await supabase
                .from("canvases")
                .select("id, title")
                .ilike("title", like)
                .limit(CAP);
            return (data ?? []).map((r: any): SearchHit => ({
                id: String(r.id ?? ""),
                label: toLabel(r.title, "Lienzo"),
                sub: "Lienzo",
                href: `/pizarra`,
            }));
        }),
    ]);

    out.perfiles = perfiles;
    out.paginas = paginas;
    out.publicaciones = publicaciones;
    // Memorias = memories + vaults (bóvedas), respetando el tope global.
    out.memorias = [...memorias, ...vaults].slice(0, CAP);
    // Conocimiento = temas + categorías, respetando el tope global.
    out.temas = [...temas, ...categorias].slice(0, CAP);
    out.cerebros = cerebros;
    out.apps = apps;
    out.lienzos = lienzos;

    return out;
}

/** Cuenta total de resultados en todas las categorías. */
export function totalHits(r: UniversalSearchResults): number {
    return SEARCH_CATEGORIES.reduce((acc, c) => acc + (r[c.key]?.length ?? 0), 0);
}

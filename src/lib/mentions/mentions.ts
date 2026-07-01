// src/lib/mentions/mentions.ts
// ─────────────────────────────────────────────────────────────────────────────
// MENCIONES UNIVERSALES #/@ de StarSeed OS (sin dependencias de editor).
//
// Permite mencionar / adjuntar CUALQUIER entidad de la red dentro del texto de
// una publicación: usuario, grupo, comunidad, entidad federativa, cuenta,
// publicación, lienzo, evento, insignia, propuesta (y afines: página, memoria,
// tema, cerebro, app…). No añade Tiptap/ProseMirror: opera como un sistema de
// TOKENS sobre el textarea existente del composer.
//
// Semántica del disparador:
//   · `@` → MENCIÓN / notificar (personas y entidades "actor").
//   · `#` → ETIQUETA / tema / adjuntar (temas, publicaciones, eventos, insignias…).
//
// Formato de token (serializado dentro del cuerpo, reversible y legible):
//     @{type:id|Etiqueta}      #{type:id|Etiqueta}
//   p. ej.  @{profile:abc123|Alex}   #{proposal:p_9|Renta Básica}
//
// El texto "plano" (para difusión a destinos que no entienden tokens, como los
// chats) se obtiene con `toPlainText`, que colapsa cada token a `@Etiqueta` /
// `#Etiqueta`. La lista estructurada se obtiene con `parseMentions`.
//
// La BÚSQUEDA de entidades reutiliza las mismas tablas que el buscador universal
// (profiles, pages, posts, memorias, temas, cerebros, apps, lienzos) y añade
// insignias (`badges`) y propuestas (`proposals`). Cada sonda va en su try/catch
// y degrada a []: si una tabla no existe, esa categoría simplemente no aparece.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@/utils/supabase/client";

// ── Tipos de entidad mencionable ─────────────────────────────────────────────

/**
 * Tipos de entidad que se pueden mencionar/adjuntar. Cubre explícitamente los
 * pedidos (usuario, grupo, comunidad, entidad federativa, cuenta, publicación,
 * lienzo, evento, insignia, propuesta) más afines útiles.
 */
export type EntityType =
    | "profile" // usuario / perfil
    | "account" // cuenta soberana
    | "group" // grupo
    | "community" // comunidad
    | "federation" // entidad federativa
    | "page" // página genérica
    | "post" // publicación
    | "canvas" // lienzo / pizarra
    | "event" // evento
    | "badge" // insignia / logro
    | "proposal" // propuesta de gobernanza
    | "topic" // tema de conocimiento
    | "memory" // memoria / baúl
    | "brain" // cerebro
    | "app"; // app IA

/** Disparador de la mención: mención (`@`) o etiqueta (`#`). */
export type MentionTrigger = "@" | "#";

/** Una entidad candidata devuelta por la búsqueda. */
export interface EntityHit {
    type: EntityType;
    id: string;
    label: string;
    /** Subtítulo opcional (handle, tipo, blurb…). */
    sub?: string;
    /** Ruta in-app opcional (para render enlazado del chip). */
    href?: string;
}

/** Una mención estructurada, tal como se persiste con la publicación. */
export interface Mention {
    /** `@` (notificar) o `#` (etiquetar/adjuntar). */
    kind: MentionTrigger;
    type: EntityType;
    id: string;
    label: string;
}

// ── Metadatos de presentación por tipo ───────────────────────────────────────

/** Etiqueta legible + icono lucide por tipo de entidad. */
export const ENTITY_META: Record<
    EntityType,
    { label: string; icon: string; hrefBase?: string }
> = {
    profile: { label: "Perfil", icon: "User", hrefBase: "/profile" },
    account: { label: "Cuenta", icon: "IdCard" },
    group: { label: "Grupo", icon: "Users", hrefBase: "/pagina" },
    community: { label: "Comunidad", icon: "Users2", hrefBase: "/pagina" },
    federation: { label: "Entidad federativa", icon: "Flag", hrefBase: "/pagina" },
    page: { label: "Página", icon: "FileText", hrefBase: "/pagina" },
    post: { label: "Publicación", icon: "MessageSquare", hrefBase: "/post" },
    canvas: { label: "Lienzo", icon: "LayoutDashboard", hrefBase: "/pizarra" },
    event: { label: "Evento", icon: "CalendarDays" },
    badge: { label: "Insignia", icon: "Award" },
    proposal: { label: "Propuesta", icon: "ScrollText" },
    topic: { label: "Tema", icon: "BookOpen", hrefBase: "/conocimiento" },
    memory: { label: "Memoria", icon: "Library", hrefBase: "/memorias" },
    brain: { label: "Cerebro", icon: "Cpu", hrefBase: "/cerebros" },
    app: { label: "App IA", icon: "Sparkles", hrefBase: "/apps-ia" },
};

/** Tipos que tienen sentido como `@` (actores a notificar). */
export const AT_TYPES: EntityType[] = [
    "profile",
    "account",
    "group",
    "community",
    "federation",
    "page",
];

/** Tipos que tienen sentido como `#` (temas / objetos a adjuntar). */
export const HASH_TYPES: EntityType[] = [
    "topic",
    "post",
    "canvas",
    "event",
    "badge",
    "proposal",
    "page",
    "community",
    "federation",
    "memory",
    "brain",
    "app",
];

// ── Serialización / parseo de tokens ─────────────────────────────────────────

// Token: (@|#){type:id|label}. `id` sin `|` ni `}`; `label` sin `}` ni `|`.
// Se permiten espacios en la etiqueta. Los caracteres problemáticos se escapan.
const TOKEN_RE = /([@#])\{([a-z_]+):([^|{}]+)\|([^{}]*)\}/g;

/** Escapa un valor para que quepa dentro de un token sin romper el parser. */
function escapeTokenValue(v: string): string {
    return (v || "").replace(/[|{}]/g, " ").replace(/\s+/g, " ").trim();
}

/** Serializa una mención a su token textual insertable. */
export function serializeMention(m: Mention): string {
    const id = escapeTokenValue(m.id);
    const label = escapeTokenValue(m.label) || id;
    return `${m.kind}{${m.type}:${id}|${label}}`;
}

/** Construye el token a partir de un hit y un disparador. */
export function tokenFor(hit: EntityHit, trigger: MentionTrigger): string {
    return serializeMention({
        kind: trigger,
        type: hit.type,
        id: hit.id,
        label: hit.label,
    });
}

/**
 * Extrae todas las menciones estructuradas de un cuerpo con tokens.
 * Nunca lanza; ante un cuerpo vacío devuelve [].
 */
export function parseMentions(body: string | null | undefined): Mention[] {
    const out: Mention[] = [];
    if (!body) return out;
    const seen = new Set<string>();
    let match: RegExpExecArray | null;
    TOKEN_RE.lastIndex = 0;
    while ((match = TOKEN_RE.exec(body)) !== null) {
        const kind = match[1] as MentionTrigger;
        const type = match[2] as EntityType;
        const id = match[3].trim();
        const label = (match[4] || id).trim();
        const key = `${kind}:${type}:${id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ kind, type, id, label });
    }
    return out;
}

/**
 * Colapsa los tokens a texto legible (`@Etiqueta` / `#Etiqueta`), para difundir
 * a destinos que no entienden el formato de token (chats, mensajes, previews).
 */
export function toPlainText(body: string | null | undefined): string {
    if (!body) return "";
    return body.replace(TOKEN_RE, (_all, kind: string, _type: string, _id: string, label: string) => {
        const clean = (label || "").trim();
        return `${kind}${clean.replace(/\s+/g, kind === "#" ? "" : " ").trim() || "mención"}`;
    });
}

/** ¿El cuerpo contiene al menos un token de mención? */
export function hasMentions(body: string | null | undefined): boolean {
    if (!body) return false;
    TOKEN_RE.lastIndex = 0;
    return TOKEN_RE.test(body);
}

// ── Detección del disparador activo en el textarea ───────────────────────────

/** Info del disparador activo bajo el cursor (para abrir el autocompletado). */
export interface ActiveTrigger {
    trigger: MentionTrigger;
    /** Texto de consulta escrito tras el disparador (sin el símbolo). */
    query: string;
    /** Índice en el texto donde empieza el disparador (posición del @/#). */
    start: number;
    /** Índice del cursor (fin de la consulta). */
    end: number;
}

/**
 * Dado el texto completo y la posición del cursor, detecta si el usuario está
 * escribiendo una mención (`@…`) o etiqueta (`#…`). Reglas:
 *   · El `@`/`#` debe estar al inicio del texto o precedido de un espacio/salto.
 *   · La consulta no puede contener espacios (se corta en el primer espacio).
 *   · La consulta no puede contener `{`/`}` (evita re-disparar dentro de tokens).
 * Devuelve null si no hay disparador activo.
 */
export function detectActiveTrigger(
    text: string,
    caret: number,
): ActiveTrigger | null {
    if (!text || caret <= 0 || caret > text.length) return null;

    // Retrocede desde el cursor buscando el símbolo disparador.
    let i = caret - 1;
    while (i >= 0) {
        const ch = text[i];
        if (ch === "\n" || ch === " ") return null; // consulta rota por espacio
        if (ch === "{" || ch === "}") return null; // dentro/junto a un token
        if (ch === "@" || ch === "#") {
            // Válido sólo si está al inicio o tras espacio/salto de línea.
            const prev = i > 0 ? text[i - 1] : "";
            if (i === 0 || prev === " " || prev === "\n" || prev === "(") {
                const query = text.slice(i + 1, caret);
                return {
                    trigger: ch as MentionTrigger,
                    query,
                    start: i,
                    end: caret,
                };
            }
            return null;
        }
        i -= 1;
    }
    return null;
}

/**
 * Inserta el token de un hit reemplazando el fragmento `@query`/`#query` activo.
 * Devuelve el nuevo texto y la nueva posición del cursor (tras el token + espacio).
 */
export function insertMention(
    text: string,
    active: ActiveTrigger,
    hit: EntityHit,
): { text: string; caret: number } {
    const token = tokenFor(hit, active.trigger);
    const before = text.slice(0, active.start);
    const after = text.slice(active.end);
    const insert = `${token} `;
    const next = `${before}${insert}${after}`;
    return { text: next, caret: (before + insert).length };
}

// ── Búsqueda de entidades (real, defensiva) ──────────────────────────────────

const CAP = 8;

function escapeLike(q: string): string {
    return q.replace(/[%_]/g, (m) => `\\${m}`);
}

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

function toLabel(value: unknown, fallback: string, max = 80): string {
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

function extractPostText(content: any): string {
    if (content == null) return "";
    if (typeof content === "string") return content;
    if (typeof content !== "object") return String(content);
    const direct =
        content.text ??
        content.title ??
        content.body ??
        content.caption ??
        content.summary ??
        content.markdown;
    if (typeof direct === "string" && direct.trim()) return direct;
    try {
        return JSON.stringify(content);
    } catch {
        return "";
    }
}

async function probe(
    label: string,
    fn: () => Promise<EntityHit[]>,
): Promise<EntityHit[]> {
    try {
        const res = await fn();
        return Array.isArray(res) ? res.slice(0, CAP) : [];
    } catch (err) {
        if (typeof console !== "undefined") {
            // eslint-disable-next-line no-console
            console.debug?.(`[mentions] sonda "${label}" falló:`, err);
        }
        return [];
    }
}

/**
 * Busca entidades para el autocompletado de menciones. `trigger` filtra QUÉ
 * tipos tiene sentido ofrecer: `@` → actores; `#` → temas/objetos. Nunca lanza;
 * cada tabla se sonda de forma aislada y degrada a []. Para `@` con consulta
 * vacía devuelve algunos perfiles recientes como sugerencia inicial.
 */
export async function searchEntities(
    query: string,
    trigger: MentionTrigger = "@",
): Promise<EntityHit[]> {
    const term = (query ?? "").trim();

    let supabase: ReturnType<typeof createClient>;
    try {
        supabase = createClient();
    } catch {
        return [];
    }

    const like = `%${escapeLike(term)}%`;
    const allowAt = trigger === "@";
    const allowHash = trigger === "#";

    // Sin término: sugerimos algunos perfiles (para @) o temas (para #).
    const noTerm = term.length < 1;

    const probes: Promise<EntityHit[]>[] = [];

    // ── Perfiles / usuarios (@) ──
    if (allowAt) {
        probes.push(
            probe("profiles", async () => {
                let q = supabase.from("profiles").select("id, handle, display_name");
                q = noTerm
                    ? q.limit(CAP)
                    : q.or(`display_name.ilike.${like},handle.ilike.${like}`).limit(CAP);
                const { data } = await q;
                return (data ?? []).map((r: any): EntityHit => {
                    const handle = (r.handle ?? "").toString().replace(/^@+/, "");
                    return {
                        type: "profile",
                        id: String(r.id ?? handle),
                        label: toLabel(r.display_name ?? r.handle, "Perfil"),
                        sub: handle ? `@${handle}` : "Perfil",
                        href: handle ? `/profile/${encodeURIComponent(handle)}` : undefined,
                    };
                });
            }),
        );
    }

    // ── Páginas → se clasifican por `type` en grupo/comunidad/entidad/página ──
    if (allowAt || allowHash) {
        probes.push(
            probe("pages", async () => {
                let q = supabase.from("pages").select("id, title, type");
                q = noTerm ? q.limit(CAP) : q.ilike("title", like).limit(CAP);
                const { data } = await q;
                return (data ?? []).map((r: any): EntityHit => {
                    const t = String(r.type ?? "").toLowerCase();
                    const type: EntityType =
                        t.includes("comunidad") || t === "community"
                            ? "community"
                            : t.includes("grupo") || t === "group"
                              ? "group"
                              : t.includes("federa") || t.includes("entidad")
                                ? "federation"
                                : "page";
                    const slug = slugify(r.title || "") || String(r.id ?? "");
                    return {
                        type,
                        id: String(r.id ?? slug),
                        label: toLabel(r.title, ENTITY_META[type].label),
                        sub: ENTITY_META[type].label,
                        href: `/pagina/${encodeURIComponent(slug)}`,
                    };
                });
            }),
        );
    }

    if (!noTerm) {
        // ── Publicaciones (#) ──
        if (allowHash) {
            probes.push(
                probe("posts", async () => {
                    const { data } = await supabase
                        .from("posts")
                        .select("id, content, type")
                        .ilike("content::text", like)
                        .limit(CAP);
                    return (data ?? []).map((r: any): EntityHit => ({
                        type: "post",
                        id: String(r.id ?? ""),
                        label: toLabel(extractPostText(r.content), "Publicación"),
                        sub: "Publicación",
                        href: `/post/${encodeURIComponent(String(r.id ?? ""))}`,
                    }));
                }),
            );
        }

        // ── Temas de conocimiento (#) ──
        if (allowHash) {
            probes.push(
                probe("knowledge_topics", async () => {
                    const { data } = await supabase
                        .from("knowledge_topics")
                        .select("id, name, blurb")
                        .or(`name.ilike.${like},blurb.ilike.${like}`)
                        .limit(CAP);
                    return (data ?? []).map((r: any): EntityHit => ({
                        type: "topic",
                        id: String(r.id ?? ""),
                        label: toLabel(r.name, "Tema"),
                        sub: r.blurb ? toLabel(r.blurb, "Tema", 50) : "Tema",
                        href: `/conocimiento`,
                    }));
                }),
            );
        }

        // ── Propuestas de gobernanza (#) ──
        if (allowHash) {
            probes.push(
                probe("proposals", async () => {
                    const { data } = await supabase
                        .from("proposals")
                        .select("id, title, status")
                        .ilike("title", like)
                        .limit(CAP);
                    return (data ?? []).map((r: any): EntityHit => ({
                        type: "proposal",
                        id: String(r.id ?? ""),
                        label: toLabel(r.title, "Propuesta"),
                        sub: r.status ? `Propuesta · ${r.status}` : "Propuesta",
                        href: `/network/politics`,
                    }));
                }),
            );
        }

        // ── Insignias / logros (#) ──
        if (allowHash) {
            probes.push(
                probe("badges", async () => {
                    const { data } = await supabase
                        .from("badges")
                        .select("id, name, description")
                        .or(`name.ilike.${like},description.ilike.${like}`)
                        .limit(CAP);
                    return (data ?? []).map((r: any): EntityHit => ({
                        type: "badge",
                        id: String(r.id ?? ""),
                        label: toLabel(r.name, "Insignia"),
                        sub: r.description ? toLabel(r.description, "Insignia", 50) : "Insignia",
                    }));
                }),
            );
        }

        // ── Eventos (#) — tabla `events` si existe (defensivo) ──
        if (allowHash) {
            probes.push(
                probe("events", async () => {
                    const { data } = await supabase
                        .from("events")
                        .select("id, title, starts_at")
                        .ilike("title", like)
                        .limit(CAP);
                    return (data ?? []).map((r: any): EntityHit => ({
                        type: "event",
                        id: String(r.id ?? ""),
                        label: toLabel(r.title, "Evento"),
                        sub: r.starts_at ? `Evento · ${String(r.starts_at).slice(0, 10)}` : "Evento",
                    }));
                }),
            );
        }

        // ── Lienzos / pizarras (#) ──
        if (allowHash) {
            probes.push(
                probe("canvases", async () => {
                    const { data } = await supabase
                        .from("canvases")
                        .select("id, title")
                        .ilike("title", like)
                        .limit(CAP);
                    return (data ?? []).map((r: any): EntityHit => ({
                        type: "canvas",
                        id: String(r.id ?? ""),
                        label: toLabel(r.title, "Lienzo"),
                        sub: "Lienzo",
                        href: `/pizarra`,
                    }));
                }),
            );
        }
    }

    const groups = await Promise.all(probes);
    const flat: EntityHit[] = [];
    const seen = new Set<string>();
    for (const g of groups) {
        for (const hit of g) {
            const key = `${hit.type}:${hit.id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            flat.push(hit);
        }
    }
    return flat.slice(0, 24);
}

// ── Persistencia defensiva de menciones (entity_mentions) ────────────────────

/**
 * Persiste las menciones de una publicación en la tabla polimórfica
 * `entity_mentions`. DEFENSIVO: si la tabla/columnas aún no existen (migración
 * sin aplicar), o no hay sesión, no lanza — las menciones ya viajan además dentro
 * de `post_references.mentions` del propio post, así que nada se pierde ni rompe.
 *
 * Devuelve el nº de filas insertadas (0 si la tabla no está disponible).
 */
export async function persistMentions(params: {
    sourceType: string; // p. ej. "post"
    sourceId: string;
    mentions: Mention[];
}): Promise<number> {
    const { sourceType, sourceId, mentions } = params;
    if (!sourceId || !mentions || mentions.length === 0) return 0;
    try {
        const supabase = createClient();
        const rows = mentions.map((m) => ({
            source_type: sourceType,
            source_id: sourceId,
            target_type: m.type,
            target_id: m.id,
            kind: m.kind,
        }));
        const { error } = await supabase.from("entity_mentions").insert(rows);
        if (error) return 0; // tabla ausente / RLS: degradación silenciosa
        return rows.length;
    } catch {
        return 0;
    }
}

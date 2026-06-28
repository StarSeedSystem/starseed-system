// src/lib/browser/browser.ts
// ─────────────────────────────────────────────────────────────────────────────
// StarSeed OS — Navegador (gestor de ventanas y pestañas) sobre Supabase.
//
// HONESTIDAD TÉCNICA: una app web NO puede incrustar sitios arbitrarios en
// iframes (muchos envían X-Frame-Options / CSP frame-ancestors que bloquean el
// embebido) ni reemplazar el motor de un navegador real. Por eso esto NO es un
// "navegador" en el sentido de Chrome/Safari, sino un GESTOR de ventanas que:
//   · Guarda ventanas (url, grupo, carpeta, estado, suspendida) en la tabla
//     pública `browser_windows`.
//   · Renderiza URLs incrustables en iframes sandbox, con fallback claro
//     ("este sitio no permite incrustarse — abrir en pestaña nueva") cuando el
//     sitio rechaza el embebido.
//   · Soporta operaciones de ventana: agrupar, archivar en carpetas, guardar,
//     suspender, modo widget, pantalla completa, multivista, posición y tamaño.
//   · Integra la NAVEGACIÓN REAL vía Astraura/Aurora a través de la extensión
//     Claude-in-Chrome (Astraura conduce el navegador real; aquí solo emitimos
//     la intención `starseed:astraura-browse`).
//
// Filosofía de fallback (igual que os-social.ts): si Supabase falla, no está
// configurado o no hay sesión, las lecturas devuelven [] y las escrituras
// devuelven `{ ok:false, needsAuth? }` sin lanzar, para que la UI nunca rompa.
//
// SSR-SAFE: este módulo no toca window/document en su nivel superior; el código
// que sí lo hace (compartir, abrir pestaña) vive en helpers que la UI llama
// únicamente desde efectos/handlers.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@/utils/supabase/client";
import { resolveRoute, type ServiceSource } from "@/lib/services/service-routes";

// ── Tipos del dominio ──

/** Modo de visualización de una ventana en la pizarra/canvas de StarSeed. */
export type WindowView = "window" | "widget" | "fullscreen" | "tab";

/** Estado espacial + de presentación persistido en la columna `state` (jsonb). */
export interface WindowState {
    /** Posición X en el canvas (px). */
    x: number;
    /** Posición Y en el canvas (px). */
    y: number;
    /** Ancho (px). */
    w: number;
    /** Alto (px). */
    h: number;
    /** Modo de vista actual. */
    view: WindowView;
    /** Orden de apilamiento (z-index relativo) en el canvas. */
    z: number;
}

/** Ventana normalizada lista para la UI (mapea la fila de `browser_windows`). */
export interface BrowserWindow {
    id: string;
    owner?: string;
    name: string;
    /** Grupo lógico (pestañas relacionadas). Vacío = "Sin grupo". */
    groupName: string;
    /** Carpeta de archivado. Vacío = "Sin carpeta". */
    folder: string;
    url: string;
    state: WindowState;
    suspended: boolean;
    /** Si true, la ventana se abre por defecto en el marco inmersivo VR/AR. */
    vrAr: boolean;
    createdAt: string;
    updatedAt: string;
    /** true si proviene de datos locales/ejemplo (no de Supabase). */
    isLocal?: boolean;
}

/** Forma cruda de una fila de `browser_windows` (todos los campos seguros). */
interface BrowserWindowRow {
    id: string;
    owner?: string | null;
    name?: string | null;
    group_name?: string | null;
    folder?: string | null;
    url?: string | null;
    state?: Partial<WindowState> | null;
    suspended?: boolean | null;
    vr_ar?: boolean | null;
    settings?: Record<string, unknown> | null;
    created_at?: string | null;
    updated_at?: string | null;
}

// ── Constantes ──

const TABLE = "browser_windows";
const DEFAULT_VIEW: WindowView = "window";

/** Estado por defecto para una ventana nueva (posición escalonada se aplica en newWindow). */
export const DEFAULT_STATE: WindowState = { x: 40, y: 40, w: 480, h: 360, view: DEFAULT_VIEW, z: 1 };

/** Motor de búsqueda por defecto (privado, sin tracking). */
export const SEARCH_ENGINE = "https://duckduckgo.com/?q=";

// ── Normalización ──

/** Combina un `state` parcial con los valores por defecto, saneando números. */
export function normalizeState(raw?: Partial<WindowState> | null): WindowState {
    const s = raw || {};
    const num = (v: unknown, d: number) =>
        typeof v === "number" && Number.isFinite(v) ? v : d;
    const view: WindowView =
        s.view === "widget" || s.view === "fullscreen" || s.view === "tab"
            ? s.view
            : DEFAULT_VIEW;
    return {
        x: num(s.x, DEFAULT_STATE.x),
        y: num(s.y, DEFAULT_STATE.y),
        w: num(s.w, DEFAULT_STATE.w),
        h: num(s.h, DEFAULT_STATE.h),
        view,
        z: num(s.z, DEFAULT_STATE.z),
    };
}

function normalizeWindow(row: BrowserWindowRow): BrowserWindow {
    return {
        id: row.id,
        owner: row.owner || undefined,
        name: row.name || row.url || "Ventana",
        groupName: row.group_name || "",
        folder: row.folder || "",
        url: row.url || "",
        state: normalizeState(row.state),
        suspended: !!row.suspended,
        vrAr: !!row.vr_ar,
        createdAt: row.created_at || new Date().toISOString(),
        updatedAt: row.updated_at || new Date().toISOString(),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// URL: normalización, búsqueda y heurística de "incrustabilidad"
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normaliza la entrada de la barra de direcciones:
 *   · Si parece una URL/host (tiene punto o esquema) → asegura https://.
 *   · Si parece una búsqueda (texto con espacios, o sin punto) → DuckDuckGo.
 * Nunca lanza; devuelve siempre una URL absoluta usable en un iframe / pestaña.
 */
export function normalizeUrl(input: string): string {
    const raw = (input || "").trim();
    if (!raw) return "";

    // Ya trae esquema explícito.
    if (/^https?:\/\//i.test(raw)) return raw;

    // Esquemas no http (mailto:, tel:, etc.) → se respetan tal cual.
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !raw.includes(" ")) return raw;

    // Heurística "es un dominio/URL": sin espacios y con un punto (o localhost).
    const looksLikeHost =
        !raw.includes(" ") &&
        (/^[^\s/]+\.[^\s/]{2,}/.test(raw) || /^localhost(?::\d+)?(?:\/|$)/i.test(raw));

    if (looksLikeHost) return `https://${raw}`;

    // En cualquier otro caso lo tratamos como búsqueda.
    return `${SEARCH_ENGINE}${encodeURIComponent(raw)}`;
}

/** Extrae el hostname de una URL de forma tolerante (vacío si no es válida). */
export function urlHost(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return "";
    }
}

/**
 * Hosts/sufijos que SABEMOS suelen permitir el embebido en iframe.
 * No es exhaustivo — solo evita mostrar el aviso de fallback de entrada para
 * destinos conocidos. Para todo lo demás aplicamos "intenta el iframe y haz
 * fallback si falla la carga" (ver isLikelyEmbeddable + onError en la UI).
 */
const EMBEDDABLE_SUFFIXES = [
    "wikipedia.org",
    "m.wikipedia.org",
    "openstreetmap.org",
    "youtube.com",
    "youtube-nocookie.com",
    "player.vimeo.com",
    "vimeo.com",
    "codepen.io",
    "codesandbox.io",
    "observablehq.com",
    "archive.org",
    "duckduckgo.com",
    "example.com",
];

/**
 * Hosts/sufijos que CASI SIEMPRE bloquean el embebido (X-Frame-Options:
 * DENY/SAMEORIGIN o CSP frame-ancestors). Para estos mostramos directamente
 * el fallback "abrir en pestaña nueva" sin intentar el iframe.
 */
const NON_EMBEDDABLE_SUFFIXES = [
    "google.com",
    "accounts.google.com",
    "facebook.com",
    "instagram.com",
    "x.com",
    "twitter.com",
    "github.com",
    "gitlab.com",
    "linkedin.com",
    "amazon.com",
    "netflix.com",
    "reddit.com",
    "chatgpt.com",
    "openai.com",
    "claude.ai",
    "anthropic.com",
    "notion.so",
    "figma.com",
];

function hostMatches(host: string, suffixes: string[]): boolean {
    if (!host) return false;
    return suffixes.some((s) => host === s || host.endsWith(`.${s}`));
}

/**
 * Heurística de "incrustabilidad". Devuelve:
 *   · true  → conocido-incrustable o mismo origen → intenta iframe directo.
 *   · false → conocido-bloqueante → muestra fallback de entrada.
 *   · "try" → desconocido → intenta el iframe y haz fallback en onError/timeout.
 *
 * Esta función NO puede determinar con certeza la cabecera del servidor desde el
 * cliente (CORS lo impide), por eso el veredicto real lo da el evento de carga
 * del iframe en la UI. Aquí solo orientamos la experiencia inicial.
 */
export function isLikelyEmbeddable(url: string): true | false | "try" {
    const host = urlHost(url);
    if (!host) return "try";

    // Mismo origen (cuando hay window) → siempre incrustable.
    if (typeof window !== "undefined") {
        try {
            if (new URL(url).origin === window.location.origin) return true;
        } catch {
            /* noop */
        }
    }

    if (hostMatches(host, NON_EMBEDDABLE_SUFFIXES)) return false;
    if (hostMatches(host, EMBEDDABLE_SUFFIXES)) return true;
    return "try";
}

// ─────────────────────────────────────────────────────────────────────────────
// Agrupación: grupos y carpetas
// ─────────────────────────────────────────────────────────────────────────────

export const NO_GROUP = "Sin grupo";
export const NO_FOLDER = "Sin carpeta";

export interface GroupsAndFolders {
    /** Nombres de grupo únicos presentes (incluye "Sin grupo" si aplica), ordenados. */
    groups: string[];
    /** Nombres de carpeta únicos presentes (incluye "Sin carpeta" si aplica), ordenados. */
    folders: string[];
    /** Ventanas indexadas por nombre de grupo (clave normalizada a etiqueta visible). */
    byGroup: Record<string, BrowserWindow[]>;
    /** Ventanas indexadas por carpeta (clave normalizada a etiqueta visible). */
    byFolder: Record<string, BrowserWindow[]>;
}

/**
 * Calcula los índices por grupo y por carpeta para alimentar la UI colapsable.
 * Las ventanas sin grupo/carpeta se agrupan bajo las etiquetas NO_GROUP/NO_FOLDER.
 */
export function groupsAndFolders(windows: BrowserWindow[]): GroupsAndFolders {
    const byGroup: Record<string, BrowserWindow[]> = {};
    const byFolder: Record<string, BrowserWindow[]> = {};

    for (const w of windows) {
        const g = w.groupName?.trim() || NO_GROUP;
        const f = w.folder?.trim() || NO_FOLDER;
        (byGroup[g] ||= []).push(w);
        (byFolder[f] ||= []).push(w);
    }

    const sortLabels = (keys: string[], none: string) =>
        keys.sort((a, b) => {
            if (a === none) return 1; // "Sin ..." al final
            if (b === none) return -1;
            return a.localeCompare(b, "es");
        });

    return {
        groups: sortLabels(Object.keys(byGroup), NO_GROUP),
        folders: sortLabels(Object.keys(byFolder), NO_FOLDER),
        byGroup,
        byFolder,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Compartir / adjuntar
// ─────────────────────────────────────────────────────────────────────────────

/** Payload portable para adjuntar una ventana a una publicación, mensaje o pizarra. */
export interface WindowShareRef {
    kind: "starseed/browser-window";
    version: 1;
    id: string;
    name: string;
    url: string;
    host: string;
    group: string;
    folder: string;
    view: WindowView;
    suspended: boolean;
    /** Marca de tiempo de la referencia (no de la ventana). */
    sharedAt: string;
}

/**
 * Construye una referencia compartible de una ventana. Pensada para:
 *   · Copiar al portapapeles como JSON.
 *   · Emitir en un evento `window` (starseed:attach-window) que la pizarra o el
 *     compositor de publicaciones puede escuchar.
 */
export function shareRef(w: BrowserWindow): WindowShareRef {
    return {
        kind: "starseed/browser-window",
        version: 1,
        id: w.id,
        name: w.name,
        url: w.url,
        host: urlHost(w.url),
        group: w.groupName || "",
        folder: w.folder || "",
        view: w.state.view,
        suspended: w.suspended,
        sharedAt: new Date().toISOString(),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD sobre Supabase (tabla `browser_windows`, RLS por `owner = auth.uid()`)
// ─────────────────────────────────────────────────────────────────────────────

/** Resultado uniforme de mutaciones. */
export interface MutationResult {
    ok: boolean;
    needsAuth?: boolean;
    error?: string;
    window?: BrowserWindow;
}

async function getUid(): Promise<string | null> {
    try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        return data?.user?.id ?? null;
    } catch {
        return null;
    }
}

/**
 * Lista las ventanas del usuario (más recientes primero). Si no hay sesión o
 * Supabase falla devuelve [] (la UI muestra el estado vacío / semillas locales).
 */
export async function listWindows(): Promise<BrowserWindow[]> {
    try {
        const supabase = createClient();
        const { data: au } = await supabase.auth.getUser();
        const uid = au?.user?.id ?? null;
        if (!uid) return [];
        const { data, error } = await supabase
            .from(TABLE)
            .select("*")
            .eq("owner", uid)
            .order("updated_at", { ascending: false });
        if (error) return [];
        return ((data as BrowserWindowRow[]) || []).map(normalizeWindow);
    } catch {
        return [];
    }
}

/**
 * Inserta (sin id) o actualiza (con id) una ventana. Exige sesión.
 * Devuelve la ventana normalizada resultante en `window`.
 */
export async function saveWindow(
    w: Partial<BrowserWindow> & { url: string },
): Promise<MutationResult> {
    const uid = await getUid();
    if (!uid) return { ok: false, needsAuth: true };
    try {
        const supabase = createClient();
        const payload = {
            owner: uid,
            name: w.name || w.url,
            group_name: w.groupName ?? "",
            folder: w.folder ?? "",
            url: w.url,
            state: normalizeState(w.state),
            suspended: !!w.suspended,
            vr_ar: !!w.vrAr,
            updated_at: new Date().toISOString(),
        };
        const query = w.id
            ? supabase.from(TABLE).update(payload).eq("id", w.id).eq("owner", uid)
            : supabase.from(TABLE).insert(payload);
        const { data, error } = await query.select("*").single();
        if (error) return { ok: false, error: error.message };
        return { ok: true, window: normalizeWindow(data as BrowserWindowRow) };
    } catch (e) {
        return { ok: false, error: (e as Error)?.message };
    }
}

/** Crea una ventana nueva a partir de una URL/búsqueda cruda. */
export async function newWindow(
    input: string,
    name?: string,
    opts?: { vrAr?: boolean },
): Promise<MutationResult> {
    const url = normalizeUrl(input);
    if (!url) return { ok: false, error: "URL vacía" };
    // Escalona ligeramente la posición para no apilar ventanas exactamente.
    const jitter = Math.floor(Math.random() * 6) * 24;
    const state: WindowState = {
        ...DEFAULT_STATE,
        x: DEFAULT_STATE.x + jitter,
        y: DEFAULT_STATE.y + jitter,
    };
    return saveWindow({
        url,
        name: name?.trim() || urlHost(url) || url,
        state,
        vrAr: !!opts?.vrAr,
    });
}

/** Elimina una ventana propia. */
export async function deleteWindow(id: string): Promise<MutationResult> {
    const uid = await getUid();
    if (!uid) return { ok: false, needsAuth: true };
    try {
        const supabase = createClient();
        const { error } = await supabase
            .from(TABLE)
            .delete()
            .eq("id", id)
            .eq("owner", uid);
        if (error) return { ok: false, error: error.message };
        return { ok: true };
    } catch (e) {
        return { ok: false, error: (e as Error)?.message };
    }
}

/** Marca/desmarca una ventana como suspendida (libera el iframe). */
export async function setSuspended(id: string, value: boolean): Promise<MutationResult> {
    return patchWindow(id, { suspended: value });
}

/** Marca/desmarca la ventana para abrirse en modo inmersivo VR/AR. */
export async function setVrAr(id: string, value: boolean): Promise<MutationResult> {
    return patchWindow(id, { vr_ar: value });
}

/** Cambia el modo de vista (window/widget/fullscreen/tab) dentro de `state`. */
export async function setView(id: string, view: WindowView): Promise<MutationResult> {
    return patchState(id, { view });
}

/** Asigna (o limpia) la carpeta de archivado de una ventana. */
export async function setFolder(id: string, folder: string): Promise<MutationResult> {
    return patchWindow(id, { folder: folder.trim() });
}

/** Asigna (o limpia) el grupo de una ventana. */
export async function setGroup(id: string, group: string): Promise<MutationResult> {
    return patchWindow(id, { group_name: group.trim() });
}

/** Persiste posición/tamaño/z (multi-prop) sin tocar el resto del estado. */
export async function setGeometry(
    id: string,
    geom: Partial<Pick<WindowState, "x" | "y" | "w" | "h" | "z">>,
): Promise<MutationResult> {
    return patchState(id, geom);
}

// ── Helpers internos de patch (parche superficial de columna / de `state`) ──

interface RowPatch {
    name?: string;
    group_name?: string;
    folder?: string;
    url?: string;
    suspended?: boolean;
    vr_ar?: boolean;
}

async function patchWindow(id: string, patch: RowPatch): Promise<MutationResult> {
    const uid = await getUid();
    if (!uid) return { ok: false, needsAuth: true };
    try {
        const supabase = createClient();
        const { data, error } = await supabase
            .from(TABLE)
            .update({ ...patch, updated_at: new Date().toISOString() })
            .eq("id", id)
            .eq("owner", uid)
            .select("*")
            .single();
        if (error) return { ok: false, error: error.message };
        return { ok: true, window: normalizeWindow(data as BrowserWindowRow) };
    } catch (e) {
        return { ok: false, error: (e as Error)?.message };
    }
}

/**
 * Parche superficial de la columna `state` (jsonb). Re-lee el estado actual para
 * fusionarlo (evita pisar campos que no se tocan). Tolerante a fallos.
 */
async function patchState(
    id: string,
    patch: Partial<WindowState>,
): Promise<MutationResult> {
    const uid = await getUid();
    if (!uid) return { ok: false, needsAuth: true };
    try {
        const supabase = createClient();
        const { data: cur } = await supabase
            .from(TABLE)
            .select("state")
            .eq("id", id)
            .eq("owner", uid)
            .maybeSingle();
        const merged = normalizeState({
            ...normalizeState((cur as { state?: Partial<WindowState> } | null)?.state),
            ...patch,
        });
        const { data, error } = await supabase
            .from(TABLE)
            .update({ state: merged, updated_at: new Date().toISOString() })
            .eq("id", id)
            .eq("owner", uid)
            .select("*")
            .single();
        if (error) return { ok: false, error: error.message };
        return { ok: true, window: normalizeWindow(data as BrowserWindowRow) };
    } catch (e) {
        return { ok: false, error: (e as Error)?.message };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Integración con Astraura / Aurora (navegación real vía Claude-in-Chrome)
// ─────────────────────────────────────────────────────────────────────────────

export const ASTRAURA_BROWSE_EVENT = "starseed:astraura-browse";
export const ATTACH_WINDOW_EVENT = "starseed:attach-window";

export interface AstrauraBrowseDetail {
    url: string;
    /** Instrucción opcional en lenguaje natural para Astraura. */
    intent?: string;
    /** Origen de la petición (para trazabilidad en el orquestador IA). */
    source: "navegador";
}

/**
 * Emite la intención de que Astraura/Aurora navegue REALMENTE a una URL usando
 * la extensión Claude-in-Chrome. Esta función NO navega por sí misma: solo
 * publica el evento `starseed:astraura-browse` en `window` para que el puente IA
 * (que sí tiene acceso al navegador real) lo recoja. SSR-safe (no-op en server).
 *
 * Hook documentado:
 *   window.addEventListener('starseed:astraura-browse', (e: CustomEvent<AstrauraBrowseDetail>) => { ... })
 */
export function requestAstrauraBrowse(url: string, intent?: string): boolean {
    if (typeof window === "undefined") return false;
    const detail: AstrauraBrowseDetail = { url, intent, source: "navegador" };
    window.dispatchEvent(new CustomEvent(ASTRAURA_BROWSE_EVENT, { detail }));
    return true;
}

/**
 * Emite el evento de "adjuntar ventana" a la pizarra/publicación. Pensado para
 * que el compositor de posts o el canvas (pizarra) lo escuche. SSR-safe.
 */
export function emitAttachWindow(w: BrowserWindow): boolean {
    if (typeof window === "undefined") return false;
    window.dispatchEvent(
        new CustomEvent<WindowShareRef>(ATTACH_WINDOW_EVENT, { detail: shareRef(w) }),
    );
    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Servidores del navegador (tri-fuente) + proxy/render de paginas
// ─────────────────────────────────────────────────────────────────────────────
// El navegador puede enrutar la carga/render de cualquier sitio http a traves de
// un SERVIDOR de render/proxy configurado en el modelo tri-fuente (dominio
// "browser"): Servidor personal / Servidor StarSeed / Servidor externo, las tres
// activables a la vez. Con un endpoint de proxy configurado, los sitios que
// bloquean el iframe pueden incrustarse via proxy; sin endpoint, caemos a
// window.open. HONESTIDAD: el proxying real SOLO funciona con un servidor
// configurado (o la extension/app de escritorio). Config en `service_routes`
// (dominio "browser") via TriSourceConfig.


/** Dominio tri-fuente del navegador (para <TriSourceConfig domain={BROWSER_DOMAIN} />). */
export const BROWSER_DOMAIN = "browser";

/** Clave de `config` por fuente: endpoint del proxy de render. */
export const PROXY_ENDPOINT_KEY = "proxy_endpoint";
/** Clave de `config` por fuente: como se pasa la URL ("query" | "path"). */
export const PROXY_MODE_KEY = "proxy_mode";
/** Clave de `config` por fuente: nombre del parametro de query (def. "url"). */
export const PROXY_PARAM_KEY = "proxy_param";

export interface ProxyTarget {
    rendered: string;
    proxied: boolean;
    source?: ServiceSource["kind"];
}

/**
 * Construye la URL de carga segun la config tri-fuente del dominio "browser".
 * Si la fuente activa primaria tiene endpoint de proxy, envuelve la URL destino
 * (query: `${endpoint}?url=<enc>` o path: `${endpoint}/<enc>`). Sin proxy
 * devuelve la URL original (proxied:false). SSR-safe.
 */
export function renderUrl(url: string): ProxyTarget {
    if (!url) return { rendered: url, proxied: false };
    try {
        const { participants } = resolveRoute(BROWSER_DOMAIN);
        for (const s of participants) {
            const cfg = (s.config || {}) as Record<string, unknown>;
            const endpoint = (
                typeof cfg[PROXY_ENDPOINT_KEY] === "string"
                    ? (cfg[PROXY_ENDPOINT_KEY] as string)
                    : s.endpoint || ""
            ).trim();
            if (!endpoint) continue;
            const mode = cfg[PROXY_MODE_KEY] === "path" ? "path" : "query";
            const param =
                typeof cfg[PROXY_PARAM_KEY] === "string" && cfg[PROXY_PARAM_KEY]
                    ? (cfg[PROXY_PARAM_KEY] as string)
                    : "url";
            const enc = encodeURIComponent(url);
            const rendered =
                mode === "path"
                    ? `${endpoint.replace(/\/+$/, "")}/${enc}`
                    : `${endpoint}${endpoint.includes("?") ? "&" : "?"}${param}=${enc}`;
            return { rendered, proxied: true, source: s.kind };
        }
    } catch {
        /* sin proxy / sin window */
    }
    return { rendered: url, proxied: false };
}

/** true si hay al menos una fuente del navegador con endpoint de proxy. */
export function hasProxyConfigured(): boolean {
    try {
        const { participants } = resolveRoute(BROWSER_DOMAIN);
        return participants.some((s) => {
            const cfg = (s.config || {}) as Record<string, unknown>;
            const ep =
                typeof cfg[PROXY_ENDPOINT_KEY] === "string"
                    ? (cfg[PROXY_ENDPOINT_KEY] as string)
                    : s.endpoint;
            return !!(ep && ep.trim());
        });
    } catch {
        return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipo de enlace: externo / interno (ruta OS) / sistema StarSeed
// ─────────────────────────────────────────────────────────────────────────────

export type LinkKind = "internal" | "external" | "starseed";

/** Otros sistemas StarSeed conocidos (Nexus / Cafe / Audiomorphic ...). */
export const STARSEED_SYSTEM_SUFFIXES = [
    "starseed.systems",
    "starseed.system",
    "nexus.starseed.systems",
    "cafe.starseed.systems",
    "audiomorphic.starseed.systems",
    "audiomorphic.com",
    // Apps de la red StarSeed alojadas en Vercel (incluida la home por defecto).
    "starseed-nexus.vercel.app",
    "starseed-system.vercel.app",
];

/**
 * Sufijos que cuentan como "red StarSeed" para el modo de red (internet abierto
 * vs solo interno). Incluye los sistemas StarSeed conocidos. Una ruta interna de
 * la OS ("/...") o el mismo origen son SIEMPRE internos (ver isExternalTarget).
 */
export const STARSEED_NET_SUFFIXES = [
    ...STARSEED_SYSTEM_SUFFIXES,
    "starseed",
];

/** Clasifica un destino: internal | starseed | external. SSR-safe. */
export function classifyLink(target: string): LinkKind {
    const t = (target || "").trim();
    if (!t) return "external";
    if (t.startsWith("/") && !t.startsWith("//")) return "internal";
    const host = urlHost(t);
    if (typeof window !== "undefined") {
        try {
            if (new URL(t, window.location.href).origin === window.location.origin) {
                return "internal";
            }
        } catch {
            /* noop */
        }
    }
    if (hostMatches(host, STARSEED_SYSTEM_SUFFIXES)) return "starseed";
    return "external";
}

/** Abre un destino: interno via router.push/location, externo/starseed via window.open. */
export function openLink(
    target: string,
    opts?: { router?: { push: (href: string) => void } },
): { kind: LinkKind; opened: boolean } {
    const kind = classifyLink(target);
    if (typeof window === "undefined") return { kind, opened: false };
    if (kind === "internal") {
        if (opts?.router) opts.router.push(target);
        else window.location.assign(target);
        return { kind, opened: true };
    }
    window.open(target, "_blank", "noopener,noreferrer");
    return { kind, opened: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Home (página de inicio configurable) — por defecto StarSeed Nexus
// ─────────────────────────────────────────────────────────────────────────────

/** Home por defecto del navegador: StarSeed Nexus. */
export const NEXUS_HOME = "https://starseed-nexus.vercel.app";

/**
 * Resuelve la home efectiva para una ventana/pestaña dada. `perWindow[id]`
 * (si existe y no está vacío) tiene prioridad sobre la home global; ésta cae a
 * Nexus si está vacía. Acepta rutas internas ("/...") o URLs. SSR-safe.
 */
export function resolveHome(
    home: { url?: string; perWindow?: Record<string, string> } | null | undefined,
    windowId?: string,
): string {
    const per = (windowId && home?.perWindow?.[windowId]) || "";
    const candidate = (per || home?.url || "").trim();
    if (!candidate) return NEXUS_HOME;
    if (candidate.startsWith("/")) return candidate; // ruta interna de la OS
    return normalizeUrl(candidate);
}

// ─────────────────────────────────────────────────────────────────────────────
// Modo de red: internet abierto vs solo servidores internos (StarSeed)
// ─────────────────────────────────────────────────────────────────────────────

export type NetMode = "open" | "internal";

/**
 * ¿El destino es EXTERNO a la red StarSeed? Internos: rutas de la OS ("/..."),
 * mismo origen, o cualquier host de la red StarSeed (STARSEED_NET_SUFFIXES).
 * Todo lo demás es externo (internet abierto). SSR-safe.
 */
export function isExternalTarget(target: string): boolean {
    const t = (target || "").trim();
    if (!t) return false;
    if (t.startsWith("/") && !t.startsWith("//")) return false; // ruta interna OS
    if (typeof window !== "undefined") {
        try {
            if (new URL(t, window.location.href).origin === window.location.origin) {
                return false;
            }
        } catch {
            /* noop */
        }
    }
    const host = urlHost(t);
    if (hostMatches(host, STARSEED_NET_SUFFIXES)) return false;
    return true;
}

/**
 * Aplica el modo de red a un destino. En modo "internal" se BLOQUEA cualquier
 * destino externo a StarSeed; en "open" se permite todo. Devuelve si está
 * permitido y, si no, el motivo. Pura (sin efectos).
 */
export function enforceNetMode(
    target: string,
    mode: NetMode,
): { allowed: boolean; external: boolean; reason?: string } {
    const external = isExternalTarget(target);
    if (mode === "internal" && external) {
        return {
            allowed: false,
            external,
            reason:
                "Modo «solo interno» activo: este destino es de internet abierto y está bloqueado. " +
                "Cambia a «internet abierto» en Ajustes para permitirlo.",
        };
    }
    return { allowed: true, external };
}

// ─────────────────────────────────────────────────────────────────────────────
// Abrir en otro navegador externo (Chrome / Opera / Ecosia / predeterminado)
// ─────────────────────────────────────────────────────────────────────────────
// HONESTIDAD: una web NO puede forzar QUÉ navegador del sistema abre una URL.
// `window.open` abre en el navegador actual (otra pestaña/ventana). Cuando un
// navegador expone un esquema/URL conocido para "abrir con", lo usamos de forma
// best-effort; si no, abrimos honestamente una pestaña nueva y etiquetamos la
// opción para que el usuario sepa qué pasa de verdad.

export type ExternalBrowser = "chrome" | "opera" | "ecosia" | "default";

export const EXTERNAL_BROWSER_LABEL: Record<ExternalBrowser, string> = {
    chrome: "Google Chrome",
    opera: "Opera",
    ecosia: "Ecosia",
    default: "Navegador predeterminado",
};

/**
 * Intenta abrir `url` en el navegador externo elegido. Devuelve `{ opened,
 * honest }`: `honest=false` cuando se usó un esquema específico del navegador
 * (puede no estar instalado), `true` cuando se abrió una pestaña nueva normal.
 * SSR-safe.
 */
export function openInExternalBrowser(
    url: string,
    browser: ExternalBrowser,
): { opened: boolean; honest: boolean } {
    if (typeof window === "undefined" || !url) return { opened: false, honest: true };
    const u = url.startsWith("/")
        ? new URL(url, window.location.href).toString()
        : normalizeUrl(url);

    // Esquemas "abrir con" conocidos (sólo móvil/algunas plataformas; best-effort).
    // En desktop estos esquemas no existen de forma estándar, así que caemos a
    // window.open. Detectamos móvil de forma laxa por el user agent.
    const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
    const isAndroid = /Android/i.test(ua);
    const isIOS = /iPhone|iPad|iPod/i.test(ua);

    try {
        if (browser === "chrome") {
            if (isIOS) {
                // Chrome iOS: esquema googlechrome(s)://
                const scheme = u.replace(/^https?/i, (m) =>
                    m.toLowerCase() === "https" ? "googlechromes" : "googlechrome",
                );
                window.open(scheme, "_blank");
                return { opened: true, honest: false };
            }
            if (isAndroid) {
                // Intent de Android hacia Chrome.
                const intent =
                    "intent://" +
                    u.replace(/^https?:\/\//i, "") +
                    "#Intent;scheme=https;package=com.android.chrome;end";
                window.open(intent, "_blank");
                return { opened: true, honest: false };
            }
        }
        if (browser === "opera") {
            if (isAndroid) {
                const intent =
                    "intent://" +
                    u.replace(/^https?:\/\//i, "") +
                    "#Intent;scheme=https;package=com.opera.browser;end";
                window.open(intent, "_blank");
                return { opened: true, honest: false };
            }
            if (isIOS) {
                // Opera Touch iOS: esquema touch-http(s)://
                const scheme = u.replace(/^https?/i, (m) =>
                    m.toLowerCase() === "https" ? "touch-https" : "touch-http",
                );
                window.open(scheme, "_blank");
                return { opened: true, honest: false };
            }
        }
        if (browser === "ecosia") {
            // Ecosia no expone un esquema fiable: abrimos la URL directamente
            // (en Ecosia si es el navegador del usuario; si no, una pestaña nueva)
            // o, como alternativa, una búsqueda en Ecosia del propio destino.
            window.open(u, "_blank", "noopener,noreferrer");
            return { opened: true, honest: true };
        }
    } catch {
        /* cae a window.open honesto */
    }

    // Predeterminado / desktop / fallback: abrir honestamente una pestaña nueva.
    window.open(u, "_blank", "noopener,noreferrer");
    return { opened: true, honest: true };
}

/**
 * Construye la URL para abrir un destino "vía otro servidor" (el proxy/render
 * tri-fuente del dominio "browser"), o null si no hay proxy configurado. Útil
 * en el diálogo de sitio bloqueado para la opción «otro servidor».
 */
export function proxiedUrlOrNull(url: string): string | null {
    const t = renderUrl(url);
    return t.proxied ? t.rendered : null;
}

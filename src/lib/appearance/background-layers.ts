/**
 * background-layers — CAPAS DE FONDO del StarSeed OS (Adenda 68 · D)
 * ============================================================================
 * El OS tenía UN solo fondo (`config.background.type`). Ahora tiene una PILA:
 *
 *      ┌──────────────────────────────┐  layers[n-1]   (arriba del todo)
 *      │  …                           │
 *      │  audiomorphic (blend screen) │  layers[0]
 *      ├──────────────────────────────┤
 *      │  FONDO BASE (motor del OS)   │  config.background.type
 *      └──────────────────────────────┘  spline · webgl · living · materia · …
 *
 * • `config.background.type` sigue siendo la BASE (compatibilidad total: los
 *   motores pesados —Spline, WebGL, Living, Materia— son singletons que leen
 *   ese campo; no se tocan).  ⚠️ Limitación honesta: el motor del OS es SIEMPRE
 *   la capa de abajo. Para poner un color/degradado por encima, se añade como
 *   capa de la pila (que es justo lo que hace este módulo).
 * • `config.background.layers` es la PILA que va ENCIMA, en orden (índice 0 =
 *   la más baja). Cada capa tiene opacidad, visibilidad y modo de mezcla.
 * • Una config antigua (sin `layers`) sigue funcionando: pila vacía = un solo
 *   fondo, exactamente como antes.
 *
 * ── AUDIOMORPHIC: DE IFRAME A MOTOR NATIVO (Adenda 68 · E · 2026-07-13) ─────
 * Ahora tenemos la REPO fuente (github.com/StarSeedSystem/Audiomorphic-AR-app,
 * del propio usuario) y el visualizador está **PORTADO AL OS como código
 * nativo** (`src/lib/audiomorphic/`). Eso mata de raíz los tres problemas que
 * tenía el iframe (todos verificados leyendo su bundle):
 *
 *  1. NO aceptaba NINGÚN parámetro por URL (`bg`, `autostart`, `preset`, `mic`…
 *     aparecían CERO veces en su código) ⇒ el OS no podía configurar nada.
 *     → AHORA: el motor es nuestro; TODOS sus parámetros son configurables.
 *  2. Su `<body>` es `#050505` OPACO y su canvas 2D se creaba con
 *     `alpha: false` + una estela que PINTA NEGRO cada fotograma ⇒ transparencia
 *     imposible; se parcheaba con `mix-blend-mode: screen` (que no compone: solo
 *     esconde el negro).
 *     → AHORA: canvas con `alpha: true` y estela por `destination-out` (borra
 *     alfa en vez de pintar negro) ⇒ **TRANSPARENCIA REAL**. Ver `renderer.ts`.
 *  3. Su tour salía en cada navegador y no se podía cerrar desde fuera
 *     (localStorage particionado por sitio de nivel superior).
 *     → AHORA: no hay tour, ni login, ni planes. El motor es parte del OS.
 *
 * `engine: "iframe"` se conserva como RESPALDO (la app externa sigue en línea y
 * es la única que tiene el modo VR/AR — ver nota en `AudiomorphicLayerConfig`).
 */

/* ── Tipos ─────────────────────────────────────────────────────────────── */

export type LayerKind = "color" | "gradiente" | "imagen" | "video" | "audiomorphic";

export type BlendMode =
    | "normal" | "screen" | "lighten" | "overlay" | "soft-light"
    | "multiply" | "color-dodge" | "difference" | "hard-light" | "luminosity";

/**
 * Motor de la capa Audiomorphic.
 *  · `nativo` (defecto) — el visualizador PORTADO, corriendo dentro del OS con
 *    transparencia real y todos sus parámetros configurables. Sin iframe.
 *  · `iframe`  — RESPALDO: la app externa (audiomorphic.vercel.app). Se conserva
 *    porque es la única que tiene el modo **VR/AR** (que no se ha portado: su
 *    stack exige React 19 + R3F v9 y el OS va con React 18 + R3F v8).
 */
export type AudiomorphicEngine = "nativo" | "iframe";

/** Ajustes propios de una capa Audiomorphic. */
export interface AudiomorphicLayerConfig {
    /** Motor: nativo (defecto) o iframe de respaldo. */
    engine: AudiomorphicEngine;

    /* ── MOTOR NATIVO ─────────────────────────────────────────────────────── */
    /**
     * Micrófono. El permiso se pide SIEMPRE con un gesto del usuario (un botón),
     * NUNCA al cargar. Sin micrófono el espiral sigue vivo (piloto automático):
     * el audio solo añade reactividad.
     */
    mic: boolean;
    /**
     * Parámetros REALES del motor (los del `types.ts` de la app original):
     * modo del piloto (deriva/armónico/génesis), sensibilidad, color, velocidad,
     * detalle, estela, geometría sagrada… Parcial: lo que no esté cae al defecto
     * exacto de la app original.
     */
    visual: Record<string, unknown>;

    /* ── COMUNES (CSS sobre la capa, valen para los dos motores) ──────────── */
    /** Escala (1–2): acerca el espiral. */
    scale: number;
    hue: number;        // -180..180 (deg)
    saturate: number;   // 0..2
    brightness: number; // 0.2..2
    contrast: number;   // 0.2..2

    /* ── RESPALDO POR IFRAME ─────────────────────────────────────────────── */
    /** URL del visualizador externo (self-host permitido). */
    url: string;
    /**
     * MODO INTERACCIÓN (solo iframe): la capa sube al frente y recibe clics para
     * usar los controles de la app externa. En el motor NATIVO no hace falta:
     * todo se configura desde el panel de fondos del OS.
     */
    interactive: boolean;
}

export interface BackgroundLayer {
    id: string;
    kind: LayerKind;
    /** Nombre editable (se muestra en la lista de capas). */
    name?: string;
    visible: boolean;
    /** 0..1 */
    opacity: number;
    blend: BlendMode;
    /** color → CSS color · gradiente → CSS gradient · imagen/video → URL */
    value?: string;
    audiomorphic?: AudiomorphicLayerConfig;
}

/**
 * Versión del modelo de capas — dispara la migración de configs persistidas.
 *  1 → Audiomorphic deja de ser `background.type` y pasa a ser CAPA (Adenda 68·D).
 *  2 → Audiomorphic pasa de IFRAME a MOTOR NATIVO (Adenda 68·E). Sin esto, las
 *      cuentas que ya tienen la capa guardada seguirían viendo el iframe opaco:
 *      la regla del proyecto es que todo rediseño migra las configs persistidas.
 */
export const BG_LAYERS_VERSION = 2;

export const AUDIOMORPHIC_DEFAULT_URL = "https://audiomorphic.vercel.app";

/** Motor por defecto de la BASE cuando hay que reparar una config rota. */
export const DEFAULT_BASE_ENGINE = "spline";

/* ── URL del visualizador (parámetros REALES, verificados) ─────────────── */

/**
 * Construye la URL del iframe de Audiomorphic.
 * `source=starseed-os` es el ÚNICO parámetro que la app entiende (contiene
 * "starseed") → la trata como cuenta StarSeed vinculada: sin muro de acceso y
 * con su tour mostrado UNA sola vez (no en cada carga). `starseed=1` va como
 * refuerzo (la app acepta ambos).
 */
export function buildAudiomorphicUrl(cfg?: Partial<AudiomorphicLayerConfig>): string {
    const base = cfg?.url?.trim() || AUDIOMORPHIC_DEFAULT_URL;
    try {
        const u = new URL(base);
        u.searchParams.set("source", "starseed-os");
        u.searchParams.set("starseed", "1");
        return u.toString();
    } catch {
        return `${AUDIOMORPHIC_DEFAULT_URL}?source=starseed-os&starseed=1`;
    }
}

/** Filtro CSS de una capa Audiomorphic (o `undefined` si no hay nada que aplicar). */
export function audiomorphicFilter(a: AudiomorphicLayerConfig): string | undefined {
    const parts: string[] = [];
    if (a.hue) parts.push(`hue-rotate(${a.hue}deg)`);
    if (a.saturate !== 1) parts.push(`saturate(${a.saturate})`);
    if (a.brightness !== 1) parts.push(`brightness(${a.brightness})`);
    if (a.contrast !== 1) parts.push(`contrast(${a.contrast})`);
    return parts.length ? parts.join(" ") : undefined;
}

/* ── Fábricas ──────────────────────────────────────────────────────────── */

function uid(): string {
    try {
        if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    } catch { /* noop */ }
    return `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function defaultAudiomorphicConfig(): AudiomorphicLayerConfig {
    return {
        engine: "nativo",    // el motor portado: transparencia real y configurable
        mic: false,          // NUNCA por defecto: el permiso se pide con un gesto del usuario
        visual: {},          // {} = los valores EXACTOS de la app original
        scale: 1,
        hue: 0,
        saturate: 1,
        brightness: 1,
        contrast: 1,
        url: AUDIOMORPHIC_DEFAULT_URL,
        interactive: false,  // (solo iframe) no roba clics a la UI del OS
    };
}

export function createLayer(kind: LayerKind): BackgroundLayer {
    const common = { id: uid(), kind, visible: true, opacity: 1 } as const;
    switch (kind) {
        case "audiomorphic":
            return {
                ...common,
                name: "Audiomorphic",
                // `normal`: con el motor NATIVO el canvas tiene alfa REAL, así que
                // el espiral ya se compone solo sobre la capa de abajo. Ya no hace
                // falta el truco de `screen` (que existía únicamente para esconder
                // el negro opaco del iframe). `screen` sigue disponible en el
                // selector si se quiere el brillo aditivo, pero como ELECCIÓN
                // estética, no como parche.
                blend: "normal",
                opacity: 1,
                audiomorphic: defaultAudiomorphicConfig(),
            };
        case "gradiente":
            return { ...common, name: "Degradado", blend: "normal", opacity: 0.6, value: "linear-gradient(135deg, #7C3AED 0%, #22D3EE 100%)" };
        case "color":
            return { ...common, name: "Color", blend: "normal", opacity: 0.35, value: "#0a0118" };
        case "imagen":
            return { ...common, name: "Imagen", blend: "normal", opacity: 0.8, value: "" };
        case "video":
            return { ...common, name: "Vídeo", blend: "normal", opacity: 0.8, value: "" };
    }
}

/* ── Catálogo (lo que ofrece "Añadir capa") ────────────────────────────── */

export interface LayerCatalogEntry {
    kind: LayerKind;
    label: string;
    hint: string;
}

export const LAYER_CATALOG: LayerCatalogEntry[] = [
    { kind: "audiomorphic", label: "Audiomorphic", hint: "Espiral de geometría sonora — motor NATIVO, con transparencia real y micrófono. Todos sus parámetros son configurables aquí." },
    { kind: "gradiente", label: "Degradado", hint: "Degradado CSS con opacidad y mezcla." },
    { kind: "color", label: "Color", hint: "Tinte sólido — útil para teñir el fondo de abajo." },
    { kind: "imagen", label: "Imagen", hint: "Imagen por URL, a pantalla completa." },
    { kind: "video", label: "Vídeo", hint: "Vídeo por URL, en bucle y sin sonido." },
];

/* ── Normalización defensiva ───────────────────────────────────────────── */

const BLENDS: BlendMode[] = [
    "normal", "screen", "lighten", "overlay", "soft-light",
    "multiply", "color-dodge", "difference", "hard-light", "luminosity",
];
const KINDS: LayerKind[] = ["color", "gradiente", "imagen", "video", "audiomorphic"];

const clamp = (v: unknown, lo: number, hi: number, fb: number): number => {
    const n = typeof v === "number" && Number.isFinite(v) ? v : fb;
    return Math.min(hi, Math.max(lo, n));
};

function normalizeAudiomorphic(raw: unknown): AudiomorphicLayerConfig {
    const d = defaultAudiomorphicConfig();
    const a = (raw ?? {}) as Partial<AudiomorphicLayerConfig>;
    return {
        // Sin `engine` (config anterior a la Adenda 68·E) ⇒ NATIVO. Es la
        // migración de facto: nadie se queda con el iframe opaco por inercia.
        engine: a.engine === "iframe" ? "iframe" : "nativo",
        mic: a.mic === true,
        visual: a.visual && typeof a.visual === "object" ? { ...a.visual } : {},
        scale: clamp(a.scale, 1, 2, d.scale),
        hue: clamp(a.hue, -180, 180, d.hue),
        saturate: clamp(a.saturate, 0, 2, d.saturate),
        brightness: clamp(a.brightness, 0.2, 2, d.brightness),
        contrast: clamp(a.contrast, 0.2, 2, d.contrast),
        url: typeof a.url === "string" && a.url.trim() ? a.url.trim() : d.url,
        // OJO: `interactive` es un estado TEMPORAL del respaldo por iframe (el
        // usuario entra a tocar la app externa y sale). Una capa de fondo
        // interactiva de forma permanente robaría clics a la UI del OS.
        interactive: a.interactive === true,
    };
}

/** Sanea la pila venga de donde venga (config vieja, import, sync remoto). */
export function normalizeLayers(raw: unknown): BackgroundLayer[] {
    if (!Array.isArray(raw)) return [];
    const out: BackgroundLayer[] = [];
    for (const item of raw) {
        if (!item || typeof item !== "object") continue;
        const l = item as Partial<BackgroundLayer>;
        if (!l.kind || !KINDS.includes(l.kind)) continue;
        out.push({
            id: typeof l.id === "string" && l.id ? l.id : uid(),
            kind: l.kind,
            name: typeof l.name === "string" ? l.name : undefined,
            visible: l.visible !== false,
            opacity: clamp(l.opacity, 0, 1, 1),
            blend: l.blend && BLENDS.includes(l.blend) ? l.blend : "normal",
            value: typeof l.value === "string" ? l.value : undefined,
            audiomorphic: l.kind === "audiomorphic" ? normalizeAudiomorphic(l.audiomorphic) : undefined,
        });
        if (out.length >= 8) break; // techo sano: 8 capas
    }
    return out;
}

/* ── MIGRACIÓN — la raíz del bug ───────────────────────────────────────── */

export interface LegacyBackgroundLike {
    type?: string;
    layers?: unknown;
    layersVersion?: number;
    /** ajustes del viejo fondo Audiomorphic (url/overlay/preset/mic/camera). */
    audiomorphic?: { url?: string; overlay?: number; mode?: string; mic?: boolean; camera?: boolean; preset?: string };
    [k: string]: unknown;
}

export interface MigratedBackground {
    type: string;
    layers: BackgroundLayer[];
    layersVersion: number;
    /** true si la migración tuvo que apagar el fantasma de Audiomorphic. */
    removedAudiomorphicGhost: boolean;
}

/**
 * Migra una config de fondo persistida al modelo de capas.
 *
 * REGLA (petición del usuario, 2026-07-13): **Audiomorphic NUNCA arranca solo.**
 * Si la config guardada tenía `type: "audiomorphic"` (es el caso real que veía
 * el usuario: se quedó grabado en `appearance-config-v2` y —al estar esa clave
 * en SYNCED_KEYS de ÁMBITO CUENTA— volvía en cada dispositivo y en cada carga),
 * la base pasa al motor por defecto y Audiomorphic queda como CAPA APAGADA,
 * conservando los ajustes del usuario para que pueda encenderla cuando quiera.
 *
 * También repara `type: "none"`, que escribían los botones "Quitar fondo" y que
 * NO es un tipo válido → dejaba al OS literalmente sin fondo.
 */
export function migrateBackgroundLayers(bg: LegacyBackgroundLike): MigratedBackground {
    const layers = normalizeLayers(bg.layers);
    const prevVersion = typeof bg.layersVersion === "number" ? bg.layersVersion : 0;

    // EL ARRANQUE NUNCA ES INTERACTIVO. `interactive` es un estado de sesión (el
    // usuario entra a tocar la app externa y sale). Si se colara persistido, el
    // OS abriría el visualizador a pantalla completa al cargar — otro fantasma.
    layers.forEach((l) => {
        if (l.kind === "audiomorphic" && l.audiomorphic) l.audiomorphic.interactive = false;
    });

    // ── v2 · IFRAME → MOTOR NATIVO ────────────────────────────────────────
    // `normalizeAudiomorphic` ya pone `engine: "nativo"` a toda capa guardada
    // sin ese campo (las de la Adenda 68·D). Aquí solo queda deshacer el PARCHE
    // que existía por culpa del iframe: `mix-blend-mode: screen` se usaba para
    // esconder su `<body>` negro opaco. Con alfa REAL ya no hace falta, y con
    // `normal` los colores del espiral son los verdaderos.
    // Se hace SOLO al cruzar la versión: si el usuario elige `screen` a partir
    // de ahora (por gusto: da brillo aditivo), se respeta para siempre.
    if (prevVersion < 2) {
        layers.forEach((l) => {
            if (l.kind === "audiomorphic" && l.blend === "screen") l.blend = "normal";
        });
    }

    let type = typeof bg.type === "string" && bg.type ? bg.type : DEFAULT_BASE_ENGINE;
    let removedAudiomorphicGhost = false;

    // `none` nunca fue un tipo válido de fondo (lo escribían los "Quitar fondo").
    if (type === "none") type = DEFAULT_BASE_ENGINE;

    if (type === "audiomorphic") {
        removedAudiomorphicGhost = true;
        type = DEFAULT_BASE_ENGINE;
        if (!layers.some((l) => l.kind === "audiomorphic")) {
            const layer = createLayer("audiomorphic");
            layer.visible = false;                     // apagada: no vuelve a salir sola
            layer.audiomorphic!.interactive = false;   // ni a pantalla completa
            if (bg.audiomorphic?.url) layer.audiomorphic!.url = bg.audiomorphic.url;
            layers.push(layer);
        } else {
            layers.forEach((l) => { if (l.kind === "audiomorphic") l.visible = false; });
        }
    }

    return { type, layers, layersVersion: BG_LAYERS_VERSION, removedAudiomorphicGhost };
}

/* ── Helpers de pila (puros; los consume la UI y los widgets) ──────────── */

export function addLayer(layers: BackgroundLayer[] | undefined, kind: LayerKind): BackgroundLayer[] {
    const next = [...(layers ?? [])];
    if (next.length >= 8) return next;
    next.push(createLayer(kind));
    return next;
}

export function removeLayer(layers: BackgroundLayer[] | undefined, id: string): BackgroundLayer[] {
    return (layers ?? []).filter((l) => l.id !== id);
}

export function patchLayer(
    layers: BackgroundLayer[] | undefined,
    id: string,
    patch: Partial<BackgroundLayer>,
): BackgroundLayer[] {
    return (layers ?? []).map((l) => (l.id === id ? { ...l, ...patch } : l));
}

export function patchAudiomorphic(
    layers: BackgroundLayer[] | undefined,
    id: string,
    patch: Partial<AudiomorphicLayerConfig>,
): BackgroundLayer[] {
    return (layers ?? []).map((l) =>
        l.id === id && l.kind === "audiomorphic"
            ? { ...l, audiomorphic: normalizeAudiomorphic({ ...(l.audiomorphic ?? {}), ...patch }) }
            : l,
    );
}

/**
 * Parchea los parámetros VISUALES del motor nativo (modo del piloto, color,
 * sensibilidad, velocidad, detalle…). Se guardan como parche: lo que no esté
 * cae al defecto EXACTO de la app original.
 */
export function patchAudiomorphicVisual(
    layers: BackgroundLayer[] | undefined,
    id: string,
    patch: Record<string, unknown>,
): BackgroundLayer[] {
    return (layers ?? []).map((l) =>
        l.id === id && l.kind === "audiomorphic" && l.audiomorphic
            ? {
                ...l,
                audiomorphic: {
                    ...l.audiomorphic,
                    visual: { ...(l.audiomorphic.visual ?? {}), ...patch },
                },
            }
            : l,
    );
}

/** Mueve una capa a otra posición (arrastrar para reordenar). */
export function reorderLayers(layers: BackgroundLayer[] | undefined, from: number, to: number): BackgroundLayer[] {
    const next = [...(layers ?? [])];
    if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) return next;
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
}

/** ¿Hay una capa Audiomorphic ENCENDIDA? (lo consultan los widgets) */
export function audiomorphicLayer(layers: BackgroundLayer[] | undefined): BackgroundLayer | undefined {
    return (layers ?? []).find((l) => l.kind === "audiomorphic" && l.visible);
}

/**
 * Enciende/apaga Audiomorphic como capa (lo que antes hacían los widgets
 * pisando `background.type`). Si no existe la capa, la crea.
 */
export function setAudiomorphicEnabled(layers: BackgroundLayer[] | undefined, on: boolean): BackgroundLayer[] {
    const list = [...(layers ?? [])];
    const idx = list.findIndex((l) => l.kind === "audiomorphic");
    if (idx === -1) {
        if (!on) return list;
        const layer = createLayer("audiomorphic");
        list.push(layer);
        return list;
    }
    list[idx] = { ...list[idx], visible: on };
    return list;
}

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
 * ── AUDIOMORPHIC: LA VERDAD VERIFICADA (2026-07-13) ─────────────────────────
 * Se descargó y leyó el bundle de https://audiomorphic.vercel.app.
 *
 *  1. La app NO acepta `?bg`, `?autostart`, `?full`, `?mic`, `?cam`, `?preset`
 *     ni `?starseed_os` — esos parámetros aparecen CERO veces en su código. El
 *     "modo fondo" que el OS creía usar NUNCA existió: el iframe cargaba la app
 *     ENTERA, con su UI y su tour de bienvenida.
 *  2. Lo ÚNICO que la app lee de la URL es `source` / `from` (si contienen
 *     "starseed"), `starseed=1` o `#starseed`. Con eso se da por VINCULADA a
 *     una cuenta StarSeed (`isLoggedIn = true`, insignia "StarSeed",
 *     `viaStarSeed: true`).
 *  3. Su tour se muestra si `intro.seen !== "true"` **O NO hay sesión**. Sin el
 *     parámetro correcto no hay sesión ⇒ el tour salía SIEMPRE, en cada carga.
 *     Y como el iframe iba con `pointer-events: none`, no se podía cerrar.
 *  4. Su `<body>` es `background-color: #050505` (OPACO). NO hay transparencia
 *     posible por `allowtransparency`. Por eso las capas Audiomorphic usan
 *     `mix-blend-mode: screen` por defecto: el negro desaparece y solo quedan
 *     el espiral y sus brillos sobre la capa de abajo.
 *  5. La app NO tiene API `postMessage` ⇒ el OS no puede pilotarla desde fuera.
 *     Sus parámetros visuales (k, psi, hue…) viven en SU localStorage. Lo que
 *     el OS SÍ puede hacer, y hace: opacidad, mezcla, escala y filtros CSS
 *     (tono/saturación/brillo/contraste) sobre el iframe, y —con la capa en
 *     modo interactivo— dejar que el usuario use los controles de la propia app
 *     (Deriva · Armónico · Génesis · Iniciar Micrófono · Pantalla completa).
 */

/* ── Tipos ─────────────────────────────────────────────────────────────── */

export type LayerKind = "color" | "gradiente" | "imagen" | "video" | "audiomorphic";

export type BlendMode =
    | "normal" | "screen" | "lighten" | "overlay" | "soft-light"
    | "multiply" | "color-dodge" | "difference" | "hard-light" | "luminosity";

/** Ajustes propios de una capa Audiomorphic (todo lo que SÍ podemos controlar). */
export interface AudiomorphicLayerConfig {
    /** URL del visualizador (self-host permitido). */
    url: string;
    /**
     * Micrófono ACTIVADO por el usuario. La app externa exige un clic SUYO en
     * su botón "Iniciar Micrófono" para pedir el permiso — el OS nunca lo pide
     * ni lo dispara solo. Marca de intención + insignia en la UI.
     */
    mic: boolean;
    /**
     * MODO INTERACCIÓN (temporal): la capa sube al frente y recibe clics, para
     * que el usuario use los controles de la propia app (Iniciar Micrófono,
     * Deriva/Armónico/Génesis…). Al salir, el iframe NO se remonta ⇒ el audio y
     * la escena siguen vivos cuando vuelve al fondo.
     */
    interactive: boolean;
    /** Escala del iframe (1–2): acerca el espiral. */
    scale: number;
    /** Filtros CSS reales sobre el iframe. */
    hue: number;        // -180..180 (deg)
    saturate: number;   // 0..2
    brightness: number; // 0.2..2
    contrast: number;   // 0.2..2
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

/** Versión del modelo de capas — dispara la migración de configs persistidas. */
export const BG_LAYERS_VERSION = 1;

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
        url: AUDIOMORPHIC_DEFAULT_URL,
        mic: false,          // NUNCA por defecto: el permiso se pide con un gesto del usuario
        interactive: false,  // no roba clics a la UI del OS
        scale: 1,
        hue: 0,
        saturate: 1,
        brightness: 1,
        contrast: 1,
    };
}

export function createLayer(kind: LayerKind): BackgroundLayer {
    const common = { id: uid(), kind, visible: true, opacity: 1 } as const;
    switch (kind) {
        case "audiomorphic":
            return {
                ...common,
                name: "Audiomorphic",
                // screen: el #050505 opaco de la app se vuelve invisible y solo
                // queda el espiral sobre la capa de abajo. Es LA razón de que
                // funcione como "capa transparente" sin tocar la app externa.
                blend: "screen",
                opacity: 0.9,
                audiomorphic: {
                    ...defaultAudiomorphicConfig(),
                    // PRIMER USO: la capa nace en MODO INTERACCIÓN, al frente.
                    // Motivo real (verificado): la app externa muestra su tour de
                    // bienvenida la primera vez en cada navegador, y su
                    // localStorage está PARTICIONADO por sitio de nivel superior
                    // ⇒ el OS no puede cerrarlo por él. Con la capa interactiva el
                    // usuario pulsa «Saltar» (y «Iniciar Micrófono» si quiere) y
                    // sale con «Listo»: a partir de ahí el fondo queda limpio.
                    // Nunca persiste: el arranque siempre fuerza interactive=false.
                    interactive: true,
                },
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
    { kind: "audiomorphic", label: "Audiomorphic", hint: "Espiral de geometría sonora. Se mezcla en 'screen' → solo se ve el espiral." },
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
        url: typeof a.url === "string" && a.url.trim() ? a.url.trim() : d.url,
        mic: a.mic === true,
        // OJO: `interactive` es un estado TEMPORAL (el usuario entra a tocar la
        // app y sale). No se fuerza desde `mic`: una capa de fondo interactiva
        // de forma permanente robaría clics a la UI del OS.
        interactive: a.interactive === true,
        scale: clamp(a.scale, 1, 2, d.scale),
        hue: clamp(a.hue, -180, 180, d.hue),
        saturate: clamp(a.saturate, 0, 2, d.saturate),
        brightness: clamp(a.brightness, 0.2, 2, d.brightness),
        contrast: clamp(a.contrast, 0.2, 2, d.contrast),
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
    // EL ARRANQUE NUNCA ES INTERACTIVO. `interactive` es un estado de sesión (el
    // usuario entra a tocar la app y sale). Si se colara persistido, el OS
    // abriría el visualizador a pantalla completa al cargar — otro fantasma.
    layers.forEach((l) => {
        if (l.kind === "audiomorphic" && l.audiomorphic) l.audiomorphic.interactive = false;
    });
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

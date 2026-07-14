/**
 * Audiomorphic — TIPOS Y PARÁMETROS (port nativo COMPLETO · Adenda 69 · K)
 * ============================================================================
 * Portado LITERALMENTE de la repo **CORRECTA** del usuario:
 *   https://github.com/alexbordongarrigos/audiomorphic-ar   (`types.ts`)
 *
 * ⚠️ CORRECCIÓN DE LA ADENDA 68·E: aquel port se hizo desde
 * `StarSeedSystem/Audiomorphic-AR-app`, que es una versión **VIEJA y recortada**
 * (4 geometrías, sin aleatorizador, sin capa de geometría sagrada, sin fondos,
 * sin VR/AR…). La app real tiene ~3.600 líneas solo de panel de control. De ahí
 * que al usuario le faltaran "muchas opciones del menú de ajustes".
 *
 * Autoría original: Audiomorphic (Alex Bordón Garrigós).
 * No se cambia ni un valor por defecto.
 *
 * ── Qué NO se copia y por qué ───────────────────────────────────────────────
 *  · `SubscriptionTier` y el global JSX de `stripe-buy-button`: en el OS la app
 *    va **DESBLOQUEADA y sin login**. No hay planes que representar.
 *  · Los parámetros VR/AR **sí** se conservan (para no perder presets ni
 *    exportaciones), pero su motor (`VisualizerVR`, R3F v9 + @react-three/xr v6)
 *    **no es portable a React 18**. Ver `control-panel.tsx` §VR/AR: se dice con
 *    todas las letras en la UI, no se finge.
 */

export type AutoPilotMode = "drift" | "harmonic" | "genesis";
export type GeometryRegime = "primary" | "reciprocal" | "void";

/** Las **20** geometrías sagradas reales de la app (el port viejo tenía 4). */
export type SacredGeometryMode =
    | "goldenSpiral"
    | "flowerOfLife"
    | "quantumWave"
    | "torus"
    | "metatron"
    | "merkaba"
    | "platonicSolids"
    | "sriYantra"
    | "cymatics"
    | "vectorEquilibrium"
    | "treeOfLife"
    | "yinYang"
    | "mandala1"
    | "mandala2"
    | "mandala3"
    | "holographicFractal"
    | "chakras"
    | "om"
    | "lotus"
    | "dharmaChakra";

export type BackgroundMode =
    | "solid"
    | "gradient"
    | "liquid-rainbow"
    | "crystal-bubbles"
    | "organic-fade"
    | "morphing-colors";

export type AutoRandomMode =
    | "none" | "subtle" | "chaotic" | "harmonic" | "sacred" | "rhythmic"
    | "rainbow" | "astral" | "random" | "smart" | "dj";

export type AutoTimeDelayMode = "instant" | "custom" | "smart";
export type AutoParamRegenMode = "instant" | "smooth" | "custom";
export type AutoRelationshipMode = "empathetic" | "technical" | "rhythmic";
export type ArFilter = "none" | "psychedelic" | "noir" | "neon" | "glitch" | "dream" | "hypnotic";
export type SgDrawMode = "nodes" | "layers" | "both";
export type AudioSource = "microphone" | "system";

export interface GeometryInfo {
    V: number;       // Vértices
    E: number;       // Aristas
    alpha: number;   // Variable de estructura
    beta: number;    // Variable de potencial
    regime: GeometryRegime;
    name: string;
}

export interface SacredGeometrySettings {
    complexity: number;
    connectionSpan: number;
    scale: number;
    lineOpacity: number;
    bgOpacity: number;
    thickness: number;
    flowSpeed: number;
    audioReactivity: number;
    viscosity: number;
    colored: boolean;
    customColor: number;
}

export interface VisualizerParams {
    k: number;           // Factor de expansión base
    psi: number;         // Ángulo de rotación base
    z0_r: number;        // Constante compleja (real)
    z0_i: number;        // Constante compleja (imaginaria)
    iter: number;        // Iteraciones por fotograma (detalle)
    zoom: number;        // Escala visual
    sensitivity: number; // Sensibilidad del audio
    freqRange: number;   // Rango del espectro muestreado
    hueSpeed: number;    // Velocidad del ciclo de color
    trail: number;       // Persistencia / estela (0-1)

    // Color
    baseHue: number;
    hueRange: number;
    saturation: number;
    brightness: number;
    harmonicColor: boolean;
    harmonicSensitivity: number;
    harmonicDepth: number;

    // Automatización
    autoPilot: boolean;
    autoPilotMode: AutoPilotMode;
    genesisStage: number;
    rootNote: number;
    autoViscosity: number;          // 0 (agua) → 1 (miel)
    autoSpeed: number;
    autoEmotionSensitivity: number;
    autoStyleFluidity: number;

    // Autorregeneración avanzada
    autoOffscreenFade: boolean;
    autoTimeDelayMode: AutoTimeDelayMode;
    autoTimeDelay: number;          // 0-10 s
    autoParamRegenMode: AutoParamRegenMode;
    autoParamRegenDelay: number;    // 0-10 s
    autoParamRegenBuffer: number;   // 0-100
    autoOptionSaturationAuto: boolean;
    autoOptionSaturation: number;   // 0-100
    autoRelationshipMode: AutoRelationshipMode;
    autoParamRatioLeveler: number;  // 0-100
    autoRandomOnBeat: boolean;
    autoRandomMode: AutoRandomMode;
    /** Claves de parámetros que el usuario ha BLOQUEADO (el piloto no los toca). */
    lockedParams: string[];

    // Objetivos para interpolación suave (los escribe el panel; los lee el piloto)
    targetZoom?: number;
    targetIter?: number;
    targetDistanceZoom?: number;
    targetSpiralThickness?: number;
    targetK?: number;
    targetPsi?: number;
    targetZ0_r?: number;
    targetZ0_i?: number;
    targetBaseHue?: number;

    // Geometría sagrada
    /** Geometrías que PERTURBAN la espiral. */
    spiralResonanceModes: SacredGeometryMode[];
    /** Capa de geometría sagrada INDEPENDIENTE (se puede usar sin Génesis). */
    sacredGeometryEnabled: boolean;
    sacredGeometryModes: SacredGeometryMode[];
    sgSettings: Record<SacredGeometryMode, SacredGeometrySettings>;
    sgShowNodes: boolean;
    sgDrawMode: SgDrawMode;
    sgAutoResonance: boolean;
    sgTheme: "light" | "dark";
    sgAutoHarmonic: boolean;
    sgGlobalOpacity: number;
    sgGlobalFlowSpeed: number;
    sgGlobalAudioReactivity: number;
    sgGlobalViscosity: number;
    spiralThickness: number;

    // VR/AR — ⚠️ sin motor en el OS (React 18). Se conservan para no perder presets.
    vrMode: boolean;
    arMode: boolean;
    vrDragRotation: boolean;
    vrDepth: number;
    vrDistance: number;
    distanceZoom: number;   // ← este SÍ se usa en 2D (separación/acercamiento)
    vrSplitScreen: boolean;
    vrRadius: number;
    vrThickness: number;
    vrSymmetric: boolean;

    arFilter: ArFilter;
    arIntensity: number;

    arPortalMode: boolean;
    arPortalScale: number;
    arPortalPerspectiveIntensity: number;
    arPortalVanishingRadius: number;
    arPortalFade: number;
    arPortalBending: number;

    // Fondo propio del visualizador
    bgMode: BackgroundMode;
    bgColors: string[];
    bgSpeed: number;
    bgAnimatable: boolean;
    bgVignette: boolean;
    bgVignetteIntensity: number;

    // UI
    showIndicators: boolean;
    menuTransparency: number;
    menuAutoCloseTime: number;
    audioSource: AudioSource;

    // Datos vivos (solo lectura para la UI)
    geometryData?: GeometryInfo;
}

const defaultSGSettings: SacredGeometrySettings = {
    complexity: 3.0,
    connectionSpan: 100.0,
    scale: 0.1,
    lineOpacity: 0.5,
    bgOpacity: 0.1,
    thickness: 0.1,
    flowSpeed: 0.2,
    audioReactivity: 5.0,
    viscosity: 0.5,
    colored: true,
    customColor: 200,
};

export const SG_MODES: SacredGeometryMode[] = [
    "goldenSpiral", "flowerOfLife", "quantumWave", "torus", "metatron", "merkaba",
    "platonicSolids", "sriYantra", "cymatics", "vectorEquilibrium", "treeOfLife",
    "yinYang", "mandala1", "mandala2", "mandala3", "holographicFractal",
    "chakras", "om", "lotus", "dharmaChakra",
];

/** Etiquetas en español, exactamente las de la app original. */
export const SG_MODE_LABELS: Record<SacredGeometryMode, string> = {
    goldenSpiral: "Espiral Áurea",
    flowerOfLife: "Flor de la Vida",
    quantumWave: "Onda Cuántica",
    torus: "Toroide",
    metatron: "Cubo de Metatrón",
    merkaba: "Merkaba",
    platonicSolids: "Sólidos Platónicos",
    sriYantra: "Sri Yantra",
    cymatics: "Cimática",
    vectorEquilibrium: "Equilibrio Vectorial",
    treeOfLife: "Árbol de la Vida",
    yinYang: "Yin Yang",
    mandala1: "Mandala 1 (Externo)",
    mandala2: "Mandala 2 (Interno)",
    mandala3: "Mandala 3 (Secreto)",
    holographicFractal: "Fractal Holográfico",
    chakras: "Chakras",
    om: "Om",
    lotus: "Flor de Loto",
    dharmaChakra: "Dharma Chakra",
};

function emptySgSettings(): Record<SacredGeometryMode, SacredGeometrySettings> {
    const out = {} as Record<SacredGeometryMode, SacredGeometrySettings>;
    for (const m of SG_MODES) out[m] = { ...defaultSGSettings };
    return out;
}

/** Valores por defecto EXACTOS de la app original (repo `audiomorphic-ar`). */
export const DEFAULT_PARAMS: VisualizerParams = {
    k: 1.008,
    psi: 2.399,        // ángulo áureo
    z0_r: 0.0,
    z0_i: 0.0,
    iter: 2000,
    zoom: 0.001,
    sensitivity: 5.0,
    freqRange: 1.0,
    hueSpeed: 0.2,
    trail: 1.0,

    baseHue: 200,
    hueRange: 360,
    saturation: 100,
    brightness: 10,
    harmonicColor: false,
    harmonicSensitivity: 5.0,
    harmonicDepth: 360,

    autoPilot: true,
    autoPilotMode: "harmonic",
    genesisStage: 0,
    rootNote: 0,
    autoViscosity: 0.963,
    autoSpeed: 1.0,
    autoEmotionSensitivity: 0.5,
    autoStyleFluidity: 0.5,

    autoOffscreenFade: false,
    autoTimeDelayMode: "smart",
    autoTimeDelay: 2.0,
    autoParamRegenMode: "custom",
    autoParamRegenDelay: 1.0,
    autoParamRegenBuffer: 50,
    autoOptionSaturationAuto: false,
    autoOptionSaturation: 50,
    autoRelationshipMode: "empathetic",
    autoParamRatioLeveler: 50,
    autoRandomOnBeat: false,
    autoRandomMode: "none",
    lockedParams: [],

    spiralResonanceModes: [],
    sacredGeometryEnabled: false,
    sacredGeometryModes: [],
    sgSettings: emptySgSettings(),
    sgShowNodes: true,
    sgDrawMode: "layers",
    sgAutoResonance: false,
    sgTheme: "light",
    sgAutoHarmonic: false,
    sgGlobalOpacity: 1.0,
    sgGlobalFlowSpeed: 1.0,
    sgGlobalAudioReactivity: 1.0,
    sgGlobalViscosity: 1.0,
    spiralThickness: 1.0,

    vrMode: false,
    arMode: false,
    vrDragRotation: false,
    vrDepth: 20,
    vrDistance: 0,
    distanceZoom: 1.0,
    vrSplitScreen: false,
    vrRadius: 5,
    vrThickness: 2,
    vrSymmetric: true,

    arFilter: "none",
    arIntensity: 0.5,

    arPortalMode: false,
    arPortalScale: 1.0,
    arPortalPerspectiveIntensity: 2.0,
    arPortalVanishingRadius: 1.0,
    arPortalFade: 1.0,
    arPortalBending: 0.0,

    bgMode: "solid",
    bgColors: ["#000000", "#1a1a2e"],
    bgSpeed: 0.5,
    bgAnimatable: false,
    bgVignette: false,
    bgVignetteIntensity: 0.8,

    showIndicators: true,
    menuTransparency: 0.8,
    menuAutoCloseTime: 5,
    audioSource: "microphone",
};

/** Métricas de audio del fotograma (las 5 bandas reales de la app). */
export interface AudioMetrics {
    /** 0-1 normalizado */
    volume: number;
    /** 0-1 normalizado (centroide espectral) */
    frequency: number;
    bass: number;
    mid: number;
    treble: number;
}

/** Proveedor de métricas (el renderer nunca toca el micrófono él solo). */
export type AudioMetricsProvider = (sensitivity: number, freqRange: number) => AudioMetrics;

/** Métricas en silencio — lo que se usa cuando NO hay micrófono concedido. */
export const SILENT_METRICS: AudioMetrics = { volume: 0, frequency: 0, bass: 0, mid: 0, treble: 0 };

/* ── Normalización defensiva (configs persistidas / sync remoto) ─────────── */

const clampNum = (v: unknown, lo: number, hi: number, fb: number): number => {
    const n = typeof v === "number" && Number.isFinite(v) ? v : fb;
    return Math.min(hi, Math.max(lo, n));
};

const pick = <T extends string>(v: unknown, allowed: readonly T[], fb: T): T =>
    typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fb;

const PILOT_MODES: AutoPilotMode[] = ["drift", "harmonic", "genesis"];
const RANDOM_MODES: AutoRandomMode[] = [
    "none", "subtle", "chaotic", "harmonic", "sacred", "rhythmic",
    "rainbow", "astral", "random", "smart", "dj",
];
const BG_MODES: BackgroundMode[] = [
    "solid", "gradient", "liquid-rainbow", "crystal-bubbles", "organic-fade", "morphing-colors",
];
const AR_FILTERS: ArFilter[] = ["none", "psychedelic", "noir", "neon", "glitch", "dream", "hypnotic"];

function normalizeModes(raw: unknown, fallback: SacredGeometryMode[]): SacredGeometryMode[] {
    if (!Array.isArray(raw)) return [...fallback];
    return raw.filter((m): m is SacredGeometryMode => SG_MODES.includes(m as SacredGeometryMode));
}

function normalizeSgSettings(raw: unknown): Record<SacredGeometryMode, SacredGeometrySettings> {
    const src = (raw ?? {}) as Partial<Record<SacredGeometryMode, Partial<SacredGeometrySettings>>>;
    const out = {} as Record<SacredGeometryMode, SacredGeometrySettings>;
    for (const m of SG_MODES) out[m] = { ...defaultSGSettings, ...(src[m] ?? {}) };
    return out;
}

/**
 * Fusiona un parche parcial (lo que guarda una capa de fondo, o un preset)
 * sobre los valores por defecto, saneando rangos. Nunca lanza.
 *
 * **Migración de la Adenda 68·E:** aquel port llamaba `sgResonanceModes` a lo
 * que la app real llama `spiralResonanceModes`. Las capas de fondo ya guardadas
 * llevan la clave vieja ⇒ se traduce aquí (lectura) y en `migrateBackgroundLayers`
 * (escritura). Sin esto, quien ya tuviera la capa perdería su geometría.
 */
export function resolveParams(patch?: Partial<VisualizerParams> | null): VisualizerParams {
    const d = DEFAULT_PARAMS;
    const p = (patch ?? {}) as Partial<VisualizerParams> & { sgResonanceModes?: unknown };

    const legacySpiral = p.spiralResonanceModes ?? p.sgResonanceModes;

    return {
        ...d,
        ...p,
        k: clampNum(p.k, 0.8, 1.2, d.k),
        psi: clampNum(p.psi, -Math.PI * 2, Math.PI * 2, d.psi),
        z0_r: clampNum(p.z0_r, -2, 2, d.z0_r),
        z0_i: clampNum(p.z0_i, -2, 2, d.z0_i),
        iter: Math.round(clampNum(p.iter, 100, 6000, d.iter)),
        zoom: clampNum(p.zoom, 0.0001, 3, d.zoom),
        sensitivity: clampNum(p.sensitivity, 0.1, 20, d.sensitivity),
        freqRange: clampNum(p.freqRange, 0.05, 1, d.freqRange),
        hueSpeed: clampNum(p.hueSpeed, 0, 5, d.hueSpeed),
        trail: clampNum(p.trail, 0.01, 1, d.trail),

        baseHue: clampNum(p.baseHue, 0, 360, d.baseHue),
        hueRange: clampNum(p.hueRange, 0, 720, d.hueRange),
        saturation: clampNum(p.saturation, 0, 100, d.saturation),
        brightness: clampNum(p.brightness, 0, 100, d.brightness),
        harmonicColor: p.harmonicColor === true,
        harmonicSensitivity: clampNum(p.harmonicSensitivity, 0, 20, d.harmonicSensitivity),
        harmonicDepth: clampNum(p.harmonicDepth, 0, 360, d.harmonicDepth),

        autoPilot: p.autoPilot !== false,
        autoPilotMode: pick(p.autoPilotMode, PILOT_MODES, d.autoPilotMode),
        genesisStage: Math.round(clampNum(p.genesisStage, 0, 6, d.genesisStage)),
        rootNote: Math.round(clampNum(p.rootNote, 0, 11, d.rootNote)),
        autoViscosity: clampNum(p.autoViscosity, 0, 0.999, d.autoViscosity),
        autoSpeed: clampNum(p.autoSpeed, 0.01, 5, d.autoSpeed),
        autoEmotionSensitivity: clampNum(p.autoEmotionSensitivity, 0, 1, d.autoEmotionSensitivity),
        autoStyleFluidity: clampNum(p.autoStyleFluidity, 0, 1, d.autoStyleFluidity),

        autoOffscreenFade: p.autoOffscreenFade === true,
        autoTimeDelayMode: pick(p.autoTimeDelayMode, ["instant", "custom", "smart"] as const, d.autoTimeDelayMode),
        autoTimeDelay: clampNum(p.autoTimeDelay, 0, 10, d.autoTimeDelay),
        autoParamRegenMode: pick(p.autoParamRegenMode, ["instant", "smooth", "custom"] as const, d.autoParamRegenMode),
        autoParamRegenDelay: clampNum(p.autoParamRegenDelay, 0, 10, d.autoParamRegenDelay),
        autoParamRegenBuffer: clampNum(p.autoParamRegenBuffer, 0, 100, d.autoParamRegenBuffer),
        autoOptionSaturationAuto: p.autoOptionSaturationAuto === true,
        autoOptionSaturation: clampNum(p.autoOptionSaturation, 0, 100, d.autoOptionSaturation),
        autoRelationshipMode: pick(p.autoRelationshipMode, ["empathetic", "technical", "rhythmic"] as const, d.autoRelationshipMode),
        autoParamRatioLeveler: clampNum(p.autoParamRatioLeveler, 0, 100, d.autoParamRatioLeveler),
        autoRandomOnBeat: p.autoRandomOnBeat === true,
        autoRandomMode: pick(p.autoRandomMode, RANDOM_MODES, d.autoRandomMode),
        lockedParams: Array.isArray(p.lockedParams) ? p.lockedParams.filter((s): s is string => typeof s === "string") : [],

        spiralResonanceModes: normalizeModes(legacySpiral, d.spiralResonanceModes),
        sacredGeometryEnabled: p.sacredGeometryEnabled === true,
        sacredGeometryModes: normalizeModes(p.sacredGeometryModes, d.sacredGeometryModes),
        sgSettings: normalizeSgSettings(p.sgSettings),
        sgShowNodes: p.sgShowNodes !== false,
        sgDrawMode: pick(p.sgDrawMode, ["nodes", "layers", "both"] as const, d.sgDrawMode),
        sgAutoResonance: p.sgAutoResonance === true,
        sgTheme: p.sgTheme === "dark" ? "dark" : "light",
        sgAutoHarmonic: p.sgAutoHarmonic === true,
        sgGlobalOpacity: clampNum(p.sgGlobalOpacity, 0, 3, d.sgGlobalOpacity),
        sgGlobalFlowSpeed: clampNum(p.sgGlobalFlowSpeed, -3, 3, d.sgGlobalFlowSpeed),
        sgGlobalAudioReactivity: clampNum(p.sgGlobalAudioReactivity, 0, 5, d.sgGlobalAudioReactivity),
        sgGlobalViscosity: clampNum(p.sgGlobalViscosity, 0, 3, d.sgGlobalViscosity),
        spiralThickness: clampNum(p.spiralThickness, 0.1, 10, d.spiralThickness),

        vrMode: p.vrMode === true,
        arMode: p.arMode === true,
        vrDragRotation: p.vrDragRotation === true,
        vrDepth: clampNum(p.vrDepth, 1, 100, d.vrDepth),
        vrDistance: clampNum(p.vrDistance, -20, 20, d.vrDistance),
        distanceZoom: clampNum(p.distanceZoom, 0.1, 5, d.distanceZoom),
        vrSplitScreen: p.vrSplitScreen === true,
        vrRadius: clampNum(p.vrRadius, 0, 20, d.vrRadius),
        vrThickness: clampNum(p.vrThickness, 0.1, 10, d.vrThickness),
        vrSymmetric: p.vrSymmetric !== false,

        arFilter: pick(p.arFilter, AR_FILTERS, d.arFilter),
        arIntensity: clampNum(p.arIntensity, 0, 1, d.arIntensity),

        arPortalMode: p.arPortalMode === true,
        arPortalScale: clampNum(p.arPortalScale, 0.1, 20, d.arPortalScale),
        arPortalPerspectiveIntensity: clampNum(p.arPortalPerspectiveIntensity, 0, 5, d.arPortalPerspectiveIntensity),
        arPortalVanishingRadius: clampNum(p.arPortalVanishingRadius, 0, 10, d.arPortalVanishingRadius),
        arPortalFade: clampNum(p.arPortalFade, 0, 5, d.arPortalFade),
        arPortalBending: clampNum(p.arPortalBending, 0, 1, d.arPortalBending),

        bgMode: pick(p.bgMode, BG_MODES, d.bgMode),
        bgColors: Array.isArray(p.bgColors) && p.bgColors.length
            ? p.bgColors.filter((c): c is string => typeof c === "string").slice(0, 6)
            : [...d.bgColors],
        bgSpeed: clampNum(p.bgSpeed, 0, 5, d.bgSpeed),
        bgAnimatable: p.bgAnimatable === true,
        bgVignette: p.bgVignette === true,
        bgVignetteIntensity: clampNum(p.bgVignetteIntensity, 0, 1, d.bgVignetteIntensity),

        showIndicators: p.showIndicators === true,
        menuTransparency: clampNum(p.menuTransparency, 0, 1, d.menuTransparency),
        menuAutoCloseTime: clampNum(p.menuAutoCloseTime, 1, 60, d.menuAutoCloseTime),
        audioSource: p.audioSource === "system" ? "system" : "microphone",

        geometryData: undefined, // dato vivo: nunca se persiste
    };
}

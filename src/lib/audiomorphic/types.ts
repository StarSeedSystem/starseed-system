/**
 * Audiomorphic — TIPOS Y PARÁMETROS (port nativo · Adenda 68 · E)
 * ============================================================================
 * Portado LITERALMENTE de la repo del propio usuario:
 *   https://github.com/StarSeedSystem/Audiomorphic-AR-app  (`types.ts`)
 *
 * Autoría original: Audiomorphic / StarSeedSystem (Alex Bordón Garrigós).
 * No se cambia ni un valor por defecto: el espiral se ve EXACTAMENTE igual que
 * en la app original. Lo único que añade el OS es `transparent` en el renderer
 * (ver `renderer.ts`) para poder componerlo como CAPA DE FONDO real.
 *
 * ── Por qué existe este archivo en el OS ────────────────────────────────────
 * Antes, Audiomorphic vivía en un <iframe> a `audiomorphic.vercel.app`:
 *   · su <body> es `#050505` OPACO ⇒ cero transparencia real (se parcheaba con
 *     `mix-blend-mode: screen`, que solo "esconde" el negro);
 *   · no acepta NINGÚN parámetro por URL ⇒ el OS no podía configurar nada;
 *   · su tour de bienvenida salía en cada navegador y no se podía cerrar desde
 *     fuera (localStorage particionado por sitio de nivel superior).
 * Con el port nativo desaparecen los tres problemas de raíz.
 */

export type AutoPilotMode = "drift" | "harmonic" | "genesis";
export type GeometryRegime = "primary" | "reciprocal" | "void";
export type SacredGeometryMode = "goldenSpiral" | "flowerOfLife" | "quantumWave" | "torus";

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
}

export interface VisualizerParams {
    k: number;           // Factor de expansión base
    psi: number;         // Ángulo de rotación base
    z0_r: number;        // Constante compleja (parte real)
    z0_i: number;        // Constante compleja (parte imaginaria)
    iter: number;        // Iteraciones por fotograma (detalle)
    zoom: number;        // Escala visual (normalizada al tamaño de pantalla)
    sensitivity: number; // Sensibilidad del micrófono
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
    autoViscosity: number; // 0 (agua) → 1 (miel)
    autoSpeed: number;

    // Geometría sagrada (modo Génesis)
    sgResonanceModes: SacredGeometryMode[];
    sgSettings: Record<SacredGeometryMode, SacredGeometrySettings>;
    sgShowNodes: boolean;
    sgDrawMode: "nodes" | "layers";
    sgAutoResonance: boolean;

    // UI
    showIndicators: boolean;

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
};

/** Valores por defecto EXACTOS de la app original. */
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
    harmonicColor: true,
    harmonicSensitivity: 5.0,
    harmonicDepth: 360,

    autoPilot: true,
    autoPilotMode: "drift",
    genesisStage: 0,
    rootNote: 0,
    autoViscosity: 0.963,
    autoSpeed: 1.0,

    sgResonanceModes: ["flowerOfLife"],
    sgSettings: {
        goldenSpiral: { ...defaultSGSettings },
        flowerOfLife: { ...defaultSGSettings },
        quantumWave: { ...defaultSGSettings },
        torus: { ...defaultSGSettings },
    },
    sgShowNodes: true,
    sgDrawMode: "layers",
    sgAutoResonance: true,

    showIndicators: true,
};

export interface AudioMetrics {
    /** 0-1 normalizado */
    volume: number;
    /** 0-1 normalizado (centroide espectral) */
    frequency: number;
}

/** Proveedor de métricas de audio (el renderer nunca toca el micrófono él solo). */
export type AudioMetricsProvider = (sensitivity: number, freqRange: number) => AudioMetrics;

/** Métricas en silencio — lo que se usa cuando NO hay micrófono concedido. */
export const SILENT_METRICS: AudioMetrics = { volume: 0, frequency: 0 };

/* ── Normalización defensiva (configs persistidas / sync remoto) ─────────── */

const clampNum = (v: unknown, lo: number, hi: number, fb: number): number => {
    const n = typeof v === "number" && Number.isFinite(v) ? v : fb;
    return Math.min(hi, Math.max(lo, n));
};

const SG_MODES: SacredGeometryMode[] = ["goldenSpiral", "flowerOfLife", "quantumWave", "torus"];
const PILOT_MODES: AutoPilotMode[] = ["drift", "harmonic", "genesis"];

/**
 * Fusiona un parche parcial (lo que guarda una capa de fondo) sobre los valores
 * por defecto, saneando rangos. Nunca lanza: cualquier basura cae al defecto.
 */
export function resolveParams(patch?: Partial<VisualizerParams> | null): VisualizerParams {
    const d = DEFAULT_PARAMS;
    const p = (patch ?? {}) as Partial<VisualizerParams>;
    return {
        ...d,
        ...p,
        k: clampNum(p.k, 0.9, 1.1, d.k),
        psi: clampNum(p.psi, -Math.PI * 2, Math.PI * 2, d.psi),
        z0_r: clampNum(p.z0_r, -2, 2, d.z0_r),
        z0_i: clampNum(p.z0_i, -2, 2, d.z0_i),
        iter: Math.round(clampNum(p.iter, 100, 6000, d.iter)),
        zoom: clampNum(p.zoom, 0.0001, 0.02, d.zoom),
        sensitivity: clampNum(p.sensitivity, 0.1, 20, d.sensitivity),
        freqRange: clampNum(p.freqRange, 0.05, 1, d.freqRange),
        hueSpeed: clampNum(p.hueSpeed, 0, 3, d.hueSpeed),
        trail: clampNum(p.trail, 0.01, 1, d.trail),
        baseHue: clampNum(p.baseHue, 0, 360, d.baseHue),
        hueRange: clampNum(p.hueRange, 0, 360, d.hueRange),
        saturation: clampNum(p.saturation, 0, 100, d.saturation),
        brightness: clampNum(p.brightness, 0, 100, d.brightness),
        harmonicColor: p.harmonicColor !== false,
        harmonicSensitivity: clampNum(p.harmonicSensitivity, 0, 20, d.harmonicSensitivity),
        harmonicDepth: clampNum(p.harmonicDepth, 0, 360, d.harmonicDepth),
        autoPilot: p.autoPilot !== false,
        autoPilotMode: p.autoPilotMode && PILOT_MODES.includes(p.autoPilotMode) ? p.autoPilotMode : d.autoPilotMode,
        rootNote: Math.round(clampNum(p.rootNote, 0, 11, d.rootNote)),
        autoViscosity: clampNum(p.autoViscosity, 0, 0.999, d.autoViscosity),
        autoSpeed: clampNum(p.autoSpeed, 0.1, 5, d.autoSpeed),
        sgResonanceModes:
            Array.isArray(p.sgResonanceModes) && p.sgResonanceModes.length
                ? p.sgResonanceModes.filter((m): m is SacredGeometryMode => SG_MODES.includes(m))
                : d.sgResonanceModes,
        sgSettings: {
            goldenSpiral: { ...defaultSGSettings, ...(p.sgSettings?.goldenSpiral ?? {}) },
            flowerOfLife: { ...defaultSGSettings, ...(p.sgSettings?.flowerOfLife ?? {}) },
            quantumWave: { ...defaultSGSettings, ...(p.sgSettings?.quantumWave ?? {}) },
            torus: { ...defaultSGSettings, ...(p.sgSettings?.torus ?? {}) },
        },
        sgShowNodes: p.sgShowNodes !== false,
        sgDrawMode: p.sgDrawMode === "nodes" ? "nodes" : "layers",
        sgAutoResonance: p.sgAutoResonance !== false,
        showIndicators: p.showIndicators === true,
        geometryData: undefined, // dato vivo: nunca se persiste
    };
}

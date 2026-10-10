/**
 * StarSeed XR · TIPOS COMPARTIDOS del núcleo (2026-10-10). Contrato: `architecture/starseed-xr.md`.
 * Módulo PURO: sin React, sin red, sin DOM, sin `node:*`. Sólo vocabulario cerrado y pequeñas ayudas.
 */

/** Los cinco formatos en que se abre el OS. El navegador sólo deja entrar a los tres últimos con un gesto. */
export const MODOS_XR = ["2d", "3d-pantalla", "vr-inmersivo", "ar-passthrough", "ar-mano"] as const;
export type ModoXR = (typeof MODOS_XR)[number];
export const esModoXR = (v: unknown): v is ModoXR => typeof v === "string" && (MODOS_XR as readonly string[]).includes(v);
/** ¿Este modo abre una sesión WebXR (`requestSession`)? */
export const esInmersivo = (m: ModoXR): boolean => m === "vr-inmersivo" || m === "ar-passthrough" || m === "ar-mano";

/** Niveles de calidad, de menos a más. El índice sirve para comparar y para subir o bajar un paso. */
export const NIVELES_CALIDAD = ["minima", "baja", "media", "alta", "maxima"] as const;
export type NivelCalidad = (typeof NIVELES_CALIDAD)[number];
export const esNivelCalidad = (v: unknown): v is NivelCalidad =>
    typeof v === "string" && (NIVELES_CALIDAD as readonly string[]).includes(v);
export const indiceNivel = (n: NivelCalidad): number => NIVELES_CALIDAD.indexOf(n);
export const nivelEn = (i: number): NivelCalidad =>
    NIVELES_CALIDAD[Math.min(NIVELES_CALIDAD.length - 1, Math.max(0, Math.round(i)))];

/** Dónde se abre el OS. «visor» = lleva puesto en la cabeza; «movil» = se sostiene en la mano. */
export type PlataformaVisor =
    | "quest"
    | "pico"
    | "visionos"
    | "android-xr"
    | "magic-leap"
    | "spectacles"
    | "android-movil"
    | "ios"
    | "escritorio"
    | "desconocida";

/** Plataformas de visor de cabeza (sesión inmersiva con el aparato puesto). */
export const PLATAFORMAS_VISOR: readonly PlataformaVisor[] = [
    "quest", "pico", "visionos", "android-xr", "magic-leap", "spectacles",
];

export type Postura = "de-pie" | "sentado" | "una-mano";
export type Mano = "izquierda" | "derecha";
export type Vec3 = [number, number, number];

/** Los cuatro cardinales de la Trinity más el menú de mano. */
export type NodoTrinity = "zenith" | "horizon" | "logic" | "anchor" | "menuMano";

/** Formas de dar órdenes dentro del visor. */
export type EntradaXR = "mandos" | "manos" | "mirada-pellizco" | "tactil" | "teclado-raton" | "gamepad" | "voz";

/** Funciones opcionales de WebXR que se piden como `optionalFeatures` y se confirman con `enabledFeatures`. */
export const FUNCIONES_XR = [
    "local-floor", "bounded-floor", "hand-tracking", "layers", "anchors", "hit-test",
    "plane-detection", "mesh-detection", "depth-sensing", "dom-overlay", "light-estimation",
] as const;
export type FuncionXR = (typeof FUNCIONES_XR)[number];
export const esFuncionXR = (v: unknown): v is FuncionXR =>
    typeof v === "string" && (FUNCIONES_XR as readonly string[]).includes(v);

export const aRadianes = (grados: number): number => (grados * Math.PI) / 180;
export const aGrados = (rad: number): number => (rad * 180) / Math.PI;
export const acotar = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
/** Redondea a milímetros: las poses viajan por la red y no necesitan más. */
export const mm = (v: number): number => Math.round(v * 1000) / 1000;

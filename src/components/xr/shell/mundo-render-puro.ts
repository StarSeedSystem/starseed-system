/**
 * StarSeed XR · RENDER PURO del MundoSpec (XR1010V · contrato `architecture/starseed-xr.md` §3 g).
 * Toda la lógica del render del mundo que no necesita WebGL vive aquí y se prueba en node:
 * paleta de cielos, terreno procedural por `semilla`, recortes por nivel de calidad (luces,
 * portales, zonas, pantallas, pizarras, marcas de spawn) y material de objeto por nivel.
 * El componente `mundo-render.tsx` es el cascarón R3F; este módulo manda. Módulo PURO.
 */
import type { NivelCalidad } from "@/lib/xr/tipos";
import { PERFILES } from "@/lib/xr/calidad-perfiles";
import { FORMAS_PRIMITIVAS, LIMITES, TERRENOS, type CieloMundo, type LuzMundo, type MundoSpec, type ObjetoMundo, type SpawnMundo, type ZonaMundo } from "@/lib/xr/mundo-tipos";
import { adaptarANivel } from "@/lib/xr/mundo-spec";

export const PAISAJE: Record<CieloMundo, { arriba: string; abajo: string; niebla: string; estrellas: boolean }> = {
    nebulosa: { arriba: "#1b0f3a", abajo: "#5b2a86", niebla: "#2a1245", estrellas: true },
    amanecer: { arriba: "#f8b26a", abajo: "#46237a", niebla: "#6b3a55", estrellas: false },
    mediodia: { arriba: "#7ec8e3", abajo: "#0e3a5c", niebla: "#20506e", estrellas: false },
    atardecer: { arriba: "#ff8c69", abajo: "#33184a", niebla: "#5c2440", estrellas: false },
    noche: { arriba: "#05060f", abajo: "#10132b", niebla: "#0b0d1c", estrellas: true },
    estudio: { arriba: "#232533", abajo: "#14151f", niebla: "#1b1c27", estrellas: false },
    ninguno: { arriba: "#000000", abajo: "#000000", niebla: "#000000", estrellas: false },
};

/** Color guía de cada zona; el efecto decide el color, nadie lo escribe a mano en el componente. */
export const COLOR_ZONA: Record<ZonaMundo["efecto"], string> = {
    nada: "#B9C0D8",
    "punto-reunion": "#39FF14",
    escenario: "#FFBF00",
    "audio-privado": "#007FFF",
    silencio: "#DC143C",
    "gravedad-cero": "#F5F7FF",
    "zona-segura": "#00FFB2",
};

// Terrain procedural: ruido de valor con hash determinista (misma semilla → mismo terreno en todos
// los equipos, que es la identidad de gesto del área: cada aparato peinta lo mismo a su resolución).

const dispera = (x: number, z: number, semilla: number): number => {
    let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(semilla, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

const suave = (t: number): number => t * t * (3 - 2 * t);

const ruido = (x: number, z: number, semilla: number): number => {
    const ix = Math.floor(x), iz = Math.floor(z);
    const [fx, fz] = [suave(x - ix), suave(z - iz)];
    const a = dispera(ix, iz, semilla), b = dispera(ix + 1, iz, semilla);
    const c = dispera(ix, iz + 1, semilla), d = dispera(ix + 1, iz + 1, semilla);
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
};

export type Terrenos = (typeof TERRENOS)[number];

export interface EntradaTerreno { terreno: Terrenos; semilla: number; tamano: number; alturaMax: number }

/** Altura del suelo en metros para el punto (x, z): procede de la semilla, igual en todos los aparatos. */
export function alturaTerreno(x: number, z: number, t: EntradaTerreno): number {
    if (t.terreno === "plano" || t.terreno === "agua" || t.terreno === "vacio" || t.alturaMax <= 0) return 0;
    const nx = (x / t.tamano) * 24, nz = (z / t.tamano) * 24;
    const colinas = (ruido(nx, nz, t.semilla) * 0.7 + ruido(nx * 2.1, nz * 2.1, t.semilla + 7) * 0.3) * t.alturaMax;
    if (t.terreno === "colinas") return colinas;
    // Islas: bulto redondeado desde el centro con borde de ruido; fuera cae a 0 (mar).
    const d = Math.hypot(x, z) / (t.tamano / 2);
    const isla = Math.max(0, 1 - d) ** 2 * (t.alturaMax * 0.8 + colinas * 0.4);
    return Math.max(0, isla);
}

/** Resolución de la malla del terreno por nivel (tiempos: 625 … 16 641 vértices). */
export const segmentosTerreno = (n: NivelCalidad): number => ({ minima: 16, baja: 32, media: 64, alta: 96, maxima: 128 })[n];

/** Material del objeto por nivel: en mínima, sombreado plano sin luces; si no, estándar. */
export type MaterialObjeto = "meshBasicMaterial" | "meshStandardMaterial";
export const materialObjeto = (n: NivelCalidad): MaterialObjeto => (n === "minima" ? "meshBasicMaterial" : "meshStandardMaterial");

/** ¿Estrellas del cielo? Sólo si el cielo las pide y hay presupuesto de partículas (mínima no). */
export const estrellasActivas = (n: NivelCalidad, cielo: CieloMundo): boolean => PAISAJE[cielo].estrellas && PERFILES[n].particulas > 0;

export interface Recorte<T> { visibles: T[]; quitadas: number }

/** Corta una lista al tope del nivel conservando el orden original (para portales, zonas, pizarras…). */
export function alTope<T>(xs: T[], max: number): Recorte<T> {
    return { visibles: xs.slice(0, Math.max(0, max)), quitadas: xs.length - Math.min(xs.length, Math.max(0, max)) };
}

/**
 * Luces del render para un nivel: `ambiente` y `direccional` tienen prioridad fija (aclaran todo el
 * mundo, quitarlas oscurece la escena); `puntual` y `foco` entran hasta agotar el del perfil.
 */
export function lucesParaNivel(luces: LuzMundo[], n: NivelCalidad): Recorte<LuzMundo> {
    const tope = PERFILES[n].lucesDinamicas;
    const fijas = luces.filter((l) => l.clase === "ambiente" || l.clase === "direccional");
    const dinamicas = luces.filter((l) => l.clase === "puntual" || l.clase === "foco");
    const visibles = [...fijas, ...dinamicas.slice(0, Math.max(0, tope - fijas.length))];
    return { visibles, quitadas: luces.length - visibles.length };
}

/** Marcas de spawn visibles: tantas como jugadores admite el nivel (4 en mínima … 48 en máxima). */
export function spawnsParaNivel(spawns: SpawnMundo[], n: NivelCalidad): Recorte<SpawnMundo> {
    return alTope(spawns, LIMITES[n].jugadores);
}

/** Muestra el mundo para el nivel: los objetos se recortan con `adaptarANivel` (del núcleo) y aquí se recorta el resto. */
export interface VisualMundo {
    mundo: MundoSpec;
    recortes: string[];
    luces: Recorte<LuzMundo>;
    spawns: Recorte<SpawnMundo>;
    portales: Recorte<MundoSpec["portales"][number]>;
    zonas: Recorte<MundoSpec["zonas"][number]>;
    pantallas: Recorte<MundoSpec["pantallas"][number]>;
    pizarras: Recorte<MundoSpec["pizarras"][number]>;
}

/** Alto de una pantalla de vídeo 16:9 a partir de su ancho (m). */
export const altoPantalla = (ancho: number): number => (ancho * 9) / 16;

/** Argumentos de la geometría base de cada primitiva (el objeto los escala con `esc`). */
export const ARGS_PRIMITIVA: {
    caja: readonly [number, number, number];
    esfera: readonly [number, number, number];
    cilindro: readonly [number, number, number, number];
    cono: readonly [number, number, number];
    toro: readonly [number, number, number, number];
    plano: readonly [number, number];
    capsula: readonly [number, number, number, number];
} = {
    caja: [1, 1, 1], esfera: [1, 24, 16], cilindro: [0.5, 0.5, 1, 24], cono: [0.7, 1, 24], toro: [0.7, 0.25, 12, 32], plano: [1, 1], capsula: [0.25, 0.5, 8, 16],
};

/** Lo visual del mundo listo para pintar: adapta el spec al nivel y recorta cada lista al tope. */
export function visualDe(mundo: MundoSpec, n: NivelCalidad): VisualMundo {
    const adap = adaptarANivel(mundo, n);
    const m = adap.mundo;
    return {
        mundo: m,
        recortes: adap.recortes,
        luces: lucesParaNivel(m.luces, n),
        spawns: spawnsParaNivel(m.spawns, n),
        portales: alTope(m.portales, LIMITES[n].portales),
        zonas: alTope(m.zonas, LIMITES[n].zonas),
        pantallas: alTope(m.pantallas, LIMITES[n].pantallas),
        pizarras: alTope(m.pizarras, LIMITES[n].pizarras),
    };
}

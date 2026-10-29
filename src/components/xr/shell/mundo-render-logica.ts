/**
 * StarSeed XR · LÓGICA PURA del render de un `MundoSpec` (XR1010V · contrato §3 g). Un mundo es DATO:
 * estas funciones deciden, sin React ni WebGL, qué cielo y luces caben en cada nivel, cómo se deforma
 * el terreno procedural por su semilla y dónde aparece cada persona. `mundo-render.tsx` lo traduce a three.
 */
import type { NivelCalidad } from "@/lib/xr/tipos";
import { perfilDeNivel } from "@/lib/xr/calidad";
import { LIMITES, type CieloMundo, type LuzMundo, type MundoSpec, type ObjetoMundo, type SpawnMundo } from "@/lib/xr/mundo-tipos";
import { adaptarANivel } from "@/lib/xr/mundo-spec";
import { PRESETS_CIELO, type PresetCielo } from "@/lib/vivo/espacial/modelo";
import { COLORES_NODO, mezclar } from "@/lib/xr/tokens-3d";

export type FormaPrimitiva = Extract<ObjetoMundo["fuente"], { tipo: "primitiva" }>["forma"];
export interface OpcionesTerreno {
    terreno: MundoSpec["entorno"]["terreno"];
    semilla: number;
    tamano: number;
    alturaMax: number;
    segmentos: number;
}
export interface MallaTerreno { posiciones: number[]; indices: number[] }
export type ArgsPrimitiva =
    | { tipo: "box"; args: [number, number, number] }
    | { tipo: "sphere"; args: [number, number, number] }
    | { tipo: "cylinder"; args: [number, number, number, number] }
    | { tipo: "cone"; args: [number, number, number] }
    | { tipo: "torus"; args: [number, number, number, number] }
    | { tipo: "plane"; args: [number, number] }
    | { tipo: "capsule"; args: [number, number, number, number] };
export function cieloDeMundo(cielo: CieloMundo): PresetCielo | null {
    if (cielo === "ninguno") return null;
    return PRESETS_CIELO[cielo];
}
const SEGMENTOS: Record<NivelCalidad, number> = { minima: 16, baja: 24, media: 40, alta: 64, maxima: 96 };
export const segmentosTerreno = (nivel: NivelCalidad): number => SEGMENTOS[nivel];
export const segmentosObjeto = (nivel: NivelCalidad): number => Math.max(6, Math.round(SEGMENTOS[nivel] / 2));
const ESTRELLAS: Record<NivelCalidad, number> = { minima: 0, baja: 600, media: 1400, alta: 2600, maxima: 4200 };
export function estrellasDeNivel(nivel: NivelCalidad, hayEstrellas: boolean): number {
    return hayEstrellas ? ESTRELLAS[nivel] : 0;
}
export const sombraDeNivel = (nivel: NivelCalidad): { activas: boolean; resolucion: number } => perfilDeNivel(nivel).sombras;
const NIEBLA: Record<NivelCalidad, number> = { minima: 40, baja: 60, media: 90, alta: 130, maxima: 180 };
export const distanciaNiebla = (nivel: NivelCalidad): number => NIEBLA[nivel];
const PRIORIDAD_LUZ: Record<LuzMundo["clase"], number> = { direccional: 0, ambiente: 1, foco: 2, puntual: 3 };
export function lucesVisibles(luces: readonly LuzMundo[], nivel: NivelCalidad): LuzMundo[] {
    const tope = Math.min(LIMITES[nivel].luces, perfilDeNivel(nivel).lucesDinamicas);
    return luces.map((luz, i) => ({ luz, i }))
        .sort((a, b) => PRIORIDAD_LUZ[a.luz.clase] - PRIORIDAD_LUZ[b.luz.clase] || a.i - b.i)
        .slice(0, Math.max(0, tope))
        .sort((a, b) => a.i - b.i)
        .map(({ luz }) => luz);
}

export function spawnInicial(mundo: Pick<MundoSpec, "spawns">): SpawnMundo {
    return mundo.spawns[0] ?? { id: "entrada", pos: [0, 0, 0], yaw: 0 };
}

export const mundoParaNivel = (mundo: MundoSpec, nivel: NivelCalidad): { mundo: MundoSpec; recortes: string[] } =>
    adaptarANivel(mundo, nivel);

const suave = (t: number): number => t * t * (3 - 2 * t);
function ruido(x: number, z: number, semilla: number): number {
    const v = Math.sin(x * 127.1 + z * 311.7 + semilla * 0.017) * 43758.5453;
    return v - Math.floor(v);
}
function valorRuido(x: number, z: number, semilla: number): number {
    const xi = Math.floor(x), zi = Math.floor(z);
    const u = suave(x - xi), v = suave(z - zi);
    const a = ruido(xi, zi, semilla), b = ruido(xi + 1, zi, semilla);
    const c = ruido(xi, zi + 1, semilla), d = ruido(xi + 1, zi + 1, semilla);
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

export function alturaTerreno(x: number, z: number, o: OpcionesTerreno): number {
    if (o.terreno === "vacio" || o.terreno === "plano") return 0;
    if (o.terreno === "agua") return Math.sin(x * 0.35 + o.semilla) * 0.06 + Math.cos(z * 0.42 - o.semilla) * 0.04;
    const octavas = valorRuido(x / 12, z / 12, o.semilla) * 0.62 + valorRuido(x / 5, z / 5, o.semilla + 7) * 0.28
        + valorRuido(x / 2, z / 2, o.semilla + 13) * 0.1;
    if (o.terreno === "colinas") return (0.15 + octavas * 0.85) * o.alturaMax;
    const mitad = Math.max(1, o.tamano / 2);
    const costa = Math.max(0, 1 - (Math.min(1, Math.hypot(x, z) / mitad) ** 2));
    return (costa * (0.55 + octavas * 0.75) - 0.18) * o.alturaMax;
}

export function generarTerreno(o: OpcionesTerreno): MallaTerreno {
    const n = Math.max(1, Math.min(128, Math.round(o.segmentos)));
    const paso = o.tamano / n, mitad = o.tamano / 2;
    const posiciones: number[] = [];
    for (let iz = 0; iz <= n; iz += 1) {
        for (let ix = 0; ix <= n; ix += 1) {
            const x = -mitad + ix * paso, z = -mitad + iz * paso;
            posiciones.push(x, alturaTerreno(x, z, o), z);
        }
    }
    const indices: number[] = [];
    for (let iz = 0; iz < n; iz += 1) {
        for (let ix = 0; ix < n; ix += 1) {
            const a = iz * (n + 1) + ix, b = a + 1, c = a + n + 1, d = c + 1;
            indices.push(a, c, b, b, c, d);
        }
    }
    return { posiciones, indices };
}

export function argsPrimitiva(forma: FormaPrimitiva, segmentos: number): ArgsPrimitiva {
    const s = Math.max(4, Math.round(segmentos));
    switch (forma) {
        case "caja": return { tipo: "box", args: [1, 1, 1] };
        case "esfera": return { tipo: "sphere", args: [0.5, s, Math.max(4, Math.round(s / 2))] };
        case "cilindro": return { tipo: "cylinder", args: [0.5, 0.5, 1, s] };
        case "cono": return { tipo: "cone", args: [0.5, 1, s] };
        case "toro": return { tipo: "torus", args: [0.5, 0.2, Math.max(6, Math.round(s / 2)), s] };
        case "plano": return { tipo: "plane", args: [1, 1] };
        case "capsula": return { tipo: "capsule", args: [0.5, 1, Math.max(4, Math.round(s / 2)), s] };
    }
}

export function colorAgua(cielo: CieloMundo): string {
    return mezclar(COLORES_NODO.zenith.vivo, 0.55, cieloDeMundo(cielo)?.fondo ?? "#0E101E");
}

/**
 * StarSeed XR · TERRENO Y PLAN DE ESCENA (XR1010V, contrato §3 g). Genera las alturas del terreno de un
 * `MundoSpec` de forma DETERMINISTA por `semilla` (ruido de valor suavizado; nada de azar) y lista TODO lo
 * que se pinta de un mundo ya adaptado al nivel de calidad: cielo, terreno, objetos, luces y spawns, con
 * las órdenes del motor (`EstadoMotor` de XR1010U) y los recursos https de la Biblioteca aplicados.
 * Módulo PURO: sin three, sin red, sin DOM; `world-render.tsx` pinta este plan.
 */
import type { NivelCalidad } from "./tipos";
import { NIVELES_CALIDAD } from "./tipos";
import type { CieloMundo, FuenteObjeto, LuzMundo, MundoSpec, SpawnMundo } from "./mundo-tipos";
import { adaptarANivel, costoMundo } from "./mundo-spec";

/** Tablero determinista: el mismo (semilla, x, y) da el mismo valor en todos los equipos (mismo gesto/terreno). */
function vale(semilla: number, x: number, y: number): number {
    let h = (Math.trunc(semilla) ^ 0x9e3779b9) >>> 0;
    h = Math.imul(h ^ (x | 0), 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h ^ (y | 0), 0xc2b2ae35) >>> 0;
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

/** Ruido de valor en malla con suavizado 3-2-1 entre celdas enteras de frecuencias distintas. */
function ruido(semilla: number, u: number, v: number, celdas: number): number {
    const fx = u * celdas;
    const fy = v * celdas;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const s = (t: number): number => t * t * (3 - 2 * t);
    const sx = s(fx - x0);
    const sy = s(fy - y0);
    const a = vale(semilla, x0, y0);
    const b = vale(semilla, x0 + 1, y0);
    const c = vale(semilla, x0, y0 + 1);
    const d = vale(semilla, x0 + 1, y0 + 1);
    const baja = a + (b - a) * sx;
    const alta = c + (d - c) * sx;
    return baja + (alta - baja) * sy;
}

/** Dos octavas: forma gruesa más detalle fino, siempre dentro de [0, 1]. */
const octavas = (semilla: number, u: number, v: number): number =>
    ruido(semilla, u, v, 5) * 0.75 + ruido(semilla + 1013, u, v, 10) * 0.25;

export interface TerrenoGenerado {
    /** Alturas (m) en una malla de `resolucion+1` por `resolucion+1`: índice = fila * lado + columna. */
    alturas: Float32Array;
    /** Extensión del terreno en metros (el `tamano` del entorno). */
    ancho: number;
    /** Altura real más alta de la malla (0 para llanos vacíos o agua; siempre ≤ `alturaMax`). */
    max: number;
}

/** Detalle de la malla del terreno por nivel: más resolución solo donde hay aparatología para renderizarla. */
const RESOLUCION_TERRENO: Record<NivelCalidad, number> = { minima: 16, baja: 24, media: 32, alta: 48, maxima: 64 };
export const resolucionPorNivel = (n: NivelCalidad): number => RESOLUCION_TERRENO[n];

/**
 * Alturas deterministas del terreno por `semilla`. `vacio` y `plano` salen planas (0); `colinas` alza y hunde;
 * `islas` cae al nivel del agua (0) en el borde de todo el cuadrado; `agua` queda bajo el nivel 0. `alturaMax` acota.
 */
export function generarTerreno(ent: MundoSpec["entorno"], resolucion: number): TerrenoGenerado {
    const lado = Math.max(1, Math.trunc(resolucion)) + 1;
    const alturas = new Float32Array(lado * lado);
    const tope = Math.max(0, ent.alturaMax);
    let pico = 0;
    if (ent.terreno === "colinas" || ent.terreno === "islas" || ent.terreno === "agua") {
        for (let j = 0; j < lado; j += 1) {
            for (let i = 0; i < lado; i += 1) {
                const u = i / (lado - 1);
                const v = j / (lado - 1);
                const n = octavas(ent.semilla, u, v);
                let h = 0;
                if (ent.terreno === "colinas") h = (n * 1.3 - 0.3) * tope;
                else if (ent.terreno === "islas") {
                    const distancia = Math.hypot(u - 0.5, v - 0.5) * 2;
                    h = n * tope * Math.max(0, 1 - distancia) ** 1.5;
                } else h = -tope * (0.3 + 0.7 * (1 - n));
                h = Math.min(tope, Math.max(-tope, h));
                if (h > pico) pico = h;
                alturas[j * lado + i] = h;
            }
        }
    }
    return { alturas, ancho: ent.tamano, max: pico };
}

/** Órdenes visuales del motor de reglas (XR1010U): visibilidad, posición y color por id de objeto. */
export interface VistasEstado {
    vistas?: Record<string, { visible?: boolean; pos?: { x: number; y: number; z: number }; color?: string }>;
}

export type PiezaEscena =
    | { clase: "cielo"; cielo: CieloMundo; malla: boolean }
    | { clase: "terreno"; datos: TerrenoGenerado; resolucion: number }
    | { clase: "objeto"; id: string; fuente: FuenteObjeto; pos: [number, number, number]; rot: [number, number, number]; esc: [number, number, number]; color: string; visible: boolean; url: string | null }
    | { clase: "luz"; luz: LuzMundo }
    | { clase: "spawn"; spawn: SpawnMundo };

export interface PlanEscena {
    piezas: PiezaEscena[];
    /** Mensaje discreto si el nivel recortó algo del mundo («Se simplificó el mundo para este aparato»). */
    aviso: string | null;
    nivelMinimo: NivelCalidad | null;
}

/** Sólo contenido https se carga de fuera de la cuenta; una URL http no entra en el plan. */
export const esHttps = (u: string): boolean => typeof u === "string" && u.startsWith("https://");

/** Lista todo lo que se pinta: aplica `adaptarANivel` + `costoMundo`, recorta a `LIMITES[nivel]` y aplica el motor. */
export function planDeEscena(m: MundoSpec, nivel: NivelCalidad, estado?: VistasEstado, recursos?: Record<string, string | null>): PlanEscena {
    const { mundo: a, recortes } = adaptarANivel(m, nivel);
    const piezas: PiezaEscena[] = [];
    if (a.entorno.cielo !== "ninguno") {
        piezas.push({ clase: "cielo", cielo: a.entorno.cielo, malla: NIVELES_CALIDAD.indexOf(nivel) >= 2 });
    }
    if (a.entorno.terreno !== "vacio") {
        const res = resolucionPorNivel(nivel);
        piezas.push({ clase: "terreno", datos: generarTerreno(a.entorno, res), resolucion: res });
    }
    for (const o of a.objetos) {
        let url: string | null = null;
        if (o.fuente.tipo === "biblioteca" && (o.fuente.formato === "glb" || o.fuente.formato === "imagen")) {
            const u = recursos?.[o.fuente.id] ?? null;
            if (u === null || !esHttps(u)) continue;
            url = u;
        }
        const v = estado?.vistas?.[o.id];
        piezas.push({
            clase: "objeto", id: o.id, fuente: o.fuente,
            pos: v?.pos ? [v.pos.x, v.pos.y, v.pos.z] : o.pos, rot: o.rot, esc: o.esc,
            color: v?.color ?? o.color, visible: v?.visible ?? !o.oculto, url,
        });
    }
    for (const l of a.luces) piezas.push({ clase: "luz", luz: l });
    for (const s of a.spawns) piezas.push({ clase: "spawn", spawn: s });
    return { piezas, aviso: recortes.length ? "Se simplificó el mundo para este aparato" : null, nivelMinimo: costoMundo(a).nivelMinimo };
}

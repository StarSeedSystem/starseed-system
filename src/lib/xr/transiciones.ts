/**
 * StarSeed XR · TRANSICIONES. Qué pasa cuando un panel entra, toma el foco, se despliega o cambia de capa,
 * dicho en metros, milisegundos y curvas. Tres estilos (los de `PerfilCalidad.transiciones`) y un modo de
 * movimiento reducido que sólo desvanece. Las reglas de confort son duras: nada se mueve más de 25 cm ni a
 * más de 1,5 m/s, y ninguna secuencia escalonada pasa de 700 ms (en un visor, el movimiento de la interfaz
 * delante de la cara marea antes de que moleste). Módulo PURO: el tiempo entra como dato.
 */
import type { Vec3 } from "./tipos";
import { acotar, mm } from "./tipos";

export type EventoTransicion = "entrada" | "foco" | "desfoco" | "despliegue" | "pliegue" | "cambio-capa" | "salida" | "confirmar";
export type EstiloTransicion = "minimas" | "normales" | "ricas";
export type Easing = "lineal" | "salida-cubica" | "entrada-salida" | "resorte";

/** Estado visual de un panel respecto a su sitio de reposo (posición LOCAL del panel: +z hacia quien mira). */
export interface EstadoVisual { pos: Vec3; esc: number; opacidad: number; brillo: number }
export interface PlanTransicion {
    evento: EventoTransicion;
    ms: number;
    retardo: number;
    easing: Easing;
    desde: EstadoVisual;
    hasta: EstadoVisual;
    /** Retardo entre hermanos (listas, botones del dock). */
    escalonMs: number;
}

export const MAX_DESPLAZAMIENTO_M = 0.25;
export const MAX_VELOCIDAD_MS = 1.5;
export const DURACION_TOTAL_MAX_MS = 700;

const REPOSO: EstadoVisual = { pos: [0, 0, 0], esc: 1, opacidad: 1, brillo: 0 };
const v = (pos: Vec3, esc: number, opacidad: number, brillo = 0): EstadoVisual => ({ pos, esc, opacidad, brillo });

/** Tabla base (estilo «normales»). */
const BASE: Record<EventoTransicion, { ms: number; easing: Easing; desde: EstadoVisual; hasta: EstadoVisual; escalon: number }> = {
    entrada: { ms: 360, easing: "salida-cubica", desde: v([0, -0.06, -0.15], 0.92, 0), hasta: REPOSO, escalon: 45 },
    salida: { ms: 200, easing: "entrada-salida", desde: REPOSO, hasta: v([0, 0, -0.05], 0.96, 0), escalon: 20 },
    foco: { ms: 140, easing: "salida-cubica", desde: REPOSO, hasta: v([0, 0, 0.02], 1.04, 1, 1), escalon: 0 },
    desfoco: { ms: 160, easing: "salida-cubica", desde: v([0, 0, 0.02], 1.04, 1, 1), hasta: REPOSO, escalon: 0 },
    despliegue: { ms: 280, easing: "salida-cubica", desde: v([0, -0.1, 0], 0.6, 0), hasta: REPOSO, escalon: 35 },
    pliegue: { ms: 220, easing: "entrada-salida", desde: REPOSO, hasta: v([0, -0.1, 0], 0.6, 0), escalon: 25 },
    "cambio-capa": { ms: 320, easing: "entrada-salida", desde: v([0, 0, -0.25], 0.94, 0.35), hasta: REPOSO, escalon: 30 },
    confirmar: { ms: 220, easing: "resorte", desde: v([0, 0, 0], 1, 1, 0), hasta: v([0, 0, 0], 1, 1, 1), escalon: 0 },
};
const FACTOR: Record<EstiloTransicion, number> = { minimas: 0.4, normales: 1, ricas: 1.3 };

/** Curva 0→1 → 0→1 (el resorte pasa un poco de 1 y vuelve; acaba exacto en 1). */
export function ease(e: Easing, t: number): number {
    const x = acotar(t, 0, 1);
    if (e === "lineal") return x;
    if (e === "salida-cubica") return 1 - (1 - x) ** 3;
    if (e === "entrada-salida") return x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;
    return x >= 1 ? 1 : 1 - Math.cos(x * Math.PI * 2.5) * Math.exp(-5 * x);
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerp3 = (a: Vec3, b: Vec3, k: number): Vec3 => [mm(lerp(a[0], b[0], k)), mm(lerp(a[1], b[1], k)), mm(lerp(a[2], b[2], k))];
const largo = (p: Vec3) => Math.hypot(p[0], p[1], p[2]);

/** Recorta un desplazamiento a los límites de confort (distancia y velocidad media). */
function acotarMovimiento(desde: Vec3, hasta: Vec3, ms: number): [Vec3, Vec3] {
    const d = Math.hypot(desde[0] - hasta[0], desde[1] - hasta[1], desde[2] - hasta[2]);
    const tope = Math.min(MAX_DESPLAZAMIENTO_M, (MAX_VELOCIDAD_MS * ms) / 1000);
    if (d <= tope || d === 0) return [desde, hasta];
    const k = tope / d;
    return [lerp3(hasta, desde, k), hasta];
}

export function planTransicion(evento: EventoTransicion, estilo: EstiloTransicion, o: { movimientoReducido?: boolean; escalaDistancia?: number } = {}): PlanTransicion {
    const b = BASE[evento];
    if (o.movimientoReducido) {
        const ms = Math.min(120, Math.round(b.ms * 0.4));
        const quieto = (s: EstadoVisual): EstadoVisual => ({ ...s, pos: [0, 0, 0], esc: 1 });
        return { evento, ms, retardo: 0, easing: "lineal", desde: quieto(b.desde), hasta: quieto(b.hasta), escalonMs: 0 };
    }
    const ms = Math.max(60, Math.round(b.ms * FACTOR[estilo]));
    const k = acotar(o.escalaDistancia ?? 1, 0.25, 1) * (estilo === "minimas" ? 0.15 : 1);
    const escala = (p: Vec3): Vec3 => [mm(p[0] * k), mm(p[1] * k), mm(p[2] * k)];
    const [d, h] = acotarMovimiento(escala(b.desde.pos), escala(b.hasta.pos), ms);
    const easing: Easing = estilo === "ricas" && (evento === "entrada" || evento === "despliegue") ? "resorte" : b.easing;
    const esc = (s: EstadoVisual): number => (estilo === "minimas" ? 1 : s.esc);
    return {
        evento, ms, retardo: 0, easing,
        desde: { ...b.desde, pos: d, esc: esc(b.desde) }, hasta: { ...b.hasta, pos: h, esc: esc(b.hasta) },
        escalonMs: estilo === "minimas" ? 0 : Math.round(b.escalon * FACTOR[estilo]),
    };
}

/** Estado en el instante `t` (ms desde el inicio de la transición, ya descontado el retardo). */
export function evaluar(p: PlanTransicion, t: number): EstadoVisual {
    const k = ease(p.easing, p.ms <= 0 ? 1 : (t - p.retardo) / p.ms);
    return { pos: lerp3(p.desde.pos, p.hasta.pos, k), esc: lerp(p.desde.esc, p.hasta.esc, k), opacidad: acotar(lerp(p.desde.opacidad, p.hasta.opacidad, k), 0, 1), brillo: acotar(lerp(p.desde.brillo, p.hasta.brillo, k), 0, 1) };
}

/** Retardo del hermano `i` de `n`: se comprime para que la secuencia entera no pase de 700 ms. */
export function retardoDeHermano(p: PlanTransicion, i: number, n: number): number {
    if (n <= 1 || p.escalonMs === 0) return 0;
    const libre = Math.max(0, DURACION_TOTAL_MAX_MS - p.ms);
    const paso = Math.min(p.escalonMs, libre / (n - 1));
    return Math.round(paso * Math.max(0, Math.min(i, n - 1)));
}

export const desplazamientoMax = (p: PlanTransicion): number => Math.max(largo(p.desde.pos), largo(p.hasta.pos));

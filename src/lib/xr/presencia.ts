/**
 * StarSeed XR · PRESENCIA (§3 h y k). La pose que viaja por la red es `pose-avatar`: SOLO cabeza y
 * manos, con las posiciones redondeadas a milímetro. Ni articulaciones ni mirada salen del aparato
 * (`privacidad.ts`). Módulo PURO: el reloj y las poses entran como datos; no hay red, DOM ni `node:*`.
 */
import type { Vec3 } from "./tipos";
import { acotar, mm } from "./tipos";

export type CuaternionXR = [number, number, number, number];
export interface PoseSimpleXR { p: Vec3; q: CuaternionXR }
/** El único mensaje de presencia que sale del aparato. `null` = esa mano no se ha visto. */
export interface PoseCabezaManosXR { cabeza: PoseSimpleXR; izquierda: PoseSimpleXR | null; derecha: PoseSimpleXR | null }
/** Lo que se lee del visor antes de empaquetar. */
export interface PoseCrudaXR { pos: Vec3; rot: CuaternionXR }
export interface ManosCrudasXR { izq?: PoseCrudaXR | null; der?: PoseCrudaXR | null }
export interface ConectadoXR { id: string; desde: number }
export interface JugadorPoseXR { id: string; pos: Vec3 }

const finito = (v: number, porDefecto = 0): number => (Number.isFinite(v) ? v : porDefecto);

function cuaternionSeguro(r: readonly number[]): CuaternionXR {
    const [x, y, z, w] = [finito(r[0]), finito(r[1]), finito(r[2]), finito(r[3], 1)];
    const n = Math.hypot(x, y, z, w);
    return n < 1e-9 ? [0, 0, 0, 1] : [x / n, y / n, z / n, w / n];
}

const simple = (p: PoseCrudaXR): PoseSimpleXR => ({
    p: [mm(finito(p.pos[0])), mm(finito(p.pos[1])), mm(finito(p.pos[2]))],
    q: cuaternionSeguro(p.rot),
});

function leerSimple(v: unknown): PoseSimpleXR | null {
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    if (!Array.isArray(o.p) || o.p.length !== 3 || !Array.isArray(o.q) || o.q.length !== 4) return null;
    if (![...o.p, ...o.q].every((n) => typeof n === "number" && Number.isFinite(n))) return null;
    return { p: [mm(o.p[0]), mm(o.p[1]), mm(o.p[2])], q: cuaternionSeguro(o.q) };
}

/** Cabeza + manos → mensaje compacto. Las manos que no se han visto viajan como `null`. */
export function empaquetarPose(cabeza: PoseCrudaXR, manos: ManosCrudasXR = {}): PoseCabezaManosXR {
    return { cabeza: simple(cabeza), izquierda: manos.izq ? simple(manos.izq) : null, derecha: manos.der ? simple(manos.der) : null };
}

/** Mensaje de fuera → pose válida (o `null`). Descarta articulaciones, mirada y basura. */
export function desempaquetarPose(v: unknown): PoseCabezaManosXR | null {
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    const cabeza = leerSimple(o.cabeza);
    return cabeza ? { cabeza, izquierda: leerSimple(o.izquierda), derecha: leerSimple(o.derecha) } : null;
}

/** ¿Toca enviar? `true` sólo si han pasado los milisegundos del máximo de Hz. */
export function limitarFrecuencia(ultimoMs: number, ahora: number, hz = 10): boolean {
    if (!Number.isFinite(ahora)) return false;
    if (!Number.isFinite(ultimoMs)) return true;
    const intervalo = hz > 0 && Number.isFinite(hz) ? 1000 / hz : 0;
    return ahora - ultimoMs >= intervalo - 1e-6;
}

function nlerp(a: CuaternionXR, b: CuaternionXR, k: number): CuaternionXR {
    const signo = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
    const q: CuaternionXR = [
        a[0] + (signo * b[0] - a[0]) * k, a[1] + (signo * b[1] - a[1]) * k,
        a[2] + (signo * b[2] - a[2]) * k, a[3] + (signo * b[3] - a[3]) * k,
    ];
    const n = Math.hypot(q[0], q[1], q[2], q[3]);
    return n < 1e-9 ? [0, 0, 0, 1] : [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

const mezcla = (a: PoseSimpleXR, b: PoseSimpleXR, k: number): PoseSimpleXR => ({
    p: [a.p[0] + (b.p[0] - a.p[0]) * k, a.p[1] + (b.p[1] - a.p[1]) * k, a.p[2] + (b.p[2] - a.p[2]) * k],
    q: nlerp(a.q, b.q, k),
});
const mezclaMano = (a: PoseSimpleXR | null, b: PoseSimpleXR | null, k: number): PoseSimpleXR | null =>
    !b ? null : !a ? b : mezcla(a, b, k);

/** Suaviza entre la pose anterior y la última recibida (`t` 0…1). Una mano que no llega no se inventa. */
export function interpolar(prev: PoseCabezaManosXR, sig: PoseCabezaManosXR, t: number): PoseCabezaManosXR {
    const k = acotar(t, 0, 1);
    return {
        cabeza: k <= 0 ? prev.cabeza : k >= 1 ? sig.cabeza : mezcla(prev.cabeza, sig.cabeza, k),
        izquierda: mezclaMano(prev.izquierda, sig.izquierda, k),
        derecha: mezclaMano(prev.derecha, sig.derecha, k),
    };
}

/** El anfitrión es el de menor `id` entre los conectados: todos eligen igual y, si se va, hay relevo. */
export function elegirAnfitrion(conectados: readonly ConectadoXR[]): ConectadoXR | null {
    let mejor: ConectadoXR | null = null;
    for (const c of conectados) {
        if (c && typeof c.id === "string" && c.id && (!mejor || c.id < mejor.id)) mejor = c;
    }
    return mejor;
}

/** Los `tope` jugadores más cercanos a `miPos`, ordenados de cerca a lejos. */
export function jugadoresVisibles(poses: readonly JugadorPoseXR[], miPos: Vec3, tope: number): JugadorPoseXR[] {
    const max = Math.max(0, Math.floor(finito(tope)));
    if (max === 0 || poses.length === 0) return [];
    const distancia = (p: Vec3) => (p[0] - miPos[0]) ** 2 + (p[1] - miPos[1]) ** 2 + (p[2] - miPos[2]) ** 2;
    return poses
        .map((p) => ({ p, d: distancia(p.pos) }))
        .sort((a, b) => a.d - b.d || (a.p.id < b.p.id ? -1 : a.p.id > b.p.id ? 1 : 0))
        .slice(0, max)
        .map((x) => x.p);
}

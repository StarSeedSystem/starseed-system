/**
 * StarSeed XR · PRESENCIA. Poses de cabeza y manos para el sistema multijugador, empaquetadas
 * de forma compacta para viajar por la red a 10 Hz (criterio de privacidad y rendimiento).
 * Módulo PURO (no WebGL, no DOM, sin dependencias pesadas).
 */
import type { Vec3 } from "./tipos";
import { mm } from "./tipos";
import { evaluarSalida, type Destino } from "./privacidad";

export interface PoseCabeza {
    pos: Vec3;
    rot: [number, number, number, number];
}

export interface PoseManos {
    izq?: { pos: Vec3; rot: [number, number, number, number] };
    der?: { pos: Vec3; rot: [number, number, number, number] };
}

/** Mensaje compacto de presencia: sólo cabeza y manos, sin articulaciones. */
export interface MensajePresencia {
    cabeza: PoseCabeza;
    manos?: PoseManos;
    timestamp: number;
}

/** Empaqueta pose: redondea a mm y asegura que el mensaje sea minimalista. */
export function empaquetarPose(cabeza: PoseCabeza, manos?: PoseManos): Omit<MensajePresencia, "timestamp"> {
    const p: Omit<MensajePresencia, "timestamp"> = {
        cabeza: {
            pos: [mm(cabeza.pos[0]), mm(cabeza.pos[1]), mm(cabeza.pos[2])],
            rot: [mm(cabeza.rot[0]), mm(cabeza.rot[1]), mm(cabeza.rot[2]), mm(cabeza.rot[3])],
        },
    };

    if (manos) {
        p.manos = {};
        if (manos.izq) {
            p.manos.izq = {
                pos: [mm(manos.izq.pos[0]), mm(manos.izq.pos[1]), mm(manos.izq.pos[2])],
                rot: [mm(manos.izq.rot[0]), mm(manos.izq.rot[1]), mm(manos.izq.rot[2]), mm(manos.izq.rot[3])],
            };
        }
        if (manos.der) {
            p.manos.der = {
                pos: [mm(manos.der.pos[0]), mm(manos.der.pos[1]), mm(manos.der.pos[2])],
                rot: [mm(manos.der.rot[0]), mm(manos.der.rot[1]), mm(manos.der.rot[2]), mm(manos.der.rot[3])],
            };
        }
    }
    return p;
}

/** Limitar frecuencia (10 Hz = 100 ms entre mensajes). */
export function limitarFrecuencia(ultimoMs: number, ahora: number, hz = 10): boolean {
    return ahora - ultimoMs >= 1000 / hz;
}

/** Interpolación simple para suavizar movimiento a 10 Hz. */
export function interpolar(prev: number, sig: number, t: number): number {
    return prev + (sig - prev) * t;
}

/** Determinista: todos eligen igual, el de menor ID. Si el anfitrión sale, el siguiente toma el relevo. */
export function elegirAnfitrion(conectados: { id: string; desde: number }[]): string | null {
    if (conectados.length === 0) return null;
    return [...conectados].sort((a, b) => a.id.localeCompare(b.id))[0].id;
}

/** Jugadores más cercanos (tope = limite de perfil). */
export function jugadoresVisibles(
    poses: { id: string; pos: Vec3 }[],
    miPos: Vec3,
    tope: number
): string[] {
    return poses
        .filter((p) => p.id !== "yo")
        .sort((a, b) => {
            const distA = Math.hypot(a.pos[0] - miPos[0], a.pos[1] - miPos[1], a.pos[2] - miPos[2]);
            const distB = Math.hypot(b.pos[0] - miPos[0], b.pos[1] - miPos[1], b.pos[2] - miPos[2]);
            return distA - distB;
        })
        .slice(0, tope)
        .map((p) => p.id);
}

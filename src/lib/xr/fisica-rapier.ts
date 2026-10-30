/* StarSeed XR · FÍSICA RAPIER. Conversiones y utilidades de poses. Módulo PURO: sin red,
   sin disco, sin procesos lanzados. Tipos cerrados y funciones matemáticas auxiliares. */
import type { Vec3, Vec4 } from "./tipos";

/** Convierte unas Euler angles (en radianes) a un quaternion [x, y, z, w].
 *  Orden de rotación: Z-Y-X (yaw, pitch, roll).
 */
export function cuaternionDeEuler(euler: Vec3): Vec4 {
    const [x, y, z] = euler;
    const cx = Math.cos(x / 2);
    const sx = Math.sin(x / 2);
    const cy = Math.cos(y / 2);
    const sy = Math.sin(y / 2);
    const cz = Math.cos(z / 2);
    const sz = Math.sin(z / 2);

    const w = cx * cy * cz + sx * sy * sz;
    const x$ = cx * cy * sz - sx * sy * cz;
    const y$ = cx * sy * cz + sx * cy * sz;
    const z$ = sx * cy * cz - cx * sy * sz;

    return [x$, y$, z$, w];
}

/** Filtra las poses de un mensaje, descartando las que no tienen datos exactos
 *  (posiciones con longitud insuficiente o valores nulos). */
export function posesDeMensaje(mensaje: { poses: (readonly { id: string; pos: readonly number[]; rot: readonly number[] } | null)[] }): Map<string, { pos: Vec3; rot: Vec4 }> {
    const resultado = new Map<string, { pos: Vec3; rot: Vec4 }>();
    const { poses } = mensaje;
    for (const pose of poses) {
        if (!pose) continue;
        if (!pose.pos || pose.pos.length < 3) continue;
        if (!pose.rot || pose.rot.length < 4) continue;
        const id = pose.id;
        if (!id) continue;
        resultado.set(id, {
            pos: [pose.pos[0], pose.pos[1], pose.pos[2]] as Vec3,
            rot: [pose.rot[0], pose.rot[1], pose.rot[2], pose.rot[3]] as Vec4,
        });
    }
    return resultado;
}

/** Interpola entre dos mapas de poses según un factor.
 *  factor 0 → mapa a, factor 1 → mapa b, factor fuera [0,1] se clampea.
 */
export function interpolarPoses(
    a: Map<string, { pos: Vec3; rot: Vec4 }>,
    b: Map<string, { pos: Vec3; rot: Vec4 }>,
    factor: number,
): Map<string, { pos: Vec3; rot: Vec4 }> {
    const resultado = new Map<string, { pos: Vec3; rot: Vec4 }>();
    const factorClamped = Math.max(0, Math.min(1, factor));

    for (const [id, poseA] of a) {
        const poseB = b.get(id);
        if (!poseB) continue;

        const posInterp: Vec3 = [
            poseA.pos[0] + (poseB.pos[0] - poseA.pos[0]) * factorClamped,
            poseA.pos[1] + (poseB.pos[1] - poseA.pos[1]) * factorClamped,
            poseA.pos[2] + (poseB.pos[2] - poseA.pos[2]) * factorClamped,
        ];

        const rotInterp: Vec4 = [
            poseA.rot[0] + (poseB.rot[0] - poseA.rot[0]) * factorClamped,
            poseA.rot[1] + (poseB.rot[1] - poseA.rot[1]) * factorClamped,
            poseA.rot[2] + (poseB.rot[2] - poseA.rot[2]) * factorClamped,
            poseA.rot[3] + (poseB.rot[3] - poseA.rot[3]) * factorClamped,
        ];

        resultado.set(id, { pos: posInterp, rot: rotInterp });
    }
    return resultado;
}
/**
 * StarSeed XR · MENÚ DE MANO, parte PURA (XR1010N · contrato `architecture/starseed-xr.md` §3 a/e).
 * Decide qué botones lleva el menú de la muñeca y en qué orden, y calcula su pose pegada a la
 * muñeca de la mano NO dominante. Sin React, sin three, sin DOM: entra estado, sale dato.
 */

import type { Mano, Postura, Vec3 } from "../../../lib/xr/tipos";
import type { NodoEspacial } from "../../../lib/xr/espacio-trinity";
import type { AccionXR } from "../../../lib/xr/vinculos-xr";

export type IdItemMenuMano = "recentrar" | "salir" | "hablar" | "dock" | "calidad" | "ajustes";
export type AccionItemMenuMano = AccionXR | "calidad" | "ajustes";

export interface ItemMenuMano { id: IdItemMenuMano; etiqueta: string; accion: AccionItemMenuMano }
export interface OpcionesMenuMano { postura: Postura; hablando: boolean; calidadAuto: boolean }
export type Cuaternion = [number, number, number, number];
export interface MunecaMenu { pos: Vec3; rot: Cuaternion }
export interface PosaMenuMano { posicion: Vec3; rotacion: Cuaternion }

/** Salir va primero: es el botón que el pulgar alcanza sin soltar el visor. Recentrar, después. */
const ITEMS_COMPLETOS: readonly IdItemMenuMano[] = ["salir", "recentrar", "hablar", "dock", "calidad", "ajustes"];
/** A una mano se recortan los secundarios, pero NUNCA los dos que evitan dejar a alguien atrapado. */
const ITEMS_UNA_MANO: readonly IdItemMenuMano[] = ["salir", "recentrar", "hablar"];

const ACCION_DE: Record<IdItemMenuMano, AccionItemMenuMano> = {
    salir: "salir", recentrar: "recentrar", hablar: "hablar",
    dock: "abrir-dock", calidad: "calidad", ajustes: "ajustes",
};

function etiquetaDe(id: IdItemMenuMano, o: OpcionesMenuMano): string {
    switch (id) {
        case "salir": return "Salir";
        case "recentrar": return "Recentrar";
        case "hablar": return o.hablando ? "Dejar de hablar" : "Hablar";
        case "dock": return "Abrir dock";
        case "calidad": return o.calidadAuto ? "Calidad automática" : "Calidad fija";
        case "ajustes": return "Ajustes";
    }
}

/** Lista ordenada y estable de los botones del menú de la muñeca. */
export function itemsMenuMano(o: OpcionesMenuMano): ItemMenuMano[] {
    const ids = o.postura === "una-mano" ? ITEMS_UNA_MANO : ITEMS_COMPLETOS;
    return ids.map((id) => ({ id, etiqueta: etiquetaDe(id, o), accion: ACCION_DE[id] }));
}

/** La mano que lleva el menú es SIEMPRE la contraria a la dominante. */
export function manoMenuDe(dominante: Mano): Mano {
    return dominante === "derecha" ? "izquierda" : "derecha";
}

const finito = (n: number, porDefecto = 0): number => (Number.isFinite(n) ? n : porDefecto);

function normalizar(q: Cuaternion): Cuaternion {
    const l = Math.hypot(q[0], q[1], q[2], q[3]);
    if (!Number.isFinite(l) || l < 1e-8) return [0, 0, 0, 1];
    return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

function multiplicar(a: Cuaternion, b: Cuaternion): Cuaternion {
    const [ax, ay, az, aw] = a;
    const [bx, by, bz, bw] = b;
    return normalizar([
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    ]);
}

/** Euler YXZ del núcleo → cuaternión (mismo orden que usa three). */
function cuaternionDeEuler(pitch: number, yaw: number, roll: number): Cuaternion {
    const qy: Cuaternion = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
    const qx: Cuaternion = [Math.sin(pitch / 2), 0, 0, Math.cos(pitch / 2)];
    const qz: Cuaternion = [0, 0, Math.sin(roll / 2), Math.cos(roll / 2)];
    return multiplicar(multiplicar(qy, qx), qz);
}

function rotar(q: Cuaternion, v: Vec3): Vec3 {
    const [x, y, z, w] = q;
    const tx = 2 * (y * v[2] - z * v[1]);
    const ty = 2 * (z * v[0] - x * v[2]);
    const tz = 2 * (x * v[1] - y * v[0]);
    return [
        v[0] + w * tx + (y * tz - z * ty),
        v[1] + w * ty + (z * tx - x * tz),
        v[2] + w * tz + (x * ty - y * tx),
    ];
}

/**
 * Pose del menú pegado a la muñeca. `mano` es la mano que lo lleva (la NO dominante). La pose de
 * la muñeca llega en el marco `local-floor`; el desplazamiento local de `nodo.posicion` se gira con
 * ella y se espeja al lado de esa mano. La rotación compone la muñeca con el `-90°` de `nodo`
 * (pitch hacia arriba), de modo que con la palma hacia la cara —el gesto que lo abre— el panel
 * mira a la cabeza. Queda a menos de 15 cm de la muñeca para no tapar la mano.
 */
export function posicionMenu(muneca: MunecaMenu, mano: Mano, nodo: NodoEspacial): PosaMenuMano {
    const pos: Vec3 = [finito(muneca.pos[0]), finito(muneca.pos[1], 1.2), finito(muneca.pos[2])];
    const rot = normalizar([finito(muneca.rot[0]), finito(muneca.rot[1]), finito(muneca.rot[2]), finito(muneca.rot[3], 1)]);
    const lado = mano === "izquierda" ? -1 : 1;
    const desplazamiento: Vec3 = [
        finito(nodo.posicion[0]) + 0.025 * lado,
        finito(nodo.posicion[1]),
        finito(nodo.posicion[2]),
    ];
    const girado = rotar(rot, desplazamiento);
    const posicion: Vec3 = [pos[0] + girado[0], pos[1] + girado[1], pos[2] + girado[2]];
    const rotacion = multiplicar(rot, cuaternionDeEuler(nodo.rotacion.pitch, nodo.rotacion.yaw, nodo.rotacion.roll));
    return { posicion, rotacion };
}

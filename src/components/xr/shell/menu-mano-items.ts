/**
 * StarSeed XR · MENÚ DE MANO (XR1010N · contrato `architecture/starseed-xr.md` §3 a/e).
 * Módulo PURO: qué lleva el menú y dónde se pega a la muñeca, sin React, sin red, sin `node:*`.
 * La lista la ordena la accesibilidad: `salir` va primero (lo primero que toca el pulgar) y
 * `salir` + `recentrar` están SIEMPRE; en postura de una mano la lista se acorta pero conserva
 * ambas. El menú vive en la muñeca de la mano NO dominante: `posicionMenu` compone la pose del
 * `wrist` (o del `gripSpace` del mando como respaldo) con el desplazamiento local de `nodo.posicion`
 * (`anclaje: 'muneca'`); con la palma hacia la cara —la activación del detector `palma-a-la-cara`—
 * el dorso de la muñeca mira a la cabeza, y ese es el plano del menú.
 */
import type { Mano, Postura, Vec3 } from "../../../lib/xr/tipos";
import type { AccionXR, MapaEntrada } from "../../../lib/xr/vinculos-xr";
import type { NodoEspacial } from "../../../lib/xr/espacio-trinity";

export type IdMenuMano = "recentrar" | "salir" | "hablar" | "dock" | "calidad" | "ajustes";

export interface ItemMenuMano {
    id: IdMenuMano;
    etiqueta: string;
    accion: AccionXR | "calidad" | "ajustes";
}

/** Pose del articulo `wrist` (o del `gripSpace` del mando): posición en m y cuaternión [x, y, z, w]. */
export interface PoseMuneca {
    pos: Vec3;
    rot: [number, number, number, number];
}

/** Dónde queda el menú: target del `group` del cascarón. */
export interface PoseMenu {
    posicion: Vec3;
    rotacion: [number, number, number, number];
}

export function itemsMenuMano(o: {
    postura: Postura;
    hablando: boolean;
    calidadAuto: boolean;
}): ItemMenuMano[] {
    const fijos: ItemMenuMano[] = [
        { id: "salir", etiqueta: "Salir", accion: "salir" },
        { id: "recentrar", etiqueta: "Recentrar", accion: "recentrar" },
    ];
    const resto: ItemMenuMano[] = [{ id: "hablar", etiqueta: o.hablando ? "Silenciar" : "Hablar", accion: "hablar" }];
    if (o.postura !== "una-mano") {
        resto.push(
            { id: "dock", etiqueta: "Dock", accion: "abrir-dock" },
            { id: "calidad", etiqueta: o.calidadAuto ? "Calidad: auto" : "Calidad", accion: "calidad" },
            { id: "ajustes", etiqueta: "Ajustes", accion: "ajustes" },
        );
    }
    return [...fijos, ...resto];
}

/** El gatillo `menu-mano` de un mapa de mando (A/X izquierdo por defecto) o `null` si es de otro tipo. */
export function botonMenuMando(
    mapa?: MapaEntrada,
): { indice: number; mano: Mano } | null {
    for (const gatillo of mapa?.["menu-mano"] ?? []) {
        if (gatillo.tipo === "boton") return { indice: gatillo.indice, mano: gatillo.mano };
    }
    return null;
}

type Quat = [number, number, number, number];

const qConjunto = (eje: "x" | "y" | "z", ang: number): Quat => {
    const h = ang / 2;
    const c: Vec3 = eje === "x" ? [1, 0, 0] : eje === "y" ? [0, 1, 0] : [0, 0, 1];
    return [c[0] * Math.sin(h), c[1] * Math.sin(h), c[2] * Math.sin(h), Math.cos(h)];
};

const qMultiplicar = (a: Quat, b: Quat): Quat => [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];

const qNormalizada = (q: Quat): Quat => {
    const m = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    return [q[0] / m, q[1] / m, q[2] / m, q[3] / m];
};

const rotarVec = (v: Vec3, q: Quat): Vec3 => {
    const [x, y, z, w] = q;
    const tx = 2 * (y * v[2] - z * v[1]);
    const ty = 2 * (z * v[0] - x * v[2]);
    const tz = 2 * (x * v[1] - y * v[0]);
    return [
        v[0] + w * tx + (y * tz - z * ty),
        v[1] + w * ty + (z * tx - x * tz),
        v[2] + w * tz + (x * ty - y * tx),
    ];
};

const qDeEulerYXZ = (pitch: number, yaw: number, roll: number): Quat =>
    qNormalizada(qMultiplicar(qMultiplicar(qConjunto("y", yaw), qConjunto("x", pitch)), qConjunto("z", roll)));

const mm = (v: number): number => Math.round(v * 1000) / 1000;

export function posicionMenu(muneca: PoseMuneca, mano: Mano, nodo: NodoEspacial): PoseMenu {
    const q = qNormalizada(muneca.rot);
    const espejo = mano === "izquierda" ? 1 : -1;
    const local: Vec3 = [nodo.posicion[0] * espejo, nodo.posicion[1], nodo.posicion[2]];
    const desplazado = rotarVec(local, q);
    // Un espejo en roll alinea el texto con cada muñeca (se lee igual lejos del cuerpo en ambas).
    const qNodo = qDeEulerYXZ(nodo.rotacion.pitch, nodo.rotacion.yaw, nodo.rotacion.roll + (mano === "izquierda" ? 0 : Math.PI));
    return {
        posicion: [mm(muneca.pos[0] + desplazado[0]), mm(muneca.pos[1] + desplazado[1]), mm(muneca.pos[2] + desplazado[2])],
        rotacion: qNormalizada(qMultiplicar(q, qNodo)),
    };
}

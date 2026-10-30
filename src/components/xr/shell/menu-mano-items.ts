/**
 * StarSeed XR · MENÚ DE MANO · LÓGICA PURA (XR1010N · contrato `architecture/starseed-xr.md` §3 a).
 * Elementos ordenados del menú de muñeca y su colocación pegada a la muñeca de la mano NO dominante.
 * Sin React, sin red, sin `node:*`: prueba `__tests__/menu-mano-items.test.ts`. El botón `hablar`
 * abre y cierra el micrófono; `salir` y `recentrar` están SIEMPRE (nadie queda atrapado, §0.2).
 */
import type { Mano, Postura, Vec3 } from "../../../lib/xr/tipos";
import { mm } from "../../../lib/xr/tipos";
import type { AccionXR, Gatillo, MapaEntrada } from "../../../lib/xr/vinculos-xr";
import { MAPAS_DEFECTO } from "../../../lib/xr/vinculos-xr";
import type { NodoEspacial } from "../../../lib/xr/espacio-trinity";

export type IdItemMenuMano = "recentrar" | "salir" | "hablar" | "dock" | "calidad" | "ajustes";
/** «calidad» y «ajustes» son del propio menú (no existen en `AccionXR`); el componente los despacha. */
export type AccionItemMenu = AccionXR | "calidad" | "ajustes";

export interface ItemMenuMano {
    id: IdItemMenuMano;
    etiqueta: string;
    accion: AccionItemMenu;
}

export interface OpcionesItemsMenuMano {
    postura: Postura;
    /** Micrófono abierto: la etiqueta pasa a «Silenciar». */
    hablando: boolean;
    /** «Auto» o un nivel fijo (la calidad se ve en Logic). */
    calidadAuto: boolean;
}

/** Cuaternión [x, y, z, w] (el que dan las poses WebXR). */
export type Qt = [number, number, number, number];
/** Pose de la muñeca: articulación `wrist` de la mano, o `gripSpace` del mando como respaldo. */
export interface Muneca {
    pos: Vec3;
    rot: Qt;
}
export interface PosicionMenuMano {
    posicion: Vec3;
    quat: Qt;
}

export function itemsMenuMano(o: OpcionesItemsMenuMano): ItemMenuMano[] {
    const todos: ItemMenuMano[] = [
        { id: "salir", etiqueta: "Salir", accion: "salir" },
        { id: "recentrar", etiqueta: "Recentrar", accion: "recentrar" },
        { id: "hablar", etiqueta: o.hablando ? "Silenciar" : "Hablar", accion: "hablar" },
        { id: "calidad", etiqueta: o.calidadAuto ? "Calidad: Auto" : "Calidad: Fija", accion: "calidad" },
        { id: "dock", etiqueta: "Dock", accion: "abrir-dock" },
        { id: "ajustes", etiqueta: "Ajustes", accion: "ajustes" },
    ];
    // Con una mano, calidad y ajustes quedan en las pestañas que `disponerTrinity` agrupa más lejos:
    // el menú de muñeca sigue corto, y `salir` y `recentrar` se conservan SIEMPRE, en ese orden.
    return o.postura === "una-mano" ? todos.filter((i) => i.id !== "calidad" && i.id !== "ajustes") : todos;
}

/** Qué botón de mando abre el menú: el `menu-mano` del mapa (por defecto el A/X izquierdo, índice 4,
 * del `xr-standard`; el botón del sistema no llega a la página, §3 e). Sin gatillo de botón → null. */
export function botonMenuMando(mapa: MapaEntrada = MAPAS_DEFECTO.mandos): { indice: number; mano: Mano } | null {
    const g = (mapa["menu-mano"] ?? []).find((x): x is Extract<Gatillo, { tipo: "boton" }> => x.tipo === "boton");
    return g ? { indice: g.indice, mano: g.mano } : null;
}

/** Tramo local del núcleo (`menuMano.rotacion.pitch`): −90° en X. Al abrirse con la palma hacia la
 * cara (condición de apertura; nunca el pellizco de palma, que es del sistema del visor), deja el
 * panel de cara a la cabeza. */
const Q_TRAMO: Qt = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];

function compone(a: Qt, b: Qt): Qt {
    return [
        a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
        a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
        a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
        a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ];
}

function gira(v: Vec3, q: Qt): Vec3 {
    const [x, y, z] = v;
    const tx = 2 * (q[1] * z - q[2] * y), ty = 2 * (q[2] * x - q[0] * z), tz = 2 * (q[0] * y - q[1] * x);
    return [
        x + q[3] * tx + (q[1] * tz - q[2] * ty),
        y + q[3] * ty + (q[2] * tx - q[0] * tz),
        z + q[3] * tz + (q[0] * ty - q[1] * tx),
    ];
}

/** Pose del menú: aplica el desplazamiento local del nodo (`anclaje: "muneca"`) por la rotación de
 * la muñeca y le añade el tramo de −90°. Los ejes de cada mano son el espejo anatómico el uno del
 * otro: el desplazamiento local se espeja en X para el mando de la mano derecha. Ambas manos quedan
 * a ≤ 15 cm de la muñeca siempre que el nodo mida ≤ 0,15 m (el `menuMano` del núcleo mide 0,14). */
export function posicionMenu(muneca: Muneca, mano: Mano, nodo: NodoEspacial): PosicionMenuMano {
    const [x, y, z] = nodo.posicion;
    const espejo = mano === "derecha" ? -1 : 1;
    const offset = gira([espejo * x, y, z], muneca.rot);
    return {
        posicion: [mm(muneca.pos[0] + offset[0]), mm(muneca.pos[1] + offset[1]), mm(muneca.pos[2] + offset[2])],
        quat: compone(muneca.rot, Q_TRAMO),
    };
}

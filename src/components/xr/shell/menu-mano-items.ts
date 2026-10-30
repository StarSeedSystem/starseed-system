/**
 * StarSeed XR · MENÚ DE MANO — LÓGICA PURA (XR1010N · contrato §3 a y e). Qué items tiene el menú
 * de la muñeca y dónde se coloca: pegado a la muñeca de la mano NO dominante (la que `disponerTrinity`
 * ya marca como `mano`), con el desplazamiento local de `nodo.posicion` (`anclaje: "muneca"`) y
 * mirando a la cabeza. Módulo puro, sin React ni `node:*`: pruebas en node.
 */
import type { Mano, Postura, Vec3 } from "../../../lib/xr/tipos";
import type { NodoEspacial } from "../../../lib/xr/espacio-trinity";
import type { AccionXR, MapaEntrada } from "../../../lib/xr/vinculos-xr";

/** Los seis items posibles del menú de muñeca. */
export type IdItemMenuMano = "recentrar" | "salir" | "hablar" | "dock" | "calidad" | "ajustes";

export interface ItemMenuMano {
  id: IdItemMenuMano;
  etiqueta: string;
  accion: AccionXR | "calidad" | "ajustes";
}

export interface OpcionesMenuMano {
  postura: Postura;
  /** La voz de Astraura está escuchando: el item «hablar» pasa a invitar a detenerla. */
  hablando: boolean;
  /** La calidad la fija el aparato (auto) o la persona en manual. */
  calidadAuto: boolean;
}

/** Cuaternión (x, y, z, w), tal como la da la pose de WebXR. */
export type Cuat = [number, number, number, number];
/** Pose de la muñeca (articulación `wrist` o `gripSpace` del mando), en metros y cuaternión WebXR. */
export interface PoseMuneca {
  pos: Vec3;
  rot: Cuat;
}
/** La salida: posición del panel y su cuaternión de orientación. */
export interface ColocacionMenu {
  posicion: Vec3;
  rotacion: Cuat;
}

/**
 * Lista ORDENADA de items. El pulgar barre el panel desde la muñeca hacia afuera, así que el item 0
 * es el primero que toca: ahí va `salir`, que nunca puede faltar; `recentrar` siempre sigue. En
 * postura de una mano el menú queda corto con ambos. `calidad` y `ajustes` no son acciones del
 * núcleo: el componente los lleva a sus paneles.
 */
export function itemsMenuMano(o: OpcionesMenuMano): ItemMenuMano[] {
  const fijos: ItemMenuMano[] = [
    { id: "salir", etiqueta: "Salir", accion: "salir" },
    { id: "recentrar", etiqueta: "Recentrar", accion: "recentrar" },
  ];
  if (o.postura === "una-mano") return fijos;
  return [
    ...fijos,
    { id: "hablar", etiqueta: o.hablando ? "Detener voz" : "Hablar", accion: "hablar" },
    { id: "dock", etiqueta: "Abrir dock", accion: "abrir-dock" },
    { id: "calidad", etiqueta: o.calidadAuto ? "Calidad: auto" : "Calidad: manual", accion: "calidad" },
    { id: "ajustes", etiqueta: "Ajustes", accion: "ajustes" },
  ];
}

/* ---- matemática local de cuaterniones (los helpers de three no existen en node puro) ---- */
function rotar(v: Vec3, q: Cuat): Vec3 {
  const [qx, qy, qz, qw] = q;
  const u = { x: qx, y: qy, z: qz };
  const a = cruz(u, { x: v[0], y: v[1], z: v[2] });
  const b = cruz(u, a);
  return [v[0] + 2 * (qw * a.x + b.x), v[1] + 2 * (qw * a.y + b.y), v[2] + 2 * (qw * a.z + b.z)];
}
function cruz(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
/** Producto de Hamilton: aplicar `a` y luego `b` vale `b ⊗ a`. */
function multiplicar(a: Cuat, b: Cuat): Cuat {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [bw * ax + bx * aw + by * az - bz * ay, bw * ay - bx * az + by * aw + bz * ax, bw * az + bx * ay - by * ax + bz * aw, bw * aw - bx * ax - by * ay - bz * az];
}
/** Euler en orden YXZ (el de `NodoEspacial.rotacion`) → cuaternión. */
export function cuatEulerYXZ(r: { pitch: number; yaw: number; roll: number }): Cuat {
  const xp = Math.sin(r.pitch / 2), xc = Math.cos(r.pitch / 2);
  const yp = Math.sin(r.yaw / 2), yc = Math.cos(r.yaw / 2);
  const zp = Math.sin(r.roll / 2), zc = Math.cos(r.roll / 2);
  return [xp * yc * zc + xc * yp * zp, xc * yp * zc - xp * yc * zp, xc * yc * zp - xp * yp * zc, xc * yc * zc + xp * yp * zp];
}
/** Billboard de guiñada: el panel gira en horizontal para mirar a la cabeza y se queda vertical. */
function cuatMirarA(desde: Vec3, hacia: Vec3): Cuat {
  const fx = hacia[0] - desde[0], fz = hacia[2] - desde[2];
  if (Math.hypot(fx, fz) < 1e-6) return [0, 0, 0, 1];
  const yaw = Math.atan2(fx, fz);
  return [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
}
/** El eje x local del mando izquierdo y del derecho van en sentidos opuestos: se espeja para un lado. */
function desplazamientoLocal(nodo: NodoEspacial, mano: Mano): Vec3 {
  const [x, y, z] = nodo.posicion;
  return mano === "derecha" ? [-x, y, z] : [x, y, z];
}
const roundMm = (v: number): number => Math.round(v * 1000) / 1000;
/**
 * Coloca el menú: muñeca → menú, con el desplazamiento local de `nodo.posicion` (`anclaje: "muneca"`)
 * rotado por el cuaternión de la muñeca. Si llega `cabeza`, el panel gira a mirarla (billboard);
 * si no, hereda la inclinación del nodo sobre la muñeca. Posición en milímetros, como el núcleo.
 */
export function posicionMenu(muneca: PoseMuneca, mano: Mano, nodo: NodoEspacial, cabeza?: Vec3): ColocacionMenu {
  const [dx, dy, dz] = rotar(desplazamientoLocal(nodo, mano), muneca.rot);
  const posicion: Vec3 = [roundMm(muneca.pos[0] + dx), roundMm(muneca.pos[1] + dy), roundMm(muneca.pos[2] + dz)];
  const rotacion = cabeza ? cuatMirarA(posicion, cabeza) : multiplicar(cuatEulerYXZ(nodo.rotacion), muneca.rot);
  return { posicion, rotacion };
}

/**
 * Los gatillos de BOTÓN del mando que abren el menú de mano, según el mapa (por defecto el A/X
 * izquierdo en `xr-standard` botón 4; los botones del sistema no llegan a la página). El componente
 * los interpreta por mano e índice; las reasignaciones de Logic ya llegan aquí.
 */
export function gatillosBotonMenuMano(mapa: MapaEntrada): { mano: Mano; indice: number }[] {
  return (mapa["menu-mano"] ?? [])
    .filter((g) => g.tipo === "boton")
    .map((g) => (g.tipo === "boton" ? { mano: g.mano, indice: g.indice } : null))
    .filter((g): g is { mano: Mano; indice: number } => g !== null);
}

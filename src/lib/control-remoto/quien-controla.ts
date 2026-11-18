/**
 * CTL1117I · quién controla ESTE aparato ahora, con su color, para el punto de la esquina, su panelito y el panel de ajustes.
 * Puro. El color sale de lo que el controlador FIRMÓ al abrir (`SesionActiva.color`), si no del que declaró al presentarse y,
 * si tampoco, del de su id de neurona (`colorPorDefecto`), igual que lo calcula él.
 */

import type { Controlador, PermisoControl, SesionActiva } from "./sesion";
import { colorDe, colorValido } from "@/lib/neurons/color-publico";

export interface QuienControla {
    nombre: string;
    nivel: SesionActiva["nivel"];
    /** Epoch ms del inicio. */
    desde: number;
    color: string;
    /** Id de la neurona que controla, si se conoce. */
    neurona: string | null;
}

export function quienControla(sesion: SesionActiva | null, permiso: Pick<PermisoControl, "controladores"> | null): QuienControla | null {
    if (!sesion) return null;
    const c: Controlador | undefined = permiso?.controladores.find((x) => x.huella === sesion.de);
    const color = colorValido(sesion.color) ? sesion.color : colorDe(c?.neurona ?? sesion.de, c?.color);
    return { nombre: sesion.nombre, nivel: sesion.nivel, desde: sesion.inicio, color, neurona: c?.neurona ?? null };
}

/** CTL1118G: el tope largo del nombre en pantalla. Por debajo se enseña ENTERO; por encima, con puntos suspensivos. */
export const TOPE_NOMBRE_MOSTRADO = 40;

/** CTL1118G: el nombre tal cual para enseñarlo (sin recortarlo salvo por encima de 40 caracteres). */
export function nombreParaMostrar(nombre: string, tope = TOPE_NOMBRE_MOSTRADO): string {
    const letras = [...nombre.trim()];
    return letras.length > tope ? `${letras.slice(0, tope).join("")}…` : letras.join("");
}

/** VEN1115L · de un punto del puntero a una coordenada 0..1 de la pantalla del aparato, con giro y bandas negras. */
import type { Giro } from "./tipos";

export interface Caja {
    left: number;
    top: number;
    width: number;
    height: number;
}

/** Tamaño con el que se ve la pantalla una vez girada (a 90 y 270 se intercambian ancho y alto). */
export function tamanoGirado(ancho: number, alto: number, giro: Giro): { w: number; h: number } {
    return giro === 90 || giro === 270 ? { w: alto, h: ancho } : { w: ancho, h: alto };
}

/** La imagen más grande que cabe en la caja sin deformarse, centrada (las bandas negras quedan fuera). */
export function ajustar(caja: Caja, w: number, h: number): Caja {
    if (!(w > 0) || !(h > 0) || !(caja.width > 0) || !(caja.height > 0)) return { left: caja.left, top: caja.top, width: 0, height: 0 };
    const k = Math.min(caja.width / w, caja.height / h);
    const ancho = w * k;
    const alto = h * k;
    return { left: caja.left + (caja.width - ancho) / 2, top: caja.top + (caja.height - alto) / 2, width: ancho, height: alto };
}

const acotar = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

export interface Punto {
    x: number;
    y: number;
    /** El puntero estaba fuera de la imagen (en las bandas o fuera de la caja): x e y ya van acotados. */
    fuera: boolean;
}

/**
 * (u,v) son 0..1 de la imagen tal como se ve (ya girada); el resultado es 0..1 del cuadro del aparato sin girar,
 * que es lo que enseñan los cuadros (la imagen se ve girada `giro` grados en sentido horario).
 */
export function aCuadro(u: number, v: number, giro: Giro): [number, number] {
    switch (giro) {
        case 90: return [v, 1 - u];
        case 180: return [1 - u, 1 - v];
        case 270: return [1 - v, u];
        default: return [u, v];
    }
}

/** Punto del puntero (coordenadas del cliente) → coordenadas 0..1 de la pantalla del aparato. */
export function puntoEnPantalla(clientX: number, clientY: number, imagen: Caja, giro: Giro): Punto {
    if (!(imagen.width > 0) || !(imagen.height > 0)) return { x: 0, y: 0, fuera: true };
    const ru = (clientX - imagen.left) / imagen.width;
    const rv = (clientY - imagen.top) / imagen.height;
    const fuera = !(ru >= 0 && ru <= 1 && rv >= 0 && rv <= 1);
    const [x, y] = aCuadro(acotar(ru), acotar(rv), giro);
    return { x, y, fuera };
}

/** Un desplazamiento de la imagen vista (du,dv) → el mismo desplazamiento en el cuadro del aparato sin girar. */
export function deltaACuadro(du: number, dv: number, giro: Giro): [number, number] {
    switch (giro) {
        case 90: return [dv, -du];
        case 180: return [-du, -dv];
        case 270: return [-dv, du];
        default: return [du, dv];
    }
}

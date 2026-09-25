/**
 * Geometría de los paneles deslizables (puro, sin DOM).
 * ─────────────────────────────────────────────────────────────────────────────
 * Un panel que vive en un lado de la pantalla se cierra moviéndose HACIA ese
 * lado. Estas funciones traducen cualquier desplazamiento del puntero (dx, dy)
 * a «cuánto se acerca al cierre», que es la única magnitud que le importa a la
 * física. Así un mismo código sirve para las cuatro cortinas Trinity.
 */

import type { BordeTrinity, Eje, Lado } from "./tipos";

/** Eje en el que se mueve un panel del lado dado. */
export function ejeDe(lado: Lado): Eje {
    return lado === "izquierda" || lado === "derecha" ? "x" : "y";
}

/**
 * Sentido (en coordenadas de pantalla) en el que se mueve el panel al cerrarse:
 * izquierda/arriba → negativo (hacia 0), derecha/abajo → positivo.
 */
export function signoCierre(lado: Lado): 1 | -1 {
    return lado === "izquierda" || lado === "arriba" ? -1 : 1;
}

/** Componente de (dx, dy) que empuja el panel hacia su borde (positivo = cerrar). */
export function haciaCierre(lado: Lado, dx: number, dy: number): number {
    const principal = ejeDe(lado) === "x" ? dx : dy;
    return principal * signoCierre(lado);
}

/** Componente perpendicular al eje del panel, en valor absoluto. */
export function transversal(lado: Lado, dx: number, dy: number): number {
    return Math.abs(ejeDe(lado) === "x" ? dy : dx);
}

/** Recorta un valor al intervalo [min, max]. */
export function limitar(valor: number, min: number, max: number): number {
    if (Number.isNaN(valor)) return min;
    return Math.min(max, Math.max(min, valor));
}

/**
 * Fracción visible del panel (1 = del todo abierto, 0 = fuera de pantalla) a
 * partir de su «cerradez» (0 abierto → 1 cerrado). Alimenta la opacidad del
 * fondo que se oscurece al arrastrar.
 */
export function fraccionAbierta(cerradez: number): number {
    return limitar(1 - cerradez, 0, 1);
}

/** Lado de la pantalla que ocupa cada nodo Trinity. */
export function ladoDeBorde(borde: BordeTrinity): Lado {
    switch (borde) {
        case "zenith":
            return "arriba";
        case "horizon":
            return "izquierda";
        case "logic":
            return "derecha";
        case "anchor":
            return "abajo";
    }
}

/**
 * Transformación CSS de un panel según su cerradez.
 * ─────────────────────────────────────────────────────────────────────────────
 * Se expresa en PORCENTAJE del propio panel (más un margen fijo para su sombra
 * y su separación del borde) para que el primer fotograma ya salga fuera de
 * pantalla sin haber medido nada: si el panel se pintara un instante en su
 * sitio antes de medirlo, se vería un parpadeo. Con cerradez 0 devuelve
 * "none": un transform en reposo convertiría el panel en bloque contenedor de
 * sus hijos `position: fixed` (visores a pantalla completa del Exocórtex…).
 *
 * `inclinacion3d` (grados) añade una rotación sutil sobre el eje del borde, de
 * modo que el panel «entra de canto» y se endereza al llegar: movimiento
 * natural en 3D sin coste de pintura (solo compositor).
 */
export function transformPanel(lado: Lado, cerradez: number, margenPx: number, inclinacion3d = 0): string {
    if (Math.abs(cerradez) < 0.0005) return "none";
    const s = signoCierre(lado);
    const pct = (s * cerradez * 100).toFixed(3);
    const px = (s * cerradez * margenPx).toFixed(2);
    const desplazamiento = `calc(${pct}% + ${px}px)`;
    const traslado = ejeDe(lado) === "x"
        ? `translate3d(${desplazamiento}, 0, 0)`
        : `translate3d(0, ${desplazamiento}, 0)`;
    // La inclinación solo acompaña al cierre (nunca al estirón elástico hacia dentro).
    const c = limitar(cerradez, 0, 1);
    if (!inclinacion3d || c === 0) return traslado;
    const angulo = (inclinacion3d * c).toFixed(3);
    // izquierda: el canto interior se aleja al cerrarse (rotateY positivo);
    // derecha: simétrico; arriba/abajo: lo mismo sobre el eje X.
    const rotacion = lado === "izquierda"
        ? `rotateY(${angulo}deg)`
        : lado === "derecha"
            ? `rotateY(-${angulo}deg)`
            : lado === "arriba"
                ? `rotateX(-${angulo}deg)`
                : `rotateX(${angulo}deg)`;
    return `perspective(1400px) ${traslado} ${rotacion}`;
}

/** Punto de giro coherente con `transformPanel`: el canto pegado al borde. */
export function origenTransformPanel(lado: Lado): string {
    switch (lado) {
        case "izquierda":
            return "left center";
        case "derecha":
            return "right center";
        case "arriba":
            return "center top";
        case "abajo":
            return "center bottom";
    }
}

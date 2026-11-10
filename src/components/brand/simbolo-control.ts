// ════════════════════════════════════════════════════════════════
// StarSeed OS — Control del símbolo vivo (ESC1110B)
// ----------------------------------------------------------------
// Une la mirada, el parpadeo y el giro de la flor en un solo objeto que
// alimentan los eventos del DOM (puntero, clic, arrastre, teclado) y que el
// lienzo consulta en cada fotograma. Sin React y sin three: probado aparte.
// Con movimiento reducido: sin seguimiento, sin parpadeo y sin giro solo;
// la flor responde al teclado y al arrastre saltando a su posición.
// ════════════════════════════════════════════════════════════════

import { SIMBOLO_OFICIAL, esOficial, type ArchivoSimbolo } from "./simbolo-archivo";
import {
    OPCIONES_FLOR,
    arrastrarFlor,
    estadoFlorInicial,
    florEnMovimiento,
    girarConTeclado,
    indiceReposo,
    pasoFlor,
    soltarFlor,
    type EstadoFlor,
    type OpcionesFlor,
} from "./simbolo-flor";
import {
    MIRADA_FRENTE,
    avanzarParpadeo,
    estadoParpadeoInicial,
    miradaQuieta,
    objetivoConReposo,
    objetivoMirada,
    parpadeando,
    pedirParpadeo,
    seguirMirada,
    type EstadoParpadeo,
    type Mirada,
} from "./simbolo-ojo";

export interface EstadoFotograma {
    t: number;
    inclinacion: { x: number; y: number };
    mirada: Mirada;
    cierre: number;
    anguloFlor: number;
    quieto: boolean;
}

export interface ControlSimbolo {
    readonly reducido: boolean;
    /** Puntero en pantalla relativo al centro del ojo (px) y escala de saturación (px). */
    mirar(dx: number, dy: number, escala: number, ahoraMs: number): void;
    /** Inclinación de la pieza hacia el puntero, ya normalizada a [-1, 1]. */
    inclinar(x: number, y: number): void;
    parpadear(ahoraMs: number): void;
    arrastrar(delta: number, dt: number): void;
    soltar(): void;
    teclado(sentido: 1 | -1): void;
    /** Avanza `dt` s y devuelve lo que pinta el fotograma. */
    paso(dt: number, ahoraMs: number, t: number): EstadoFotograma;
    /** ¿Hay que pedir otro fotograma? (flotación, mirada, parpadeo o flor en marcha). */
    enMovimiento(): boolean;
    /** Ángulo y posición de reposo de la flor (para lectores de pantalla). */
    flor(): { angulo: number; reposo: number };
    /** Avisa cuando algo pide pintar. */
    suscribir(f: () => void): () => void;
}

export function opcionesFlorDeArchivo(a: ArchivoSimbolo, reducido: boolean): OpcionesFlor {
    const c = a.comportamientos;
    const auto = !reducido && c.rotacionFlor && c.fusionFlor && c.velocidadFlor > 0;
    return {
        ...OPCIONES_FLOR,
        auto,
        pausa: c.pausaFlor,
        deslizar: OPCIONES_FLOR.deslizar / Math.max(0.05, c.velocidadFlor || 1),
    };
}

export function crearControlSimbolo(
    archivo: ArchivoSimbolo = SIMBOLO_OFICIAL,
    opciones: { reducido?: boolean; ahoraMs?: number; azar?: () => number } = {},
): ControlSimbolo {
    const reducido = !!opciones.reducido;
    const azar = opciones.azar ?? Math.random;
    const c = archivo.comportamientos;
    const ojo = esOficial(archivo);
    const sigue = !reducido && c.seguirCursor;
    const parpadea = !reducido && ojo && c.parpadeo;
    const opFlor = opcionesFlorDeArchivo(archivo, reducido);
    let flor: EstadoFlor = estadoFlorInicial(0);
    if (!opFlor.auto) flor = { ...flor, modo: "quieta" };
    let mirada: Mirada = MIRADA_FRENTE;
    let objetivo: Mirada = MIRADA_FRENTE;
    let inclinacion = { x: 0, y: 0 };
    let ultimaEntrada = -Infinity;
    let ahoraUltimo = opciones.ahoraMs ?? 0;
    let parpadeo: EstadoParpadeo = estadoParpadeoInicial(ahoraUltimo, parpadea && c.parpadeoOcioso, azar);
    const oyentes = new Set<() => void>();
    const avisar = () => oyentes.forEach((f) => f());

    return {
        reducido,
        mirar(dx, dy, escala, ahoraMs) {
            if (!sigue) return;
            objetivo = ojo ? objetivoMirada(dx, dy, escala) : MIRADA_FRENTE;
            ultimaEntrada = ahoraMs;
            avisar();
        },
        inclinar(x, y) {
            if (!sigue) return;
            inclinacion = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
            avisar();
        },
        parpadear(ahoraMs) {
            if (!parpadea) return;
            parpadeo = pedirParpadeo(parpadeo, ahoraMs);
            avisar();
        },
        arrastrar(delta, dt) {
            if (!c.fusionFlor) return;
            flor = arrastrarFlor(flor, delta, dt);
            avisar();
        },
        soltar() {
            if (flor.modo !== "arrastre") return;
            flor = soltarFlor(flor, !reducido);
            avisar();
        },
        teclado(sentido) {
            if (!c.fusionFlor) return;
            flor = girarConTeclado(flor, sentido, reducido);
            avisar();
        },
        paso(dt, ahoraMs, t) {
            ahoraUltimo = ahoraMs;
            flor = pasoFlor(flor, dt, opFlor);
            const meta = objetivoConReposo(objetivo, ahoraMs - ultimaEntrada);
            mirada = sigue ? seguirMirada(mirada, meta, dt) : MIRADA_FRENTE;
            let cierre = 0;
            if (parpadea) {
                const r = avanzarParpadeo(parpadeo, ahoraMs, azar);
                parpadeo = r.estado;
                cierre = r.cierre;
            }
            return { t, inclinacion: sigue ? inclinacion : { x: 0, y: 0 }, mirada, cierre, anguloFlor: flor.angulo, quieto: reducido };
        },
        enMovimiento() {
            if (florEnMovimiento(flor)) return true;
            if (reducido) return false;
            // Vivo: flota, la flor espera su turno y el ojo puede parpadear solo.
            if (archivo.pose.flotacion > 0 || opFlor.auto || (parpadea && c.parpadeoOcioso)) return true;
            const meta = objetivoConReposo(objetivo, ahoraUltimo - ultimaEntrada);
            return !miradaQuieta(mirada, meta) || parpadeando(parpadeo);
        },
        flor() {
            return { angulo: flor.angulo, reposo: indiceReposo(flor.angulo) };
        },
        suscribir(f) {
            oyentes.add(f);
            return () => { oyentes.delete(f); };
        },
    };
}

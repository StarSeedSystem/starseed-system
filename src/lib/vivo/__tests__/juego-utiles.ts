/**
 * Utilidades de las pruebas de juegos en vivo: construir entradas y mesas, y jugar diarios enteros
 * sin red. (No es una prueba: el nombre no acaba en .test.)
 */
import { baseDePartida, motorMesa, type EstadoMesa } from "../juegos/mesa";
import type { Datos, Entrada, IdJuego, Registro } from "../juegos/tipos";

let contador = 0;

export function entrada(k: string, u: string, d?: Datos, n = 0, t = 1_000 + n * 1_000): Entrada {
    contador += 1;
    return { id: `e${contador}_${n}`, n, u, t, k, ...(d ? { d } : {}) };
}

export function registroDe(juego: IdJuego, creador = "ana", opciones: Datos = {}, id = "p1", gen = 1): Registro {
    return { id, tipo: juego, gen, creada: 1, base: baseDePartida(juego, creador, 7, opciones), log: [] };
}

/** Aplica entradas (numerándolas) y devuelve el estado; lanza si alguna es inválida. */
export function jugarMesa(juego: IdJuego, pasos: [string, string, Datos?][], opciones: Datos = {}): EstadoMesa {
    let e = motorMesa.inicial(baseDePartida(juego, "ana", 7, opciones));
    pasos.forEach(([k, u, d], i) => {
        const r = motorMesa.aplicar(e, entrada(k, u, d, i));
        if (!r.ok) throw new Error(`Paso ${i} (${k} de ${u}) rechazado: ${r.motivo}`);
        e = r.estado;
    });
    return e;
}

/** Mesa de dos con «ana» (asiento 0) y «beto» (asiento 1) ya sentados. */
export const SENTAR_DOS: [string, string, Datos][] = [
    ["sentar", "ana", { nombre: "Ana" }],
    ["sentar", "beto", { nombre: "Beto" }],
];

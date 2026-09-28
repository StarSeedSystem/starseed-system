/**
 * Tres en raya — reglas puras. Asiento 0 = X, asiento 1 = O. Casillas 0..8 en filas de tres.
 * Entrada: `k: "jugar"`, `d: { c: <casilla> }`.
 */
import type { Datos, Entrada, JuegoDeMesa, ResultadoJuego } from "./tipos";

export type Marca = 0 | 1;

export interface TableroTresEnRaya {
    /** null = vacía; 0 = X; 1 = O. */
    c: (Marca | null)[];
    /** Asiento al que le toca mover. */
    turno: Marca;
    /** Casillas de la línea ganadora (vacío si no hay). */
    linea: number[];
    /** Jugadas hechas. */
    jugadas: number;
}

export const LINEAS_TRES: readonly (readonly [number, number, number])[] = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
];

export function tableroTresInicial(inicia: Marca = 0): TableroTresEnRaya {
    return { c: Array.from({ length: 9 }, () => null), turno: inicia, linea: [], jugadas: 0 };
}

/** Línea ganadora de un tablero, o [] si aún no la hay. */
export function lineaGanadora(c: readonly (Marca | null)[]): number[] {
    for (const [a, b, d] of LINEAS_TRES) {
        const v = c[a];
        if (v !== null && v === c[b] && v === c[d]) return [a, b, d];
    }
    return [];
}

/** Casillas libres. */
export function casillasLibres(t: TableroTresEnRaya): number[] {
    const libres: number[] = [];
    t.c.forEach((v, i) => {
        if (v === null) libres.push(i);
    });
    return libres;
}

export const juegoTresEnRaya: JuegoDeMesa<TableroTresEnRaya> = {
    id: "tres-en-raya",
    nombre: "Tres en raya",
    jugadores: { min: 2, max: 2 },
    autoInicio: true,
    inicial(opciones: Datos) {
        return tableroTresInicial(opciones.inicia === 1 ? 1 : 0);
    },
    turno(t) {
        return t.linea.length > 0 || t.jugadas >= 9 ? null : t.turno;
    },
    aplicar(t, entrada: Entrada, ctx): ResultadoJuego<TableroTresEnRaya> {
        if (entrada.k !== "jugar") return { ok: false, motivo: "Eso no se puede hacer en el tres en raya." };
        const c = entrada.d?.c;
        if (typeof c !== "number" || !Number.isInteger(c) || c < 0 || c > 8) {
            return { ok: false, motivo: "Casilla no válida." };
        }
        if (!ctx.asientosDe(entrada.u).includes(t.turno)) {
            return { ok: false, motivo: "No es tu turno." };
        }
        if (t.c[c] !== null) return { ok: false, motivo: "Esa casilla ya está ocupada." };

        const celdas = t.c.slice();
        celdas[c] = t.turno;
        const linea = lineaGanadora(celdas);
        const jugadas = t.jugadas + 1;
        const siguiente = (t.turno === 0 ? 1 : 0) as Marca;
        const tablero: TableroTresEnRaya = { c: celdas, turno: siguiente, linea, jugadas };
        if (linea.length > 0) {
            return { ok: true, tablero, fin: { tipo: "victoria", ganador: t.turno, motivo: "Tres en raya" } };
        }
        if (jugadas >= 9) {
            return { ok: true, tablero, fin: { tipo: "tablas", ganador: null, motivo: "Tablero lleno" } };
        }
        return { ok: true, tablero, fin: null };
    },
};

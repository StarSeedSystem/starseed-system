/**
 * Conecta 4 — reglas puras. Asiento 0 = rojo (juega primero), asiento 1 = amarillo.
 * Tablero de 7 columnas × 6 filas; la fila 0 es la de ABAJO. Casilla = fila * 7 + columna.
 * Entrada: `k: "jugar"`, `d: { c: <columna 0..6> }`.
 */
import type { Datos, Entrada, JuegoDeMesa, ResultadoJuego } from "./tipos";

export const COLUMNAS_C4 = 7;
export const FILAS_C4 = 6;

export type Ficha = 0 | 1;

export interface TableroConecta4 {
    /** null = vacía. Índice = fila * 7 + columna (fila 0 abajo). */
    c: (Ficha | null)[];
    turno: Ficha;
    /** Las cuatro (o más) casillas de la línea ganadora. */
    linea: number[];
    jugadas: number;
}

export function tableroC4Inicial(inicia: Ficha = 0): TableroConecta4 {
    return { c: Array.from({ length: COLUMNAS_C4 * FILAS_C4 }, () => null), turno: inicia, linea: [], jugadas: 0 };
}

/** Fila libre más baja de una columna, o -1 si está llena. */
export function filaLibre(c: readonly (Ficha | null)[], columna: number): number {
    for (let f = 0; f < FILAS_C4; f++) {
        if (c[f * COLUMNAS_C4 + columna] === null) return f;
    }
    return -1;
}

const DIRECCIONES: readonly (readonly [number, number])[] = [
    [1, 0], // horizontal
    [0, 1], // vertical
    [1, 1], // diagonal ↗
    [1, -1], // diagonal ↘
];

/** Casillas de la línea de 4+ que pasa por `casilla` (todas iguales a la suya), o []. */
export function lineaDesde(c: readonly (Ficha | null)[], casilla: number): number[] {
    const ficha = c[casilla];
    if (ficha === null || ficha === undefined) return [];
    const fila = Math.floor(casilla / COLUMNAS_C4);
    const col = casilla % COLUMNAS_C4;
    for (const [dc, df] of DIRECCIONES) {
        const linea = [casilla];
        for (const signo of [1, -1]) {
            let cc = col + dc * signo;
            let ff = fila + df * signo;
            while (cc >= 0 && cc < COLUMNAS_C4 && ff >= 0 && ff < FILAS_C4 && c[ff * COLUMNAS_C4 + cc] === ficha) {
                linea.push(ff * COLUMNAS_C4 + cc);
                cc += dc * signo;
                ff += df * signo;
            }
        }
        if (linea.length >= 4) return linea.sort((a, b) => a - b);
    }
    return [];
}

export const juegoConecta4: JuegoDeMesa<TableroConecta4> = {
    id: "conecta-4",
    nombre: "Conecta 4",
    jugadores: { min: 2, max: 2 },
    autoInicio: true,
    inicial(opciones: Datos) {
        return tableroC4Inicial(opciones.inicia === 1 ? 1 : 0);
    },
    turno(t) {
        return t.linea.length > 0 || t.jugadas >= COLUMNAS_C4 * FILAS_C4 ? null : t.turno;
    },
    aplicar(t, entrada: Entrada, ctx): ResultadoJuego<TableroConecta4> {
        if (entrada.k !== "jugar") return { ok: false, motivo: "Eso no se puede hacer en Conecta 4." };
        const columna = entrada.d?.c;
        if (typeof columna !== "number" || !Number.isInteger(columna) || columna < 0 || columna >= COLUMNAS_C4) {
            return { ok: false, motivo: "Columna no válida." };
        }
        if (!ctx.asientosDe(entrada.u).includes(t.turno)) return { ok: false, motivo: "No es tu turno." };
        const fila = filaLibre(t.c, columna);
        if (fila < 0) return { ok: false, motivo: "Esa columna está llena." };

        const casilla = fila * COLUMNAS_C4 + columna;
        const celdas = t.c.slice();
        celdas[casilla] = t.turno;
        const linea = lineaDesde(celdas, casilla);
        const jugadas = t.jugadas + 1;
        const tablero: TableroConecta4 = {
            c: celdas,
            turno: (t.turno === 0 ? 1 : 0) as Ficha,
            linea,
            jugadas,
        };
        if (linea.length > 0) {
            return { ok: true, tablero, fin: { tipo: "victoria", ganador: t.turno, motivo: "Cuatro en línea" } };
        }
        if (jugadas >= COLUMNAS_C4 * FILAS_C4) {
            return { ok: true, tablero, fin: { tipo: "tablas", ganador: null, motivo: "Tablero lleno" } };
        }
        return { ok: true, tablero, fin: null };
    },
};

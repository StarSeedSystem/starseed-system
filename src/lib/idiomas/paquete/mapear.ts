/**
 * IMA10 (TRA1116-IDIOMAS) · Mapea las claves importadas de un paquete externo a las claves
 * españolas del OS. Una entrada casa si su CLAVE (normalizada) es igual a una clave española,
 * o —cuando la clave importada parece un identificador, p. ej. `menu.save`— si el valor de la
 * columna fuente coincide con una clave española ignorando mayúsculas y puntuación final.
 * Nunca se casa por parecido difuso. Módulo PURO: sin red, sin disco; `fuente` se inyecta
 * (el JSON puede ser enorme y no se importa aquí).
 */

import { normalizarTexto } from "../catalogo";

export interface ResultadoMapeo {
    /** Claves españolas del OS → valor importado correspondiente. */
    entradas: Record<string, string>;
    /** Cuántas entradas importadas casaron con una clave española. */
    casadas: number;
    /** Claves importadas sin casar, para que la persona las vea (máximo 200). */
    sinCasar: string[];
    /** Porcentaje de casadas sobre el total importado (0 si no hay entradas). */
    porcentaje: number;
}

export const MAX_SIN_CASAR = 200;

/** Identificador estilo `menu.save`, `common_ok`, `btn-ok`: sin espacios y con separadores. */
const PATRON_IDENTIFICADOR = /^[A-Za-z][A-Za-z0-9]*(?:[._:-][A-Za-z0-9]+)+$/;

/** Mayúsculas a minúsculas y puntuación final fuera, para comparar el valor fuente. */
const leniente = (t: string): string =>
    normalizarTexto(t).toLowerCase().replace(/[.,;:!?…]+$/, "");

/** Las claves españolas del OS: los textos de la lista o las claves del objeto inyectado. */
function clavesFuente(fuente: Record<string, unknown> | string[]): string[] {
    if (Array.isArray(fuente)) return fuente.filter((t): t is string => typeof t === "string");
    return Object.keys(fuente);
}

/** Formas lenientes de cada clave española (gana la primera si dos coinciden). */
function indiceLeniente(claves: string[]): Map<string, string> {
    const indice = new Map<string, string>();
    for (const clave of claves) {
        const forma = leniente(clave);
        if (forma !== "" && !indice.has(forma)) indice.set(forma, clave);
    }
    return indice;
}

export function mapearClaves(
    importadas: Record<string, string>,
    fuente: Record<string, unknown> | string[],
): ResultadoMapeo {
    const exactas = new Set(clavesFuente(fuente).map(normalizarTexto));
    const lenientes = indiceLeniente([...exactas].filter(Boolean));
    const entradas: Record<string, string> = {};
    const sinCasar: string[] = [];
    let casadas = 0;
    let total = 0;

    for (const [clave, valor] of Object.entries(importadas)) {
        total += 1;
        const claveNormalizada = normalizarTexto(clave);
        if (exactas.has(claveNormalizada)) {
            entradas[claveNormalizada] = valor;
            casadas += 1;
            continue;
        }
        if (PATRON_IDENTIFICADOR.test(clave)) {
            const claveEspañola = lenientes.get(leniente(valor));
            if (claveEspañola !== undefined) {
                entradas[claveEspañola] = valor;
                casadas += 1;
                continue;
            }
        }
        if (sinCasar.length < MAX_SIN_CASAR) sinCasar.push(clave);
    }

    const porcentaje = total === 0 ? 0 : Math.round((casadas / total) * 100);
    return { entradas, casadas, sinCasar, porcentaje };
}

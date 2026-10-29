/**
 * GridCraft ↔ tabla viva (2026-10-29; contrato `architecture/artcraft-y-rare.md` §4.2).
 *
 * GridCraft es el motor DE DATOS de la Protomolécula; la verdad sigue siendo la tabla viva, a la
 * que esto accede como una COPIA de trabajo. Módulo PURO (sin `node:*`, sin React, sin red):
 * nada habla con la pasarela; entrega CSV, matrices y UN PLAN de llamadas (`new_workbook`,
 * `write_range`, `format_range`, `create_table`, `insert_chart`, `save_workbook`) que la pasarela
 * ejecuta por su lista permitida (§3.2). Las columnas calculadas viajan como su VALOR: una hoja
 * de GridCraft no entiende las fórmulas del OS.
 */
import { MAX_BYTES_IMPORTAR, csvDesdeTabla } from "../vivo/tabla/csv";
import { crearCalculadora, textoCalculado, type Calculadora } from "../vivo/tabla/formulas";
import {
    LIMITES,
    claveCelda,
    columnasVisibles,
    estaVacio,
    filasVisibles,
    nombreDeOpcion,
    type Columna,
    type Tabla,
    type ValorCelda,
} from "../vivo/tabla/modelo";

// ───────────────────────── rangos A1 (más de 26 columnas) ─────────────────────────

/** Letra de columna A1: 1 → A, 26 → Z, 27 → AA, 52 → AZ. */
export function letraA1(n: number): string {
    let s = "";
    let i = Math.max(1, Math.round(n));
    while (i > 0) {
        s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
        i = Math.floor((i - 1) / 26);
    }
    return s;
}

/** Rango A1 de un bloque que empieza en A1: `rangoA1(3, 2)` → «A1:B3». */
export function rangoA1(filas: number, columnas: number): string {
    const f = Math.max(1, Math.round(filas));
    const c = Math.max(1, Math.round(columnas));
    return `A1:${letraA1(c)}${f}`;
}

// ───────────────────────── CSV ─────────────────────────

/** Tabla viva → CSV con comas (el que GridCraft entiende de fábrica). */
export function csvParaGridcraft(t: Tabla): string {
    return csvDesdeTabla(t, { separador: "," });
}

/** Un valor de `read_range` (`string|number|boolean|null`) como campo CSV. */
function escaparValor(v: unknown): string {
    if (v === null || v === undefined) return "";
    let s: string;
    if (typeof v === "string") s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    else s = String(v);
    return /["\r\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Matriz 2-D (lo que devuelve `read_range`) → CSV. Cada fila es una línea; `null` queda vacío y
 * los booleanos van como `true`/`false`. Tope: `MAX_BYTES_IMPORTAR`; las líneas de más se
 * descartan (el aviso de recorte es cosa de quien llama, que sabe cuántas filas trajo la matriz).
 */
export function matrizACsv(filas: readonly unknown[][]): string {
    const lineas: string[] = [];
    let bytes = 0;
    for (const fila of filas) {
        const linea = fila.map(escaparValor).join(",");
        if (lineas.length && bytes + linea.length > MAX_BYTES_IMPORTAR) break;
        lineas.push(linea);
        bytes += linea.length;
    }
    return lineas.length ? `${lineas.join("\r\n")}\r\n` : "";
}

// ───────────────────────── plan de llamadas ─────────────────────────

export interface OpcionesPlan {
    /** Nombre del archivo, sin ruta: la pasarela lo deja SIEMPRE dentro de `salida/`. */
    archivo: string;
    encabezadoNegrita?: boolean;
    tabla?: boolean;
    grafica?: { tipo: string; titulo?: string };
}

export interface LlamadaGridcraft {
    herramienta: string;
    parametros: Record<string, unknown>;
}

export interface PlanGridcraft {
    llamadas: LlamadaGridcraft[];
    avisos: string[];
}

function sanearArchivo(nombre: string): string {
    const limpio = nombre
        .toLowerCase()
        .trim()
        .replace(/\.xlsx?$/i, "")
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
    return limpio || "datos";
}

/** El valor de una celda para la hoja: las calculadas con su resultado (número o etiqueta de error). */
function valorDeCelda(t: Tabla, col: Columna, filaId: string, calc: Calculadora): ValorCelda {
    if (col.tipo.v === "calculado") {
        const v = calc.calculada(filaId, col.id);
        if (!v) return null;
        return v.ok ? v.n : textoCalculado(v);
    }
    const x = t.celdas[claveCelda(filaId, col.id)]?.v ?? null;
    if (estaVacio(x)) return null;
    if (col.tipo.v === "seleccion") return nombreDeOpcion(col, x) ?? "";
    return x;
}

/**
 * Plan de llamadas para llevar la tabla a GridCraft y guardarla en `salida/`: libro nuevo,
 * bloque con los datos, encabezado en negrita (si cabe), tabla y gráfica opcionales, y guardado.
 * Con la tabla vacía no hay llamadas de escritura: solo se avisa.
 */
export function planGridcraftDesdeTabla(t: Tabla, o: OpcionesPlan): PlanGridcraft {
    const avisos: string[] = [];
    const nombre = sanearArchivo(o.archivo);
    if (nombre !== o.archivo) avisos.push(`El nombre del archivo se saneó a «${nombre}»: solo minúsculas, cifras y «-» o «_».`);

    const todas = columnasVisibles(t);
    const todasFilas = filasVisibles(t);
    if (!todasFilas.length) return { llamadas: [], avisos: [...avisos, "La tabla está vacía: no hay nada que copiar a GridCraft."] };

    const cols = todas.slice(0, LIMITES.columnas);
    const filas = todasFilas.slice(0, LIMITES.filas);
    if (todas.length > cols.length) avisos.push(`Se descartaron ${todas.length - cols.length} columnas: máximo ${LIMITES.columnas}.`);
    if (todasFilas.length > filas.length) avisos.push(`Se descartaron ${todasFilas.length - filas.length} filas: máximo ${LIMITES.filas}.`);

    const calc = crearCalculadora(t);
    const calculadas = cols.filter((c) => c.tipo.v === "calculado");
    if (calculadas.length) {
        avisos.push(
            `Las columnas calculadas (${calculadas.map((c) => c.nombre.v).join(", ")}) se exportan con su valor, no como fórmula.`,
        );
    }

    const matriz: ValorCelda[][] = [cols.map((c) => c.nombre.v)];
    for (const f of filas) matriz.push(cols.map((c) => valorDeCelda(t, c, f.id, calc)));

    const llamadas: LlamadaGridcraft[] = [
        { herramienta: "new_workbook", parametros: {} },
        { herramienta: "write_range", parametros: { range: "A1", values: matriz } },
    ];
    if (o.encabezadoNegrita !== false) {
        llamadas.push({ herramienta: "format_range", parametros: { range: rangoA1(1, cols.length), bold: true } });
    }
    const rango = rangoA1(matriz.length, cols.length);
    if (o.tabla) llamadas.push({ herramienta: "create_table", parametros: { range: rango, header: true } });
    if (o.grafica) {
        llamadas.push({
            herramienta: "insert_chart",
            parametros: { range: rango, type: o.grafica.tipo, ...(o.grafica.titulo ? { title: o.grafica.titulo } : {}) },
        });
    }
    llamadas.push({ herramienta: "save_workbook", parametros: { path: `salida/${nombre}.xlsx` } });
    return { llamadas, avisos };
}

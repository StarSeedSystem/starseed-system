/** GridCraft ↔ tabla viva (§4.2): convierte y planifica sobre una COPIA; módulo puro, sin pasarela. */
import { MAX_BYTES_IMPORTAR, csvDesdeTabla, textoDeCelda } from "../vivo/tabla/csv";
import { crearCalculadora, type Calculadora } from "../vivo/tabla/formulas";
import { LIMITES, columnasVisibles, filasVisibles, type Columna, type Tabla } from "../vivo/tabla/modelo";

export interface LlamadaGridcraft { herramienta: string; parametros: Record<string, unknown>; }
export interface PlanGridcraft { llamadas: LlamadaGridcraft[]; avisos: string[]; }
export interface OpcionesPlanGridcraft { archivo: string; encabezadoNegrita?: boolean; tabla?: boolean; grafica?: { tipo: string; titulo?: string }; }

/** Tabla viva → CSV con coma (lo que GridCraft importa). */
export function csvParaGridcraft(t: Tabla): string {
    return csvDesdeTabla(t, { separador: "," });
}

/** Número de columna (1 = A) → letras de Excel, también más allá de Z. */
function letraColumna(n: number): string {
    let s = "", x = Math.max(1, Math.trunc(n));
    while (x > 0) { const r = (x - 1) % 26; s = String.fromCharCode(65 + r) + s; x = Math.floor((x - 1) / 26); }
    return s;
}

/** Rango A1 desde A1 hasta la última celda de `filas` × `columnas`. */
export function rangoA1(filas: number, columnas: number): string {
    const f = Math.max(1, Math.trunc(filas));
    const c = Math.max(1, Math.trunc(columnas));
    return f === 1 && c === 1 ? "A1" : `A1:${letraColumna(c)}${f}`;
}

/** Nombre de archivo permitido: solo `[a-z0-9-_]`, sin rutas ni extensiones. */
function sanearArchivo(nombre: string): string {
    const limpio = nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
        .replace(/[^a-z0-9-_]+/g, "-").replace(/-+/g, "-").replace(/^[-_]+|[-_]+$/g, "").slice(0, 60);
    return limpio || "tabla";
}

function textoMatriz(v: unknown): string | null {
    if (v === null) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
    if (typeof v === "boolean") return v ? "Sí" : "No";
    return null;
}

function escaparCampo(s: string): string {
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Matriz de `read_range` → CSV; descarta lo no compatible y respeta `MAX_BYTES_IMPORTAR`. */
export function matrizACsv(filas: unknown[][], avisos: string[] = []): string {
    const lineas: string[] = [];
    let descartados = 0;
    let tamano = 0;
    for (const fila of filas) {
        if (!Array.isArray(fila)) {
            descartados += 1;
            continue;
        }
        const campos = fila.map((v) => {
            const s = textoMatriz(v);
            if (s === null) {
                descartados += 1;
                return "";
            }
            return escaparCampo(s);
        });
        const linea = campos.join(",");
        const extra = (lineas.length ? 2 : 0) + linea.length;
        if (tamano + extra > MAX_BYTES_IMPORTAR) {
            avisos.push(`La matriz supera el tope de importación (${MAX_BYTES_IMPORTAR} caracteres): se cortaron las filas restantes.`);
            break;
        }
        tamano += extra;
        lineas.push(linea);
    }
    if (descartados) avisos.push(`${descartados} valor(es) no compatibles con CSV se descartaron.`);
    return lineas.length ? lineas.join("\r\n") + "\r\n" : "";
}

const TIPOS_TEXTO = new Set<Columna["tipo"]["v"]>(["texto", "enlace"]);

function valorParaHoja(t: Tabla, col: Columna, filaId: string, calc: Calculadora): string {
    const s = textoDeCelda(t, col, filaId, calc);
    return TIPOS_TEXTO.has(col.tipo.v) && /^[=+\-@]/.test(s) ? `'${s}` : s;
}

/** Tabla viva → plan de llamadas: libro, rango, formato, tabla/gráfica opcionales y guardado. */
export function planGridcraftDesdeTabla(t: Tabla, o: OpcionesPlanGridcraft): PlanGridcraft {
    const avisos: string[] = [];
    const llamadas: LlamadaGridcraft[] = [];
    const archivo = sanearArchivo(o.archivo);
    if (archivo !== o.archivo) avisos.push(`El nombre del archivo se saneó a «${archivo}».`);
    llamadas.push({ herramienta: "new_workbook", parametros: {} });

    const todas = columnasVisibles(t);
    const columnas = todas.slice(0, LIMITES.columnas);
    if (todas.length > columnas.length) avisos.push(`Solo se exportan ${LIMITES.columnas} columnas de ${todas.length}.`);
    const filasTodas = filasVisibles(t);
    const filas = filasTodas.slice(0, LIMITES.filas);
    if (filasTodas.length > filas.length) avisos.push(`Solo se exportan ${LIMITES.filas} filas de ${filasTodas.length}.`);

    if (!columnas.length) {
        avisos.push("La tabla está vacía: no hay nada que escribir en la hoja.");
    } else {
        const calculadas = columnas.filter((c) => c.tipo.v === "calculado");
        if (calculadas.length) avisos.push(`${calculadas.length} columna(s) calculada(s) se exportan con su valor, no con la fórmula.`);
        const calc = crearCalculadora(t);
        let formulas = 0;
        const values: string[][] = [columnas.map((c) => c.nombre.v)];
        for (const f of filas) {
            values.push(columnas.map((c) => {
                const bruto = textoDeCelda(t, c, f.id, calc);
                if (TIPOS_TEXTO.has(c.tipo.v) && /^[=+\-@]/.test(bruto)) formulas += 1;
                return valorParaHoja(t, c, f.id, calc);
            }));
        }
        if (formulas) avisos.push(`${formulas} celda(s) con fórmula se exportan como texto.`);
        llamadas.push({ herramienta: "write_range", parametros: { range: "A1", values } });
        if (o.encabezadoNegrita !== false) llamadas.push({ herramienta: "format_range", parametros: { range: rangoA1(1, columnas.length), bold: true } });
        const rango = rangoA1(filas.length + 1, columnas.length);
        if (o.tabla && filas.length) llamadas.push({ herramienta: "create_table", parametros: { range: rango, header: true } });
        if (o.grafica && filas.length) llamadas.push({ herramienta: "insert_chart", parametros: { range: rango, type: o.grafica.tipo, title: o.grafica.titulo ?? "" } });
    }
    llamadas.push({ herramienta: "save_workbook", parametros: { path: `salida/${archivo}.xlsx` } });
    return { llamadas, avisos };
}

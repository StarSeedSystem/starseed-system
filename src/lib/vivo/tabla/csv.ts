/**
 * CSV y TSV de la tabla (2026-09-28): importar, exportar y copiar/pegar rangos.
 *
 * · `parseCsv` sigue RFC 4180 (comillas, comillas dobles, saltos de línea dentro de campo) y
 *   adivina el separador (`,` `;` tabulador).
 * · `importarCsv` AÑADE las filas a la tabla: las columnas con el mismo nombre se reutilizan y las
 *   demás se crean con un tipo deducido (número, fecha, casilla, enlace o selección).
 * · `csvDesdeTabla` exporta lo que ve la persona (las columnas calculadas con su resultado).
 *   Un texto que empiece por `=`, `+`, `-` o `@` se exporta con un apóstrofo delante para que
 *   Excel/Sheets no lo ejecuten como fórmula; al importar, ese apóstrofo se retira.
 */
import { crearCalculadora, textoCalculado, type Calculadora } from "./formulas";
import {
    LIMITES,
    claveCelda,
    columnasVisibles,
    estaVacio,
    fechaDesdeTexto,
    filasVisibles,
    nombreDeOpcion,
    normalizarNombre,
    numeroDesdeTexto,
    numeroParaEditar,
    sanearNombreColumna,
    type Columna,
    type Ctx,
    type Tabla,
    type TipoColumna,
    type ValorCelda,
} from "./modelo";
import {
    aplicarCeldas,
    anadirColumna,
    anadirFilasAlFinal,
    anadirOpcion,
    coaccionarTexto,
    nombreLibre,
    type CambioCelda,
} from "./operaciones";

// ───────────────────────────── lectura ─────────────────────────────

export type Delimitador = "," | ";" | "\t";

/** Adivina el separador mirando la primera línea (fuera de comillas). */
export function detectarDelimitador(texto: string): Delimitador {
    const cuenta: Record<Delimitador, number> = { ",": 0, ";": 0, "\t": 0 };
    let entre = false;
    for (let i = 0; i < texto.length && i < 20_000; i++) {
        const ch = texto[i];
        if (ch === '"') entre = !entre;
        else if (!entre) {
            if (ch === "\n" || ch === "\r") break;
            if (ch in cuenta) cuenta[ch as Delimitador] += 1;
        }
    }
    if (cuenta["\t"] > 0 && cuenta["\t"] >= cuenta[";"] && cuenta["\t"] >= cuenta[","]) return "\t";
    if (cuenta[";"] > cuenta[","]) return ";";
    return ",";
}

/** Texto → filas de campos. Quita el BOM y la última línea vacía. */
export function parseCsv(entrada: string, delimitador?: Delimitador): string[][] {
    const texto = entrada.charCodeAt(0) === 0xfeff ? entrada.slice(1) : entrada;
    const d = delimitador ?? detectarDelimitador(texto);
    const filas: string[][] = [];
    let fila: string[] = [];
    let campo = "";
    let entre = false;
    let hayAlgo = false;
    for (let i = 0; i < texto.length; i++) {
        const ch = texto[i];
        if (entre) {
            if (ch === '"') {
                if (texto[i + 1] === '"') {
                    campo += '"';
                    i += 1;
                } else entre = false;
            } else campo += ch;
            continue;
        }
        if (ch === '"' && campo === "") {
            entre = true;
            hayAlgo = true;
        } else if (ch === d) {
            fila.push(campo);
            campo = "";
            hayAlgo = true;
        } else if (ch === "\n" || ch === "\r") {
            if (ch === "\r" && texto[i + 1] === "\n") i += 1;
            fila.push(campo);
            filas.push(fila);
            fila = [];
            campo = "";
            hayAlgo = false;
        } else {
            campo += ch;
            hayAlgo = true;
        }
    }
    if (hayAlgo || campo !== "" || fila.length) {
        fila.push(campo);
        filas.push(fila);
    }
    return filas;
}

/** Retira el apóstrofo de protección que pone la exportación. */
function desproteger(s: string): string {
    return /^'[=+\-@]/.test(s) ? s.slice(1) : s;
}

// ───────────────────────────── deducción de tipos ─────────────────────────────

const SI_NO = new Set(["sí", "si", "no", "true", "false", "verdadero", "falso"]);

export function inferirTipo(valores: readonly string[]): TipoColumna {
    const llenos = valores.map((v) => v.trim()).filter((v) => v !== "");
    if (!llenos.length) return "texto";
    if (llenos.every((v) => SI_NO.has(v.toLowerCase()))) return "casilla";
    if (llenos.every((v) => fechaDesdeTexto(v) !== null)) return "fecha";
    if (llenos.every((v) => /^https?:\/\/\S+$/i.test(v))) return "enlace";
    const numeros = llenos.every((v) => !/^0\d/.test(v) && v.replace(/[^\d]/g, "").length <= 15 && numeroDesdeTexto(v) !== null);
    if (numeros) return "numero";
    const distintos = new Set(llenos.map((v) => normalizarNombre(v)));
    if (distintos.size >= 2 && distintos.size <= 10 && llenos.length >= distintos.size * 2) return "seleccion";
    return "texto";
}

// ───────────────────────────── importar ─────────────────────────────

export interface ResultadoImportar {
    tabla: Tabla;
    filasAnadidas: number;
    columnasNuevas: number;
    avisos: string[];
}

export const MAX_BYTES_IMPORTAR = 4_000_000;

/**
 * Añade el contenido de un CSV. La primera fila son los títulos. Las columnas con el mismo
 * nombre (sin importar mayúsculas ni tildes) se reutilizan; las demás se crean.
 */
export function importarCsv(t: Tabla, texto: string, c: Ctx, delimitador?: Delimitador): ResultadoImportar {
    const avisos: string[] = [];
    if (texto.length > MAX_BYTES_IMPORTAR) return { tabla: t, filasAnadidas: 0, columnasNuevas: 0, avisos: ["El archivo es demasiado grande (máximo unos 4 MB)."] };
    const matriz = parseCsv(texto, delimitador).filter((f) => f.some((x) => x.trim() !== ""));
    if (matriz.length < 1) return { tabla: t, filasAnadidas: 0, columnasNuevas: 0, avisos: ["El archivo está vacío."] };

    const cabecera = matriz[0];
    const datos = matriz.slice(1);
    let tabla = t;

    // 1 · columnas: reutilizar o crear (con el tipo deducido de sus valores)
    const vivas = columnasVisibles(tabla).filter((x) => x.tipo.v !== "calculado");
    const usadas = new Set<string>();
    const destino: (string | null)[] = [];
    let columnasNuevas = 0;
    for (let j = 0; j < cabecera.length; j++) {
        const nombre = sanearNombreColumna(desproteger(cabecera[j] ?? ""));
        const hit = nombre ? vivas.find((x) => !usadas.has(x.id) && normalizarNombre(x.nombre.v) === normalizarNombre(nombre)) : undefined;
        if (hit) {
            usadas.add(hit.id);
            destino.push(hit.id);
            continue;
        }
        const valores = datos.map((f) => desproteger(f[j] ?? ""));
        if (valores.every((v) => v.trim() === "") && !nombre) {
            destino.push(null);
            continue;
        }
        const r = anadirColumna(tabla, c, { nombre: nombre || nombreLibre(tabla), tipo: inferirTipo(valores) });
        if (!r.colId) {
            avisos.push(`No cupieron todas las columnas (máximo ${LIMITES.columnas}).`);
            destino.push(null);
            continue;
        }
        tabla = r.tabla;
        columnasNuevas += 1;
        destino.push(r.colId);
    }

    // 2 · filas
    const r = anadirFilasAlFinal(tabla, datos.length, c);
    tabla = r.tabla;
    if (r.filaIds.length < datos.length) avisos.push(`Solo se importaron ${r.filaIds.length} de ${datos.length} filas (máximo ${LIMITES.filas}).`);

    // 3 · valores
    const cambios: CambioCelda[] = [];
    let noValidas = 0;
    r.filaIds.forEach((filaId, i) => {
        const fila = datos[i];
        destino.forEach((colId, j) => {
            if (!colId) return;
            const bruto = desproteger(fila[j] ?? "");
            if (bruto.trim() === "") return;
            const col = tabla.columnas[colId];
            let valor = coaccionarTexto(col, bruto);
            if (valor === undefined && col.tipo.v === "seleccion") {
                const o = anadirOpcion(tabla, colId, bruto, c);
                tabla = o.tabla;
                valor = o.opcionId ?? undefined;
            }
            if (valor === undefined) {
                noValidas += 1;
                return;
            }
            cambios.push({ filaId, colId, valor });
        });
    });
    if (noValidas) avisos.push(`${noValidas} celda${noValidas === 1 ? "" : "s"} no se pudieron leer para el tipo de su columna y quedaron vacías.`);
    tabla = aplicarCeldas(tabla, cambios, c);
    return { tabla, filasAnadidas: r.filaIds.length, columnasNuevas, avisos };
}

// ───────────────────────────── exportar / copiar ─────────────────────────────

export interface OpcionesTexto {
    /** Filas a incluir (por defecto todas las vivas, en orden compartido). */
    filaIds?: readonly string[];
    /** Columnas a incluir (por defecto todas las vivas). */
    colIds?: readonly string[];
    /** Nombre visible de una cuenta (columnas «Persona»). */
    nombrePersona?: (uid: string) => string | null;
    calc?: Calculadora;
    /** Separador decimal de los números: «.» en el CSV con comas; «,» en el TSV y el CSV de Excel en español. */
    decimal?: "," | ".";
}

/** El valor de una celda como texto plano (lo que se copia y se exporta). */
export function textoDeCelda(
    t: Tabla,
    col: Columna,
    filaId: string,
    calc: Calculadora,
    nombrePersona?: (uid: string) => string | null,
    decimal: "," | "." = ".",
): string {
    const tipo = col.tipo.v;
    const num = (n: number): string => (decimal === "," ? numeroParaEditar(n) : String(n));
    if (tipo === "calculado") {
        const v = calc.calculada(filaId, col.id);
        if (!v) return "";
        return v.ok ? num(v.n) : textoCalculado(v);
    }
    const v: ValorCelda = t.celdas[claveCelda(filaId, col.id)]?.v ?? null;
    if (estaVacio(v)) return "";
    if (tipo === "casilla") return v === true ? "Sí" : v === false ? "No" : "";
    if (tipo === "seleccion") return nombreDeOpcion(col, v) ?? "";
    if (tipo === "persona") return typeof v === "string" ? nombrePersona?.(v) ?? v : "";
    if (tipo === "numero" && typeof v === "number") return num(v);
    return String(v);
}

function escaparCsv(valor: string, d: string, esTexto: boolean): string {
    let s = valor;
    if (esTexto && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    if (s.includes(d) || s.includes('"') || s.includes("\n") || s.includes("\r")) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

/** Tabla → CSV (con títulos). `separador` por defecto coma. */
export function csvDesdeTabla(t: Tabla, opc: OpcionesTexto & { separador?: Delimitador } = {}): string {
    const d = opc.separador ?? ",";
    const decimal = opc.decimal ?? (d === "," ? "." : ",");
    const cols = opc.colIds ? opc.colIds.map((id) => t.columnas[id]).filter(Boolean) : columnasVisibles(t);
    const filas = opc.filaIds ?? filasVisibles(t).map((f) => f.id);
    const calc = opc.calc ?? crearCalculadora(t);
    const lineas: string[] = [cols.map((c) => escaparCsv(c.nombre.v, d, true)).join(d)];
    for (const f of filas) {
        lineas.push(
            cols
                .map((c) => escaparCsv(textoDeCelda(t, c, f, calc, opc.nombrePersona, decimal), d, c.tipo.v === "texto" || c.tipo.v === "enlace" || c.tipo.v === "seleccion" || c.tipo.v === "persona"))
                .join(d),
        );
    }
    return lineas.join("\r\n") + "\r\n";
}

/** Rango → TSV para el portapapeles (sin títulos). Comillas si hay tabulador, salto o comilla. */
export function tsvDesdeRango(t: Tabla, filaIds: readonly string[], colIds: readonly string[], opc: OpcionesTexto = {}): string {
    const calc = opc.calc ?? crearCalculadora(t);
    const cols = colIds.map((id) => t.columnas[id]).filter(Boolean);
    return filaIds
        .map((f) =>
            cols
                .map((c) => {
                    const s = textoDeCelda(t, c, f, calc, opc.nombrePersona, opc.decimal ?? ",");
                    return /[\t\r\n"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
                })
                .join("\t"),
        )
        .join("\n");
}

/** Portapapeles (TSV) → matriz de texto. */
export function matrizDesdeTsv(texto: string): string[][] {
    const limpio = texto.replace(/\r\n/g, "\n").replace(/\n+$/, "");
    if (limpio === "") return [[""]];
    return parseCsv(limpio, "\t");
}

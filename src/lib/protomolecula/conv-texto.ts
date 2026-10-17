// Conversores reales de texto para la Protomolécula: CSV↔JSON (RFC 4180) y SRT↔VTT.
// Módulo puro: sin red, sin disco y sin librerías. Tolera BOM y finales de línea mixtos.
import type { ConversorDef } from "./convertidores";

type Entrada = Uint8Array | string;
type FilaCsv = { campos: string[]; linea: number };

/** Texto UTF-8 sin BOM, venga como cadena o como bytes. */
export function comoTexto(entrada: Entrada): string {
  const texto = typeof entrada === "string" ? entrada : new TextDecoder("utf-8").decode(entrada);
  return texto.replace(/^\uFEFF/, "");
}

/** Filas de un CSV (RFC 4180) con la línea física donde empieza cada una; las líneas en blanco no cuentan. */
function leerCsv(texto: string): FilaCsv[] {
  const filas: FilaCsv[] = [];
  let campos: string[] = [], campo = "", entre = false, citado = false, linea = 1, inicio = 1;
  const cerrarFila = () => {
    campos.push(campo);
    if (campos.length > 1 || campo !== "" || citado) filas.push({ campos, linea: inicio });
    campos = []; campo = ""; citado = false;
  };
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entre) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') entre = false;
      else { if (c === "\n" || (c === "\r" && texto[i + 1] !== "\n")) linea++; campo += c; }
    } else if (c === '"' && campo === "") { entre = true; citado = true; }
    else if (c === ",") { campos.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      cerrarFila(); linea++; inicio = linea;
    } else campo += c;
  }
  if (entre) throw new Error(`CSV con comillas sin cerrar (fila que empieza en la línea ${inicio}).`);
  if (campos.length > 0 || campo !== "" || citado) cerrarFila();
  return filas;
}

/** CSV → JSON: la primera fila son las claves; los valores quedan como texto, sin adivinar tipos. */
export function csvAJson(entrada: Entrada): string {
  const [cabecera, ...resto] = leerCsv(comoTexto(entrada));
  if (!cabecera) return "[]";
  const claves = cabecera.campos;
  const repetida = claves.find((k, i) => claves.indexOf(k) !== i);
  if (repetida !== undefined) throw new Error(`La cabecera del CSV repite la columna «${repetida}».`);
  const registros = resto.map(({ campos, linea }) => {
    const n = campos.length;
    if (n !== claves.length) throw new Error(`La fila de la línea ${linea} tiene ${n} columna${n === 1 ? "" : "s"} y la cabecera ${claves.length}.`);
    return Object.fromEntries(claves.map((k, i) => [k, campos[i]]));
  });
  return JSON.stringify(registros, null, 2);
}

const citarCsv = (v: string): string => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const esObjeto = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
function valorPlano(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") throw new Error("JSON demasiado anidado para CSV.");
  return String(v);
}
/** JSON (array de objetos planos) → CSV; claves en orden de primera aparición y saltos CRLF (RFC 4180). */
export function jsonACsv(entrada: Entrada): string {
  const texto = comoTexto(entrada).trim();
  if (texto === "") return "";
  let datos: unknown;
  try { datos = JSON.parse(texto); } catch { throw new Error("El texto no es un JSON válido."); }
  if (!Array.isArray(datos)) throw new Error("El JSON para CSV debe ser un array de objetos.");
  const filas = (datos as unknown[]).map((f) => {
    if (!esObjeto(f)) throw new Error("Cada elemento del array debe ser un objeto para pasarlo a CSV.");
    return f;
  });
  const claves = [...new Set(filas.flatMap((f) => Object.keys(f)))];
  if (claves.length === 0) return "";
  const unir = (vs: string[]): string => vs.map(citarCsv).join(",") || '""'; // 1 columna vacía ≠ línea en blanco
  const lineas = filas.map((f) => unir(claves.map((k) => valorPlano(f[k]))));
  return [unir(claves), ...lineas].join("\r\n") + "\r\n";
}

/** Bloques de subtítulos separados por líneas en blanco, con los saltos ya unificados a LF. */
const bloques = (entrada: Entrada): string[][] =>
  comoTexto(entrada).replace(/\r\n?/g, "\n").trim().split(/\n[ \t]*\n\s*/)
    .filter((b) => b.trim() !== "").map((b) => b.split("\n"));
function marca(t: string, aSrt: boolean): string {
  const m = /^(?:(\d+):)?([0-5]?\d):([0-5]?\d)[.,](\d{1,3})$/.exec(t);
  if (!m) throw new Error(`Marca de tiempo no válida: «${t}».`);
  const [h = "0", mi, s, ms] = m.slice(1);
  return `${h.padStart(2, "0")}:${mi.padStart(2, "0")}:${s.padStart(2, "0")}${aSrt ? "," : "."}${ms.padEnd(3, "0")}`;
}

/** Un bloque: descarta el identificador, rehace la línea de tiempos (sin ajustes) y conserva el texto. */
function cue(lineas: string[], n: number, aSrt: boolean): string[] {
  const t = lineas.findIndex((l) => l.includes("-->"));
  const m = t < 0 ? null : /^\s*(\S+?)\s*-->\s*(\S+)/.exec(lineas[t]);
  if (!m) throw new Error(`El bloque ${n} de los subtítulos no tiene una línea de tiempos válida.`);
  return [`${marca(m[1], aSrt)} --> ${marca(m[2], aSrt)}`, ...lineas.slice(t + 1)];
}

/** SRT → WebVTT: cabecera WEBVTT y coma → punto en los tiempos. */
export function srtAVtt(entrada: Entrada): string {
  const cues = bloques(entrada).map((b, i) => cue(b, i + 1, false).join("\n"));
  return ["WEBVTT", ...cues].join("\n\n") + "\n";
}

/** WebVTT → SRT: quita la cabecera, las notas y los estilos; numera los bloques; punto → coma. */
export function vttASrt(entrada: Entrada): string {
  const utiles = bloques(entrada)
    .filter((b, i) => !(i === 0 && /^WEBVTT/.test(b[0])) && !/^(NOTE|STYLE|REGION)(\s|$)/.test(b[0]));
  const cues = utiles.map((b, i) => [String(i + 1), ...cue(b, i + 1, true)].join("\n"));
  return cues.length === 0 ? "" : cues.join("\n\n") + "\n";
}

const def = (de: string, a: string, convertir: (e: Entrada) => string): ConversorDef =>
  ({ de, a, via: "js", costo: 1, nombre: `${de}-a-${a}`, convertir });
/** Conversores de texto listos para `registrarConversor` (los registra `convertidores-base.ts`, tarea F2D). */
export const CONVERSORES_TEXTO: ConversorDef[] = [
  def("csv", "json", csvAJson), def("json", "csv", jsonACsv),
  def("srt", "vtt", srtAVtt), def("vtt", "srt", vttASrt),
];

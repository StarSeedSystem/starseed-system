// src/lib/variaciones/sugerir-astraura.ts — Sugerencias de variaciones con Astraura
// (contrato: architecture/variaciones-publicas.md §4; escalera: genesis-conectores-abiertos.md §2).
// Puro: el enrutador de Astraura (escalera local primero) y el ADN del contexto llegan inyectados;
// sin red, sin disco y sin DOM, para probarlo con un modelo falso y cablear la ventana con calma.

import { leerClave } from "./clave-elemento";
import { validarVariacion } from "./validar";

/** Cuántas variaciones se piden y se devuelven como máximo. */
export const NUMERO_SUGERENCIAS = 3;
/** Escalera de genesis-conectores-abiertos.md §2: local más potente primero, pago al final. */
export const ESCALERA_LOCAL_PRIMERO = ["neuronas-cuenta", "modelos-locales", "malla", "contenedores", "proveedores-gratis", "pago"];

/** Una prueba del registro del ADN (memory/diseno/adn/esquema.json: id, comprobación, auto). */
export interface PruebaAdn { id: string; comprobacion: string; auto?: boolean }
/** El ADN inyectado del contexto: el registro cuyo slug encaja con el ámbito del elemento. */
export interface AdnInyectado { slug: string; pruebas: PruebaAdn[] }
export interface PeticionAstraura {
  clave: string; contexto: string; familia: string; payloadActual: unknown;
  cantidad: number; peldanos: string[];
}
export interface SugerenciaAstraura { titulo: string; payload: unknown; nota?: string }
/** Respuesta del enrutador; `fuente` nombra el peldaño que respondió (astraura-158-local…). */
export interface RespuestaAstraura { fuente: string; sugerencias: SugerenciaAstraura[] }
export type EnrutadorAstraura = (peticion: PeticionAstraura) => Promise<RespuestaAstraura>;
export interface VeredictoPruebas { pasadas: string[]; falladas: string[]; sinVerificar: string[] }
export interface SugerenciaVariacion { titulo: string; payload: unknown; motivo: string; fuente: string; requiereAislamiento: boolean; pruebas: VeredictoPruebas }
export interface DescarteSugerencia { titulo: string; motivo: string }
export interface DepsSugerir {
  enrutar: EnrutadorAstraura; payloadActual: unknown; adn: AdnInyectado[];
  /** La familia declara que su variación es código: solo se abrirá aislada (contrato §4). */
  codigo?: boolean;
}
export interface ResultadoSugerencias { sugerencias: SugerenciaVariacion[]; fuente: string | null; descartes: DescarteSugerencia[]; motivos: string[] }

/** Veredicto de una prueba del ADN sobre un payload. */
type Veredicto = "pasa" | "falla" | "sinVerificar";
/** Minúsculas y sin acentos, para comparar claves y comprobaciones sin pelear con tildes. */
const normalizar = (t: string): string => t.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();
/** Números que trae un valor: directo o dentro de un texto con unidad («0.85rem»). */
const numerosDe = (valor: unknown): number[] =>
  typeof valor === "number" && Number.isFinite(valor) ? [valor]
    : typeof valor === "string" ? [...valor.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0])) : [];
/** ¿Aparece el texto prohibido serializado en el payload? */
const contieneTexto = (payload: unknown, token: string): boolean => {
  try { return normalizar(JSON.stringify(payload)).includes(token); } catch { return false; }
};
/** ¿La clave del payload (normalizada) es la que menciona la comprobación? En campos de varias
 *  palabras solo encaja la clave exacta; en un campo suelto basta que una contenga a la otra. */
const claveEncaja = (clave: string, campo: string): boolean =>
  clave.length >= 3 && (clave === campo || campo.startsWith(clave + " ")
    || (!campo.includes(" ") && (clave.includes(campo) || campo.includes(clave))));

/** Ronda el payload y junta los números que viven bajo claves que encajan con el campo. */
const guardarValores = (valor: unknown, clave: string, campo: string, salida: number[], vistos: Set<object>): void => {
  if (valor === null || typeof valor !== "object") {
    if (claveEncaja(clave, campo)) salida.push(...numerosDe(valor));
    return;
  }
  if (vistos.has(valor)) return;
  vistos.add(valor);
  if (Array.isArray(valor)) {
    for (const hijo of valor) guardarValores(hijo, clave, campo, salida, vistos);
    vistos.delete(valor);
    return;
  }
  for (const [k, hijo] of Object.entries(valor as Record<string, unknown>)) guardarValores(hijo, k, campo, salida, vistos);
  vistos.delete(valor);
};

/** Cumplimiento de una comparación numérica, por operador («-» es rango entre a y b). */
const CUMPLE: Record<string, (v: number, a: number, b: number) => boolean> = {
  ">=": (v, a) => v >= a, "<=": (v, a) => v <= a, ">": (v, a) => v > a, "<": (v, a) => v < a,
  "-": (v, a, b) => v >= a && v <= b, "=": (v, a) => Math.abs(v - a) < 1e-9,
};

/** Tres formas de comprobación del ADN: prohibición («sin WebGL»), comparación («contraste
 *  >=4.5:1», «oro <20%») e igualdad o rango bajo la clave del campo («radio 0.85rem»). Si el
 *  payload no menciona la clave, la regla no se aplica; lo indescifrable queda sin verificar: */
export function evaluarPruebaAdn(comprobacion: string, payload: unknown): Veredicto {
  const texto = normalizar(comprobacion);
  const prohibicion = texto.match(/^(?:sin|no) ([a-z0-9 -]+)$/);
  if (prohibicion) return contieneTexto(payload, prohibicion[1]) ? "falla" : "pasa";
  const m = texto.match(/^([\w/-]+(?: [\w/-]+)?) (>=|<=|<|>) (\d+(?:\.\d+)?)\b/)
    ?? texto.match(/^([\w/-]+) (\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\b/)
    ?? texto.match(/^([\w/-]+) (\d+(?:\.\d+)?)\b/);
  if (!m) return "sinVerificar";
  const comparada = /^(?:>=|<=|<|>)$/.test(m[2] ?? "");
  const regla = { campo: m[1], op: comparada ? (m[2] as string) : m[3] !== undefined ? "-" : "=", a: Number(comparada ? m[3] : m[2]), b: Number(m[3] ?? m[2]) };
  const valores: number[] = [];
  guardarValores(payload, "", regla.campo, valores, new Set<object>());
  if (!valores.length) return "pasa";
  return valores.every((v) => CUMPLE[regla.op](v, regla.a, regla.b)) ? "pasa" : "falla";
}

/** Aplica las pruebas del ADN a un payload: solo las automáticas se miden aquí; las demás quedan anotadas. */
export function comprobarPruebas(payload: unknown, adn: AdnInyectado | null): VeredictoPruebas {
  const veredicto: VeredictoPruebas = { pasadas: [], falladas: [], sinVerificar: [] };
  for (const prueba of adn?.pruebas ?? []) {
    if (prueba.auto !== true) { veredicto.sinVerificar.push(prueba.id); continue; }
    if (evaluarPruebaAdn(prueba.comprobacion, payload) === "falla") veredicto.falladas.push(prueba.id);
    else veredicto.pasadas.push(prueba.id);
  }
  return veredicto;
}

/** El ADN del contexto: el registro cuyo slug nombra el ámbito (con o sin acentos). */
export const elegirAdn = (contexto: string, adn: AdnInyectado[]): AdnInyectado | null =>
  adn.find((registro) => normalizar(contexto).includes(normalizar(registro.slug))) ?? null;

/** Aprueba una sugerencia: validador del OS, pruebas del ADN y motivo; si algo no pasa, va a
 *  `descartes` con su razón, para que la ventana lo cuente. */
function aprobarSugerencia(res: ResultadoSugerencias, s: SugerenciaAstraura, adn: AdnInyectado | null, codigo: boolean): void {
  const titulo = (s.titulo ?? "").trim().slice(0, 200) || "Sugerencia de Astraura";
  const validacion = validarVariacion(s.payload, { codigo });
  const pruebas = comprobarPruebas(s.payload, adn);
  const descarte = !validacion.ok ? `Validador: ${validacion.motivos[0] ?? "payload no admitido"}`
    : pruebas.falladas.length ? `ADN «${adn?.slug || "sin contexto"}»: falla ${pruebas.falladas.join(" y ")}` : "";
  if (descarte) { res.descartes.push({ titulo, motivo: descarte }); return; }
  const raiz = adn ? `y las pruebas del ADN «${adn.slug}»` : "sin ADN del contexto que comprobar";
  res.sugerencias.push({
    titulo, payload: s.payload, fuente: String(res.fuente),
    motivo: `Astraura (${res.fuente}): pasa el validador ${raiz}${s.nota ? ". Nota: " + s.nota : ""}`,
    requiereAislamiento: validacion.requiereAislamiento, pruebas,
  });
}

/** Pide al enrutador de Astraura (escalera local primero) 3 variaciones del payload capturado y
 *  devuelve solo las que pasan el validador del OS y las pruebas del ADN del contexto, con su motivo. */
export async function sugerirVariaciones(clave: string, contexto: string, deps: DepsSugerir): Promise<ResultadoSugerencias> {
  const vacio: ResultadoSugerencias = { sugerencias: [], fuente: null, descartes: [], motivos: [] };
  if (!leerClave(clave)) return { ...vacio, motivos: [`Clave: «${clave}» no es una clave de elemento válida`] };
  const adn = elegirAdn(contexto, deps.adn);
  const peticion: PeticionAstraura = {
    clave, contexto, familia: clave.split(":")[0], payloadActual: deps.payloadActual,
    cantidad: NUMERO_SUGERENCIAS, peldanos: [...ESCALERA_LOCAL_PRIMERO],
  };
  try {
    const respuesta = await deps.enrutar(peticion);
    const res: ResultadoSugerencias = { ...vacio, fuente: respuesta.fuente || "astraura" };
    for (const s of (respuesta.sugerencias ?? []).slice(0, NUMERO_SUGERENCIAS)) aprobarSugerencia(res, s, adn, deps.codigo === true);
    if (!res.sugerencias.length && !res.descartes.length) res.motivos.push(`Astraura (${res.fuente}): no devolvió sugerencias`);
    return res;
  } catch (error) {
    return { ...vacio, motivos: ["Astraura: " + (error instanceof Error ? error.message : "sin respuesta")] };
  }
}

/**
 * Protomolécula · CANDIDATOS DE CÓDIGO (PM1010F7A, contrato §8.2).
 * Módulo PURO: sin React, red ni `node:*`. Una IA PROPONE; aceptar es de la mano.
 * Aquí no se ejecuta nada: `proponer` solo guarda el texto y `aceptar` cambia la
 * capa de código de UNA molécula, nunca un archivo ni el núcleo.
 */
import { decidir } from "./permisos";
import type { Autor, Capa, Molecula, Origen, Rol } from "./tipos";

export interface Candidato {
  id: string; capaId: string; lenguajeOrigen: string; lenguajeDestino?: string;
  propuesto: string; original: string; autor: Autor;
  estado: "propuesto" | "aceptado" | "rechazado"; avisos: string[];
}
export type TipoLinea = "igual" | "cambio" | "añadida" | "borrada";
export interface LineaDiff { tipo: TipoLinea; texto: string; nuevo?: string; linea?: number }
/** Una capa `codigo` lleva su texto propio; `tipos.ts#Capa` no lo declara (§3.1: sin referencia, contenido propio). */
type CapaConCodigo = Capa & { contenido?: string };
export interface EntradaPropuesta {
  capaId: string; lenguajeOrigen: string; lenguajeDestino?: string;
  propuesto: string; original: string; autor: Autor;
}
export type ResultadoPropuesta = { ok: true; candidato: Candidato } | { ok: false; motivo: string };
export interface ContextoAceptar { molecula: Molecula; rol: Rol | null; origen: Origen; ahora?: number }
export type ResultadoAceptar =
  | { ok: true; molecula: Molecula; candidato: Candidato; motivo: string }
  | { ok: false; motivo: string };
const ocultar = (s: string): string => `${s.slice(0, 4)}…(${s.length} caracteres)`;
const esNucleo = (s: string): boolean => /(^|[/\\])nucleo([/\\]|$)|invariantes/i.test(s);
const SECRETOS: readonly [RegExp, string][] = [
  [/\bsk-[A-Za-z0-9_-]{4,}/, "clave con forma «sk-»"],
  [/\bgsk_[A-Za-z0-9_-]{4,}/, "clave con forma «gsk_»"],
  [/\bBearer\s+[A-Za-z0-9._~+/-]{6,}/i, "cabecera «Bearer»"],
  [/\bghp_[A-Za-z0-9_]{6,}|\bgithub_pat_[A-Za-z0-9_]{6,}/, "token de GitHub"],
  [/\bAKIA[0-9A-Z]{8,}/, "clave de AWS"],
  [/\/Users\/[^/"\s]+/, "ruta de disco «/Users/…»"],
  [/\/home\/[^/"\s]+/, "ruta de disco «/home/…»"],
  [/[A-Z]:\\Users\\[^\\\s]+/i, "ruta de disco «C:\\Users\\…»"],
];
const PELIGROS: readonly [RegExp, string][] = [
  [/\beval\s*\(/, "usa eval"],
  [/\bnew\s+Function\s*\(/, "usa new Function"],
  [/\bimport\s*\(/, "usa import() dinámico"],
  [/\brequire\s*\(/, "usa require()"],
  [/\bnode:/, "importa node:*"],
];
const analizar = (t: string): string[] => {
  const avisos: string[] = [];
  for (const [re, que] of SECRETOS) { const m = re.exec(t); if (m) avisos.push(`secreto: ${que} «${ocultar(m[0])}»`); }
  for (const [re, que] of PELIGROS) if (re.test(t)) avisos.push(`riesgo: ${que}`);
  return avisos;
};
const esAvisoDeSecreto = (a: string): boolean => a.startsWith("secreto:");
/** ¿El candidato lleva un secreto? Entonces no se puede aceptar: hay que quitarlo y volver a proponer. */
export const bloqueaAceptacion = (c: Candidato): boolean => revisar(c).avisos.some(esAvisoDeSecreto);
export function revisar(c: Candidato): Candidato {
  const avisos = [...new Set([...analizar(c.original), ...analizar(c.propuesto)])];
  return { ...c, avisos };
}
const cola: Candidato[] = [];
let secuencia = 0;
export const candidatosDeCodigo = (): readonly Candidato[] => [...cola];
/** Solo para pruebas y para vaciar la cola al cerrar la sesión. */
export function reiniciarCandidatos(): void { cola.length = 0; secuencia = 0; }
export function tomarCandidato(id: string): Candidato | null { const i = cola.findIndex((c) => c.id === id); return i < 0 ? null : cola.splice(i, 1)[0]; }
export function rechazarCandidato(id: string): boolean { const c = cola.find((x) => x.id === id); if (!c) return false; c.estado = "rechazado"; return true; }
/** Guarda el candidato SIN ejecutarlo ni tocar la capa: la aceptación es otra puerta, la de la mano. */
export function proponer(e: EntradaPropuesta, deps: { nuevoId?: () => string } = {}): ResultadoPropuesta {
  const capaId = e.capaId.trim();
  if (!capaId) return { ok: false, motivo: "Falta «capa»: un candidato va sobre la capa de código de una molécula, nunca sobre un archivo." };
  if (!e.propuesto.trim()) return { ok: false, motivo: "Falta «propuesto»: el texto del candidato está vacío." };
  if (esNucleo(capaId)) return { ok: false, motivo: "El núcleo es intocable: ni se propone sobre «nucleo/*» ni sobre «invariantes»." };
  const candidato = revisar({ id: deps.nuevoId ? deps.nuevoId() : `cand-${(++secuencia).toString(36)}`,
    capaId, lenguajeOrigen: e.lenguajeOrigen.trim() || "texto", lenguajeDestino: e.lenguajeDestino?.trim() || undefined,
    propuesto: e.propuesto, original: e.original, autor: e.autor, estado: "propuesto", avisos: [] });
  cola.push(candidato);
  return { ok: true, candidato };
}
const lineas = (s: string): string[] => (s === "" ? [] : s.replace(/\r\n/g, "\n").split("\n"));
/** Diff línea a línea (LCS, sin librerías): igual, cambio, añadida o borrada. */
export function diff(original: string, propuesto: string): LineaDiff[] {
  const a = lineas(original), b = lineas(propuesto), n = a.length, m = b.length;
  const t: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const bruto: LineaDiff[] = []; let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { bruto.push({ tipo: "igual", texto: a[i], linea: i + 1 }); i++; j++; }
    else if (t[i + 1][j] >= t[i][j + 1]) { bruto.push({ tipo: "borrada", texto: a[i], linea: ++i }); }
    else { bruto.push({ tipo: "añadida", texto: b[j], linea: ++j }); }
  }
  while (i < n) bruto.push({ tipo: "borrada", texto: a[i], linea: ++i });
  while (j < m) bruto.push({ tipo: "añadida", texto: b[j], linea: ++j });
  const salida: LineaDiff[] = [];
  for (let k = 0; k < bruto.length; k++) {
    const x = bruto[k], y = bruto[k + 1];
    if (x.tipo === "borrada" && y?.tipo === "añadida") { salida.push({ tipo: "cambio", texto: x.texto, nuevo: y.texto, linea: x.linea }); k++; } else salida.push(x);
  }
  return salida;
}
const no = (motivo: string): ResultadoAceptar => ({ ok: false, motivo });
/** Aceptar es SIEMPRE de la mano: ni una IA ni un agente. Y solo toca una capa `codigo` de la molécula. */
export function aceptar(c: Candidato, ctx: ContextoAceptar): ResultadoAceptar {
  if (ctx.origen !== "mano") return no("Solo una persona, con la mano y tras leerlo, acepta un candidato. Una IA o un agente no pueden.");
  const r = revisar(c);
  if (r.avisos.some(esAvisoDeSecreto)) return no("No se aceptó: el candidato contiene un secreto. Quítalo y vuelve a proponerlo.");
  if (r.estado === "aceptado") return no("Este candidato ya se aceptó antes.");
  const capa = ctx.molecula.capas.find((x) => x.id === c.capaId);
  if (!capa) return no(`No hay ninguna capa «${c.capaId}» en esta molécula: un candidato no crea archivos.`);
  if (esNucleo(capa.id) || esNucleo(capa.formato)) return no("El núcleo es intocable: aceptar un candidato no puede tocarlo.");
  if (capa.tipo !== "codigo") return no(`La capa «${capa.id}» es de tipo «${capa.tipo}», no de código: no se acepta aquí.`);
  if (capa.bloqueada) return no(`La capa «${capa.id}» está bloqueada: desbloquéala tú antes de aceptar.`);
  const d = decidir({ rol: ctx.rol, origen: "mano", ambito: ctx.molecula.ambito, accion: "aplicar-codigo" });
  if (!d.permitido) return no(d.motivo);
  const nueva: CapaConCodigo = { ...capa, contenido: c.propuesto };
  const molecula: Molecula = { ...ctx.molecula, capas: ctx.molecula.capas.map((x) => (x.id === c.capaId ? nueva : x)), version: ctx.molecula.version + 1, actualizadaEn: (ctx.ahora ?? Date.now)() };
  const guardado = cola.find((x) => x.id === c.id);
  if (guardado) { guardado.estado = "aceptado"; guardado.avisos = r.avisos; }
  return { ok: true, molecula, candidato: { ...r, estado: "aceptado" }, motivo: "Aplicado a la capa de código de la molécula. Nada se ha ejecutado." };
}

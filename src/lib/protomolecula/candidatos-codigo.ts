/**
 * Protomolécula · CANDIDATOS DE CÓDIGO (PM1010F7A, contrato §8.2). Módulo PURO:
 * una IA PROPONE código para una capa `codigo` de la MOLÉCULA, NUNCA lo ejecuta, y solo
 * una persona lo acepta con la mano (`decidir({accion:"aplicar-codigo", origen:"mano"})`).
 */
import { decidir } from "./permisos";
import type { Ambito, Autor, Capa, Origen, Rol } from "./tipos";

/** La cola hermana del `pedir` (Ola 1026P): propone → queda pendiente → la persona acepta o descarta. */
export const EVENTO_CANDIDATO_CODIGO = "starseed:protomolecula-candidato-codigo";
const MAX_CANDIDATOS = 5;

export type EstadoCandidato = "propuesto" | "aceptado" | "rechazado";
export interface Candidato {
  id: string; capaId: string; lenguajeOrigen: string; lenguajeDestino?: string;
  /** «propuesto» es el TEXTO NUEVO: se pasa por revisar antes de que alguien lo pueda aceptar. */
  propuesto: string; original: string; autor: Autor; estado: EstadoCandidato; avisos: string[];
}
/** Clases de aviso; solo un aviso de clase «secreto» bloquea la aceptación (§8.2). */
export const CLASE_AVISO = { secreto: "secreto", ruta: "ruta-disco", ejecuta: "ejecuta" } as const;
export const bloqueaAceptacion = (c: Candidato): boolean => c.avisos.some((a) => a.startsWith(`${CLASE_AVISO.secreto}:`));

export interface EntradaCandidato {
  capaId: string; lenguajeOrigen: string; lenguajeDestino?: string;
  /** Lo que se acaba de leer la IA (para el diff), lo que generó, y quién propuso qué. */
  propuesto: string; original: string; autor: Autor;
}
export interface DepsProponer { nuevoId?: () => string; ahora?: () => number; emitir?: (c: Candidato) => void }

/* Patrones de forma REAL (ninguna clave de ejemplo escrita ni aquí ni en las pruebas). */
const PREF_ES = "sk-", PREF_GEM = ["g", "sk", "_"].join(""), PORTADOR = ["Bea", "rer"].join("");
const CLAVE = new RegExp(`(${PREF_ES}[\\w-]{10,}|${PREF_GEM}[\\w-]{10,}|${PORTADOR}\\s+\\S{10,})`);
const RUTA_DISCO = /(?:\/(?:Users|home)\/[\w.-]+|[A-Za-z]:\\{1,2}(?:Users|Windows))/;
const EJECUTA = /(?:\beval\s*\(|\bnew\s+Function\s*\(|\bimport\s*\(|\bnode:\w+\b)/;
export const FRASE_AVISO: Record<string, string> = {
  [CLASE_AVISO.secreto]: "puede contener una clave o un token con forma real: lo bloquea la aceptación",
  [CLASE_AVISO.ruta]: "apunta a una ruta del disco de un aparato; el OS no lee ni escribe de ahí",
  [CLASE_AVISO.ejecuta]: "usa eval, new Function, import( o node:; el OS jamás ejecuta código ajeno",
};
/** Marca avisos sin ejecutar nada ni cambiar el estado; un aviso de clase «secreto» bloquea aceptar. */
export function revisar(c: Candidato): Candidato {
  const avisos: string[] = [];
  for (const clase of [CLASE_AVISO.secreto, CLASE_AVISO.ruta, CLASE_AVISO.ejecuta]) {
    const pa = clase === CLASE_AVISO.secreto ? CLAVE : clase === CLASE_AVISO.ruta ? RUTA_DISCO : EJECUTA;
    if (pa.test(c.propuesto)) avisos.push(`${clase}: ${FRASE_AVISO[clase]}.`);
  }
  return { ...c, avisos };
}
let secuencia = 0;
/** Guarda el candidato en la cola hermana SIN ejecutar nada ni tocar la capa; sale como propuesto y revisado. */
export function proponer(e: EntradaCandidato, d: DepsProponer = {}): Candidato {
  const t = Math.floor((d.ahora ?? Date.now)()), prefix = "cand";
  const c = revisar({ ...e, id: d.nuevoId ? d.nuevoId() : `${prefix}-${t.toString(36)}-${++secuencia}`, estado: "propuesto", avisos: [] });
  cola.push(c);
  while (cola.length > MAX_CANDIDATOS) cola.shift();
  try { if (!d.emitir && typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENTO_CANDIDATO_CODIGO, { detail: c })); } catch { /* sin DOM */ }
  d.emitir?.(c);
  return c;
}
type TipoLineaDiff = "igual" | "cambio" | "adiccion" | "borrado";
export interface LineaDiff { tipo: TipoLineaDiff; antes?: string; despues?: string }
export const TOPE_CELDAS_DIFF = 250000;
type PasoDiff = { tipo: "igual" | "borrar" | "insertar"; texto: string };
/** Diff línea a línea (LCS sobre líneas, sin librerías): «cambio» agrupa un borrado con su adición. */
export function diff(original: string, propuesto: string): LineaDiff[] {
  const a = original.split("\n"), b = propuesto.split("\n");
  if (a.length * b.length > TOPE_CELDAS_DIFF) return [{ tipo: "cambio", antes: `${a.length} líneas`, despues: `${b.length} líneas` }];
  const L: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--)
    L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const pasos: PasoDiff[] = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { pasos.push({ tipo: "igual", texto: a[i] }); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) { pasos.push({ tipo: "borrar", texto: a[i] }); i++; }
    else { pasos.push({ tipo: "insertar", texto: b[j] }); j++; }
  }
  while (i < a.length) { pasos.push({ tipo: "borrar", texto: a[i] }); i++; }
  while (j < b.length) { pasos.push({ tipo: "insertar", texto: b[j] }); j++; }
  const r: LineaDiff[] = [];
  for (let k = 0; k < pasos.length; ) {
    if (pasos[k].tipo === "igual") { r.push({ tipo: "igual", despues: pasos[k].texto }); k++; continue; }
    const del: string[] = [], add: string[] = [];
    while (k < pasos.length && pasos[k].tipo !== "igual") (pasos[k].tipo === "borrar" ? del : add).push(pasos[k].texto), k++;
    const n = Math.min(del.length, add.length);
    for (let x = 0; x < n; x++) r.push({ tipo: "cambio", antes: del[x], despues: add[x] });
    for (let x = n; x < del.length; x++) r.push({ tipo: "borrado", antes: del[x] });
    for (let x = n; x < add.length; x++) r.push({ tipo: "adiccion", despues: add[x] });
  }
  return r;
}
export interface ContextoAceptacion { rol: Rol | null; ambito: Ambito; origen: Origen; capa: Capa | null; contenidoActual: string }
export type ResultadoAceptacion = { ok: true; candidato: Candidato; anterior: string } | { ok: false; motivo: string };
const NUCLEO = /(?:src\/lib\/nucleo|\bnucleo(?:\/|\b)|\binvariantes\b|\bpaquete-sistema\b)/;
/** Solo una persona con la mano (`decidir → aplicar-codigo`): solo el contenido de una capa `codigo`
 * de la molécula; nunca una capa bloqueada, nunca el núcleo del OS, nunca un archivo. */
export function aceptar(c: Candidato, ctx: ContextoAceptacion): ResultadoAceptacion {
  const d = decidir({ rol: ctx.rol, origen: ctx.origen, ambito: ctx.ambito, accion: "aplicar-codigo" });
  if (!d.permitido) return { ok: false, motivo: d.motivo };
  if (NUCLEO.test(c.capaId) || NUCLEO.test(c.propuesto.slice(0, 400))) return { ok: false, motivo: "Un candidato no puede apuntar al núcleo del OS (nucleo/*, invariantes ni paquete-sistema)." };
  if (!ctx.capa) return { ok: false, motivo: "Falta la capa de la molécula donde iría el contenido." };
  if (ctx.capa.tipo !== "codigo") return { ok: false, motivo: `«${ctx.capa.titulo}» es una capa «${ctx.capa.tipo}», no de código: el candidato no toca otra cosa.` };
  if (ctx.capa.bloqueada) return { ok: false, motivo: `La capa «${ctx.capa.titulo}» está bloqueada: no se acepta nada sobre ella.` };
  const r = revisar(c);
  if (bloqueaAceptacion(r)) return { ok: false, motivo: "Lo propuesto parece contener una clave o un token: no se muestra ni se acepta. Retira el secreto y vuelve a proponerlo." };
  if (c.original !== ctx.contenidoActual) return { ok: false, motivo: "La capa cambió desde que se propuso el candidato: revisa de nuevo el diff antes de aceptar." };
  return { ok: true, candidato: { ...c, avisos: r.avisos, estado: "aceptado" }, anterior: ctx.contenidoActual };
}

const cola: Candidato[] = [];
export const candidatosPendientes = (): readonly Candidato[] => [...cola];
export function tomarCandidato(id: string): Candidato | null { const i = cola.findIndex((c) => c.id === id); return i < 0 ? null : cola.splice(i, 1)[0]; }
/** La saca, la marca rechazada y lo dice. */
export function descartarCandidato(id: string): boolean {
  const c = tomarCandidato(id);
  if (c) c.estado = "rechazado";
  return c !== null;
}
/** Solo para pruebas. */
export function reiniciarCandidatos(): void { cola.length = 0; }

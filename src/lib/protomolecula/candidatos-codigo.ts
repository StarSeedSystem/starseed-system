/**
 * Protomolécula · CÓDIGO COMO CANDIDATO (contrato §8.2): la IA propone y una persona acepta con la mano.
 * Módulo PURO: no ejecuta nada, no toca capas, archivos ni el núcleo del OS; sin red ni `node:*`.
 * Editable sí, ejecutable no: el texto se revisa, se compara y se guarda; jamás se ejecuta.
 */
import { decidir } from "./permisos";
import type { Autor, Capa, Molecula, Origen, Rol } from "./tipos";

export interface Candidato {
  id: string;
  capaId: string;
  lenguajeOrigen: string;
  lenguajeDestino?: string;
  propuesto: string;
  original: string;
  autor: Autor;
  estado: "propuesto" | "aceptado" | "rechazado";
  avisos: string[];
}

export type TipoLineaDiff = "igual" | "cambio" | "adicion" | "borrado";
export interface LineaDiff { tipo: TipoLineaDiff; original?: string; propuesto?: string }

export type EntradaCandidato = Omit<Candidato, "id" | "estado" | "avisos">;
export interface DependenciasProponer { ahora?: () => number; nuevoId?: () => string }
export interface ContextoCandidato {
  molecula: Molecula;
  rol: Rol | null;
  /** Por defecto «mano»; si una IA o un agente lo intentan, `decidir` lo rechaza. */
  origen?: Origen;
  /** Escribe el contenido aceptado en la capa (inyectado: aquí no hay disco ni red). */
  escribir?: (capaId: string, contenido: string) => void;
}
export interface ResultadoCandidato { ok: boolean; motivo: string; candidato?: Candidato; contenido?: string }

const SECRETOS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bsk-[A-Za-z0-9_-]{8,}/, "clave con forma «sk-»"],
  [/\bgsk_[A-Za-z0-9_-]{8,}/, "clave con forma «gsk_»"],
  [/\bBearer\s+[A-Za-z0-9._~+/-]{8,}/i, "cabecera «Bearer» con token"],
  [/\/Users\/[^/"\s]+/, "ruta del disco «/Users/…»"],
  [/\/home\/[^/"\s]+/, "ruta del disco «/home/…»"],
];
const EJECUCION: ReadonlyArray<readonly [RegExp, string]> = [
  [/\beval\s*\(/, "usa «eval»"],
  [/\bnew\s+Function\s*\(/, "usa «new Function»"],
  [/\bimport\s*\(/, "importa código en tiempo de ejecución"],
  [/\bnode:/, "usa módulos «node:»"],
];
const cola: Candidato[] = [];
let secuencia = 0;
/** Guarda un candidato pendiente SIN ejecutarlo ni tocar la capa. */
export function proponer(p: EntradaCandidato, d: DependenciasProponer = {}): Candidato {
  const ahora = (d.ahora ?? Date.now)();
  const id = (d.nuevoId ?? (() => `cand-${ahora.toString(36)}-${++secuencia}`))();
  const base: Candidato = {
    id, capaId: p.capaId, lenguajeOrigen: p.lenguajeOrigen,
    ...(p.lenguajeDestino ? { lenguajeDestino: p.lenguajeDestino } : {}),
    propuesto: p.propuesto, original: p.original, autor: p.autor, estado: "propuesto", avisos: [],
  };
  const c = revisar(base);
  cola.push(c);
  return c;
}
export const candidatosPendientes = (): readonly Candidato[] => [...cola];
export function tomarCandidato(id: string): Candidato | null {
  const i = cola.findIndex((c) => c.id === id);
  return i < 0 ? null : cola.splice(i, 1)[0];
}
/** Solo para pruebas. */
export function reiniciarCandidatos(): void { cola.length = 0; secuencia = 0; }

/** Marca los avisos del texto propuesto; con secretos, la aceptación queda bloqueada. */
export function revisar(c: Candidato): Candidato {
  const avisos: string[] = [];
  for (const [re, texto] of SECRETOS) if (re.test(c.propuesto)) avisos.push(`secreto: ${texto}`);
  for (const [re, texto] of EJECUCION) if (re.test(c.propuesto)) avisos.push(`ejecución: ${texto}`);
  return { ...c, avisos };
}

/** Diff línea a línea con LCS propio: igual, cambio, adición o borrado. Sin librerías. */
export function diff(original: string, propuesto: string): LineaDiff[] {
  const a = original === "" ? [] : original.split(/\r?\n/), b = propuesto === "" ? [] : propuesto.split(/\r?\n/);
  const n = a.length, m = b.length, lcs = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out: LineaDiff[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ tipo: "igual", original: a[i], propuesto: b[j] }); i++; j++; }
    else if (lcs[i + 1][j + 1] >= lcs[i + 1][j] && lcs[i + 1][j + 1] >= lcs[i][j + 1]) out.push({ tipo: "cambio", original: a[i++], propuesto: b[j++] });
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) out.push({ tipo: "borrado", original: a[i++] });
    else out.push({ tipo: "adicion", propuesto: b[j++] });
  }
  while (i < n) out.push({ tipo: "borrado", original: a[i++] });
  while (j < m) out.push({ tipo: "adicion", propuesto: b[j++] });
  return out;
}

const esNucleo = (c: Capa): boolean =>
  /^nucleo\//.test(c.id) || c.id === "invariantes" || c.referencia?.tipo === "nucleo" || c.referencia?.id === "invariantes";

/** Acepta un candidato: solo con la mano, solo sobre una capa `codigo` de la molécula; nunca archivos ni núcleo. */
export function aceptar(c: Candidato, ctx: ContextoCandidato): ResultadoCandidato {
  const d = decidir({ rol: ctx.rol, origen: ctx.origen ?? "mano", ambito: ctx.molecula.ambito, accion: "aplicar-codigo" });
  if (!d.permitido) return { ok: false, motivo: d.motivo };
  const capa = ctx.molecula.capas.find((x) => x.id === c.capaId);
  if (!capa) return { ok: false, motivo: `La molécula no tiene la capa «${c.capaId}».` };
  if (capa.tipo !== "codigo") return { ok: false, motivo: `La capa «${c.capaId}» no es de código (es «${capa.tipo}»).` };
  if (capa.bloqueada) return { ok: false, motivo: `La capa «${c.capaId}» está bloqueada.` };
  if (capa.referencia?.tipo === "archivo") return { ok: false, motivo: "Un candidato nunca reemplaza un archivo: solo la capa de código de la molécula." };
  if (esNucleo(capa)) return { ok: false, motivo: "El núcleo del OS no se edita desde un candidato." };
  const revisado = revisar(c);
  if (revisado.avisos.some((a) => a.startsWith("secreto:"))) return { ok: false, motivo: "No se acepta: el candidato contiene un posible secreto." };
  if (c.estado !== "propuesto") return { ok: false, motivo: `Este candidato ya está «${c.estado}»: no se acepta dos veces.` };
  const aceptado: Candidato = { ...revisado, estado: "aceptado" };
  const i = cola.findIndex((x) => x.id === c.id);
  if (i >= 0) cola[i] = aceptado;
  ctx.escribir?.(capa.id, c.propuesto);
  return { ok: true, motivo: "Aceptado: se reemplaza el contenido de la capa de código; el núcleo y los archivos no se tocan.", candidato: aceptado, contenido: c.propuesto };
}

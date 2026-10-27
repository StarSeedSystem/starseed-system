/**
 * Protomolécula · CANDIDATOS DE CÓDIGO (PM1010F7A, contrato §8.2): la IA PROPONE cambios de código o
 * conversiones y la PERSONA los revisa; aceptar es una acción humana, con la mano, y aun así solo
 * reemplaza el texto de una capa `codigo` DE la molécula — jamás un archivo ni el núcleo. Nada se
 * ejecuta. Cola hermana de los planes pendientes (`peticion/pedir.ts`): proponer → pendiente → decide.
 */
import type { Autor, Molecula, Origen, Rol } from "./tipos";
import { decidir } from "./permisos";

/** El texto de una capa `codigo` vive en `valores` bajo esta clave (la capa cita; su texto vive aquí). */
export const claveTextoCapa = (capaId: string): string => `capa::${capaId}::texto`;
/** Los avisos que empiezan así marcan un secreto y BLOQUEAN la aceptación. */
export const MARCA_SECRETO = "secreto: ";
export type EstadoCandidato = "propuesto" | "aceptado" | "rechazado";
export interface Candidato {
  id: string;
  /** Siempre una capa `codigo` de la molécula; nunca una ruta de disco ni el núcleo. */
  capaId: string;
  lenguajeOrigen: string;
  lenguajeDestino?: string;
  /** Guardado tal cual, sin ejecutarlo nunca. */
  propuesto: string;
  original: string;
  autor: Autor;
  estado: EstadoCandidato;
  avisos: string[];
}
export interface ArgumentosPropuesta { capaId: string; lenguajeOrigen: string; lenguajeDestino?: string; propuesto: string; original: string; autor: Autor }
export interface ContextoAceptacion {
  molecula: Molecula; rol: Rol | null;
  /** Solo «mano» vale; una IA o un agente jamás acepta (permisos.ts: «aplicar-codigo»). */
  origen?: Origen; ahora?: () => number;
}
export type ResultadoAceptacion = { ok: true; molecula: Molecula } | { ok: false; motivo: string };

/** Secretos con FORMA real (en las pruebas se montan como cadenas en tiempo de ejecución, jamás literales). */
const SECRETOS: [RegExp, string][] = [[/sk-[A-Za-z0-9]{8,}/, "una clave tipo «sk-…»"], [/gsk_[A-Za-z0-9]{8,}/, "una clave tipo «gsk_…»"], [/Bearer\s+[A-Za-z0-9._\-=]{10,}/, "un token «Bearer» con forma real"]];
const RUTA_DISCO = /(?:\/(?:home|Users|etc|var|tmp|opt|root|mnt|srv)\/[^\s"'`]+)|(?:[A-Za-z]:\\[^\s"'`]+)/;
const EJECUCION: [RegExp, string][] = [[/\beval\s*\(/, "«eval(…)»"], [/new\s+Function\s*\(/, "«new Function(…)»"], [/\bimport\s*\(/, "un «import(…)» dinámico"], [/node:/, "un módulo «node:…»"]];
const primeros = (f: RegExpMatchArray): string => (f[0].length > 60 ? `${f[0].slice(0, 60)}…` : f[0]);
/** Avisos legibles del texto PROPUESTO. Los de secreto empiezan por `MARCA_SECRETO` y bloquean. */
export function avisosDe(p: string): string[] {
  const av: string[] = [];
  for (const [re, como] of SECRETOS) { const m = p.match(re); if (m) av.push(`${MARCA_SECRETO} parece contener ${como} («${primeros(m)}»)`); }
  const ruta = p.match(RUTA_DISCO);
  if (ruta) av.push(`Cita una ruta del disco («${primeros(ruta)}»): el núcleo no toca archivos.`);
  for (const [re, como] of EJECUCION) if (re.test(p)) av.push(`Ejecuta código ajeno: contiene ${como} (aquí nada corre).`);
  return av;
}
export const avisosSecretos = (avisos: string[]): string[] => avisos.filter((a) => a.startsWith(MARCA_SECRETO));
/** Recalcula los avisos del candidato (inmutable). */
export const revisar = (c: Candidato): Candidato => ({ ...c, avisos: avisosDe(c.propuesto) });

export type LineaDiff = { tipo: "igual"; linea: string } | { tipo: "cambiada"; antes: string; despues: string } | { tipo: "anadida"; linea: string } | { tipo: "borrada"; linea: string };

/** Diff línea a línea, sin librerías: prefijo y sufijo comunes, el centro en cambio/añadida/borrada. */
export function diff(original: string, propuesto: string): LineaDiff[] {
  const a = original.split("\n"), b = propuesto.split("\n"), res: LineaDiff[] = [];
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) { res.push({ tipo: "igual", linea: a[i] }); i++; }
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  const medioA = a.length - i - j, medioB = b.length - i - j;
  for (let k = 0; k < Math.max(medioA, medioB); k++) {
    const x = k < medioA ? a[i + k] : undefined, y = k < medioB ? b[i + k] : undefined;
    if (x !== undefined && y !== undefined) res.push({ tipo: "cambiada", antes: x, despues: y });
    else if (y !== undefined) res.push({ tipo: "anadida", linea: y });
    else if (x !== undefined) res.push({ tipo: "borrada", linea: x });
  }
  for (let k = 0; k < j; k++) res.push({ tipo: "igual", linea: a[i + medioA + k] });
  return res;
}

export const EVENTO_CANDIDATO_CODIGO = "starseed:protomolecula-codigo-candidato";
const MAX_CANDIDATOS = 5;
const cola: Candidato[] = [];
let secuencia = 0;
const emitirEnNavegador = (x: Candidato): void => {
  try { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENTO_CANDIDATO_CODIGO, { detail: x })); } catch { /* sin DOM */ }
};

/** Pendientes de revisión de la persona. */
export const candidatosPendientes = (): readonly Candidato[] => [...cola];
const tomar = (id: string): Candidato | null => { const i = cola.findIndex((c) => c.id === id); return i < 0 ? null : cola.splice(i, 1)[0]; };
export const tomarCandidatoPendiente = tomar;
export const descartarCandidatoPendiente = (id: string): boolean => tomar(id) !== null;
/** Rechazar cierra el candidato: queda «rechazado» y fuera de la cola. */
export function rechazarCandidato(id: string): Candidato | null { const c = tomar(id); if (c) c.estado = "rechazado"; return c; }
/** Solo para pruebas. */
export function reiniciarCandidatosPendientes(): void { cola.length = 0; secuencia = 0; }

/** Guarda el candidato SIN ejecutar nada ni tocar la capa; lo deja pendiente y lo emite al panel. */
export function proponer(a: ArgumentosPropuesta, d: { ahora?: () => number; nuevoId?: () => string; emitir?: (c: Candidato) => void } = {}): Candidato | { motivo: string } {
  const capaId = a.capaId.trim(), propuesto = a.propuesto, ahora = (d.ahora ?? Date.now)();
  if (!capaId) return { motivo: "Falta «capa»: el candidato apunta a una capa «codigo» de la molécula, nunca a un archivo del disco ni al núcleo." };
  if (!propuesto.trim()) return { motivo: "Falta «propuesto»: qué código propone." };
  const c = revisar({ id: d.nuevoId ? d.nuevoId() : `cand-${ahora.toString(36)}-${++secuencia}`, capaId, lenguajeOrigen: a.lenguajeOrigen.trim() || "texto", lenguajeDestino: a.lenguajeDestino?.trim() || undefined, propuesto, original: a.original, autor: a.autor, estado: "propuesto", avisos: [] });
  cola.push(c);
  while (cola.length > MAX_CANDIDATOS) cola.shift();
  (d.emitir ?? emitirEnNavegador)(c);
  return c;
}

/** Acepta con la mano: permiso «aplicar-codigo», sin secretos, capa `codigo` no bloqueada. */
export function aceptar(c: Candidato, ctx: ContextoAceptacion): ResultadoAceptacion {
  if (c.estado !== "propuesto") return { ok: false, motivo: `Este candidato ya está «${c.estado}»; la revisión se hace una vez.` };
  const permiso = decidir({ rol: ctx.rol, origen: ctx.origen ?? "mano", ambito: ctx.molecula.ambito, accion: "aplicar-codigo" });
  if (!permiso.permitido) return { ok: false, motivo: permiso.motivo };
  const secretos = avisosSecretos(avisosDe(c.propuesto));
  if (secretos.length) return { ok: false, motivo: `No se acepta: ${secretos.join(" ")}` };
  if (/[\\/]/.test(c.capaId) || /\.(ts|tsx|js|json)$/i.test(c.capaId)) return { ok: false, motivo: `«${c.capaId}» parece un archivo: un candidato señala a una capa de la molécula, jamás al núcleo («nucleo/*», invariantes) ni a un fichero del disco.` };
  const capa = ctx.molecula.capas.find((x) => x.id === c.capaId);
  if (!capa) return { ok: false, motivo: `«${c.capaId}» no es una capa de esta molécula; no se acepta nada fuera de ella.` };
  if (capa.tipo !== "codigo") return { ok: false, motivo: `La capa «${capa.titulo}» es de tipo «${capa.tipo}»: solo las capas «codigo» llevan candidatos.` };
  if (capa.bloqueada) return { ok: false, motivo: `La capa «${capa.titulo}» está bloqueada: desbloquégala con la mano antes de aceptar.` };
  const molecula: Molecula = { ...ctx.molecula, version: ctx.molecula.version + 1, actualizadaEn: (ctx.ahora ?? Date.now)(), valores: { ...ctx.molecula.valores, [claveTextoCapa(c.capaId)]: c.propuesto } };
  c.estado = "aceptado";
  tomar(c.id);
  return { ok: true, molecula };
}

/**
 * Protomolécula · CANDIDATOS DE CÓDIGO (PM1010F7A, contrato §8.2). Módulo PURO:
 * la IA (o una persona) PROPONE un cambio de código y se GUARDA (aquí no se ejecuta
 * nada). Revisarlo y aceptarlo solo lo hace una persona CON LA MANO, y solo
 * reemplaza el contenido de una capa «codigo» de la molécula: jamás un archivo ni
 * el núcleo del OS (`nucleo/*`, invariantes). El diff es línea a línea, sin librerías.
 */
import { decidir } from "./permisos";
import type { Ambito, Autor, Capa, Molecula, Origen, Rol } from "./tipos";

export type EstadoCandidato = "propuesto" | "aceptado" | "rechazado";
/** Un cambio de código PROPUESTO y guardado; nunca algo que el OS ejecute. */
export interface Candidato {
  id: string;
  /** Capa de la molécula sobre la que se aceptaría; «» si aún no hay capa «codigo». */
  capaId: string;
  lenguajeOrigen: string;
  lenguajeDestino?: string;
  propuesto: string;
  original: string;
  autor: Autor;
  estado: EstadoCandidato;
  avisos: string[];
}
/** Lo que la IA trae al proponer: el texto propuesto, el original y la capa destino. */
export type Propuesta = Omit<Candidato, "id" | "estado" | "avisos">;

export interface ContextoAceptacion { molecula: Molecula; rol: Rol | null; origen: Origen; ambito: Ambito }
export type ResultadoAceptacion =
  | { ok: true; capa: Capa; contenido: string }
  | { ok: false; motivo: string };

/* ── escáner de avisos: secretos, rutas del disco y ejecución de código ── */
/** Solo hay AVISO si el texto tiene la FORMA REAL; las cadenas de ejemplo se montan en las pruebas. */
const AVISOS: Array<{ p: RegExp; t: string; secreto: boolean }> = [
  { p: /sk-[A-Za-z0-9_-]{16,}/, t: "contiene lo que parece una clave de API (secreto: no se acepta)", secreto: true },
  { p: /gsk_[A-Za-z0-9_-]{16,}/, t: "contiene lo que parece una clave Groq (secreto: no se acepta)", secreto: true },
  { p: /bearer\s+[A-Za-z0-9._~+/=-]{12,}/i, t: "contiene un token de autorización (secreto: no se acepta)", secreto: true },
  { p: /(^|["'`\s])(\/(home|users|etc|var|root|tmp)\/[^\s"'`)|]{2,}|\w:\\(windows|users|x)[^\s"'`)|]{1,})/i, t: "menciona una ruta del disco: revisa que no exponga datos privados", secreto: false },
  { p: /\beval\s*\(/, t: "contiene «eval(» (no se ejecuta nada, pero salta en la revisión)", secreto: false },
  { p: /\bnew\s+Function\s*\(/, t: "contiene «new Function(» (no se ejecuta nada, pero salta en la revisión)", secreto: false },
  { p: /\bimport\s*\(/, t: "contiene «import(» (código ajeno dinámico: nunca se ejecuta aquí)", secreto: false },
  { p: /["']node:/, t: "importa un módulo «node:*» (esto corre en la molécula, sin Node)", secreto: false },
  { p: /src\/lib\/nucleo\/|paquete-sistema|invariantes/, t: "habla del núcleo del OS o de su paquete de sistema: un candidato jamás lo toca", secreto: false },
];

export function escanear(codigo: string): { avisos: string[]; secreto: boolean } {
  const avisos: string[] = [];
  let secreto = false;
  for (const a of AVISOS) if (a.p.test(codigo)) { if (!avisos.includes(a.t)) avisos.push(a.t); if (a.secreto) secreto = true; }
  return { avisos, secreto };
}
/** Reescanea el original y el propuesto y marca los avisos del candidato. */
export function revisar(c: Candidato): string[] {
  c.avisos = [...escanear(c.original).avisos, ...escanear(c.propuesto).avisos].filter((x, i, l) => l.indexOf(x) === i);
  return c.avisos;
}
export const haySecretos = (c: Candidato): boolean => escanear(c.original).secreto || escanear(c.propuesto).secreto;

/* ── cola de candidatos: se GUARDAN, no se ejecutan ── */
const cola: Candidato[] = [];
let secuencia = 0;

/** Guarda el candidato ya revisado (avisos marcados); no toca ninguna capa ni ejecuta nada. */
export function proponer(p: Propuesta, opc?: { id?: string }): Candidato {
  const c: Candidato = { ...p, id: opc?.id ?? `cand-${Date.now().toString(36)}-${++secuencia}`, estado: "propuesto", avisos: [] };
  revisar(c); cola.push(c);
  return c;
}
export const listarCandidatos = (f: { capaId?: string; estado?: EstadoCandidato } = {}): Candidato[] =>
  cola.filter((c) => (f.capaId === undefined || c.capaId === f.capaId) && (f.estado === undefined || c.estado === f.estado));
export const obtenerCandidato = (id: string): Candidato | undefined => cola.find((c) => c.id === id);
/** La persona aparta el candidato: marca «rechazado»; ya no se puede aceptar. */
export function rechazarCandidato(id: string): Candidato | null {
  const c = obtenerCandidato(id);
  return c && c.estado === "propuesto" ? ((c.estado = "rechazado"), c) : null;
}
export const limpiarCandidatos = (): void => { cola.length = 0; };

/* ── diff línea a línea (LCS, sin librerías): «- » quitada, «+ » puesta, «  » igual ── */
export function diff(original: string, propuesto: string): string {
  const a = original ? original.split("\n") : [], b = propuesto ? propuesto.split("\n") : [];
  if (a.join("\n") === b.join("\n")) return "sin cambios";
  const n = a.length, m = b.length, w = m + 1;
  const t = new Array<number>((n + 1) * w).fill(0);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    t[i * w + j] = a[i] === b[j] ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
  const l: string[] = [];
  const marcar = (s: string, x: string) => l.push(s + x);
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { marcar("  ", a[i]); i++; j++; continue; }
    if (t[(i + 1) * w + j] >= t[i * w + j + 1]) { marcar("- ", a[i]); i++; } else { marcar("+ ", b[j]); j++; }
  }
  for (; i < n; i++) marcar("- ", a[i]);
  for (; j < m; j++) marcar("+ ", b[j]);
  return l.join("\n");
}

/* ── aceptar: solo la mano, y solo una capa «codigo» de la molécula ── */
const noAcepto = (motivo: string): ResultadoAceptacion => ({ ok: false, motivo });

export function aceptar(c: Candidato, ctx: ContextoAceptacion): ResultadoAceptacion {
  if (c.estado !== "propuesto") return noAcepto(`El candidato «${c.id}» ya está ${c.estado}; no se repite.`);
  if (haySecretos(c)) return noAcepto("El candidato encierra lo que parece un SECRETO: hay que quitarlo antes de aceptar nada.");
  const d = decidir({ rol: ctx.rol, origen: ctx.origen, ambito: ctx.ambito, accion: "aplicar-codigo" });
  if (!d.permitido) return noAcepto(`No acepta código ${c.autor.tipo === "agente" ? "el agente" : "esa mano"}: ${d.motivo}`);
  if (c.capaId.includes("/") || /nucleo|invariantes/i.test(c.capaId)) return noAcepto(`«${c.capaId}» parece un archivo del OS (¿del núcleo intocable?): los candidatos solo tocan una capa de la molécula.`);
  const capa = ctx.molecula.capas.find((k) => k.id === c.capaId);
  if (!capa) return noAcepto(`La capa «${c.capaId}» ya no está en la molécula «${ctx.molecula.titulo}».`);
  if (capa.tipo !== "codigo") return noAcepto(`«${capa.titulo}» es una capa «${capa.tipo}»: solo una capa «codigo» puede recibir el contenido.`);
  if (capa.bloqueada) return noAcepto(`La capa «${capa.titulo}» está bloqueada; desbloquéala para aceptar el candidato.`);
  if (capa.referencia) return noAcepto(`La capa «${capa.titulo}» cita una Entidad de la Biblioteca: para editarla se abre una RAMA, no se pisa.`);
  c.estado = "aceptado";
  return { ok: true, capa, contenido: c.propuesto };
}

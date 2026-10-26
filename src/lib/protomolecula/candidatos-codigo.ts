/* Protomolécula · CANDIDATOS DE CÓDIGO (PM1010F7A · contrato §8.2). La IA PROPONE y guarda SIN ejecutar nada
 * ni tocar la capa; revisar marca avisos (secretos, ejecución, rutas de disco) y los secretos BLOQUEAN aceptar;
 * aceptar exige la mano (permisos.ts#decidir, «aplicar-codigo») y solo reemplaza el texto de UNA capa «codigo». */
import { decidir } from "./permisos";
import type { Autor, Capa, Molecula, Origen, Rol } from "./tipos";

/** Un cambio de código o una conversión de lenguaje, a la espera de una persona con la mano. */
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
/** Texto de una capa de código; el núcleo (`tipos.ts#Capa`) aún no lo declara. // provisional */
export type CapaCodigo = Capa & { texto?: string };
export interface ContextoAceptar { rol: Rol | null; origen: Origen; molecula: Molecula; ahora?: number }
export type ResultadoAceptar =
  | { ok: true; molecula: Molecula; capa: CapaCodigo; candidato: Candidato }
  | { ok: false; motivo: string };
/** El tope del puente (§8.1): un candidato no cabe más grande. */
export const TOPE_CANDIDATO = 64 * 1024;

/** Los avisos van prefijados: «secreto:», «ejecución:», «ruta:». Los de secreto BLOQUEAN aceptar. */
export const esAvisoDeSecreto = (a: string): boolean => a.startsWith("secreto:");
const aviso = (clase: "secreto" | "ejecución" | "ruta", nombre: string): string => `${clase}: contiene ${nombre}`;
/** Detección por FORMA (patrones, no claves reales); los ejemplos de las pruebas se montan en ejecución. */
const FORMAS = [
  { re: /\bsk-[A-Za-z0-9]{10,}\b/, clase: "secreto", nombre: "una clave tipo «sk-…»" },
  { re: /\bgsk_[A-Za-z0-9]{10,}\b/, clase: "secreto", nombre: "una clave tipo «gsk_…»" },
  { re: /\bBearer\s+[A-Za-z0-9._~+/=-]{10,}\b/, clase: "secreto", nombre: "un código de portador «Bearer …»" },
  { re: /\beval\s*\(/, clase: "ejecución", nombre: "«eval(»" },
  { re: /\bnew\s+Function\s*\(/, clase: "ejecución", nombre: "«new Function(»" },
  { re: /\bimport\s*\(/, clase: "ejecución", nombre: "un «import(» dinámico" },
  { re: /\bnode:/, clase: "ejecución", nombre: "un módulo «node:*», solo de servidor" },
  { re: /[A-Za-z]:\\(?:Users|Windows|Documents|Program Files)/, clase: "ruta", nombre: "una ruta de disco (Windows)" },
  { re: /[\"' (=(]\/(?:Users|home|root|etc|tmp)\/[\w.-]+/, clase: "ruta", nombre: "una ruta de disco (posix)" },
  { re: /\bfile:\/\/\//, clase: "ruta", nombre: "un enlace «file://»" },
] as const;
export function revisar(c: Candidato): Candidato {
  const avisos = FORMAS.filter((f) => f.re.test(c.propuesto)).map((f) => aviso(f.clase, f.nombre));
  return { ...c, avisos };
}

/* ── diff línea a línea, sin librerías ── */
export type TipoLinea = "igual" | "cambiado" | "añadido" | "borrado";
export interface LineaDiff { texto: string; tipo: TipoLinea }
export function diff(original: string, propuesto: string): LineaDiff[] {
  const a = original.split("\n"), b = propuesto.split("\n"), m = a.length, n = b.length;
  const tal: number[][] = Array.from({ length: m + 1 }, (): number[] => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--)
    tal[i][j] = a[i] === b[j] ? tal[i + 1][j + 1] + 1 : Math.max(tal[i + 1][j], tal[i][j + 1]);
  const bruto: LineaDiff[] = [];
  let i = 0, j = 0;
  while (i < m && j < n)
    if (a[i] === b[j]) { bruto.push({ texto: a[i], tipo: "igual" }); i++; j++; }
    else if (tal[i + 1][j] >= tal[i][j + 1]) { bruto.push({ texto: a[i], tipo: "borrado" }); i++; }
    else { bruto.push({ texto: b[j], tipo: "añadido" }); j++; }
  while (i < m) bruto.push({ texto: a[i++], tipo: "borrado" });
  while (j < n) bruto.push({ texto: b[j++], tipo: "añadido" });
  const salida: LineaDiff[] = [];
  let k = 0;
  while (k < bruto.length) {
    if (bruto[k].tipo === "igual") { salida.push(bruto[k++]); continue; }
    const bor: string[] = [], ani: string[] = [];
    while (k < bruto.length && bruto[k].tipo !== "igual") (bruto[k].tipo === "borrado" ? bor : ani).push(bruto[k++].texto);
    for (let p = 0; p < Math.min(bor.length, ani.length); p++) salida.push({ texto: `${bor[p]} → ${ani[p]}`, tipo: "cambiado" });
    for (let p = ani.length; p < bor.length; p++) salida.push({ texto: bor[p], tipo: "borrado" });
    for (let p = bor.length; p < ani.length; p++) salida.push({ texto: ani[p], tipo: "añadido" });
  }
  return salida;
}
/* ── la cola: propuesta → pendiente → una persona la acepta o la rechaza ── */
const COLA = new Map<string, Candidato>();
let secuencia = 0;
export const obtenerCandidato = (id: string): Candidato | undefined => COLA.get(id);
export const listarCandidatos = (capaId?: string): Candidato[] => [...COLA.values()].filter((c) => !capaId || c.capaId === capaId);
export const limpiarCandidatos = (): void => { COLA.clear(); secuencia = 0; };

export type EntradaCandidato = Omit<Candidato, "id" | "estado" | "avisos"> & { id?: string };
/** Guarda el candidato pendiente; NADA se ejecuta y la capa no se toca. */
export function proponer(o: EntradaCandidato): { ok: true; candidato: Candidato } | { ok: false; motivo: string } {
  const capaId = o.capaId.trim(), original = o.original.trimEnd(), propuesto = o.propuesto.trimEnd();
  if (!capaId || !original || !propuesto) return { ok: false, motivo: "Falta la capa, el texto original o el propuesto: pide antes el contenido de la capa." };
  if (propuesto.length > TOPE_CANDIDATO) return { ok: false, motivo: "El candidato pesa más del tope del puente (64 KB): pídelo en trozos." };
  if (o.id && COLA.has(o.id)) return { ok: false, motivo: "Ya existe un candidato con ese id." };
  const c = revisar({ id: o.id ?? `cand-${Date.now().toString(36)}-${++secuencia}`, capaId, original, propuesto,
    lenguajeOrigen: o.lenguajeOrigen.trim() || "texto", lenguajeDestino: o.lenguajeDestino?.trim() || undefined, autor: o.autor, estado: "propuesto", avisos: [] });
  COLA.set(c.id, c);
  return { ok: true, candidato: c };
}

export const rechazar = (c: Candidato): Candidato => { const fin = { ...c, estado: "rechazado" as const }; if (COLA.has(c.id)) COLA.set(c.id, fin); return fin; };
/** SOLO una persona con la mano (rol editor o dueño): reemplaza el texto de UNA capa «codigo» de la molécula. */
export function aceptar(c: Candidato, ctx: ContextoAceptar): ResultadoAceptar {
  const vivo = COLA.get(c.id) ?? c;
  if (vivo.estado !== "propuesto") return { ok: false, motivo: "Este candidato ya se revisó." };
  const decid = decidir({ rol: ctx.rol, origen: ctx.origen, ambito: ctx.molecula.ambito, accion: "aplicar-codigo" });
  if (!decid.permitido) return { ok: false, motivo: decid.motivo };
  if (vivo.avisos.some(esAvisoDeSecreto)) return { ok: false, motivo: "El texto propuesto parece contener un secreto: quítalo y vuelve a proponer el candidato." };
  const capa = ctx.molecula.capas.find((k) => k.id === vivo.capaId);
  if (!capa) return { ok: false, motivo: `La capa «${c.capaId}» no está en esta molécula.` };
  if (capa.tipo !== "codigo") return { ok: false, motivo: "Solo se acepta sobre una capa de tipo «codigo», nunca sobre una entidad ni el núcleo." };
  if (capa.bloqueada) return { ok: false, motivo: "La capa está bloqueada: primero la desbloquea su dueño." };
  const texto = (capa as CapaCodigo).texto;
  if (texto !== undefined && texto !== vivo.original) return { ok: false, motivo: "La capa cambió desde que se propuso: revisa el diff y vuelve a pedirlo." };
  const molecula = { ...ctx.molecula, version: ctx.molecula.version + 1, actualizadaEn: ctx.ahora ?? Date.now(),
    capas: ctx.molecula.capas.map((k) => (k.id === capa.id ? { ...k, texto: vivo.propuesto } : k)) };
  const fin = { ...vivo, estado: "aceptado" as const };
  if (COLA.has(c.id)) COLA.set(c.id, fin);
  const puesta = molecula.capas.find((k) => k.id === capa.id) as CapaCodigo;
  return { ok: true, molecula, capa: puesta, candidato: fin };
}

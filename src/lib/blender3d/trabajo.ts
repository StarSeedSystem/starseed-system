/*
 Formato de especificaciones del vocabulario (Python lo lee igual, BLD1025D):
  {"t":"num","min":n,"max":n,"ent":true?}  número (entero si "ent")
  {"t":"enum","v":[…]}  una de la lista     {"t":"bool"}  booleano
  {"t":"rgba"}  4 números 0–1               {"t":"vec","n":3,"min":n,"max":n}  lista fija de números
  {"t":"nombre"}  única, ^[A-Za-z][A-Za-z0-9_-]{0,31}$; valida y CREA el objeto
  {"t":"ref"}  nombre de un objeto creado ANTES en la escena
  {"t":"txt","max":n,"patron":"…"}  texto con patrón
  {"t":"ruta","ext":[…]}  ruta relativa: sin "/" inicial, sin "..", extensión de la lista
  {"t":"lista","de":<espec>,"max":n}  lista acotada   {"t":"obj","campos":{…}}
 Toda espec acepta "opc":true (opcional) y "def":<valor> (omisión). Los campos que
 no estén declarados se RECHAZAN con el motivo en español: el trabajo 3D es un DATO
 de lista blanca (contrato §4); jamás se construye código con textos libres.
*/
import vocab from "./vocabulario.json";

type Espec = {
  t: string; min?: number; max?: number; ent?: boolean; n?: number; v?: string[];
  ext?: string[]; patron?: string; campos?: Record<string, Espec>; de?: Espec; opc?: boolean; def?: unknown;
};
type VocJSON = {
  version: number; topes: Record<string, number>;
  operaciones: Record<string, { estado: string; motivo?: string; params: Record<string, Espec> }>;
  salidas: Record<string, { params: Record<string, Espec> }>;
};
const VOC = vocab as unknown as VocJSON;
const TOPE = VOC.topes;
const LIT = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
const RUTA = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;
export type Operacion = { op: string } & Record<string, unknown>;
export type Salida = { tipo: string } & Record<string, unknown>;
export type Trabajo3D = {
  v: 1; titulo: string;
  calidad: "borrador" | "normal" | "final";
  ambito: "personal" | "perfil" | "grupo" | "publica";
  origen: "protomolecula" | "astraura" | "estudio" | "xr" | "avatares" | "orbe" | "api";
  quien: "persona" | "agente";
  escena: Operacion[];
  salidas: Salida[];
  limites?: { segundos?: number; memoriaMB?: number };
};
export const VERSION_VOCABULARIO = VOC.version as 1;

type Gc = { creados: Set<string>; ms: string[] };
const malo = (gc: Gc, msg: string) => { gc.ms.push(msg); return false; };
const numero = (v: unknown, min?: number, max?: number, ent = false): boolean =>
  typeof v === "number" && Number.isFinite(v) && (min === undefined || v >= min) && (max === undefined || v <= max) && (!ent || Number.isInteger(v));

function casar(e: Espec, val: unknown, gc: Gc, donde: string): boolean {
  switch (e.t) {
    case "num": if (numero(val, e.min, e.max, e.ent === true)) return true; return malo(gc, `${donde}: número inválido o fuera de rango`);
    case "enum": if (e.v?.includes(val as string)) return true; return malo(gc, `${donde}: valor fuera de la lista`);
    case "bool": if (typeof val === "boolean") return true; return malo(gc, `${donde}: debe ser booleano`);
    case "vec": { if (!Array.isArray(val) || val.length !== (e.n ?? 3)) return malo(gc, `${donde}: debe ser una lista de ${e.n ?? 3} números`); return val.every((x) => numero(x, e.min, e.max)) || malo(gc, `${donde}: números inválidos o fuera de rango`); }
    case "rgba": { if (!Array.isArray(val) || val.length !== 4 || !val.every((x) => numero(x, 0, 1))) return malo(gc, `${donde}: debe ser una lista de 4 números entre 0 y 1`); return true; }
    default: return malo(gc, `especificación interna desconocida en ${donde}: ${e.t}`);
  }
}

const OPCIONAL = (e: Espec): boolean => e.opc === true || e.def !== undefined;

function casarCampo(e: Espec, val: unknown, gc: Gc, donde: string): boolean {
  if (e.t === "nombre") { if (typeof val === "string" && LIT.test(val) && !gc.creados.has(val)) { gc.creados.add(val); return true; } return malo(gc, `${donde}: denominación inválida, ya usada o fuera de la forma del vocabulario`); }
  if (e.t === "ref") { if (typeof val === "string" && LIT.test(val) && gc.creados.has(val)) return true; return malo(gc, `${donde}: la referencia no apunta a un objeto creado antes en la escena`); }
  if (e.t === "txt") { if (typeof val === "string" && val.length <= (e.max ?? Infinity) && new RegExp(e.patron ?? "").test(val)) return true; return malo(gc, `${donde}: texto no admisible (caracteres o longitud fuera del vocabulario)`); }
  if (e.t === "ruta") { if (typeof val === "string" && RUTA.test(val) && !val.includes("..") && (e.ext ?? []).some((x) => val.endsWith("." + x))) return true; return malo(gc, `${donde}: ruta no admisible (relativa, sin «..» y con extensión de la lista)`); }
  if (e.t === "lista") { if (!Array.isArray(val) || val.length > (e.max ?? Infinity)) return malo(gc, `${donde}: lista más larga de lo admitido`); return val.every((x, i) => casarCampo(e.de ?? { t: "num" }, x, gc, `${donde}[${i}]`)); }
  if (e.t === "obj") { if (typeof val !== "object" || val === null || Array.isArray(val)) return malo(gc, `${donde}: debe ser un objeto`); return checarCampos(e.campos ?? {}, val as Record<string, unknown>, gc, donde); }
  return casar(e, val, gc, donde);
}

function checarCampos(campos: Record<string, Espec>, val: Record<string, unknown>, gc: Gc, donde: string): boolean {
  for (const k of Object.keys(val)) if (!(k in campos)) return malo(gc, `${donde}: campo desconocido «${k}», fuera del vocabulario`);
  for (const [k, e] of Object.entries(campos)) {
    if (!(k in val)) { if (OPCIONAL(e)) continue; return malo(gc, `${donde}: falta el campo «${k}»`); }
    if (!casarCampo(e, val[k], gc, `${donde}.${k}`)) return false;
  }
  return true;
}

function validarLote(gc: Gc, val: unknown, campo: "escena" | "salidas", i: number, tabla: Record<string, { estado?: string; motivo?: string; params: Record<string, Espec> }>, llave: "op" | "tipo"): boolean {
  if (typeof val !== "object" || val === null || Array.isArray(val)) return malo(gc, `${campo}[${i}]: no es un objeto`);
  const o = val as Record<string, unknown>;
  const nombre = o[llave];
  if (typeof nombre !== "string" || !(nombre in tabla)) return malo(gc, `${campo}[${i}]: «${llave}» fuera del vocabulario`);
  const zeta = tabla[nombre];
  if (zeta.estado && zeta.estado !== "listo") return malo(gc, `${campo}[${i}] «${nombre}» no está disponible todavía: ${zeta.motivo ?? ""}`);
  const llaves = Object.keys(o).filter((k) => k !== llave);
  for (const k of llaves) if (!(k in zeta.params)) return malo(gc, `${campo}[${i}] «${nombre}»: campo desconocido «${k}», fuera del vocabulario`);
  for (const [k, e] of Object.entries(zeta.params)) {
    if (!(k in o)) { if (e.opc === true || e.def !== undefined) continue; return malo(gc, `${campo}[${i}] «${nombre}»: falta el campo «${k}»`); }
    if (!casarCampo(e, o[k], gc, `${nombre}.${k}`)) return false;
  }
  return true;
}

function validarCabecera(bruto: Record<string, unknown>, gc: Gc): boolean {
  for (const k of Object.keys(bruto)) if (!["v", "titulo", "calidad", "ambito", "origen", "quien", "escena", "salidas", "limites"].includes(k)) return malo(gc, `cabecera: campo desconocido «${k}», fuera del vocabulario`);
  if (bruto.v !== 1) return malo(gc, "v: debe ser 1");
  if (typeof bruto.titulo !== "string" || bruto.titulo.length === 0 || bruto.titulo.length > 80) return malo(gc, "titulo: cadena de 1 a 80 caracteres");
  const listas: Record<string, Espec> = { calidad: { t: "enum", v: ["borrador", "normal", "final"] }, ambito: { t: "enum", v: ["personal", "perfil", "grupo", "publica"] }, origen: { t: "enum", v: ["protomolecula", "astraura", "estudio", "xr", "avatares", "orbe", "api"] }, quien: { t: "enum", v: ["persona", "agente"] } };
  for (const [k, e] of Object.entries(listas)) if (!casar(e, bruto[k], gc, k)) return false;
  if (!Array.isArray(bruto.escena) || bruto.escena.length > TOPE.operaciones) return malo(gc, `escena: lista de hasta ${TOPE.operaciones} operaciones`);
  if (!Array.isArray(bruto.salidas) || bruto.salidas.length < 1 || bruto.salidas.length > 4) return malo(gc, "salidas: lista de 1 a 4 salidas");
  if (bruto.limites !== undefined) { if (typeof bruto.limites !== "object" || bruto.limites === null || checarCampos({ segundos: { t: "num", min: 1, max: TOPE.segundos, opc: true }, memoriaMB: { t: "num", min: 1, max: 65536, opc: true } }, bruto.limites as Record<string, unknown>, gc, "limites") === false) return malo(gc, "limites: objeto con segundos y memoriaMB partidos de números finitos"); }
  return true;
}

export function validarTrabajo(bruto: unknown): { ok: true; trabajo: Trabajo3D } | { ok: false; motivos: string[] } {
  const gc: Gc = { creados: new Set(), ms: [] };
  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) return { ok: false, motivos: ["el trabajo no es un objeto"] };
  const b = bruto as Record<string, unknown>;
  validarCabecera(b, gc);
  if (Array.isArray(b.escena)) b.escena.forEach((v, i) => { validarLote(gc, v, "escena", i, VOC.operaciones as never, "op"); });
  if (Array.isArray(b.salidas)) b.salidas.forEach((v, i) => { validarLote(gc, v, "salidas", i, VOC.salidas as never, "tipo"); });
  if (gc.ms.length > 0) return { ok: false, motivos: gc.ms };
  const coste = estimarCoste(b as unknown as Trabajo3D);
  if (coste.vertices > TOPE.vertices) return { ok: false, motivos: [`la escena estima ${coste.vertices} vértices, por encima del tope de ${TOPE.vertices}`] };
  return { ok: true, trabajo: b as unknown as Trabajo3D };
}

const VERTICES_BASE: Record<string, number> = { cubo: 8, esfera: 768, icosfera: 642, cilindro: 128, cono: 128, toro: 480, plano: 4, circulo: 64 };
const SEGUNDOS_POR_UNIDAD: Record<string, number> = { workbench: 400000, "cycles-cpu": 20000, "cycles-gpu": 200000, eevee: 500000 };

export function estimarCoste(trabajo: Trabajo3D): { vertices: number; segundos: number } {
  let base: Record<string, number> = {}, mult: Record<string, number> = {};
  for (const paso of trabajo.escena) {
    if (paso.op === "primitiva") { base[paso.nombre as string] = VERTICES_BASE[paso.tipo as string] ?? 0; mult[paso.nombre as string] = 1; }
    if (paso.op === "modificador" && passoTipo(paso) === "subdivision") mult[paso.objeto as string] = (mult[paso.objeto as string] ?? 1) * 4 ** ((paso.niveles as number) ?? 1);
  }
  const vertices = Object.entries(base).reduce((acc, [n, b]) => acc + b * (mult[n] ?? 1), 0);
  let segundos = 0;
  for (const s of trabajo.salidas) {
    const px = (s.ancho as number) * (s.alto as number);
    const fotogramas = s.desde !== undefined ? Math.max(1, (s.hasta as number) - (s.desde as number) + 1) : 1;
    segundos += (px * ((s.muestras as number) ?? 1) * fotogramas) / (SEGUNDOS_POR_UNIDAD[s.motor as string] ?? 100000);
  }
  return { vertices: Math.round(vertices), segundos: Math.round(segundos * 10) / 10 };
}

function passoTipo(paso: Record<string, unknown>): string { return typeof paso.tipo === "string" ? paso.tipo : ""; }

export function necesitaConfirmacion(trabajo: Trabajo3D, perfil: "ninguno" | "ligero" | "estandar" | "estudio"): boolean {
  const TOPES_LIGERO = { ancho: 1280, alto: 720, muestras: 64, fotogramas: 120 };
  if (perfil === "ninguno") return true;
  const coste = estimarCoste(trabajo);
  if (trabajo.ambito === "grupo" || trabajo.ambito === "publica" || trabajo.calidad === "final") return true;
  if (trabajo.escena.some((p) => p.op === "importar")) return true;
  const pasa = trabajo.salidas.some((s) => (s.ancho as number) > TOPES_LIGERO.ancho || (s.alto as number) > TOPES_LIGERO.alto || ((s.muestras as number | undefined) ?? 0) > 64 || ((s.hasta as number | undefined) ?? 0) > 120)
    || coste.vertices > 200000 || coste.segundos > 600;
  return pasa;
}


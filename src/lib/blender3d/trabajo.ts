// Trabajo 3D como DATO (contrato architecture/blender-3d.md §4). Módulo PURO: sin node:*,
// sin red, sin eval; solo importa vocabulario.json (compartido con Python en BLD1025D).
// FORMATO DE LAS ESPECIFICACIONES (lista cerrada; Python las implementa idénticas):
// {"t":"num","min":n,"max":n,"ent":true?} · {"t":"enum","v":[…]} · {"t":"bool"} ·
// {"t":"vec","n":3,"min":n,"max":n} · {"t":"rgba"} (4 números 0–1) · {"t":"nombre"} (único,
// crea un objeto) · {"t":"ref"} (nombre ya creado ANTES en la escena) ·
// {"t":"txt","max":n,"patron":"…"} · {"t":"ruta","ext":[…]} (relativa, sin "..") ·
// {"t":"lista","de":espec,"max":n} · {"t":"obj","campos":{…}}; cualquier espec lleva
// "opc":true y "def":valor (valor que se rellena por omisión).
import vocabularioBruto from "./vocabulario.json";
export type ValorObj = { [c: string]: Valor };
export type Valor = string | number | boolean | Valor[] | ValorObj;
export type Operacion = { op: string } & Record<string, Valor>;
export type Salida = { tipo: string } & Record<string, Valor>;
export type Origen = "protomolecula" | "astraura" | "estudio" | "xr" | "avatares" | "orbe" | "api";
export type Perfil = "ninguno" | "ligero" | "estandar" | "estudio";
export interface Trabajo3D {
  v: 1;
  titulo: string;
  calidad: "borrador" | "normal" | "final";
  ambito: "personal" | "perfil" | "grupo" | "publica";
  origen: Origen;
  quien: "persona" | "agente";
  escena: Operacion[];
  salidas: Salida[];
  limites?: { segundos?: number; memoriaMB?: number };
}
export const VERSION_VOCABULARIO = vocabularioBruto.version;
type Espec = { t: string; min?: number; max?: number; ent?: boolean; n?: number; v?: string[]; patron?: string; ext?: string[]; de?: Espec; campos?: Record<string, Espec>; opc?: boolean; def?: Valor };
type Definicion = { estado: string; motivo?: string; params: Record<string, Espec> };
const V = vocabularioBruto as unknown as { topes: Record<string, number>; operaciones: Record<string, Definicion>; salidas: Record<string, Definicion> };
class Motivo extends Error {}
function fallo(texto: string): never { throw new Motivo(texto); }
const REGEX_NOMBRE = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
const REGEX_RUTA = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;
type Ctx = { creados: string[] };
function esNumero(x: unknown, min: number, max: number, ent: boolean, ruta: string): number {
  if (typeof x !== "number" || !Number.isFinite(x)) fallo(`${ruta}: tiene que ser un número finito`);
  if (ent && !Number.isInteger(x)) fallo(`${ruta}: tiene que ser un número entero`);
  if (x < min || x > max) fallo(`${ruta}: fuera de rango (${min}–${max})`);
  return x;
}
function validarValor(es: Espec, val: unknown, ruta: string, ctx: Ctx): Valor | undefined {
  if (val === undefined) {
    if (es.opc || es.def !== undefined) return es.def;
    fallo(`${ruta}: falta el campo`);
  }
  switch (es.t) {
    case "num":
      if (Array.isArray(val)) fallo(`${ruta}: no admite listas`);
      return esNumero(val, es.min ?? -Infinity, es.max ?? Infinity, es.ent === true, ruta);
    case "enum":
      if (typeof val !== "string" || !es.v || !es.v.includes(val)) fallo(`${ruta}: valor fuera de la lista`);
      return val;
    case "bool":
      if (typeof val !== "boolean") fallo(`${ruta}: tiene que ser true o false`);
      return val;
    case "vec":
      if (!Array.isArray(val) || val.length !== es.n) fallo(`${ruta}: lista de ${es.n} números`);
      return val.map((v, i) => esNumero(v, es.min ?? -Infinity, es.max ?? Infinity, false, `${ruta}[${i}]`));
    case "rgba":
      if (!Array.isArray(val) || val.length !== 4) fallo(`${ruta}: lista de 4 números`);
      return val.map((v, i) => esNumero(v, 0, 1, false, `${ruta}[${i}]`));
    case "nombre":
      if (typeof val !== "string" || !REGEX_NOMBRE.test(val)) fallo(`${ruta}: nombre no válido`);
      if (ctx.creados.includes(val)) fallo(`${ruta}: el nombre «${val}» ya existe`);
      ctx.creados.push(val);
      return val;
    case "ref":
      if (typeof val !== "string" || !REGEX_NOMBRE.test(val)) fallo(`${ruta}: nombre no válido`);
      if (!ctx.creados.includes(val)) fallo(`${ruta}: «${val}» no existe todavía en la escena`);
      return val;
    case "txt":
      if (typeof val !== "string" || val.length > (es.max ?? 0) || !es.patron || !new RegExp(es.patron).test(val))
        fallo(`${ruta}: texto no permitido por el patrón`);
      return val;
    case "ruta": {
      if (typeof val !== "string" || !REGEX_RUTA.test(val)) fallo(`${ruta}: ruta no válida`);
      if (val.startsWith("/") || val.includes("..")) fallo(`${ruta}: la ruta tiene que ser relativa y sin «..»`);
      const final = val.toLowerCase().split("/").pop() ?? "";
      if (!es.ext || !es.ext.some((x) => final.endsWith(`.${x.toLowerCase()}`))) fallo(`${ruta}: extensión no permitida`);
      return val;
    }
    case "lista":
      if (!Array.isArray(val) || val.length > (es.max ?? 0) || !es.de) fallo(`${ruta}: lista de ${es.max} valores como mucho`);
      return val.map((v, i) => validarValor(es.de!, v, `${ruta}[${i}]`, ctx) as Valor);
    case "obj": {
      const bruto = val !== null && typeof val === "object" && !Array.isArray(val) ? (val as Record<string, unknown>) : null;
      if (!bruto) fallo(`${ruta}: tiene que ser un objeto`);
      const campos = es.campos ?? {};
      for (const k of Object.keys(bruto)) if (!(k in campos)) fallo(`${ruta}.${k}: campo desconocido`);
      const listo: ValorObj = {};
      for (const [k, espec] of Object.entries(campos)) {
        const v = validarValor(espec, bruto[k], `${ruta}.${k}`, ctx);
        if (v !== undefined) listo[k] = v;
      }
      return listo;
    }
    default:
      fallo(`${ruta}: especificación desconocida`);
  }
}
function comoObjeto(item: unknown, ruta: string): Record<string, unknown> {
  const b = item !== null && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : null;
  if (!b) fallo(`${ruta}: tiene que ser un objeto`);
  return b;
}
function validarLista(nombre: string, defs: Record<string, Definicion>, lista: unknown[], campo: string, ctx: Ctx): ValorObj[] {
  return lista.map((item) => {
    const b = comoObjeto(item, `trabajo.${nombre}`);
    const def = defs[String(b[campo])];
    if (!def) fallo(`trabajo.${nombre}: «${String(b[campo])}» es desconocido`);
    if (nombre === "escena" && def.estado !== "listo") fallo(`op «${String(b[campo])}»: próximamente — ${def.motivo ?? "no disponible"}`);
    for (const k of Object.keys(b)) if (k !== campo && !(k in def.params)) fallo(`${nombre}.${k}: campo desconocido`);
    const listo: ValorObj = { [campo]: String(b[campo]) };
    for (const [k, espec] of Object.entries(def.params)) {
      const v = validarValor(espec, b[k], `${nombre}.${k}`, ctx);
      if (v !== undefined) listo[k] = v;
    }
    return listo;
  });
}
function validarLimites(l: unknown): void {
  const b = comoObjeto(l, "trabajo.limites");
  for (const [k, v] of Object.entries(b)) {
    if (k !== "segundos" && k !== "memoriaMB") fallo(`trabajo.limites.${k}: campo desconocido`);
    esNumero(v, 1, Number.MAX_SAFE_INTEGER, true, `trabajo.limites.${k}`);
  }
}

export function validarTrabajo(bruto: unknown): { ok: true; trabajo: Trabajo3D } | { ok: false; motivos: string[] } {
  try {
    const b = comoObjeto(bruto, "trabajo");
    for (const k of Object.keys(b)) if (!["v", "titulo", "calidad", "ambito", "origen", "quien", "escena", "salidas", "limites"].includes(k)) fallo(`trabajo.${k}: campo desconocido`);
    if (b.v !== 1) fallo("trabajo.v: la versión tiene que ser 1");
    if (typeof b.titulo !== "string" || b.titulo.length < 1 || b.titulo.length > 80) fallo("trabajo.titulo: texto de 1 a 80 letras");
    const enumDe = (val: unknown, lista: string[], ruta: string): string => {
      if (typeof val !== "string" || !lista.includes(val)) fallo(`${ruta}: valor fuera de la lista`);
      return val;
    };
    enumDe(b.calidad, ["borrador", "normal", "final"], "trabajo.calidad");
    enumDe(b.ambito, ["personal", "perfil", "grupo", "publica"], "trabajo.ambito");
    enumDe(b.origen, ["protomolecula", "astraura", "estudio", "xr", "avatares", "orbe", "api"], "trabajo.origen");
    enumDe(b.quien, ["persona", "agente"], "trabajo.quien");
    if (!Array.isArray(b.escena) || b.escena.length > V.topes.operaciones) fallo("trabajo.escena: lista de 256 operaciones como mucho");
    if (!Array.isArray(b.salidas) || b.salidas.length < 1 || b.salidas.length > 4) fallo("trabajo.salidas: lista de 1 a 4 salidas");
    if (b.limites !== undefined) validarLimites(b.limites);
    const ctx: Ctx = { creados: [] };
    const escena = validarLista("escena", V.operaciones, b.escena as unknown[], "op", ctx) as Operacion[];
    const salidas = validarLista("salidas", V.salidas, b.salidas as unknown[], "tipo", ctx) as Salida[];
    const trabajo: Trabajo3D = {
      v: 1,
      titulo: b.titulo,
      calidad: b.calidad as Trabajo3D["calidad"],
      ambito: b.ambito as Trabajo3D["ambito"],
      origen: b.origen as Origen,
      quien: b.quien as Trabajo3D["quien"],
      escena,
      salidas,
      ...(b.limites !== undefined ? { limites: b.limites as Trabajo3D["limites"] } : {}),
    };
    const coste = estimarCoste(trabajo);
    if (coste.vertices > V.topes.vertices) fallo(`coste: más de ${V.topes.vertices} vértices estimados`);
    if (coste.segundos > V.topes.segundos) fallo(`coste: más de ${V.topes.segundos} segundos estimados`);
    return { ok: true, trabajo };
  } catch (error) {
    const texto = error instanceof Motivo ? error.message : error instanceof Error ? `Error no esperado: ${error.message}` : "Error no esperado";
    return { ok: false, motivos: [texto] };
  }
}

// Coste estimado (pura): vértices de las primitivas × 4^niveles de subdivisión; segundos ≈
// píxeles × muestras × fotogramas / constante del motor (medidas del contrato §1.4).
const VERTICES: Record<string, number> = { cubo: 8, esfera: 768, icosfera: 320, cilindro: 128, cono: 96, toro: 576, plano: 4, circulo: 32 };
const SEGUNDO_POR: Record<string, number> = { workbench: 200000, "cycles-cpu": 150000, "cycles-gpu": 3000000, eevee: 2000000 };

export function estimarCoste(trabajo: Trabajo3D): { vertices: number; segundos: number } {
  const base: Record<string, number> = {};
  const niveles: Record<string, number> = {};
  for (const op of trabajo.escena) {
    if (op.op === "primitiva" && typeof op.tipo === "string" && typeof op.nombre === "string") base[op.nombre] = VERTICES[op.tipo] ?? 0;
    if (op.op === "modificador" && op.tipo === "subdivision" && typeof op.objeto === "string")
      niveles[op.objeto] = Math.min((niveles[op.objeto] ?? 0) + (typeof op.niveles === "number" ? op.niveles : 0), 12);
  }
  let vertices = 0;
  for (const nombre of Object.keys(base)) vertices += base[nombre] * Math.pow(4, niveles[nombre] ?? 0);
  let segundos = 0;
  for (const sal of trabajo.salidas) {
    const ancho = typeof sal.ancho === "number" ? sal.ancho : 1, alto = typeof sal.alto === "number" ? sal.alto : 1;
    const muestras = typeof sal.muestras === "number" ? sal.muestras : 32;
    const desde = typeof sal.desde === "number" ? sal.desde : 0, hasta = typeof sal.hasta === "number" ? sal.hasta : 0;
    const fotogramas = sal.tipo === "render_mp4" ? Math.max(1, hasta - desde + 1) : 1;
    segundos += (ancho * alto * muestras * fotogramas) / (SEGUNDO_POR[typeof sal.motor === "string" ? sal.motor : ""] ?? 150000);
  }
  return { vertices, segundos };
}

export function necesitaConfirmacion(trabajo: Trabajo3D, perfil: Perfil): boolean {
  if (trabajo.ambito === "grupo" || trabajo.ambito === "publica") return true;
  if (trabajo.escena.some((op) => op.op === "importar")) return true;
  if (trabajo.calidad === "final") return true;
  if (perfil === "ligero") {
    const coste = estimarCoste(trabajo);
    return coste.segundos > 60 || coste.vertices > 50000;
  }
  return false;
}

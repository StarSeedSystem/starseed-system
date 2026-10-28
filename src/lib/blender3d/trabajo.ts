/**
 * Trabajo 3D como DATO — `architecture/blender-3d.md` §4. Puro: sin módulos de Node, React, red ni evaluación dinámica.
 * Especificaciones del vocabulario (idénticas en Python); cualquiera admite `"opc":true` y `"def":valor`:
 *   num {t,min,max,ent?} · enum {v} · bool · vec {n,min,max} · rgba · nombre · ref
 *   txt {max,patron} · ruta {ext} (relativa, sin «..» ni «/» inicial) · lista {de,max} · obj {campos}
 *   `nombre` crea un objeto único ^[A-Za-z][A-Za-z0-9_-]{0,31}$; `ref` exige un nombre creado antes.
 */
import vocabulario from "./vocabulario.json";
export const VERSION_VOCABULARIO = 1;
export type Operacion = { op: string } & Record<string, unknown>;
export type Salida = { tipo: string } & Record<string, unknown>;
export interface Trabajo3D { v: 1; titulo: string; calidad: "borrador" | "normal" | "final"; ambito: "personal" | "perfil" | "grupo" | "publica"; origen: "protomolecula" | "astraura" | "estudio" | "xr" | "avatares" | "orbe" | "api"; quien: "persona" | "agente"; escena: Operacion[]; salidas: Salida[]; limites?: { segundos?: number; memoriaMB?: number } }
type Espec = { t: string; min?: number; max?: number; ent?: boolean; v?: unknown[]; n?: number; de?: Espec; campos?: Record<string, Espec>; ext?: string[]; patron?: string; opc?: boolean; def?: unknown };
type Def = { estado?: string; motivo?: string; params: Record<string, Espec> };
type Ctx = { nombres: Set<string>; crear: boolean };
const V = vocabulario as unknown as { version: number; topes: Record<string, number>; operaciones: Record<string, Def>; salidas: Record<string, Def> };
const RE_NOMBRE = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
const RE_RUTA = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;
const BASE: Record<string, number> = { cubo: 8, plano: 4, circulo: 32, esfera: 482, icosfera: 42, cilindro: 64, cono: 64, toro: 576 };
const VELOCIDAD: Record<string, number> = { workbench: 350000, "cycles-cpu": 120000, "cycles-gpu": 1500000, eevee: 15000 };
function esObj(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }
function validarObjeto(e: Espec, v: unknown, ctx: Ctx): string | null {
  if (!esObj(v)) return "debe ser un objeto";
  const campos = e.campos ?? {};
  const propio = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
  for (const clave of Object.keys(v)) if (!propio(campos, clave)) return `campo desconocido: ${clave}`;
  for (const [clave, campo] of Object.entries(campos)) {
    if (!propio(v, clave)) { if (!campo.opc && campo.def === undefined) return `falta el campo obligatorio: ${clave}`; continue; }
    const error = validarCampo(campo, v[clave], ctx); if (error) return `${clave}: ${error}`;
  }
  return null;
}
function validarCampo(e: Espec, v: unknown, ctx: Ctx): string | null {
  const num = (x: unknown) => typeof x === "number" && Number.isFinite(x);
  switch (e.t) {
    case "num": return num(v) && (!e.ent || Number.isInteger(v)) && (e.min === undefined || (v as number) >= e.min) && (e.max === undefined || (v as number) <= e.max) ? null : `número${e.ent ? " entero" : ""} en rango [${e.min ?? "-∞"}, ${e.max ?? "∞"}]`;
    case "bool": return typeof v === "boolean" ? null : "debe ser booleano";
    case "enum": return e.v?.includes(v) ? null : `valor no permitido (usa ${e.v?.join(", ") ?? "nada"})`;
    case "vec": return Array.isArray(v) && v.length === e.n && v.every((x) => num(x) && (e.min === undefined || x >= e.min) && (e.max === undefined || x <= e.max)) ? null : `vector de ${e.n} números en rango [${e.min ?? "-∞"}, ${e.max ?? "∞"}]`;
    case "rgba": return Array.isArray(v) && v.length === 4 && v.every((x) => num(x) && (x as number) >= 0 && (x as number) <= 1) ? null : "rgba: 4 números entre 0 y 1";
    case "nombre": {
      if (typeof v !== "string" || !RE_NOMBRE.test(v) || ctx.nombres.has(v)) return `nombre inválido o repetido: ${String(v)}`;
      ctx.nombres.add(v); return null;
    }
    case "ref": return typeof v === "string" && ctx.nombres.has(v) ? null : `referencia a un objeto que no existe: ${String(v)}`;
    case "txt": return typeof v !== "string" ? "debe ser texto" : v.length > (e.max ?? Infinity) ? `texto más largo de ${e.max} caracteres` : e.patron && !new RegExp(e.patron, "u").test(v) ? "texto con caracteres no permitidos" : null;
    case "ruta": return typeof v === "string" && RE_RUTA.test(v) && !v.includes("..") && !v.startsWith("/") && e.ext?.includes(v.slice(v.lastIndexOf(".") + 1).toLowerCase()) ? null : `ruta relativa inválida (extensiones: ${e.ext?.join(", ") ?? "ninguna"})`;
    case "lista": {
      if (!Array.isArray(v)) return "debe ser una lista";
      const errores = v.map((x, i) => { const z = validarCampo(e.de as Espec, x, ctx); return z ? `${i}: ${z}` : null; });
      return e.max !== undefined && v.length > e.max ? `lista con más de ${e.max} elementos` : errores.find((z) => z !== null) ?? null;
    }
    case "obj": return validarObjeto(e, v, ctx);
    default: return `especificación desconocida: ${e.t}`;
  }
}
function validarElemento(v: unknown, tipo: unknown, defs: Record<string, Def>, clase: "operacion" | "salida", ctx: Ctx): string | null {
  if (!esObj(v)) return `la ${clase} debe ser un objeto`;
  const definicion = defs[String(tipo)];
  if (!definicion) return `${clase} desconocida: ${String(tipo)}`;
  if (clase === "operacion" && definicion.estado !== "listo") return `${String(tipo)}: próximamente (${definicion.motivo ?? "sin motivo"})`;
  const cuerpo = { ...v }; delete cuerpo[clase === "operacion" ? "op" : "tipo"];
  return validarObjeto({ t: "obj", campos: definicion.params }, cuerpo, ctx);
}
export function validarTrabajo(bruto: unknown): { ok: true; trabajo: Trabajo3D } | { ok: false; motivos: string[] } {
  const motivos: string[] = [];
  if (!esObj(bruto)) return { ok: false, motivos: ["el trabajo debe ser un objeto"] };
  const permitidos = ["v", "titulo", "calidad", "ambito", "origen", "quien", "escena", "salidas", "limites"];
  for (const clave of Object.keys(bruto)) if (!permitidos.includes(clave)) motivos.push(`campo desconocido en el trabajo: ${clave}`);
  if (bruto.v !== 1) motivos.push("v debe ser 1");
  if (typeof bruto.titulo !== "string" || bruto.titulo.trim().length === 0 || bruto.titulo.length > 80) motivos.push("titulo debe ser texto de 1 a 80 caracteres");
  const ENUMS: Record<string, string[]> = { calidad: ["borrador", "normal", "final"], ambito: ["personal", "perfil", "grupo", "publica"], origen: ["protomolecula", "astraura", "estudio", "xr", "avatares", "orbe", "api"] };
  for (const [campo, opciones] of Object.entries(ENUMS)) if (!opciones.includes(String(bruto[campo]))) motivos.push(`${campo} no válido`);
  if (bruto.quien !== "persona" && bruto.quien !== "agente") motivos.push("quien debe ser persona o agente");
  const ctx: Ctx = { nombres: new Set(), crear: true };
  if (!Array.isArray(bruto.escena)) motivos.push("escena debe ser una lista");
  else {
    if (bruto.escena.length > V.topes.operaciones) motivos.push(`demasiadas operaciones: máximo ${V.topes.operaciones}`);
    for (const [i, op] of (bruto.escena as unknown[]).entries()) { const error = validarElemento(op, esObj(op) ? op.op : undefined, V.operaciones, "operacion", ctx); if (error) motivos.push(`escena[${i}]: ${error}`); }
  }
  if (!Array.isArray(bruto.salidas)) motivos.push("salidas debe ser una lista");
  else if (bruto.salidas.length < 1 || bruto.salidas.length > 4) motivos.push("salidas debe tener entre 1 y 4 elementos");
  else for (const [i, s] of (bruto.salidas as unknown[]).entries()) { const error = validarElemento(s, esObj(s) ? s.tipo : undefined, V.salidas, "salida", ctx); if (error) motivos.push(`salidas[${i}]: ${error}`); }
  if (bruto.limites !== undefined && !esObj(bruto.limites)) motivos.push("limites debe ser un objeto");
  else if (esObj(bruto.limites)) {
    for (const clave of Object.keys(bruto.limites)) if (clave !== "segundos" && clave !== "memoriaMB") motivos.push(`campo desconocido en limites: ${clave}`);
    for (const clave of ["segundos", "memoriaMB"]) { const x = bruto.limites[clave]; if (x !== undefined && (typeof x !== "number" || !Number.isFinite(x) || x <= 0 || (clave === "segundos" && x > V.topes.segundos))) motivos.push(`limites.${clave} debe ser un número positivo dentro de los topes`); }
  }
  if (motivos.length) return { ok: false, motivos };
  const trabajo = bruto as unknown as Trabajo3D;
  const coste = estimarCoste(trabajo);
  if (coste.vertices > V.topes.vertices) motivos.push(`demasiados vértices: ${coste.vertices} (máximo ${V.topes.vertices})`);
  if (coste.segundos > V.topes.segundos) motivos.push(`demasiados segundos estimados: ${coste.segundos} (máximo ${V.topes.segundos})`);
  return motivos.length ? { ok: false, motivos } : { ok: true, trabajo };
}
export function estimarCoste(trabajo: Trabajo3D): { vertices: number; segundos: number } {
  const cuenta = new Map<string, number>();
  let vertices = 0;
  for (const op of trabajo.escena) {
    if (op.op === "primitiva") { const n = BASE[String(op.tipo)] ?? 0; cuenta.set(String(op.nombre), n); vertices += n; }
    else if (op.op === "modificador" && op.tipo === "subdivision") { const nombre = String(op.objeto); const previos = cuenta.get(nombre) ?? 0; const veces = 4 ** (typeof op.niveles === "number" ? op.niveles : 0); cuenta.set(nombre, previos * veces); vertices += previos * (veces - 1); }
  }
  let segundos = 0;
  for (const s of trabajo.salidas) { if (!s.tipo.startsWith("render_")) continue; const fotogramas = s.tipo === "render_mp4" ? Math.max(1, Number(s.hasta) - Number(s.desde) + 1) : 1; segundos += (Number(s.ancho) * Number(s.alto) * Number(s.muestras) * fotogramas) / (VELOCIDAD[String(s.motor)] ?? VELOCIDAD["cycles-cpu"]); }
  return { vertices, segundos: Math.round(segundos * 1000) / 1000 };
}
const TOPES: Record<string, { ancho: number; alto: number; muestras: number; fotogramas: number; memoriaMB: number } | null> = {
  ninguno: null, ligero: { ancho: 1280, alto: 720, muestras: 64, fotogramas: 120, memoriaMB: 2048 },
  estandar: { ancho: 1920, alto: 1080, muestras: 256, fotogramas: 300, memoriaMB: 4096 }, estudio: { ancho: 3840, alto: 2160, muestras: 1024, fotogramas: 1800, memoriaMB: 8192 },
};
export function necesitaConfirmacion(trabajo: Trabajo3D, perfil: "ninguno" | "ligero" | "estandar" | "estudio"): boolean {
  if (trabajo.ambito === "grupo" || trabajo.ambito === "publica" || trabajo.calidad === "final") return true;
  if (trabajo.escena.some((op) => op.op === "importar")) return true;
  const tope = TOPES[perfil];
  if (!tope) return true;
  if ((trabajo.limites?.memoriaMB ?? 0) > tope.memoriaMB) return true;
  return trabajo.salidas.some((s) => { if (!s.tipo.startsWith("render_")) return false; const fotogramas = s.tipo === "render_mp4" ? Math.max(1, Number(s.hasta) - Number(s.desde) + 1) : 1; return Number(s.ancho) > tope.ancho || Number(s.alto) > tope.alto || Number(s.muestras) > tope.muestras || fotogramas > tope.fotogramas; });
}

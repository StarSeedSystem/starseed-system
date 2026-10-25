/**
 * Núcleo PURO del «trabajo 3D» (contrato architecture/blender-3d.md §4) y su vocabulario único.
 * Especificaciones (lista cerrada): num{min,max,ent?} · enum{v} · bool · vec{n,min,max} ·
 * rgba (4 números 0–1) · nombre{único, CREA objeto} · ref{nombre creado antes} · txt{max,patron} ·
 * ruta{ext} relativa, sin «..» ni «/» inicial · lista{de,max} · obj{campos}. Cualquiera admite
 * «opc»:true y «def». Valida números finitos, enteros, rangos, longitudes, nombres únicos,
 * referencias anteriores, campos desconocidos (rechazo con motivo) y operaciones «proximamente».
 * Sin módulos de Node, React, red ni evaluación dinámica: lo leen TypeScript y Python (BLD1025D).
 */
import vocabulario from "./vocabulario.json";

export const VERSION_VOCABULARIO = vocabulario.version;
export type Calidad = "borrador" | "normal" | "final"; export type Ambito = "personal" | "perfil" | "grupo" | "publica";
export type Origen = "protomolecula" | "astraura" | "estudio" | "xr" | "avatares" | "orbe" | "api"; export type Quien = "persona" | "agente";
export type Perfil = "ninguno" | "ligero" | "estandar" | "estudio";
export interface Operacion { op: string; [campo: string]: unknown }
export interface Salida { tipo: string; [campo: string]: unknown }
export interface Trabajo3D { v: 1; titulo: string; calidad: Calidad; ambito: Ambito; origen: Origen; quien: Quien; escena: Operacion[]; salidas: Salida[]; limites?: { segundos?: number; memoriaMB?: number } }
export type ResultadoTrabajo = { ok: true; trabajo: Trabajo3D } | { ok: false; motivos: string[] };
type Espec = { t: string; min?: number; max?: number; ent?: boolean; v?: string[]; n?: number; de?: Espec; campos?: Record<string, Espec>; ext?: string[]; patron?: string; opc?: boolean; def?: unknown };
type Objeto = Record<string, unknown>; type Ctx = { creados: Set<string>; motivos: string[] };
type Def = { estado?: "listo" | "proximamente"; motivo?: string; params: Record<string, Espec> };
const VOCAB = vocabulario as unknown as { version: number; topes: Record<string, number>; operaciones: Record<string, Def>; salidas: Record<string, Def> };
const esObjeto = (v: unknown): v is Objeto => typeof v === "object" && v !== null && !Array.isArray(v);
const arreglo = (v: unknown): unknown[] | undefined => (Array.isArray(v) ? (v as unknown[]) : undefined);
const numero = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
function fallar(ctx: Ctx, ruta: string, motivo: string): undefined { ctx.motivos.push(`${ruta}: ${motivo}`); return undefined; }

function campo(esp: Espec, valor: unknown, ruta: string, ctx: Ctx): unknown {
  const dentro = (n: number) => n >= (esp.min ?? -Infinity) && n <= (esp.max ?? Infinity);
  switch (esp.t) {
    case "num":
      return typeof valor === "number" && Number.isFinite(valor) && dentro(valor) && (!esp.ent || Number.isInteger(valor))
        ? valor
        : fallar(ctx, ruta, `Número finito en rango (${esp.min ?? "-∞"}–${esp.max ?? "∞"}${esp.ent ? ", entero" : ""}).`);
    case "enum":
      return typeof valor === "string" && !!esp.v?.includes(valor) ? valor : fallar(ctx, ruta, `Debe ser uno de: ${esp.v?.join(", ")}.`);
    case "bool":
      return typeof valor === "boolean" ? valor : fallar(ctx, ruta, "Debe ser verdadero o falso.");
    case "vec": {
      const v = arreglo(valor);
      return v && v.length === esp.n && v.every((n) => typeof n === "number" && Number.isFinite(n) && dentro(n))
        ? v.slice()
        : fallar(ctx, ruta, `Vector de ${esp.n} números finitos en rango.`);
    }
    case "rgba": {
      const v = arreglo(valor);
      return v && v.length === 4 && v.every((n) => typeof n === "number" && n >= 0 && n <= 1) ? v.slice() : fallar(ctx, ruta, "Color rgba de 4 números entre 0 y 1.");
    }
    case "nombre":
      return typeof valor === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(valor) && !ctx.creados.has(valor)
        ? (ctx.creados.add(valor), valor)
        : fallar(ctx, ruta, "Nombre único: letra inicial y hasta 32 letras, cifras, «_» o «-».");
    case "ref":
      return typeof valor === "string" && ctx.creados.has(valor) ? valor : fallar(ctx, ruta, `Debe referir un objeto creado antes; «${String(valor)}» no existe.`);
    case "txt":
      return typeof valor === "string" && valor.length <= (esp.max ?? 0) && (!esp.patron || new RegExp(esp.patron).test(valor))
        ? valor
        : fallar(ctx, ruta, `Texto inválido o de más de ${esp.max ?? 0} caracteres.`);
    case "ruta": {
      const ext = typeof valor === "string" ? (valor.split(".").pop() ?? "").toLowerCase() : "";
      return typeof valor === "string" && /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/.test(valor) && !valor.includes("..") && !!ext && !!esp.ext?.includes(ext)
        ? valor
        : fallar(ctx, ruta, `Ruta relativa y sin «..», con extensión ${esp.ext?.join(", ")}.`);
    }
    case "lista": {
      const v = arreglo(valor);
      if (!v || v.length > (esp.max ?? 0)) return fallar(ctx, ruta, `Lista de ${esp.max ?? 0} elementos como máximo.`);
      const salida: unknown[] = [];
      for (let i = 0; i < v.length; i++) {
        const r = esp.de ? campo(esp.de, v[i], `${ruta}[${i}]`, ctx) : undefined;
        if (r === undefined) return undefined;
        salida.push(r);
      }
      return salida;
    }
    case "obj":
      return campos(esp.campos ?? {}, valor, ruta, ctx);
    default:
      return fallar(ctx, ruta, `Especificación desconocida «${esp.t}».`);
  }
}

function campos(especs: Record<string, Espec>, valor: unknown, ruta: string, ctx: Ctx): Objeto | undefined {
  if (!esObjeto(valor)) return fallar(ctx, ruta, "Debe ser un objeto.");
  let ok = true;
  for (const clave of Object.keys(valor)) if (!(clave in especs)) { fallar(ctx, `${ruta}.${clave}`, "Campo desconocido."); ok = false; }
  const salida: Objeto = {};
  for (const [clave, esp] of Object.entries(especs)) {
    const v = valor[clave];
    if (v === undefined) {
      if (esp.opc) { if (esp.def !== undefined) salida[clave] = esp.def; } else { fallar(ctx, `${ruta}.${clave}`, "Falta un campo obligatorio."); ok = false; }
      continue;
    }
    const r = campo(esp, v, `${ruta}.${clave}`, ctx);
    if (r === undefined) ok = false; else salida[clave] = r;
  }
  return ok ? salida : undefined;
}
function coleccion(valor: unknown, clave: string, defs: Record<string, Def>, ruta: string, max: number, ctx: Ctx): Objeto[] | undefined { return arreglo(valor) ? [] : fallar(ctx, ruta, "Debe ser una lista."); }
function limitesDe(valor: unknown, ctx: Ctx): NonNullable<Trabajo3D["limites"]> | undefined { return esObjeto(valor) ? {} : fallar(ctx, "limites", "Debe ser un objeto."); }

export function validarTrabajo(bruto: unknown): ResultadoTrabajo { return { ok: false, motivos: ["Pendiente."] }; }
export function estimarCoste(trabajo: Trabajo3D): { vertices: number; segundos: number } { return { vertices: 0, segundos: 0 }; }
export function necesitaConfirmacion(trabajo: Trabajo3D, perfil: Perfil): boolean { return false; }

// Trabajo 3D como DATO (architecture/blender-3d.md §4). Módulo PURO: sin módulos de Node, React, red ni eval.
// Especificaciones cerradas (idénticas en Python): {t:"num",min,max,ent?}, {t:"enum",v}, {t:"bool"},
// {t:"vec",n,min,max}, {t:"rgba"}, {t:"nombre"}, {t:"ref"}, {t:"txt",max,patron}, {t:"ruta",ext}, {t:"lista",de,max} y {t:"obj",campos}. Cualquiera admite opc:true y def; def lo aplica el generador.
import vocabulario from "./vocabulario.json";
export const VERSION_VOCABULARIO = 1;
export type Calidad = "borrador" | "normal" | "final";
export type Ambito = "personal" | "perfil" | "grupo" | "publica";
export type Origen = "protomolecula" | "astraura" | "estudio" | "xr" | "avatares" | "orbe" | "api";
export type Quien = "persona" | "agente";
export type Operacion = { op: string } & Record<string, unknown>;
export type Salida = { tipo: string } & Record<string, unknown>;
export type Trabajo3D = { v: 1; titulo: string; calidad: Calidad; ambito: Ambito; origen: Origen; quien: Quien; escena: Operacion[]; salidas: Salida[]; limites?: { segundos?: number; memoriaMB?: number } };
export type ResultadoValidacion = { ok: true; trabajo: Trabajo3D } | { ok: false; motivos: string[] };
type Espec = { t: string; opc?: boolean; def?: unknown; min?: number; max?: number; ent?: boolean; v?: string[]; n?: number; patron?: string; ext?: string[]; de?: Espec; campos?: Record<string, Espec> };
type Vocabulario = { version: number; topes: Record<string, number>; operaciones: Record<string, { estado: string; motivo?: string; params: Record<string, Espec> }>; salidas: Record<string, { params: Record<string, Espec> }> };
const VOC = vocabulario as unknown as Vocabulario; const TOPES = VOC.topes;
const RE_NOMBRE = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/; const RE_RUTA = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;
const CAMPOS = ["v", "titulo", "calidad", "ambito", "origen", "quien", "escena", "salidas", "limites"];
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const enLista = (v: unknown, xs: string[]): boolean => typeof v === "string" && xs.includes(v);

function validarValor(v: unknown, e: Espec, nombres: Set<string>, ruta: string): string | null {
  if (e.t === "num") {
    if (typeof v !== "number" || !Number.isFinite(v)) return `${ruta}: debe ser un número finito`;
    if (e.min !== undefined && v < e.min) return `${ruta}: por debajo del mínimo ${e.min}`;
    if (e.max !== undefined && v > e.max) return `${ruta}: por encima del máximo ${e.max}`;
    return e.ent === true && !Number.isInteger(v) ? `${ruta}: debe ser entero` : null;
  }
  if (e.t === "enum") return enLista(v, e.v ?? []) ? null : `${ruta}: valor no permitido`;
  if (e.t === "bool") return typeof v === "boolean" ? null : `${ruta}: debe ser booleano`;
  if (e.t === "rgba" || e.t === "vec") {
    const largo = e.t === "rgba" ? 4 : (e.n ?? 3), min = e.t === "rgba" ? 0 : (e.min ?? -Infinity), max = e.t === "rgba" ? 1 : (e.max ?? Infinity);
    if (!Array.isArray(v) || v.length !== largo) return `${ruta}: debe ser una lista de ${largo} números`;
    for (const x of v) if (typeof x !== "number" || !Number.isFinite(x) || x < min || x > max) return `${ruta}: valores fuera de rango`;
    return null; }
  if (e.t === "nombre" && (typeof v !== "string" || !RE_NOMBRE.test(v) || nombres.has(v))) return `${ruta}: nombre no válido o repetido`;
  if (e.t === "nombre") { nombres.add(String(v)); return null; }
  if (e.t === "ref") return typeof v === "string" && nombres.has(v) ? null : `${ruta}: referencia inexistente`;
  if (e.t === "txt") return typeof v !== "string" ? `${ruta}: debe ser texto` : v.length > (e.max ?? 0) ? `${ruta}: texto demasiado largo` : e.patron && !new RegExp(e.patron).test(v) ? `${ruta}: caracteres no permitidos` : null;
  if (e.t === "ruta") return typeof v !== "string" || !RE_RUTA.test(v) || v.includes("..") ? `${ruta}: ruta relativa no válida` : (e.ext ?? []).includes(v.slice(v.lastIndexOf(".") + 1).toLowerCase()) ? null : `${ruta}: extensión no permitida`;
  if (e.t === "lista") {
    if (!Array.isArray(v) || v.length > (e.max ?? 0)) return `${ruta}: lista no válida o demasiado larga`;
    if (!e.de) return `${ruta}: especificación de lista incompleta`;
    for (let i = 0; i < v.length; i++) { const mal = validarValor(v[i], e.de, nombres, `${ruta}[${i}]`); if (mal) return mal; }
    return null; }
  if (e.t === "obj") return esObjeto(v) ? validarCampos(v, e.campos ?? {}, nombres, ruta) : `${ruta}: debe ser un objeto`;
  return `${ruta}: especificación desconocida «${e.t}»`;
}

function validarCampos(v: Record<string, unknown>, campos: Record<string, Espec>, nombres: Set<string>, ruta: string): string | null {
  for (const k of Object.keys(v)) if (!Object.hasOwn(campos, k)) return `${ruta}.${k}: campo desconocido`;
  for (const [k, e] of Object.entries(campos)) {
    const valor = v[k];
    if (valor === undefined) { if (e.opc !== true) return `${ruta}.${k}: falta un campo obligatorio`; continue; }
    const mal = validarValor(valor, e, nombres, `${ruta}.${k}`); if (mal) return mal;
  }
  return null;
}

export function validarTrabajo(bruto: unknown): ResultadoValidacion {
  if (!esObjeto(bruto)) return { ok: false, motivos: ["el trabajo debe ser un objeto"] };
  const motivos: string[] = [];
  for (const k of Object.keys(bruto)) if (!CAMPOS.includes(k)) motivos.push(`campo desconocido «${k}»`);
  if (bruto.v !== 1) motivos.push("v: debe ser 1");
  if (typeof bruto.titulo !== "string" || !bruto.titulo || bruto.titulo.length > 80) motivos.push("titulo: texto de 1 a 80 caracteres");
  const simples: [string, string[]][] = [["calidad", ["borrador", "normal", "final"]], ["ambito", ["personal", "perfil", "grupo", "publica"]], ["origen", ["protomolecula", "astraura", "estudio", "xr", "avatares", "orbe", "api"]], ["quien", ["persona", "agente"]]];
  for (const [k, xs] of simples) if (!enLista(bruto[k], xs)) motivos.push(`${k}: valor no permitido`);
  let nombres = new Set<string>(); const escena = bruto.escena;
  if (!Array.isArray(escena)) motivos.push("escena: debe ser una lista");
  else if (escena.length > TOPES.operaciones) motivos.push(`escena: más de ${TOPES.operaciones} operaciones`);
  else escena.forEach((item, i) => {
    if (!esObjeto(item) || typeof item.op !== "string") return motivos.push(`escena[${i}]: operación no válida`);
    const def = VOC.operaciones[item.op];
    if (!def) return motivos.push(`escena[${i}] ${item.op}: operación desconocida`);
    if (def.estado === "proximamente") return motivos.push(`escena[${i}] ${item.op}: próximamente — ${def.motivo ?? "sin motivo"}`);
    const ctx = new Set(nombres), resto = Object.fromEntries(Object.entries(item).filter(([k]) => k !== "op"));
    const mal = validarCampos(resto, def.params, ctx, `escena[${i}] ${item.op}`);
    if (mal) motivos.push(mal); else nombres = ctx;
  });
  const salidas = bruto.salidas; if (!Array.isArray(salidas) || salidas.length < 1 || salidas.length > 4) motivos.push("salidas: de 1 a 4"); else salidas.forEach((item, i) => {
    if (!esObjeto(item) || typeof item.tipo !== "string") return motivos.push(`salidas[${i}]: salida no válida`);
    const def = VOC.salidas[item.tipo];
    if (!def) return motivos.push(`salidas[${i}] ${item.tipo}: salida desconocida`);
    const resto = Object.fromEntries(Object.entries(item).filter(([k]) => k !== "tipo"));
    const mal = validarCampos(resto, def.params, nombres, `salidas[${i}] ${item.tipo}`);
    if (mal) motivos.push(mal);
  });
  const lim = bruto.limites; if (lim !== undefined && !esObjeto(lim)) motivos.push("limites: debe ser un objeto"); else if (lim !== undefined) {
    for (const k of Object.keys(lim)) if (k !== "segundos" && k !== "memoriaMB") motivos.push(`limites.${k}: campo desconocido`);
    const topes: [string, number, number][] = [["segundos", 0, TOPES.segundos], ["memoriaMB", 1, Infinity]];
    for (const [k, min, max] of topes) { const x = lim[k]; if (x !== undefined && (typeof x !== "number" || !Number.isFinite(x) || x < min || x > max)) motivos.push(`limites.${k}: fuera de rango`); }
  }
  if (!motivos.length) { const coste = estimarCoste(bruto as unknown as Trabajo3D); if (coste.vertices > TOPES.vertices || coste.segundos > TOPES.segundos) motivos.push("coste: supera los topes duros del vocabulario"); }
  return motivos.length ? { ok: false, motivos } : { ok: true, trabajo: bruto as unknown as Trabajo3D };
}

const VERTICES: Record<string, number> = { cubo: 8, esfera: 512, icosfera: 20, cilindro: 64, cono: 64, toro: 1024, plano: 4, circulo: 32 };
const MOTORES: Record<string, number> = { workbench: 4e5, "cycles-cpu": 15e4, "cycles-gpu": 15e5, eevee: 4e4 };
const numero = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);

export function estimarCoste(t: Trabajo3D): { vertices: number; segundos: number } {
  const v = new Map<string, number>();
  for (const o of t.escena) if (o.op === "primitiva" && typeof o.nombre === "string") v.set(o.nombre, VERTICES[String(o.tipo)] ?? 8);
  for (const o of t.escena) if (o.op === "modificador" && o.tipo === "subdivision" && typeof o.objeto === "string") v.set(o.objeto, (v.get(o.objeto) ?? 0) * 4 ** numero(o.niveles, 1));
  let vertices = 0; for (const n of v.values()) vertices += n;
  let segundos = 0;
  for (const s of t.salidas) {
    const fotos = s.tipo === "render_mp4" ? Math.max(1, numero(s.hasta) - numero(s.desde) + 1) : 1;
    segundos = Math.max(segundos, (numero(s.ancho) * numero(s.alto) * numero(s.muestras, 1) * fotos) / (MOTORES[String(s.motor)] ?? 15e4));
  }
  return { vertices, segundos: Math.round(segundos * 100) / 100 };
}

export function necesitaConfirmacion(t: Trabajo3D, perfil: "ninguno" | "ligero" | "estandar" | "estudio"): boolean {
  if (perfil === "ninguno" || t.calidad === "final") return true;
  if (t.ambito === "grupo" || t.ambito === "publica" || t.escena.some((o) => o.op === "importar")) return true;
  const tope = perfil === "ligero" ? { vertices: 5e5, segundos: 300 } : { vertices: TOPES.vertices, segundos: TOPES.segundos };
  const coste = estimarCoste(t); return coste.vertices > tope.vertices || coste.segundos > tope.segundos;
}

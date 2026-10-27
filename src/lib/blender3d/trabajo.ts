// Trabajo 3D como DATO (architecture/blender-3d.md §4); lo leen TypeScript y Python.
// Especificaciones CERRADAS: num {min,max,ent?}; enum {v}; bool; vec {n,min,max};
// rgba (4 números 0–1); nombre (^[A-Za-z][A-Za-z0-9_-]{0,31}$, único, crea objeto);
// ref (nombre ya creado); txt {max,patron:clase de caracteres, casa ^(?:patron)*$};
// ruta {ext} relativa sin «..» ni «/» inicial; lista {de,max}; obj {campos}; opc/def.
// Cualquier campo desconocido se rechaza con el motivo en español.
import vocabulario from "./vocabulario.json";
export type Operacion = { op: string; [k: string]: unknown };
export type Salida = { tipo: string; [k: string]: unknown };
export type Trabajo3D = {
  v: 1; titulo: string; calidad: "borrador" | "normal" | "final"; ambito: "personal" | "perfil" | "grupo" | "publica";
  origen: "protomolecula" | "astraura" | "estudio" | "xr" | "avatares" | "orbe" | "api"; quien: "persona" | "agente";
  escena: Operacion[]; salidas: Salida[]; limites?: { segundos?: number; memoriaMB?: number };
};
type E = { t: string; min?: number; max?: number; ent?: boolean; v?: string[]; n?: number; patron?: string; ext?: string[]; de?: E; campos?: Record<string, E>; opc?: boolean };
type P = { estado?: string; motivo?: string; params: Record<string, E> };
type V = { version: number; topes: Record<string, number>; operaciones: Record<string, P>; salidas: Record<string, P> };
const VOC = vocabulario as unknown as V;
export const VERSION_VOCABULARIO: number = VOC.version;
const NOMBRE = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/, RUTA = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;
const CLAVES = ["v", "titulo", "calidad", "ambito", "origen", "quien", "escena", "salidas", "limites"];
const AMBITOS = ["personal", "perfil", "grupo", "publica"], ORIGENES = ["protomolecula", "astraura", "estudio", "xr", "avatares", "orbe", "api"], CALIDADES = ["borrador", "normal", "final"];
const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const propio = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const malNum = (x: unknown): boolean => typeof x !== "number" || !Number.isFinite(x);
const rango = (e: E, v: number): boolean => (e.min === undefined || v >= e.min) && (e.max === undefined || v <= e.max);
function validarValor(e: E, x: unknown, c: string, nombres: Set<string>, m: string[]): void {
  if (x === undefined) { if (!e.opc) m.push(`${c}: falta un campo obligatorio`); return; }
  if (e.t === "num") {
    if (malNum(x)) m.push(`${c}: debe ser un número finito`);
    else if (e.ent && !Number.isInteger(x)) m.push(`${c}: debe ser entero`);
    else if (!rango(e, x)) m.push(`${c}: fuera de rango`);
  } else if (e.t === "enum") { if (typeof x !== "string" || !e.v!.includes(x)) m.push(`${c}: valor no permitido`);
  } else if (e.t === "bool") { if (typeof x !== "boolean") m.push(`${c}: debe ser booleano`);
  } else if (e.t === "rgba" || e.t === "vec") {
    const n = e.t === "rgba" ? 4 : e.n!, lim = e.t === "rgba" ? { t: "num", min: 0, max: 1 } : e;
    if (!Array.isArray(x) || x.length !== n) m.push(`${c}: debe ser un vector de ${n} números`);
    else (x as unknown[]).forEach((v, i) => { if (malNum(v)) m.push(`${c}[${i}]: debe ser un número finito`); else if (!rango(lim, v as number)) m.push(`${c}[${i}]: fuera de rango`); });
  } else if (e.t === "nombre") {
    if (typeof x !== "string" || !NOMBRE.test(x)) m.push(`${c}: nombre no válido`);
    else if (nombres.has(x)) m.push(`${c}: nombre repetido «${x}»`);
    else nombres.add(x);
  } else if (e.t === "ref") { if (typeof x !== "string" || !NOMBRE.test(x) || !nombres.has(x)) m.push(`${c}: referencia a un objeto que no existe`);
  } else if (e.t === "txt") {
    if (typeof x !== "string") m.push(`${c}: debe ser texto`);
    else {
      if (e.max !== undefined && x.length > e.max) m.push(`${c}: texto demasiado largo (máx ${e.max})`);
      if (e.patron && !new RegExp(`^(?:${e.patron})*$`, "u").test(x)) m.push(`${c}: texto con caracteres no permitidos`);
    }
  } else if (e.t === "ruta") {
    if (typeof x !== "string" || !RUTA.test(x) || x.includes("..") || x.startsWith("/")) m.push(`${c}: ruta relativa no válida`);
    else {
      const ext = x.slice(x.lastIndexOf(".") + 1).toLowerCase();
      if (e.ext && !e.ext.includes(ext)) m.push(`${c}: extensión «${ext}» no permitida`);
    }
  } else if (e.t === "lista") {
    if (!Array.isArray(x)) m.push(`${c}: debe ser una lista`);
    else {
      if (e.max !== undefined && x.length > e.max) m.push(`${c}: demasiados elementos (máx ${e.max})`);
      (x as unknown[]).forEach((v, i) => validarValor(e.de!, v, `${c}[${i}]`, nombres, m));
    }
  } else if (e.t === "obj") {
    if (!esObjeto(x)) m.push(`${c}: debe ser un objeto`);
    else {
      for (const k of Object.keys(x)) if (!propio(e.campos!, k)) m.push(`${c}.${k}: campo desconocido`);
      for (const [k, sub] of Object.entries(e.campos!)) validarValor(sub, x[k], `${c}.${k}`, nombres, m);
    }
  } else m.push(`${c}: especificación «${e.t}» desconocida`);
}
function validarPieza(x: unknown, clave: "op" | "tipo", tabla: Record<string, P>, c: string, nombres: Set<string>, m: string[]): void {
  if (!esObjeto(x)) { m.push(`${c}: debe ser un objeto`); return; }
  const id = x[clave];
  if (typeof id !== "string" || !propio(tabla, id)) { m.push(`${c}.${clave}: valor desconocido`); return; }
  const def = tabla[id];
  if (def.estado !== undefined && def.estado !== "listo") { m.push(`${c}: «${id}» próximamente: ${def.motivo ?? "no disponible"}`); return; }
  for (const k of Object.keys(x)) if (k !== clave && !propio(def.params, k)) m.push(`${c}.${k}: campo desconocido`);
  for (const [k, spec] of Object.entries(def.params)) validarValor(spec, x[k], `${c}.${k}`, nombres, m);
}
export type ResultadoTrabajo = { ok: true; trabajo: Trabajo3D } | { ok: false; motivos: string[] };
export function validarTrabajo(bruto: unknown): ResultadoTrabajo {
  const m: string[] = [];
  if (!esObjeto(bruto)) return { ok: false, motivos: ["el trabajo debe ser un objeto"] };
  for (const k of Object.keys(bruto)) if (!CLAVES.includes(k)) m.push(`trabajo.${k}: campo desconocido`);
  if (bruto.v !== 1) m.push("trabajo.v: debe ser 1");
  if (typeof bruto.titulo !== "string" || bruto.titulo.length < 1 || bruto.titulo.length > 80) m.push("trabajo.titulo: texto de 1 a 80 caracteres");
  if (!CALIDADES.includes(bruto.calidad as string)) m.push("trabajo.calidad: valor no permitido");
  if (!AMBITOS.includes(bruto.ambito as string)) m.push("trabajo.ambito: valor no permitido");
  if (!ORIGENES.includes(bruto.origen as string)) m.push("trabajo.origen: valor no permitido");
  if (bruto.quien !== "persona" && bruto.quien !== "agente") m.push("trabajo.quien: valor no permitido");
  const nombres = new Set<string>(), escena = bruto.escena, salidas = bruto.salidas;
  if (!Array.isArray(escena) || escena.length > VOC.topes.operaciones) m.push(`trabajo.escena: lista de hasta ${VOC.topes.operaciones} operaciones`);
  else escena.forEach((o, i) => validarPieza(o, "op", VOC.operaciones, `escena[${i}]`, nombres, m));
  if (!Array.isArray(salidas) || salidas.length < 1 || salidas.length > 4) m.push("trabajo.salidas: debe tener de 1 a 4 salidas");
  else salidas.forEach((s, i) => validarPieza(s, "tipo", VOC.salidas, `salidas[${i}]`, nombres, m));
  const lim = bruto.limites;
  if (lim !== undefined && (!esObjeto(lim) || Object.keys(lim).some((k) => k !== "segundos" && k !== "memoriaMB") || [lim.segundos, lim.memoriaMB].some((v) => v !== undefined && (malNum(v) || (v as number) <= 0)) || (typeof lim.segundos === "number" && lim.segundos > VOC.topes.segundos))) m.push("trabajo.limites: objeto {segundos?, memoriaMB?} de números positivos y dentro del tope");
  return m.length ? { ok: false, motivos: m } : { ok: true, trabajo: bruto as unknown as Trabajo3D };
}
const BASE: Record<string, number> = { cubo: 8, esfera: 482, icosfera: 42, cilindro: 66, cono: 66, toro: 576, plano: 4, circulo: 64 };
const K: Record<string, number> = { workbench: 5e8, eevee: 2e8, "cycles-gpu": 1e8, "cycles-cpu": 2e7 };
export function estimarCoste(t: Trabajo3D): { vertices: number; segundos: number } {
  const objetos = new Map<string, number>(), niveles = new Map<string, number>();
  let segundos = 0, vertices = 0;
  for (const op of t.escena) {
    if (op.op === "primitiva") objetos.set(String(op.nombre), BASE[String(op.tipo)] ?? 0);
    if (op.op === "modificador" && op.tipo === "subdivision") { const o = String(op.objeto); niveles.set(o, (niveles.get(o) ?? 0) + Number(op.niveles ?? 1)); }
  }
  for (const [o, base] of objetos) vertices += base * 4 ** (niveles.get(o) ?? 0);
  for (const s of t.salidas) {
    const fotos = s.tipo === "render_mp4" ? Math.max(1, Number(s.hasta) - Number(s.desde) + 1) : 1;
    segundos += (Number(s.ancho) * Number(s.alto) * Number(s.muestras) * fotos) / (K[String(s.motor)] ?? K.workbench);
  }
  return { vertices, segundos: Math.ceil(segundos) };
}
const TOPES: Record<string, [number, number, number, number, number]> = { ligero: [1280, 720, 64, 120, 600], estandar: [1920, 1080, 256, 300, 3600], estudio: [3840, 2160, 1024, 1800, 10800] };
export function necesitaConfirmacion(t: Trabajo3D, perfil: "ninguno" | "ligero" | "estandar" | "estudio"): boolean {
  if (perfil === "ninguno" || t.ambito === "grupo" || t.ambito === "publica" || t.calidad === "final" || t.escena.some((o) => o.op === "importar")) return true;
  const [ancho, alto, muestras, fotos, segundos] = TOPES[perfil] ?? TOPES.ligero;
  return t.salidas.some((s) => Number(s.ancho) > ancho || Number(s.alto) > alto || Number(s.muestras) > muestras || (s.tipo === "render_mp4" && Number(s.hasta) - Number(s.desde) + 1 > fotos)) || estimarCoste(t).segundos > segundos;
}

/* Trabajo 3D como DATO (contrato §4). Módulo PURO: sin red, disco ni procesos.
 * Especificaciones de vocabulario.json (Python las replica idéntico):
 *  num {"t":"num","min":n,"max":n,"ent":true?} · enum {"t":"enum","v":[…]} · bool {"t":"bool"}
 *  vec {"t":"vec","n":3,"min":n,"max":n} · rgba · nombre · ref · txt {"t":"txt","max":n,"patron":"…"}
 *  ruta {"t":"ruta","ext":[…]} · lista {"t":"lista","de":<espec>,"max":n} · obj {"t":"obj","campos":{…}}
 * Cualquiera admite "opc":true y "def":valor. Campos desconocidos se rechazan, nunca se ignoran; `nombre` crea un objeto único y `ref` solo apunta a uno creado ANTES. El texto libre no se ejecuta.
 */
import vocabulario from "./vocabulario.json";
export const VERSION_VOCABULARIO = 1;
type Espec = { t: string; min?: number; max?: number; ent?: boolean; v?: string[]; n?: number; patron?: string; ext?: string[]; de?: Espec; campos?: Record<string, Espec>; opc?: boolean; def?: unknown };
type Def = { estado?: string; motivo?: string; params: Record<string, Espec> };
type Voc = { version: number; topes: Record<string, number>; operaciones: Record<string, Def>; salidas: Record<string, Def> };
const VOCAB = vocabulario as unknown as Voc;
export type Calidad = "borrador" | "normal" | "final"; export type Ambito = "personal" | "perfil" | "grupo" | "publica";
export type Origen = "protomolecula" | "astraura" | "estudio" | "xr" | "avatares" | "orbe" | "api"; export type Quien = "persona" | "agente"; export type Perfil = "ninguno" | "ligero" | "estandar" | "estudio";
export interface Operacion { op: string; [campo: string]: unknown } export interface Salida { tipo: string; [campo: string]: unknown }
export interface Trabajo3D { v: 1; titulo: string; calidad: Calidad; ambito: Ambito; origen: Origen; quien: Quien; escena: Operacion[]; salidas: Salida[]; limites?: { segundos?: number; memoriaMB?: number } }
const NOMBRE = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/; const RUTA = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;
const BASE: Record<string, number> = { cubo: 8, plano: 4, circulo: 32, esfera: 482, icosfera: 42, cilindro: 64, cono: 34, toro: 576 };
const DIVISOR: Record<string, number> = { workbench: 1e8, eevee: 5e7, "cycles-cpu": 1e6, "cycles-gpu": 1e7 };
const TOPES: Record<Perfil, { segundos: number; vertices: number }> = { ninguno: { segundos: Infinity, vertices: Infinity }, ligero: { segundos: 120, vertices: 200000 }, estandar: { segundos: 900, vertices: 1000000 }, estudio: { segundos: 1800, vertices: 2000000 } };
const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
function validarEspec(v: unknown, e: Espec, ruta: string, nombres: Set<string>, motivos: string[]): unknown {
  if (v === undefined) return undefined;
  const malo = (d: string) => { motivos.push(`${ruta}: ${d}`); return undefined; };
  if (e.t === "num") { if (typeof v !== "number" || !Number.isFinite(v) || (e.ent && !Number.isInteger(v)) || (e.min !== undefined && v < e.min) || (e.max !== undefined && v > e.max)) return malo("número finito, entero si toca y dentro de rango"); return v; }
  if (e.t === "vec" || e.t === "rgba") {
    const n = e.t === "rgba" ? 4 : (e.n ?? 3);
    if (!Array.isArray(v) || v.length !== n) return malo(`se esperaban ${n} números`);
    for (const x of v) if (typeof x !== "number" || !Number.isFinite(x) || (e.t === "rgba" ? x < 0 || x > 1 : (e.min !== undefined && x < e.min) || (e.max !== undefined && x > e.max))) return malo(e.t === "rgba" ? "rgba debe ir de 0 a 1" : "número fuera de rango");
    return [...v];
  }
  if (e.t === "enum") return typeof v === "string" && (e.v ?? []).includes(v) ? v : malo("valor no permitido");
  if (e.t === "bool") return typeof v === "boolean" ? v : malo("booleano esperado");
  if (e.t === "nombre") { if (typeof v !== "string" || !NOMBRE.test(v)) return malo("nombre inválido"); if (nombres.has(v)) return malo("nombre repetido"); nombres.add(v); return v; }
  if (e.t === "ref") return typeof v === "string" && NOMBRE.test(v) && nombres.has(v) ? v : malo("referencia inexistente o posterior");
  if (e.t === "txt") return typeof v === "string" && v.length <= (e.max ?? 0) && new RegExp(e.patron ?? "").test(v) ? v : malo("texto no permitido");
  if (e.t === "ruta") { if (typeof v !== "string" || !RUTA.test(v) || v.startsWith("/") || v.split("/").includes("..")) return malo("ruta inválida"); const ext = v.includes(".") ? v.slice(v.lastIndexOf(".") + 1).toLowerCase() : ""; return (e.ext ?? []).includes(ext) ? v : malo("extensión no permitida"); }
  if (e.t === "lista") { if (!Array.isArray(v) || v.length > (e.max ?? 0)) return malo("lista inválida"); const r: unknown[] = []; for (const x of v) { const y = validarEspec(x, e.de as Espec, ruta, nombres, motivos); if (y !== undefined) r.push(y); } return r; }
  if (e.t === "obj") return esObjeto(v) ? validarCampos(v, e.campos ?? {}, ruta, nombres, motivos) : malo("objeto esperado");
  return malo("especificación desconocida");
}

function validarCampos(datos: Record<string, unknown>, params: Record<string, Espec>, ruta: string, nombres: Set<string>, motivos: string[]): Record<string, unknown> {
  const r: Record<string, unknown> = {}; for (const k of Object.keys(datos)) if (!(k in params)) motivos.push(`${ruta}: campo desconocido «${k}»`);
  for (const [k, e] of Object.entries(params)) {
    if (datos[k] === undefined) { if (e.def !== undefined) r[k] = e.def; else if (!e.opc) motivos.push(`${ruta}: falta «${k}»`); }
    else { const x = validarEspec(datos[k], e, `${ruta}.${k}`, nombres, motivos); if (x !== undefined) r[k] = x; }
  }
  return r;
}

function validarDefinido(bruto: unknown, clave: "op" | "tipo", mapa: Record<string, Def>, ruta: string, nombres: Set<string>, motivos: string[]): Record<string, unknown> | undefined {
  if (!esObjeto(bruto)) { motivos.push(`${ruta}: se esperaba un objeto`); return undefined; }
  const nombre = bruto[clave];
  if (typeof nombre !== "string" || !(nombre in mapa)) { motivos.push(`${ruta}: ${clave} desconocido`); return undefined; }
  const def = mapa[nombre]; if (def.estado === "proximamente") { motivos.push(`${ruta} (${nombre}): ${def.motivo ?? "no disponible"}`); return undefined; }
  const datos: Record<string, unknown> = {}; for (const [k, v] of Object.entries(bruto)) if (k !== clave) datos[k] = v;
  return { [clave]: nombre, ...validarCampos(datos, def.params, ruta, nombres, motivos) };
}

function validarLimites(v: unknown, motivos: string[]): { segundos?: number; memoriaMB?: number } | undefined {
  if (!esObjeto(v)) { motivos.push("limites: se esperaba un objeto"); return undefined; }
  const r: { segundos?: number; memoriaMB?: number } = {};
  for (const k of Object.keys(v)) if (k !== "segundos" && k !== "memoriaMB") motivos.push(`limites: campo desconocido «${k}»`);
  for (const k of ["segundos", "memoriaMB"] as const) {
    const x = v[k]; if (x === undefined) continue;
    if (typeof x !== "number" || !Number.isFinite(x) || x <= 0 || (k === "segundos" && x > VOCAB.topes.segundos)) motivos.push(`limites.${k}: número positivo dentro del tope`);
    else r[k] = x;
  }
  return r;
}

export function validarTrabajo(bruto: unknown): { ok: true; trabajo: Trabajo3D } | { ok: false; motivos: string[] } {
  const motivos: string[] = [];
  if (!esObjeto(bruto)) return { ok: false, motivos: ["el trabajo debe ser un objeto"] };
  const permitidos = ["v", "titulo", "calidad", "ambito", "origen", "quien", "escena", "salidas", "limites"];
  for (const k of Object.keys(bruto)) if (!permitidos.includes(k)) motivos.push(`campo desconocido «${k}»`);
  if (bruto.v !== 1) motivos.push("v debe ser 1");
  if (typeof bruto.titulo !== "string" || bruto.titulo.length > 80) motivos.push("titulo: hasta 80 caracteres");
  const elegir = (v: unknown, vals: readonly string[], campo: string) => { if (typeof v !== "string" || !vals.includes(v)) motivos.push(`${campo}: valor no permitido`); };
  elegir(bruto.calidad, ["borrador", "normal", "final"], "calidad"); elegir(bruto.ambito, ["personal", "perfil", "grupo", "publica"], "ambito");
  elegir(bruto.origen, ["protomolecula", "astraura", "estudio", "xr", "avatares", "orbe", "api"], "origen"); elegir(bruto.quien, ["persona", "agente"], "quien");
  const nombres = new Set<string>(); const escena: Operacion[] = [];
  if (!Array.isArray(bruto.escena)) motivos.push("escena: se esperaba una lista");
  else { if (bruto.escena.length > VOCAB.topes.operaciones) motivos.push(`escena: máximo ${VOCAB.topes.operaciones} operaciones`); bruto.escena.forEach((x, i) => { const r = validarDefinido(x, "op", VOCAB.operaciones, `escena[${i}]`, nombres, motivos); if (r) escena.push(r as Operacion); }); }
  const salidas: Salida[] = [];
  if (!Array.isArray(bruto.salidas) || bruto.salidas.length < 1 || bruto.salidas.length > 4) motivos.push("salidas: de 1 a 4");
  else bruto.salidas.forEach((x, i) => { const r = validarDefinido(x, "tipo", VOCAB.salidas, `salidas[${i}]`, nombres, motivos); if (r) salidas.push(r as Salida); });
  const limites = bruto.limites === undefined ? undefined : validarLimites(bruto.limites, motivos);
  if (motivos.length) return { ok: false, motivos };
  const trabajo = { v: 1, titulo: bruto.titulo, calidad: bruto.calidad, ambito: bruto.ambito, origen: bruto.origen, quien: bruto.quien, escena, salidas, ...(limites ? { limites } : {}) } as unknown as Trabajo3D;
  const coste = estimarCoste(trabajo);
  if (coste.vertices > VOCAB.topes.vertices) motivos.push(`estimación: ${coste.vertices} vértices supera ${VOCAB.topes.vertices}`);
  if (coste.segundos > VOCAB.topes.segundos) motivos.push(`estimación: ${Math.round(coste.segundos)} s supera ${VOCAB.topes.segundos}`);
  return motivos.length ? { ok: false, motivos } : { ok: true, trabajo };
}

export function estimarCoste(t: Trabajo3D): { vertices: number; segundos: number } {
  const porObjeto = new Map<string, number>();
  for (const op of t.escena) if (op.op === "primitiva") porObjeto.set(String(op.nombre), BASE[String(op.tipo)] ?? 0);
  for (const op of t.escena) { if (op.op !== "modificador" || op.tipo !== "subdivision") continue; const actual = porObjeto.get(String(op.objeto)); if (actual === undefined) continue; const n = typeof op.niveles === "number" ? op.niveles : 1; porObjeto.set(String(op.objeto), actual * Math.pow(4, n)); }
  let vertices = 0; for (const n of porObjeto.values()) vertices += n;
  let segundos = 0;
  for (const s of t.salidas) {
    const ancho = typeof s.ancho === "number" ? s.ancho : 0, alto = typeof s.alto === "number" ? s.alto : 0;
    const muestras = typeof s.muestras === "number" ? s.muestras : 1, motor = typeof s.motor === "string" ? s.motor : "workbench";
    const desde = typeof s.desde === "number" ? s.desde : 0, hasta = typeof s.hasta === "number" ? s.hasta : desde;
    const fotogramas = s.tipo === "render_mp4" ? Math.max(1, hasta - desde) : 1;
    segundos += (ancho * alto * muestras * fotogramas) / (DIVISOR[motor] ?? DIVISOR.workbench);
  }
  return { vertices, segundos };
}

export function necesitaConfirmacion(t: Trabajo3D, perfil: Perfil): boolean {
  if (t.ambito === "grupo" || t.ambito === "publica" || t.calidad === "final") return true;
  if (t.escena.some((o) => o.op === "importar")) return true;
  const tope = TOPES[perfil] ?? TOPES.estandar; const coste = estimarCoste(t);
  return coste.segundos > Math.min(tope.segundos, t.limites?.segundos ?? Infinity) || coste.vertices > tope.vertices;
}

// Formato de las especificaciones de vocabulario.json (lo lee también Python, BLD1025D):
//   {"t":"num","min":n,"max":n,"ent":true?} · {"t":"enum","v":[…]} · {"t":"bool"} · {"t":"vec","n":3} · {"t":"rgba"} (4 números 0–1)
//   {"t":"nombre"} único, CREA un objeto · {"t":"ref"} creado antes · {"t":"txt","max":n,"patron":"…"} · {"t":"ruta","ext":[…]} relativa
//   {"t":"lista","de":<espec>,"max":n} · {"t":"obj","campos":{…}} · toda espec admite «opc» y «def». El trabajo 3D es DATO (contrato §4).
//   Módulo PURO: sin «node:*», sin red, sin «eval» ni «new Function».
import vocabularioJson from "./vocabulario.json";
export const VERSION_VOCABULARIO: number = vocabularioJson.version;
interface Espec {
  t: "num" | "enum" | "bool" | "vec" | "rgba" | "nombre" | "ref" | "txt" | "ruta" | "lista" | "obj";
  min?: number; max?: number; ent?: boolean; patron?: string; ext?: string[];
  de?: Espec; campos?: Record<string, Espec>; opc?: boolean; def?: unknown;
}
interface OpDef { estado: string; motivo?: string; params: Record<string, Espec>; }
type Val = Record<string, unknown>; type Ctx = { creados: Set<string>; m: string[] };
export type Operacion = { op: string } & Val; export type Salida = { tipo: string } & Val;
export interface Trabajo3D {
  v: 1; titulo: string; calidad: "borrador" | "normal" | "final"; ambito: "personal" | "perfil" | "grupo" | "publica";
  origen: "protomolecula" | "astraura" | "estudio" | "xr" | "avatares" | "orbe" | "api"; quien: "persona" | "agente";
  escena: Operacion[]; salidas: Salida[]; limites?: { segundos?: number; memoriaMB?: number };
}
export type Validacion = { ok: true; trabajo: Trabajo3D } | { ok: false; motivos: string[] };
const vocab = vocabularioJson as unknown as { version: number; topes: Val; operaciones: Record<string, OpDef>; salidas: Record<string, OpDef>; coste: { vertices_tipo: Val; motor: Val } };
const RE_NOMBRE = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/; const RE_RUTA = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;
const LIGERO = { vertices: 500000, segundos: 300 };
const esNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const patron = (p: string | undefined, t: string): boolean => (p === undefined ? true : new RegExp(p, "u").test(t));
function validarValor(esp: Espec, val: unknown, don: string, cx: Ctx): void {
  const fail = (msg: string): void => { cx.m.push(`${don}: ${msg}`); };
  if (esp.t === "num") { if (!esNum(val)) fail("no es un número finito"); else if (esp.ent && !Number.isInteger(val)) fail("no es un entero");
    else if ((esp.min !== undefined && val < esp.min) || (esp.max !== undefined && val > esp.max)) fail("fuera de rango");
  } else if (esp.t === "enum") { if (typeof val !== "string" || !esp.v?.includes(val)) fail("no está en la lista cerrada"); }
  else if (esp.t === "bool") { if (typeof val !== "boolean") fail("no es un booleano"); }
  else if (esp.t === "vec" || esp.t === "rgba") {
    const tam = esp.t === "vec" ? esp.n ?? 3 : 4; const min = esp.t === "vec" ? esp.min ?? 0 : 0; const max = esp.t === "vec" ? esp.max ?? 1 : 1;
    if (!Array.isArray(val) || val.length !== tam) fail(`no son ${tam} números entre ${min} y ${max}`);
    else for (const v of val) if (!esNum(v) || v < min || v > max) fail(`no son ${tam} números entre ${min} y ${max}`);
  } else if (esp.t === "nombre") { if (typeof val !== "string" || !RE_NOMBRE.test(val)) fail("no es un nombre válido"); else if (cx.creados.has(val)) fail("nombre repetido en la escena"); }
  else if (esp.t === "ref") { if (typeof val !== "string" || !cx.creados.has(val)) fail("no es un objeto creado antes en la escena"); }
  else if (esp.t === "txt") { if (typeof val !== "string" || val.length > (esp.max ?? 0) || !patron(esp.patron, val)) fail("texto no admitido por el vocabulario"); }
  else if (esp.t === "ruta") { const ext = typeof val === "string" ? val.split(".").pop() ?? "" : "";
    if (typeof val !== "string" || !RE_RUTA.test(val)) fail("no es una ruta relativa válida"); else if (val.includes("..")) fail("no admite «..»");
    else if (!esp.ext?.includes(ext)) fail("extensión no permitida"); }
  else if (esp.t === "lista") { if (!Array.isArray(val) || val.length > (esp.max ?? 1e9)) fail(`no es una lista de hasta ${esp.max}`);
    else if (esp.de) val.forEach((v, i) => validarValor(esp.de as Espec, v, `${don}[${i}]`, cx));
  } else if (esp.t === "obj") { if (typeof val !== "object" || val === null || Array.isArray(val)) fail("no es un objeto con campos"); else validarObjeto(val as Val, esp.campos ?? {}, `${don}.`, cx); }
}
function validarObjeto(obj: Val, campos: Record<string, Espec>, don: string, cx: Ctx): { valores: Val; nuevos: string[] } {
  const valores: Val = {}; const nuevos: string[] = [];
  for (const clave of Object.keys(campos)) {
    const esp = campos[clave]; if (obj[clave] === undefined) { if (!esp.opc) cx.m.push(`${don}${clave}: falta el campo obligatorio`); if (esp.opc && esp.def !== undefined) valores[clave] = esp.def; }
    else validarValor(esp, obj[clave], `${don}${clave}`, cx);
  }
  for (const clave of Object.keys(obj)) {
    if (!campos[clave]) cx.m.push(`${don}${clave}: campo desconocido`);
    else if (campos[clave].t === "nombre" && typeof obj[clave] === "string") nuevos.push(obj[clave] as string);
  }
  return { valores, nuevos };
}
function procesarLista(
  lista: unknown[], campo: string, clave: string, tabla: Record<string, OpDef>, cx: Ctx
): { items: Val[] } {
  const items: Val[] = [];
  lista.forEach((raw, i) => {
    if (typeof raw !== "object" || raw === null) { cx.m.push(`${campo}[${i}]: no es una entrada`); return; }
    const e = raw as Val;
    const def: OpDef | undefined = typeof e[clave] === "string" ? tabla[e[clave] as string] : undefined;
    if (!def) { cx.m.push(`${campo}[${i}]: ${clave === "op" ? "operación" : "salida"} desconocida`); return; }
    if (def.estado !== "listo") { cx.m.push(`${campo}[${i}]: ${String(e[clave])} no disponible todavía — ${def.motivo ?? ""}`); return; }
    const resto: Val = { ...e }; delete resto[clave];
    const r = validarObjeto(resto, def.params, `${campo}[${i}].`, cx); r.nuevos.forEach((nvo) => cx.creados.add(nvo));
    items.push({ [clave]: e[clave] as string, ...r.valores });
  });
  return { items };
}
export function validarTrabajo(bruto: unknown): Validacion {
  const m: string[] = [];
  const cx: Ctx = { creados: new Set<string>(), m };
  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) return { ok: false, motivos: ["el trabajo no es un objeto"] };
  const b = bruto as Val; const b0: Val = { ...b };
  delete b0.escena; delete b0.salidas; delete b0.limites;
  validarObjeto(b0, {
    v: { t: "num", ent: true, min: 1, max: 1 }, titulo: { t: "txt", max: 80, patron: "." },
    calidad: { t: "enum", v: ["borrador", "normal", "final"] }, ambito: { t: "enum", v: ["personal", "perfil", "grupo", "publica"] },
    origen: { t: "enum", v: ["protomolecula", "astraura", "estudio", "xr", "avatares", "orbe", "api"] }, quien: { t: "enum", v: ["persona", "agente"] },
  }, "", cx);
  const lim = typeof b.limites === "object" && b.limites !== null ? (b.limites as Val) : undefined;
  for (const l of Object.keys(lim ?? {})) {
    if (l !== "segundos" && l !== "memoriaMB") m.push(`limites.${l}: campo desconocido`); if (!esNum(lim![l]) || lim![l] < 1) m.push(`limites.${l}: número positivo`);
  }
  const escena = Array.isArray(b.escena) ? (b.escena as unknown[]) : []; const salidas = Array.isArray(b.salidas) ? (b.salidas as unknown[]) : [];
  if (escena.length < 1 || escena.length > Number(vocab.topes.operaciones)) m.push("escena: entre 1 y 256 operaciones");
  if (salidas.length < 1 || salidas.length > 4) m.push("salidas: entre 1 y 4 salidas");

  const e1 = procesarLista(escena, "escena", "op", vocab.operaciones, cx);
  const s1 = procesarLista(salidas, "salidas", "tipo", vocab.salidas, cx);
  if (m.length === 0) { const coste = estimarCoste({ v: 1, titulo: "", calidad: "normal", ambito: "personal", origen: "estudio", quien: "agente", escena: e1.items as Operacion[], salidas: s1.items as Salida[] });
    if (coste.vertices > Number(vocab.topes.vertices) || coste.segundos > Number(vocab.topes.segundos)) m.push("coste: sobrepasa los topes del vocabulario");
  }
  if (m.length > 0) return { ok: false, motivos: m };
  return { ok: true, trabajo: { v: 1, titulo: b.titulo as string, calidad: b.calidad as Trabajo3D["calidad"], ambito: b.ambito as Trabajo3D["ambito"], origen: b.origen as Trabajo3D["origen"], quien: b.quien as Trabajo3D["quien"], escena: e1.items as Operacion[], salidas: s1.items as Salida[], limites: lim as Trabajo3D["limites"] } };
}
export function estimarCoste(trabajo: Trabajo3D): { vertices: number; segundos: number } {
  const base = new Map<string, number>(); const mult = new Map<string, number>();
  for (const op of trabajo.escena) {
    if (op.op === "primitiva") base.set(String(op.nombre), Number(vocab.coste.vertices_tipo[String(op.tipo)]) || 0);
    else if (op.op === "modificador" && op.tipo === "subdivision" && base.has(String(op.objeto))) mult.set(String(op.objeto), (mult.get(String(op.objeto)) ?? 1) * Math.pow(4, typeof op.niveles === "number" ? op.niveles : 1));
  }
  let vertices = 0; let segundos = 0;
  for (const [nombre, vrt] of base) vertices += vrt * (mult.get(nombre) ?? 1);
  for (const s of trabajo.salidas) {
    if (s.tipo === "exportar_glb") continue;
    const f = Number(vocab.coste.motor[String(s.motor)]) || 1; const fotogramas = s.tipo === "render_mp4" ? Math.max(1, Number(s.hasta) - Number(s.desde) + 1) : 1;
    segundos += (Number(s.ancho) || 0) * (Number(s.alto) || 0) * (Number(s.muestras) || 1) * fotogramas / f;
  }
  return { vertices, segundos: Math.round(segundos * 1000) / 1000 };
}
export function necesitaConfirmacion(t: Trabajo3D, perfil: "ninguno" | "ligero" | "estandar" | "estudio"): boolean {
  const coste = estimarCoste(t);
  if (perfil === "ninguno") return true;
  if (t.ambito === "grupo" || t.ambito === "publica" || t.calidad === "final" || t.escena.some((op) => op.op === "importar")) return true;
  return perfil === "ligero" && (coste.segundos > LIGERO.segundos || coste.vertices > LIGERO.vertices);
}

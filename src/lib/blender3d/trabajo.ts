/**
 * Trabajo 3D como DATO, lado TypeScript puro · StarSeed OS (architecture/blender-3d.md §4 · BLD1025C).
 * Sin módulos de Node, sin React, sin red, sin evaluación dinámica; el vocabulario vive en
 * `vocabulario.json` y Python lo leerá idéntico. Clases de especificación (en cascada):
 * num{min,max,ent} · enum{v:[…]} · bool · vec{n,min,max} · rgba (4 números 0–1) · nombre
 * (ÚNICO, CREA objeto) · ref (creado ANTES) · txt{max,patron} · ruta{ext} relativa sin «..»
 * (nunca .blend/.py) · lista{max,de} · obj{campos}; toda clase admite {opc:true, def:valor}.
 * Campos desconocidos, «proximamente» y topes duros se RECHAZAN con motivo en español.
 */
import vocabulario from "./vocabulario.json";
export type Parametros = Record<string, unknown>; export type Operacion = { op: string } & Parametros; export type Salida = { tipo: string } & Parametros;
export type Trabajo3D = {
  v: 1; titulo: string; calidad: "borrador" | "normal" | "final"; ambito: "personal" | "perfil" | "grupo" | "publica";
  origen: "protomolecula" | "astraura" | "estudio" | "xr" | "avatares" | "orbe" | "api"; quien: "persona" | "agente";
  escena: Operacion[]; salidas: Salida[]; limites?: { segundos?: number; memoriaMB?: number }; };
export type ValidezTrabajo = { ok: true; trabajo: Trabajo3D } | { ok: false; motivos: string[] }; export const VERSION_VOCABULARIO: number = vocabulario.version;
const CALIDADES = ["borrador", "normal", "final"] as const, AMBITOS = ["personal", "perfil", "grupo", "publica"] as const;
const ORIGENES = ["protomolecula", "astraura", "estudio", "xr", "avatares", "orbe", "api"] as const, QUIENES = ["persona", "agente"] as const;
const CAMPOS_TRABAJO = ["v", "titulo", "calidad", "ambito", "origen", "quien", "escena", "salidas", "limites"];
interface Espec { t: string; opc?: boolean; def?: unknown; min?: number; max?: number; ent?: boolean; n?: number; v?: string[]; patron?: string; ext?: string[]; de?: Espec; campos?: Record<string, Espec>; }
type Info = { estado: string; motivo?: string; params: Record<string, Espec> }; type Res = { ok: true; valor: unknown } | { ok: false; motivo: string };
const VOC = vocabulario as unknown as { topes: Record<string, number>; operaciones: Record<string, Info>; salidas: Record<string, Info> };
const esNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x); const tiene = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const esPlano = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const NOMBRES = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/, RUTAS = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;function validarValor(d: string, e: Espec, x: unknown, c: Set<string>): Res {
  if (x === undefined || x === null) return !e.opc ? { ok: false, motivo: `${d}: falta este parámetro` } : { ok: true, valor: e.def };
  if (e.t === "num")
    return !esNum(x) || (e.ent === true && !Number.isInteger(x)) || (e.min !== undefined && x < e.min) || (e.max !== undefined && x > e.max)
      ? { ok: false, motivo: `${d}: número no válido (rango ${e.min ?? "-∞"}…${e.max ?? "+∞"}${e.ent ? ", entero" : ""})` } : { ok: true, valor: x };
  if (e.t === "enum") return typeof x === "string" && e.v?.includes(x) ? { ok: true, valor: x } : { ok: false, motivo: `${d}: valor no permitido (solo: ${(e.v ?? []).join(", ")})` };
  if (e.t === "bool") return typeof x === "boolean" ? { ok: true, valor: x } : { ok: false, motivo: `${d}: debe ser verdadero o falso` };
  if (e.t === "vec" || e.t === "rgba") {
    const n = e.t === "vec" ? Number(e.n ?? 3) : 4, min = e.t === "vec" ? Number(e.min ?? 0) : 0, max = e.t === "vec" ? Number(e.max ?? 1) : 1;
    if (!Array.isArray(x) || x.length !== n) return { ok: false, motivo: `${d}: se esperan ${n} números` };
    for (const i of x) if (!esNum(i) || i < min || i > max) return { ok: false, motivo: `${d}: número finito fuera del rango ${min}…${max}` };
    return { ok: true, valor: x };
  }
  if (e.t === "nombre") return typeof x === "string" && NOMBRES.test(x)
    ? (!c.has(x) ? (c.add(x), { ok: true, valor: x }) : { ok: false, motivo: `${d}: nombre de objeto repetido en la escena` })
    : { ok: false, motivo: `${d}: nombre no válido (empieza por letra; luego letras, cifras, _ o -; hasta 32)` };
  if (e.t === "ref") {
    if (typeof x !== "string" || !NOMBRES.test(x) || !c.has(x)) return { ok: false, motivo: `${d}: nombre no válido o objeto que no fue creado antes` };
    return { ok: true, valor: x };
  }
  if (e.t === "txt")
    return (typeof x === "string" && x.length <= Number(e.max ?? 0) && (e.patron === undefined || new RegExp(e.patron).test(x)))
      ? { ok: true, valor: x } : { ok: false, motivo: `${d}: texto no válido (hasta ${e.max} caracteres y solo el patrón permite)` };
  if (e.t === "ruta") {
    const s = typeof x === "string" ? x : "", ext = s.includes(".") ? s.slice(s.lastIndexOf(".") + 1).toLowerCase() : "";
    if (RUTAS.test(s) && !s.includes("..") && (e.ext ?? []).includes(ext)) return { ok: true, valor: s };
    return { ok: false, motivo: `${d}: ruta relativa no válida o extensión no permitida (solo: ${(e.ext ?? []).join(", ")}; sin «..» ni barra inicial)` };
  }
  if (e.t === "lista") {
    if (!Array.isArray(x) || x.length > Number(e.max ?? 0)) return { ok: false, motivo: `${d}: lista de hasta ${e.max} elementos` };
    for (const i of x.keys()) { const r = validarValor(`${d}[${i}]`, e.de ?? { t: "bool" }, x[i], c); if (!r.ok) return r; }
    return { ok: true, valor: x };
  }
  if (e.t === "obj") {
    if (!esPlano(x)) return { ok: false, motivo: `${d}: debe ser un objeto` }; const campos = e.campos ?? {}, limpio: Parametros = {};
    for (const k of Object.keys(x)) if (!tiene(campos, k)) return { ok: false, motivo: `${d}: campo desconocido «${k}»` };
    for (const k of Object.keys(campos)) { const r = validarValor(`${d}.${k}`, campos[k], x[k], c); if (!r.ok) return r; if (r.valor !== undefined) limpio[k] = r.valor; }
    return { ok: true, valor: limpio };
  }
  return { ok: false, motivo: `${d}: clase de especificación desconocida («${e.t}»)` };
}
function validarItem(d: string, bruto: unknown, clave: "op" | "tipo", tabla: Record<string, Info>, c: Set<string>): Res {
  if (!esPlano(bruto)) return { ok: false, motivo: `${d}: debe ser un objeto` };
  const nombre = bruto[clave];
  if (typeof nombre !== "string" || !tiene(tabla, nombre)) return { ok: false, motivo: `${d}: «${String(nombre)}» no está en el vocabulario` };
  const info = tabla[nombre];
  if (info.estado && info.estado !== "listo") return { ok: false, motivo: `${d}: «${nombre}» todavía no está disponible: ${info.motivo ?? "sin motivo"}` };
  for (const k of Object.keys(bruto)) if (k !== clave && !tiene(info.params, k)) return { ok: false, motivo: `${d}: campo desconocido «${k}»` };
  const limpio: Parametros = { [clave]: nombre };
  for (const k of Object.keys(info.params)) { const r = validarValor(`${d}.${k}`, info.params[k], tiene(bruto, k) ? bruto[k] : undefined, c); if (!r.ok) return r; if (r.valor !== undefined) limpio[k] = r.valor; }
  return { ok: true, valor: limpio };
}
export function validarTrabajo(bruto: unknown): ValidezTrabajo {
  const motivos: string[] = [];
  if (!esPlano(bruto)) return { ok: false, motivos: ["el trabajo debe ser un objeto"] };
  for (const k of Object.keys(bruto)) if (!CAMPOS_TRABAJO.includes(k)) motivos.push(`campo desconocido «${k}» (solo: ${CAMPOS_TRABAJO.join(", ")})`);
  if (bruto.v !== 1) motivos.push("«v» debe ser 1"); if (typeof bruto.titulo !== "string" || bruto.titulo.length > 80) motivos.push("«titulo»: texto de hasta 80 caracteres");
  for (const [campo, lista] of [["calidad", CALIDADES], ["ambito", AMBITOS], ["origen", ORIGENES], ["quien", QUIENES]] as const)
    if (!lista.includes(bruto[campo] as never)) motivos.push(`«${campo}»: falta o valor no permitido (${lista.join(", ")})`);
  if (bruto.limites !== undefined) if (!esPlano(bruto.limites)) motivos.push("«limites»: debe ser un objeto");
  else for (const k of Object.keys(bruto.limites)) { const v = bruto.limites[k]; if (k !== "segundos" && k !== "memoriaMB") motivos.push(`«limites»: campo desconocido «${k}»`); else if (!esNum(v) || v <= 0) motivos.push(`«limites».«${k}»: número positivo`); }
  const escena: Operacion[] = [], salidas: Salida[] = [], creados = new Set<string>();
  if (!Array.isArray(bruto.escena)) motivos.push("«escena»: debe ser una lista");
  else if (bruto.escena.length > Number(VOC.topes.operaciones)) motivos.push(`«escena»: demasiadas operaciones (tope ${VOC.topes.operaciones})`);
  else bruto.escena.forEach((it, i) => { const r = validarItem(`escena[${i}]`, it, "op", VOC.operaciones, creados); if (!r.ok) motivos.push(r.motivo); else escena.push(r.valor as Operacion); });
  if (!Array.isArray(bruto.salidas) || bruto.salidas.length < 1 || bruto.salidas.length > 4) motivos.push("«salidas»: de 1 a 4 salidas");
  else bruto.salidas.forEach((it, i) => { const r = validarItem(`salidas[${i}]`, it, "tipo", VOC.salidas, creados); if (!r.ok) motivos.push(r.motivo); else salidas.push(r.valor as Salida); });
  if (motivos.length) return { ok: false, motivos };
  return { ok: true, trabajo: {
    v: 1, titulo: bruto.titulo as string, calidad: bruto.calidad as Trabajo3D["calidad"], ambito: bruto.ambito as Trabajo3D["ambito"], origen: bruto.origen as Trabajo3D["origen"],
    quien: bruto.quien as Trabajo3D["quien"], escena, salidas, limites: esPlano(bruto.limites) ? (bruto.limites as { segundos?: number; memoriaMB?: number }) : undefined,
  } };
}
const VERTICES_BASE: Record<string, number> = { cubo: 8, esfera: 512, icosfera: 320, cilindro: 96, cono: 96, toro: 512, plano: 4, circulo: 32 };
const CAPEZ: Record<string, number> = { workbench: 20000000, "cycles-cpu": 5000000, "cycles-gpu": 40000000, eevee: 10000000 };
export function estimarCoste(t: Trabajo3D): { vertices: number; segundos: number } {
  const porNombre = new Map<string, number>(); let vertices = 0, segundos = 0;
  for (const p of t.escena) {
    if (p.op === "primitiva" && typeof p.tipo === "string" && typeof p.nombre === "string") { const b = VERTICES_BASE[p.tipo] ?? 16; vertices += b; porNombre.set(p.nombre, b); }
    if (p.op === "modificador" && p.tipo === "subdivision" && typeof p.objeto === "string") { const antes = porNombre.get(p.objeto) ?? 0, luego = Math.min(antes * 4 ** Math.min(Number(p.niveles ?? 1), 6), Number(VOC.topes.vertices)); if (luego !== antes) { vertices += luego - antes; porNombre.set(p.objeto, luego); } }
  }
  for (const s of t.salidas) {
    if (typeof s.tipo !== "string" || !s.tipo.startsWith("render")) continue;
    const f = s.tipo === "render_mp4" ? Math.max(1, Number(s.hasta ?? 0) - Number(s.desde ?? 0) + 1) : 1;
    segundos += (Number(s.ancho ?? 0) * Number(s.alto ?? 0) * Number(s.muestras ?? 1) * f) / (CAPEZ[String(s.motor)] ?? CAPEZ["cycles-cpu"]);
  }
  return { vertices: Math.round(vertices), segundos: Math.ceil(segundos) };
}
const MAX_LIGERO = { ancho: 1280, alto: 720, muestras: 64, fotogramas: 120, vertices: 1000000 };
export function necesitaConfirmacion(t: Trabajo3D, perfil: "ninguno" | "ligero" | "estandar" | "estudio"): boolean {
  if (t.ambito === "grupo" || t.ambito === "publica" || t.calidad === "final" || t.escena.some((p) => p.op === "importar")) return true;
  if (perfil !== "ligero") return false;
  return estimarCoste(t).vertices > MAX_LIGERO.vertices || t.salidas.some((s) => typeof s.tipo === "string" && s.tipo.startsWith("render") &&
    (Number(s.ancho ?? 0) > MAX_LIGERO.ancho || Number(s.alto ?? 0) > MAX_LIGERO.alto || Number(s.muestras ?? 0) > MAX_LIGERO.muestras ||
      (s.tipo === "render_mp4" ? Number(s.hasta ?? 0) - Number(s.desde ?? 0) + 1 : 1) > MAX_LIGERO.fotogramas));
}

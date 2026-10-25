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
const fallar = (ctx: Ctx, ruta: string, motivo: string): undefined => { ctx.motivos.push(`${ruta}: ${motivo}`); return undefined; };
function campo(esp: Espec, valor: unknown, ruta: string, ctx: Ctx): unknown {
  const dentro = (n: number) => n >= (esp.min ?? -Infinity) && n <= (esp.max ?? Infinity);
  if (esp.t === "num") return typeof valor === "number" && Number.isFinite(valor) && dentro(valor) && (!esp.ent || Number.isInteger(valor)) ? valor : fallar(ctx, ruta, `Número finito en rango (${esp.min ?? "-∞"}–${esp.max ?? "∞"}${esp.ent ? ", entero" : ""}).`);
  if (esp.t === "enum") return typeof valor === "string" && !!esp.v?.includes(valor) ? valor : fallar(ctx, ruta, `Debe ser uno de: ${esp.v?.join(", ")}.`);
  if (esp.t === "bool") return typeof valor === "boolean" ? valor : fallar(ctx, ruta, "Debe ser verdadero o falso.");
  if (esp.t === "vec" || esp.t === "rgba") { const v = arreglo(valor), n = esp.t === "rgba" ? 4 : (esp.n ?? 0); const ok = v && v.length === n && v.every((x) => typeof x === "number" && Number.isFinite(x) && (esp.t === "rgba" ? x >= 0 && x <= 1 : dentro(x))); return ok ? v.slice() : fallar(ctx, ruta, esp.t === "rgba" ? "Color rgba de 4 números entre 0 y 1." : `Vector de ${n} números finitos en rango.`); }
  if (esp.t === "nombre") return typeof valor === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(valor) && !ctx.creados.has(valor) ? (ctx.creados.add(valor), valor) : fallar(ctx, ruta, "Nombre único: letra inicial y hasta 32 letras, cifras, «_» o «-».");
  if (esp.t === "ref") return typeof valor === "string" && ctx.creados.has(valor) ? valor : fallar(ctx, ruta, `Debe referir un objeto creado antes; «${String(valor)}» no existe.`);
  if (esp.t === "txt") return typeof valor === "string" && valor.length <= (esp.max ?? 0) && (!esp.patron || new RegExp(esp.patron).test(valor)) ? valor : fallar(ctx, ruta, `Texto inválido o de más de ${esp.max ?? 0} caracteres.`);
  if (esp.t === "ruta") { const ext = typeof valor === "string" ? (valor.split(".").pop() ?? "").toLowerCase() : ""; return typeof valor === "string" && /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/.test(valor) && !valor.includes("..") && !!ext && !!esp.ext?.includes(ext) ? valor : fallar(ctx, ruta, `Ruta relativa y sin «..», con extensión ${esp.ext?.join(", ")}.`); }
  if (esp.t === "lista") {
    const v = arreglo(valor);
    if (!v || v.length > (esp.max ?? 0)) return fallar(ctx, ruta, `Lista de ${esp.max ?? 0} elementos como máximo.`);
    const salida: unknown[] = [];
    for (let i = 0; i < v.length; i++) { const r = esp.de ? campo(esp.de, v[i], `${ruta}[${i}]`, ctx) : undefined; if (r === undefined) return undefined; salida.push(r); }
    return salida;
  }
  if (esp.t === "obj") return campos(esp.campos ?? {}, valor, ruta, ctx);
  return fallar(ctx, ruta, `Especificación desconocida «${esp.t}».`);
}
function campos(especs: Record<string, Espec>, valor: unknown, ruta: string, ctx: Ctx): Objeto | undefined {
  if (!esObjeto(valor)) return fallar(ctx, ruta, "Debe ser un objeto.");
  let ok = true;
  for (const clave of Object.keys(valor)) if (!(clave in especs)) { fallar(ctx, `${ruta}.${clave}`, "Campo desconocido."); ok = false; }
  const salida: Objeto = {};
  for (const [clave, esp] of Object.entries(especs)) {
    const v = valor[clave];
    if (v === undefined) { if (esp.opc) { if (esp.def !== undefined) salida[clave] = esp.def; } else { fallar(ctx, `${ruta}.${clave}`, "Falta un campo obligatorio."); ok = false; } continue; }
    const r = campo(esp, v, `${ruta}.${clave}`, ctx);
    if (r === undefined) ok = false; else salida[clave] = r;
  }
  return ok ? salida : undefined;
}
function cosa(valor: unknown, clave: "op" | "tipo", defs: Record<string, Def>, ruta: string, ctx: Ctx): Objeto | undefined {
  if (!esObjeto(valor)) return fallar(ctx, ruta, "Debe ser un objeto.");
  const nombre = valor[clave], def = typeof nombre === "string" ? defs[nombre] : undefined;
  if (!def) return fallar(ctx, `${ruta}.${clave}`, `«${String(nombre)}» no existe en el vocabulario.`);
  if (def.estado === "proximamente") return fallar(ctx, ruta, def.motivo ?? "Operación próximamente.");
  const resto: Objeto = { ...valor }; delete resto[clave];
  const params = campos(def.params, resto, ruta, ctx);
  return params ? { [clave]: nombre, ...params } : undefined;
}
export function validarTrabajo(bruto: unknown): ResultadoTrabajo {
  const ctx: Ctx = { creados: new Set(), motivos: [] };
  if (!esObjeto(bruto)) return { ok: false, motivos: ["El trabajo debe ser un objeto."] };
  const permitidos = ["v", "titulo", "calidad", "ambito", "origen", "quien", "escena", "salidas", "limites"];
  for (const k of Object.keys(bruto)) if (!permitidos.includes(k)) fallar(ctx, k, "Campo desconocido.");
  if (bruto.v !== 1) fallar(ctx, "v", "Debe ser 1.");
  const titulo = typeof bruto.titulo === "string" && bruto.titulo.length <= 80 ? bruto.titulo : fallar(ctx, "titulo", "Texto de 80 caracteres como máximo.");
  const unoDe = (k: string, vals: string[]) => typeof bruto[k] === "string" && vals.includes(bruto[k] as string) ? bruto[k] as string : fallar(ctx, k, `Debe ser uno de: ${vals.join(", ")}.`);
  const calidad = unoDe("calidad", ["borrador", "normal", "final"]), ambito = unoDe("ambito", ["personal", "perfil", "grupo", "publica"]);
  const origen = unoDe("origen", ["protomolecula", "astraura", "estudio", "xr", "avatares", "orbe", "api"]), quien = unoDe("quien", ["persona", "agente"]);
  const escenaBruta = arreglo(bruto.escena);
  if (!escenaBruta || escenaBruta.length > VOCAB.topes.operaciones) fallar(ctx, "escena", `Lista de ${VOCAB.topes.operaciones} operaciones como máximo.`);
  const escena = escenaBruta ? escenaBruta.map((o, i) => cosa(o, "op", VOCAB.operaciones, `escena[${i}]`, ctx)).filter((o): o is Objeto => !!o) : [];
  const salidasBrutas = arreglo(bruto.salidas);
  if (!salidasBrutas || salidasBrutas.length < 1 || salidasBrutas.length > 4) fallar(ctx, "salidas", "Entre 1 y 4 salidas.");
  const salidas = salidasBrutas ? salidasBrutas.map((s, i) => cosa(s, "tipo", VOCAB.salidas, `salidas[${i}]`, ctx)).filter((s): s is Objeto => !!s) : [];
  const limites = bruto.limites === undefined ? undefined : limitesDe(bruto.limites, ctx);
  if (ctx.motivos.length) return { ok: false, motivos: ctx.motivos };
  const trabajo: Trabajo3D = { v: 1, titulo: titulo as string, calidad: calidad as Calidad, ambito: ambito as Ambito, origen: origen as Origen, quien: quien as Quien, escena: escena as Operacion[], salidas: salidas as Salida[], ...(limites ? { limites } : {}) };
  const coste = estimarCoste(trabajo);
  if (coste.vertices > VOCAB.topes.vertices) return { ok: false, motivos: [`escena: estima ${coste.vertices} vértices; el tope es ${VOCAB.topes.vertices}.`] };
  if (trabajo.salidas.some((s) => s.tipo === "render_mp4" && numero(s.hasta) - numero(s.desde) + 1 > VOCAB.topes.fotogramas)) return { ok: false, motivos: [`salidas: el render_mp4 pasa de ${VOCAB.topes.fotogramas} fotogramas.`] };
  return { ok: true, trabajo };
}
function limitesDe(valor: unknown, ctx: Ctx): NonNullable<Trabajo3D["limites"]> | undefined {
  return campos({ segundos: { t: "num", min: 1, max: VOCAB.topes.segundos, ent: true, opc: true }, memoriaMB: { t: "num", min: 1, max: 1048576, ent: true, opc: true } }, valor, "limites", ctx) as NonNullable<Trabajo3D["limites"]> | undefined;
}
const VERTICES: Record<string, (s: number) => number> = { cubo: () => 8, plano: () => 4, circulo: (s) => s, cilindro: (s) => 2 * s + 2, cono: (s) => 2 * s + 2, icosfera: (s) => 10 * s, toro: (s) => s * s, esfera: (s) => s * s };
const DIVISOR: Record<string, number> = { workbench: 5e7, "cycles-cpu": 2e6, "cycles-gpu": 2e7, eevee: 1e7 };
export function estimarCoste(trabajo: Trabajo3D): { vertices: number; segundos: number } {
  const verts = new Map<string, number>();
  for (const o of trabajo.escena) {
    if (o.op === "primitiva") verts.set(String(o.nombre), (VERTICES[String(o.tipo)] ?? (() => 0))(numero(o.segmentos) || 32));
    if (o.op === "modificador" && o.tipo === "subdivision") { const k = String(o.objeto); verts.set(k, (verts.get(k) ?? 0) * 4 ** (typeof o.niveles === "number" ? o.niveles : 1)); }
  }
  const vertices = [...verts.values()].reduce((a, b) => a + b, 0);
  let segundos = 0;
  for (const s of trabajo.salidas) {
    const fotogramas = s.tipo === "render_mp4" ? Math.max(1, numero(s.hasta) - numero(s.desde) + 1) : s.tipo === "render_png" || s.tipo === "render_exr" ? 1 : 0;
    segundos += numero(s.ancho) * numero(s.alto) * numero(s.muestras) * fotogramas / (DIVISOR[String(s.motor)] ?? 5e7);
  }
  return { vertices, segundos };
}
const TOPES_PERFIL = { ligero: { ancho: 1280, alto: 720, muestras: 64, fotogramas: 120, segundos: 600, memoria: 2048 }, estandar: { ancho: 1920, alto: 1080, muestras: 256, fotogramas: 300, segundos: 1800, memoria: 4096 }, estudio: { ancho: 3840, alto: 2160, muestras: 1024, fotogramas: 1800, segundos: 1800, memoria: 8192 } };
export function necesitaConfirmacion(trabajo: Trabajo3D, perfil: Perfil): boolean {
  if (perfil === "ninguno" || trabajo.ambito === "grupo" || trabajo.ambito === "publica" || trabajo.calidad === "final") return true;
  if (trabajo.escena.some((o) => o.op === "importar")) return true;
  const tope = TOPES_PERFIL[perfil], coste = estimarCoste(trabajo);
  if (coste.vertices > VOCAB.topes.vertices || coste.segundos > tope.segundos || numero(trabajo.limites?.memoriaMB) > tope.memoria) return true;
  return trabajo.salidas.some((s) => numero(s.ancho) > tope.ancho || numero(s.alto) > tope.alto || numero(s.muestras) > tope.muestras || (s.tipo === "render_mp4" && numero(s.hasta) - numero(s.desde) + 1 > tope.fotogramas));
}

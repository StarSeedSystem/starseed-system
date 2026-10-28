/**
 * Trabajo 3D (contrato architecture/blender-3d.md §4). Módulo PURO (sin node:*). Lo leen TS y
 * Python (BLD1025D): comparten `vocabulario.json` y estas mismas reglas. Especificaciones:
 * {"t":"num","min":n,"max":n,"ent"?:true} · {"t":"enum","v":[…]} · {"t":"bool"} · {"t":"vec","n":N,"min":n,"max":n}
 * · {"t":"rgba"} 4 números 0-1 · {"t":"nombre"} ^[A-Za-z][A-Za-z0-9_-]{0,31}$ único, CREA un objeto ·
 * {"t":"ref"} objeto ya creado · {"t":"txt","max":n,"patron":"…"} · {"t":"ruta","ext":[…]} relativa,
 * sin «..» ni «/» inicial · {"t":"lista","max":n,"de":espec} · {"t":"obj","campos":{…}} con «opc»/«def».
 * Coste (misma regla en Python): vértices = Σ base por tipo (plano 4, cubo 24, circulo 32, icosfera
 * 80, esfera 96, cilindro 96, cono 64, toro 128) × (segmentos‖1); texto3d 256; importar 0; subdivision
 * ×4^niveles. segundos = Σ píxeles·muestras·fotogramas÷coste[motor] (workbench 2e7, eevee 1e7,
 * cycles-gpu 8e6, cycles-cpu 2e6); mp4 usa hasta−desde+1, png y exr cuentan 1. Confirmación humana:
 * ámbito grupo|publica, operación «importar», calidad final, o coste sobre los topes del perfil ligero.
 */
import vocabularioJson from "./vocabulario.json";
export const VERSION_VOCABULARIO = 1;
type Dato = string | number | boolean | Dato[] | { [campo: string]: Dato };
type Espec = { t: string; min?: number; max?: number; ent?: boolean; n?: number; v?: (string | number)[]; patron?: string; ext?: string[]; de?: Espec; campos?: Record<string, Espec>; opc?: boolean };
type DefOp = { estado?: string; motivo?: string; params: Record<string, Espec> };
type Vocab = { version: number; topes: Record<string, number>; operaciones: Record<string, DefOp>; salidas: Record<string, DefOp> };
const voc = vocabularioJson as unknown as Vocab;
const NOMBRE = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
const RUTA = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;
export interface Operacion { op: string; [campo: string]: Dato }
export interface Salida { tipo: string; [campo: string]: Dato }
export interface Trabajo3D { v: 1; titulo: string; calidad: "borrador" | "normal" | "final"; ambito: "personal" | "perfil" | "grupo" | "publica"; origen: "protomolecula" | "astraura" | "estudio" | "xr" | "avatares" | "orbe" | "api"; quien: "persona" | "agente"; escena: Operacion[]; salidas: Salida[]; limites?: { segundos?: number; memoriaMB?: number } }
export function validarTrabajo(bruto: unknown): { ok: true; trabajo: Trabajo3D } | { ok: false; motivos: string[] } {
  const motivos: string[] = [];
  const trabajo = cuerpoDe(bruto, motivos);
  return trabajo === null ? { ok: false, motivos } : { ok: true, trabajo };
}
const cuerpoDe = (bruto: unknown, motivos: string[]): Trabajo3D | null => {
  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) { motivos.push("el trabajo debe ser un objeto"); return null; }
  const b = bruto as Record<string, unknown>;
  for (const clave of ["v", "titulo", "calidad", "ambito", "origen", "quien", "escena", "salidas"]) if (!(clave in b)) motivos.push(`falta el campo «${clave}»`);
  for (const clave of Object.keys(b)) if (!["v", "titulo", "calidad", "ambito", "origen", "quien", "escena", "salidas", "limites"].includes(clave)) motivos.push(`campo desconocido «${clave}»`);
  if (b.v !== 1) motivos.push("«v» debe ser 1");
  if (typeof b.titulo !== "string" || b.titulo.length < 1 || b.titulo.length > 80) motivos.push("«titulo» debe ser un texto de 1 a 80 caracteres");
  const enums: [string, unknown, string[]][] = [["calidad", b.calidad, ["borrador", "normal", "final"]], ["ambito", b.ambito, ["personal", "perfil", "grupo", "publica"]], ["origen", b.origen, ["protomolecula", "astraura", "estudio", "xr", "avatares", "orbe", "api"]], ["quien", b.quien, ["persona", "agente"]]];
  for (const [clave, valor, lista] of enums) if (typeof valor !== "string" || !lista.includes(valor)) motivos.push(`«${clave}» no es un valor permitido`);
  const nombres = new Set<string>();
  validarGrupo("escena", b.escena, voc.operaciones, "op", 0, voc.topes.operaciones, motivos, nombres);
  validarGrupo("salidas", b.salidas, voc.salidas, "tipo", 1, 4, motivos, nombres);
  validarLimites(b.limites, motivos);
  if (motivos.length > 0) return null;
  return { v: 1, titulo: b.titulo as string, calidad: b.calidad as Trabajo3D["calidad"], ambito: b.ambito as Trabajo3D["ambito"], origen: b.origen as Trabajo3D["origen"], quien: b.quien as Trabajo3D["quien"], escena: b.escena as unknown as Operacion[], salidas: b.salidas as unknown as Salida[], limites: typeof b.limites === "object" && b.limites !== null ? (b.limites as Trabajo3D["limites"]) : undefined };
};
const validarGrupo = (ruta: string, lista: unknown, catalogo: Record<string, DefOp>, clave: string, desde: number, hasta: number, motivos: string[], nombres: Set<string>): void => {
  if (!Array.isArray(lista) || lista.length < desde || lista.length > hasta) { motivos.push(`${ruta}: debe ser una lista de ${desde} a ${hasta} elementos`); return; }
  lista.forEach((elemento, i) => {
    if (typeof elemento !== "object" || elemento === null || Array.isArray(elemento)) { motivos.push(`${ruta}[${i}]: debe ser un objeto con «${clave}»`); return; }
    const cuerpo = { ...(elemento as Record<string, unknown>) };
    const id = cuerpo[clave];
    delete cuerpo[clave];
    const def = typeof id === "string" ? (catalogo[id] ?? null) : null;
    if (!def) motivos.push(`${ruta}[${i}]: elemento desconocido «${String(id)}»`);
    else if (def.estado !== undefined && def.estado !== "listo") motivos.push(`${ruta}[${i}]: «${id}» no disponible: ${def.motivo ?? "próximamente"}`);
    else validarParams(cuerpo as Record<string, Dato>, def.params, `${ruta}[${i}] ${String(id)}`, motivos, nombres);
  });
};
const validarLimites = (limites: unknown, motivos: string[]): void => {
  if (limites === undefined) return;
  if (typeof limites !== "object" || limites === null || Array.isArray(limites)) { motivos.push("«limites» debe ser un objeto"); return; }
  const l = limites as Record<string, unknown>;
  for (const clave of Object.keys(l)) if (clave !== "segundos" && clave !== "memoriaMB") motivos.push(`limites: campo desconocido «${clave}»`);
  if (l.segundos !== undefined && (typeof l.segundos !== "number" || !Number.isInteger(l.segundos) || l.segundos < 1 || l.segundos > voc.topes.segundos)) motivos.push(`limites: «segundos» debe ser un entero de 1 a ${voc.topes.segundos}`);
  if (l.memoriaMB !== undefined && (typeof l.memoriaMB !== "number" || !Number.isFinite(l.memoriaMB) || l.memoriaMB < 1 || l.memoriaMB > 1000000)) motivos.push(`limites: «memoriaMB» debe ser un número de 1 a 1000000`);
};
const validarParams = (par: Record<string, Dato>, especs: Record<string, Espec>, ruta: string, motivos: string[], nombres: Set<string>): void => {
  for (const campo of Object.keys(especs)) {
    if (campo in par) validarValor(par[campo], especs[campo], `${ruta}: ${campo}`, motivos, nombres);
    else if (!especs[campo].opc) motivos.push(`${ruta}: falta el parámetro «${campo}»`);
  }
  for (const campo of Object.keys(par)) if (!(campo in especs)) motivos.push(`${ruta}: campo desconocido «${campo}»`);
};
const validarNum = (valor: unknown, e: Espec, ruta: string, motivos: string[]): void => {
  if (typeof valor !== "number" || !Number.isFinite(valor)) motivos.push(`${ruta}: debe ser un número finito`);
  else if ((e.min !== undefined && valor < e.min) || (e.max !== undefined && valor > e.max)) motivos.push(`${ruta}: fuera del rango ${e.min ?? "-∞"}…${e.max ?? "∞"}`);
  else if (e.ent && !Number.isInteger(valor)) motivos.push(`${ruta}: debe ser un número entero`);
};
const validarValor = (valor: unknown, e: Espec, ruta: string, motivos: string[], nombres: Set<string>): void => {
  if (e.t === "num") validarNum(valor, e, ruta, motivos);
  else if (e.t === "enum") { if (typeof valor !== "string" || !(e.v ?? []).includes(valor)) motivos.push(`${ruta}: valor fuera de la lista permitida`); }
  else if (e.t === "bool") { if (typeof valor !== "boolean") motivos.push(`${ruta}: debe ser verdadero o falso`); }
  else if (e.t === "vec" || e.t === "rgba") {
    const longitud = e.t === "vec" ? e.n ?? 3 : 4;
    if (!Array.isArray(valor) || valor.length !== longitud) motivos.push(`${ruta}: debe ser una lista de ${longitud} números`);
    else valor.forEach((x, i) => validarNum(x, { t: "num", min: e.min ?? (e.t === "rgba" ? 0 : undefined), max: e.max ?? (e.t === "rgba" ? 1 : undefined), ent: e.ent }, `${ruta}[${i}]`, motivos));
  }
  else if (e.t === "nombre") {
    if (typeof valor !== "string" || !NOMBRE.test(valor)) motivos.push(`${ruta}: nombre inválido (letras y cifras, «_» o «-», empieza por letra)`);
    else if (nombres.has(valor)) motivos.push(`${ruta}: nombre repetido «${valor}»`);
    else nombres.add(valor);
  }
  else if (e.t === "ref") { if (typeof valor !== "string" || !nombres.has(valor)) motivos.push(`${ruta}: el objeto «${String(valor)}» no existe todavía en la escena`); }
  else if (e.t === "txt") { if (typeof valor !== "string" || valor.length > (e.max ?? Infinity) || !new RegExp(e.patron ?? "").test(valor)) motivos.push(`${ruta}: texto no válido (máximo ${e.max} caracteres y patrón del vocabulario)`); }
  else if (e.t === "ruta") {
    if (typeof valor !== "string" || !RUTA.test(valor) || valor.includes("..")) motivos.push(`${ruta}: ruta relativa inválida (sin «/» inicial ni «..»)`);
    else if (!(e.ext ?? []).includes(valor.split(".").pop() ?? "")) motivos.push(`${ruta}: extensión no permitida (permitidas: ${(e.ext ?? []).join(", ")})`);
  }
  else if (e.t === "lista") {
    if (!Array.isArray(valor)) motivos.push(`${ruta}: debe ser una lista`);
    else if (valor.length > (e.max ?? Infinity)) motivos.push(`${ruta}: demasiados elementos (máximo ${e.max})`);
    else valor.forEach((x, i) => validarValor(x, e.de ?? { t: "num" }, `${ruta}[${i}]`, motivos, nombres));
  }
  else if (e.t === "obj") {
    if (typeof valor !== "object" || valor === null || Array.isArray(valor)) motivos.push(`${ruta}: debe ser un objeto`);
    else validarParams(valor as Record<string, Dato>, e.campos ?? {}, ruta, motivos, nombres);
  }
  else motivos.push(`${ruta}: especificación desconocida «${e.t}»`);
};
const BASE_VERTICES: Record<string, number> = { plano: 4, cubo: 24, circulo: 32, icosfera: 80, esfera: 96, cilindro: 96, cono: 64, toro: 128 };
const COSTE_MOTOR: Record<string, number> = { workbench: 20000000, eevee: 10000000, "cycles-gpu": 8000000, "cycles-cpu": 2000000 };
const numero = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 1);
const fotogramas = (s: Salida): number => (s.tipo === "render_mp4" ? Math.max(1, numero(s.hasta) - numero(s.desde) + 1) : 1);
export function estimarCoste(trabajo: Trabajo3D): { vertices: number; segundos: number } {
  const porNombre = new Map<string, number>();
  for (const o of trabajo.escena) {
    if (o.op === "primitiva" && typeof o.tipo === "string" && typeof o.nombre === "string") porNombre.set(o.nombre, (BASE_VERTICES[o.tipo] ?? 0) * numero(o.segmentos));
    else if (o.op === "texto3d" && typeof o.nombre === "string") porNombre.set(o.nombre, 256);
    else if (o.op === "importar" && typeof o.nombre === "string") porNombre.set(o.nombre, 0);
    else if (o.op === "modificador" && o.tipo === "subdivision" && typeof o.objeto === "string") porNombre.set(o.objeto, (porNombre.get(o.objeto) ?? 0) * Math.pow(4, numero(o.niveles)));
  }
  const vertices = [...porNombre.values()].reduce((a, v) => a + v, 0);
  const segundos = trabajo.salidas.reduce((acc, s) => acc + (numero(s.ancho) * numero(s.alto) * numero(s.muestras) * fotogramas(s)) / (COSTE_MOTOR[String(s.motor)] ?? 2000000), 0);
  return { vertices, segundos };
}
export function necesitaConfirmacion(trabajo: Trabajo3D, perfil: "ninguno" | "ligero" | "estandar" | "estudio"): boolean {
  const { vertices, segundos } = estimarCoste(trabajo);
  const tope = (v: unknown, max: number): boolean => typeof v === "number" && Number.isFinite(v) && v > max;
  return trabajo.ambito === "grupo" || trabajo.ambito === "publica" || trabajo.calidad === "final" || trabajo.escena.some((o) => o.op === "importar") ||
    (perfil === "ligero" && (vertices > voc.topes.vertices || segundos > voc.topes.segundos || trabajo.salidas.some((s) => tope(s.ancho, 1280) || tope(s.alto, 720) || tope(s.muestras, 64) || (s.tipo === "render_mp4" && fotogramas(s) > 120))));
}

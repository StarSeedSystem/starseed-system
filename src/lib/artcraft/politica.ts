/**
 * ArtCraft · POLÍTICA de la pasarela. Módulo PURO: sin `node:*`, sin React, sin red.
 * Contrato: `architecture/artcraft-y-rare.md` §3.2 y §3.3. Decide si una llamada de un
 * agente a FigCraft, GridCraft o DeckCraft se permite, necesita confirmación o se deniega.
 */
import { decidir } from "@/lib/protomolecula/permisos";
import type { Ambito, Origen, Rol } from "@/lib/protomolecula/tipos";
import { APPS_ARTCRAFT, HERRAMIENTAS, PREFIJOS_VETADOS } from "./politica-tablas";
import type { AppArtcraft } from "./politica-tablas";

export interface RaicesTrabajo { lectura: readonly string[]; escritura: readonly string[] }

export interface LlamadaArtcraft {
  app: AppArtcraft; herramienta: string; parametros: Record<string, unknown>;
  origen: Origen; ambito: Ambito; rol: Rol | null; raices: RaicesTrabajo;
}

export type Veredicto = { decision: "permitir" | "confirmar" | "denegar"; motivo: string; escribe: boolean };

const UNIDAD = /^[a-zA-Z]:\//;
const CLAVES_RUTA = ["path", "file", "dir", "out", "src", "dst", "from", "to", "ruta", "archivo", "carpeta"];
const SIN_ESCRITURA = new Set(["open_file", "open_workbook", "go_to_slide"]);
const VENTANA = new Set(["pointer", "key", "type_text", "select", "select_tool", "call_app"]);
const AUTOMATICOS = new Set<Origen>(["ia", "agente"]);

function normalizar(ruta: string): string {
  let r = ruta.trim().replace(/\\/g, "/").replace(/\/+/g, "/");
  if (UNIDAD.test(r)) r = r[0].toLowerCase() + r.slice(1);
  if (r.length > 1 && r.endsWith("/")) r = r.slice(0, -1);
  return r;
}

function claveRuta(clave: string): boolean {
  const k = clave.toLowerCase();
  return CLAVES_RUTA.some((n) => {
    if (k === n || k.startsWith(`${n}_`) || k.startsWith(`${n}-`) || k.endsWith(`_${n}`) || k.endsWith(`-${n}`)) return true;
    if (n.length <= 3) return new RegExp(`(^|[a-z])${n[0].toUpperCase()}${n.slice(1)}([A-Z]|$)`).test(clave);
    return k.startsWith(n) || k.endsWith(n);
  });
}

const pareceRuta = (v: string): boolean => /^([/\\]|~|file:)/i.test(v.trim()) || /^[a-zA-Z]:/.test(v.trim());

export function rutaDentro(ruta: string, raices: readonly string[] | RaicesTrabajo): boolean {
  const lista = Array.isArray(raices) ? (raices as readonly string[]) : [...(raices as RaicesTrabajo).lectura, ...(raices as RaicesTrabajo).escritura];
  const bruta = ruta.trim();
  if (!bruta || bruta.includes("\0") || bruta.includes("..") || bruta.includes("~")) return false;
  if (/^file:/i.test(bruta) || /^[\\/]{2}/.test(bruta)) return false;
  const r = normalizar(bruta);
  if (!r.startsWith("/") && !UNIDAD.test(r)) return false;
  return lista.some((raiz) => {
    const base = normalizar(raiz);
    if (!base) return false;
    return base === "/" ? r.startsWith("/") : r === base || r.startsWith(`${base}/`);
  });
}

function recorrer(v: unknown, clave: string | null, salida: string[], prof: number, vistos: WeakSet<object>): void {
  if (prof > 6) return;
  if (typeof v === "string") { if ((clave !== null && claveRuta(clave)) || pareceRuta(v)) salida.push(v); return; }
  if (!v || typeof v !== "object" || vistos.has(v)) return;
  vistos.add(v);
  if (Array.isArray(v)) { for (const x of v) recorrer(x, clave, salida, prof + 1, vistos); return; }
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) recorrer(x, k, salida, prof + 1, vistos);
}

export function rutasEnParametros(p: Record<string, unknown>): string[] {
  const salida: string[] = [];
  recorrer(p, null, salida, 0, new WeakSet());
  return salida;
}

function tieneTrusted(v: unknown, prof = 0): boolean {
  if (prof > 6 || !v || typeof v !== "object") return false;
  if (Array.isArray(v)) return v.some((x) => tieneTrusted(x, prof + 1));
  return Object.entries(v as Record<string, unknown>).some(([k, x]) => (k === "trusted" && x === true) || tieneTrusted(x, prof + 1));
}

function comandos(p: Record<string, unknown>): string[] {
  const salida: string[] = [];
  if (typeof p.command === "string") salida.push(p.command);
  if (!Array.isArray(p.commands)) return salida;
  for (const c of p.commands) {
    if (typeof c === "string") salida.push(c);
    else if (c && typeof c === "object" && typeof (c as { command?: unknown }).command === "string") salida.push((c as { command: string }).command);
  }
  return salida;
}

function prefijoVetado(app: AppArtcraft, texto: string): boolean {
  const t = texto.trim().toLowerCase();
  return PREFIJOS_VETADOS[app].some((pre) => t.startsWith(pre.toLowerCase()));
}

const escribeHerramienta = (app: AppArtcraft, herramienta: string): boolean =>
  HERRAMIENTAS[app].trabajo.includes(herramienta) && !SIN_ESCRITURA.has(herramienta);

export function evaluarLlamada(l: LlamadaArtcraft): Veredicto {
  if (!APPS_ARTCRAFT.includes(l.app)) return { decision: "denegar", motivo: "App de ArtCraft desconocida.", escribe: false };
  const tabla = HERRAMIENTAS[l.app];
  const escribe = escribeHerramienta(l.app, l.herramienta);
  const negar = (motivo: string): Veredicto => ({ decision: "denegar", motivo, escribe });
  if (AUTOMATICOS.has(l.origen) && VENTANA.has(l.herramienta)) return negar("Una IA o un agente no mueven la ventana de la app.");
  if (tabla.vetadas.includes(l.herramienta) || prefijoVetado(l.app, l.herramienta)) return negar("La herramienta está vetada para un agente.");
  if (!tabla.libre.includes(l.herramienta) && !tabla.trabajo.includes(l.herramienta)) return negar("La herramienta no está en la lista permitida.");
  if (tieneTrusted(l.parametros)) return negar("Ejecutar scripts marcados como de confianza queda vetado.");
  if (comandos(l.parametros).some((c) => prefijoVetado(l.app, c))) return negar("El comando pedido está en la lista vetada.");
  const rutas = rutasEnParametros(l.parametros);
  const permitidas = escribe ? l.raices.escritura : [...l.raices.lectura, ...l.raices.escritura];
  if (rutas.some((ruta) => !rutaDentro(ruta, permitidas))) {
    return negar(escribe ? "Una ruta queda fuera del directorio de escritura." : "Una ruta queda fuera del directorio de trabajo.");
  }
  if (!escribe) return { decision: "permitir", motivo: "Lectura dentro del directorio de trabajo.", escribe: false };
  const d = decidir({ rol: l.rol, origen: l.origen, ambito: l.ambito, accion: "editar-estructura" });
  if (!d.permitido) return negar(d.motivo);
  const abierto = l.ambito === "grupo" || l.ambito === "publica";
  return { decision: d.confirmar || abierto ? "confirmar" : "permitir", motivo: d.motivo, escribe: true };
}

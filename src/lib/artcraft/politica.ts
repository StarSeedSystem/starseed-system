/**
 * ArtCraft · POLÍTICA de la pasarela (§3): decide si una llamada de un agente al servidor MCP
 * de FigCraft, GridCraft o DeckCraft se permite, se confirma o se deniega.
 * Contrato: `architecture/artcraft-y-rare.md` §3.2 y §3.3. Módulo PURO: sin `node:*`, sin React, sin red.
 */
import { decidir } from "@/lib/protomolecula/permisos";
import type { Ambito, Origen, Rol } from "@/lib/protomolecula/tipos";
import { HERRAMIENTAS, PREFIJOS_VETADOS, type AppArtcraft } from "./politica-tablas";

export interface RaicesTrabajo { lectura: readonly string[]; escritura: readonly string[] }
export interface LlamadaArtcraft {
  app: AppArtcraft;
  herramienta: string;
  parametros: Record<string, unknown>;
  origen: Origen;
  ambito: Ambito;
  rol: Rol | null;
  raices: RaicesTrabajo;
}
export type Veredicto = { decision: "permitir" | "confirmar" | "denegar"; motivo: string; escribe: boolean };

const PROFUNDIDAD_MAX = 6;
const CLAVES_RUTA = new Set(["path", "file", "dir", "out", "src", "dst", "from", "to", "ruta", "archivo", "carpeta"]);
const SIN_ESCRIBIR = new Set(["open_file", "open_workbook", "open_presentation"]);
const VENTANA = new Set(["pointer", "key", "type_text", "select", "select_tool", "call_app"]);
const COMANDOS = new Set(["run_command", "execute_command", "batch"]);

const denegar = (motivo: string): Veredicto => ({ decision: "denegar", motivo, escribe: false });
const automatico = (o: Origen): boolean => o === "ia" || o === "agente";
/** Ruta absoluta normalizada con «/»; null si es vacía, relativa, UNC, `file:`, `~`, `..` o trae NUL. */
function normalizar(ruta: string): string | null {
  if (!ruta || ruta.includes("\0") || ruta.includes("~") || ruta.includes("..")) return null;
  if (ruta.startsWith("\\\\") || ruta.startsWith("//")) return null;
  if (/^file:/i.test(ruta)) return null;
  const r = ruta.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  if (!r.startsWith("/") && !/^[A-Za-z]:\//.test(r)) return null;
  return r.length > 1 && r.endsWith("/") ? r.slice(0, -1) : r;
}

/** ¿La ruta cae dentro de alguna raíz? Por componentes: `/a/b` no contiene `/a/bc`. */
export function rutaDentro(ruta: string, raices: readonly string[]): boolean {
  const b = normalizar(ruta);
  if (!b) return false;
  return raices.some((raiz) => {
    const a = normalizar(raiz);
    if (!a) return false;
    if (a === "/") return true;
    return b === a || b.startsWith(a + "/");
  });
}

function pareceRuta(v: string): boolean {
  return v.startsWith("/") || v.startsWith("~") || v.startsWith("\\\\") || /^file:/i.test(v) || /^[A-Za-z]:[\\/]/.test(v);
}

/** Cadenas de `p` con forma o clave de ruta. Profundidad ≤ 6. */
export function rutasEnParametros(p: Record<string, unknown>): string[] {
  const salida: string[] = [];
  const ver = (valor: unknown, clave: string, profundidad: number): void => {
    if (profundidad > PROFUNDIDAD_MAX) return;
    if (typeof valor === "string") {
      if (CLAVES_RUTA.has(clave.toLowerCase()) || pareceRuta(valor)) salida.push(valor);
      return;
    }
    if (Array.isArray(valor)) { valor.forEach((v) => ver(v, clave, profundidad + 1)); return; }
    if (valor && typeof valor === "object") {
      for (const [k, v] of Object.entries(valor as Record<string, unknown>)) ver(v, k, profundidad + 1);
    }
  };
  for (const [k, v] of Object.entries(p)) ver(v, k, 0);
  return salida;
}

function hayTrusted(valor: unknown, profundidad = 0): boolean {
  if (profundidad > PROFUNDIDAD_MAX || !valor || typeof valor !== "object") return false;
  if (Array.isArray(valor)) return valor.some((v) => hayTrusted(v, profundidad + 1));
  return Object.entries(valor as Record<string, unknown>).some(([k, v]) =>
    (k.toLowerCase() === "trusted" && v === true) || hayTrusted(v, profundidad + 1));
}

function comandoVetado(parametros: Record<string, unknown>, app: AppArtcraft): boolean {
  const prefijos = PREFIJOS_VETADOS[app];
  if (prefijos.length === 0) return false;
  const comandos: string[] = [];
  if (typeof parametros.command === "string") comandos.push(parametros.command);
  if (Array.isArray(parametros.commands)) {
    for (const c of parametros.commands) {
      if (typeof c === "string") comandos.push(c);
      else if (c && typeof c === "object" && typeof (c as Record<string, unknown>).command === "string") {
        comandos.push((c as { command: string }).command);
      }
    }
  }
  return comandos.some((c) => prefijos.some((pre) => c.startsWith(pre)));
}

export function evaluarLlamada(l: LlamadaArtcraft): Veredicto {
  const { app, herramienta: h, parametros, origen, ambito, rol, raices } = l;
  const tabla = HERRAMIENTAS[app];
  if (automatico(origen) && VENTANA.has(h)) return denegar("Una IA o un agente no maneja la ventana de la app.");
  const vetada = tabla.vetadas.includes(h) || PREFIJOS_VETADOS[app].some((pre) => h.startsWith(pre));
  if (vetada) return denegar(`La herramienta «${h}» está siempre vetada para agentes.`);
  const libre = tabla.libre.includes(h), trabajo = tabla.trabajo.includes(h);
  if (!libre && !trabajo) return denegar(`La herramienta «${h}» no está en la lista permitida de ${app}.`);
  if (hayTrusted(parametros)) return denegar("La pasarela no acepta «trusted: true».");
  if (COMANDOS.has(h) && comandoVetado(parametros, app)) return denegar("El comando pedido está vetado en esta app.");
  const escribe = trabajo && !SIN_ESCRIBIR.has(h);
  for (const ruta of rutasEnParametros(parametros)) {
    if (!rutaDentro(ruta, raices.lectura) && !rutaDentro(ruta, raices.escritura)) return denegar("Hay una ruta fuera del directorio de trabajo.");
    if (escribe && !rutaDentro(ruta, raices.escritura)) return denegar("Escribir solo se permite dentro de la carpeta de salida.");
  }
  if (!escribe) return { decision: "permitir", motivo: "Herramienta de lectura: el agente puede usarla.", escribe: false };
  const d = decidir({ rol, origen, ambito, accion: "editar-estructura" });
  if (!d.permitido) return denegar(d.motivo);
  if (d.confirmar || ambito === "grupo" || ambito === "publica") {
    return { decision: "confirmar", motivo: "Escribir en un ámbito compartido pide confirmación.", escribe: true };
  }
  return { decision: "permitir", motivo: "Escritura dentro de tu espacio personal.", escribe: true };
}

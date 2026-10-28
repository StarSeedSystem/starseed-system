/**
 * Pasarela ArtCraft · POLÍTICA pura (contrato: `architecture/artcraft-y-rare.md` §3).
 * Decide si una llamada del agente al MCP de FigCraft, GridCraft o DeckCraft se permite,
 * pide confirmación o se deniega. Sin `node:*`, sin React, sin red.
 */
import { decidir } from "@/lib/protomolecula/permisos";
import type { Ambito, Origen, Rol } from "@/lib/protomolecula/tipos";
import { APPS_ARTCRAFT, HERRAMIENTAS, PREFIJOS_VETADOS } from "./politica-tablas";
import type { AppArtcraft } from "./politica-tablas";

export type { AppArtcraft } from "./politica-tablas";
export interface RaicesTrabajo { lectura: readonly string[]; escritura: readonly string[] }
export interface LlamadaArtcraft {
  app: AppArtcraft; herramienta: string; parametros: Record<string, unknown>;
  origen: Origen; ambito: Ambito; rol: Rol | null; raices: RaicesTrabajo;
}
export type Veredicto = { decision: "permitir" | "confirmar" | "denegar"; motivo: string; escribe: boolean };

/** Herramientas de ventana: nunca desde un origen automático (`ia` o `agente`). */
const HERRAMIENTAS_VENTANA = ["pointer", "key", "type_text", "select", "select_tool", "call_app"];
/** De la lista de trabajo, estas solo LEEN: no exigen raíz de escritura. */
const LECTURAS_TRABAJO = ["open_file", "open_workbook", "open_presentation"];
const si = (motivo: string, escribe: boolean): Veredicto => ({ decision: "permitir", motivo, escribe });
const confirmar = (motivo: string, escribe: boolean): Veredicto => ({ decision: "confirmar", motivo, escribe });
const no = (motivo: string, escribe = false): Veredicto => ({ decision: "denegar", motivo, escribe });
const normalizaRuta = (r: string): string => r.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
const esCadena = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const pintaRuta = (v: string): boolean =>
  v.startsWith("/") || v.startsWith("~") || v.toLowerCase().startsWith("file:") || v.startsWith("\\") || /^[a-zA-Z]:/.test(v);
const CLAVES_RUTA = ["path", "file", "dir", "out", "src", "dst", "from", "to", "ruta", "archivo", "carpeta"];

/** ¿La ruta normalizada es exactamente una raíz o cuelga de ella (`raiz/…`)? */
export function rutaDentro(ruta: string, raices: RaicesTrabajo): boolean {
  const n = normalizaRuta(ruta.trim());
  if (!n || n.includes("..") || n.startsWith("~") || n.toLowerCase().includes("file:")) return false;
  if (n.includes("\u0000") || n.startsWith("//") || !n.startsWith("/") || (n.length > 1 && n[1] === ":")) return false;
  return [...raices.lectura, ...raices.escritura].some((raiz) => {
    const r = normalizaRuta(raiz.trim()).replace(/\/+$/, "");
    return !!r && (n === r || n.startsWith(r + "/"));
  });
}

/** Toda cadena de los parámetros que parece una ruta: por su clave o por su forma (profundidad ≤ 6). */
export function rutasEnParametros(p: Record<string, unknown>, profundidad = 0): string[] {
  const rutas: string[] = [];
  for (const [clave, valor] of Object.entries(p)) {
    const porClave = CLAVES_RUTA.some((c) => clave.toLowerCase().includes(c));
    if (esCadena(valor) && (porClave || pintaRuta(valor))) rutas.push(valor);
    else if (Array.isArray(valor) && profundidad < 6) {
      for (const v of valor) if (esCadena(v) && (porClave || pintaRuta(v))) rutas.push(v);
    } else if (valor !== null && typeof valor === "object" && profundidad < 6) rutas.push(...rutasEnParametros(valor as Record<string, unknown>, profundidad + 1));
  }
  return rutas;
}

/** ¿Hay algún `trusted === true` en cualquier parte de los parámetros (profundidad ≤ 6)? */
export function hayTrusted(p: unknown, profundidad = 0): boolean {
  if (profundidad > 6 || p === null || typeof p !== "object") return false;
  const esTrusted = ([k, v]: [string, unknown]) => k === "trusted" && v === true;
  return (
    Array.isArray(p) ? p.some((v) => hayTrusted(v, profundidad + 1))
    : Object.entries(p).some(esTrusted) || Object.values(p).some((v) => hayTrusted(v, profundidad + 1))
  );
}

/** El prefijo vetado de una orden de `run_command`/`batch` se aparece con su texto, no con su nombre. */
const comandoVetado = (app: AppArtcraft, comando: string): boolean =>
  PREFIJOS_VETADOS[app].some((p) => comando === p || comando.startsWith(p));
const ordenesDeEjecucion = ["run_command", "execute_command", "batch"];
const ordenVetada = (l: LlamadaArtcraft): string[] => {
  if (!ordenesDeEjecucion.includes(l.herramienta)) return [];
  const vals = Array.isArray(l.parametros.commands) ? l.parametros.commands : [];
  const cs = [...vals.flatMap((v) => (esCadena(v) ? [v] : v !== null && typeof v === "object" ? [(v as Record<string, unknown>).command] : []))];
  const suelto = typeof l.parametros.command === "string" ? [l.parametros.command] : [];
  return [...suelto, ...cs].filter(esCadena).filter((c) => comandoVetado(l.app, c));
};
const esEscribir = (app: AppArtcraft, herramienta: string): boolean =>
  HERRAMIENTAS[app].trabajo.includes(herramienta) && !LECTURAS_TRABAJO.includes(herramienta);

/** Veredicto completo de una llamada del agente al servidor MCP (contrato §3.2 y §3.3). */
export function evaluarLlamada(l: LlamadaArtcraft): Veredicto {
  if (!APPS_ARTCRAFT.includes(l.app)) return no("Esa app no pasa por la pasarela ArtCraft.");
  const tabla = HERRAMIENTAS[l.app];
  const escribe = esEscribir(l.app, l.herramienta);
  if ((l.origen === "ia" || l.origen === "agente") && HERRAMIENTAS_VENTANA.includes(l.herramienta))
    return no("Un origen automático nunca toca las herramientas de ventana de la app.");
  if (tabla.vetadas.includes(l.herramienta)) return no(`«${l.herramienta}» está vetada en la pasarela.`);
  if (!tabla.libre.includes(l.herramienta) && !tabla.trabajo.includes(l.herramienta)) return no(`«${l.herramienta}» no está en la lista permitida de ${l.app}.`);
  if (hayTrusted(l.parametros)) return no("Un script marcado de confianza nunca se ejecuta desde un agente.");
  const vetadas = ordenVetada(l);
  if (vetadas.length > 0) return no("La orden pide un comando vetado (colaboración, complementos o scripts).");
  const fuera = rutasEnParametros(l.parametros).find((r) => !rutaDentro(r, l.raices));
  if (fuera) return no("Una ruta de los parámetros está fuera del directorio de trabajo de la neurona.");
  if (escribe) {
    const dentroEscritura = (r: string): boolean => rutaDentro(r, { lectura: [], escritura: l.raices.escritura });
    const fueraEscritura = rutasEnParametros(l.parametros).find((r) => !dentroEscritura(r));
    if (fueraEscritura) return no("Escribir solo cabe en la raíz de escritura del directorio de trabajo.", true);
    const d = decidir({ rol: l.rol, origen: l.origen, ambito: l.ambito, accion: "editar-estructura" });
    if (!d.permitido) return no(d.motivo, true);
    if (d.confirmar) return confirmar("Escritura en el directorio de trabajo de un ámbito compartido: pide confirmación.", true);
    return si("Escritura permitida dentro del directorio de trabajo.", true);
  }
  return si("Lectura del directorio de trabajo, permitida.", false);
}

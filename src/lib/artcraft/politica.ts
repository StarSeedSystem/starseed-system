/**
 * ArtCraft · POLÍTICA de la pasarela (PURA): decide si una llamada MCP de un agente a
 * FigCraft, GridCraft o DeckCraft se permite, necesita confirmación o se deniega.
 * Contrato: `architecture/artcraft-y-rare.md` §3 (lista §3.2, ámbitos §3.3).
 * Sin `node:*`, sin red, sin React. Las tablas viven en `politica-tablas.ts`.
 */
import { decidir } from "@/lib/protomolecula/permisos";
import type { Ambito, Origen, Rol } from "@/lib/protomolecula/tipos";
import { HERRAMIENTAS, PREFIJOS_VETADOS, type AppArtcraft } from "./politica-tablas";

export interface RaicesTrabajo {
  /** Rutas absolutas ya normalizadas que entrega el servidor de la neurona. */
  lectura: readonly string[];
  escritura: readonly string[];
}

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

/** Herramientas de ventana: jamás desde un origen `ia` o `agente`. */
const VENTANA = new Set(["pointer", "key", "type_text", "select", "call_app"]);
/** Herramientas que ejecutan órdenes: se mira `command` y cada `commands[].command`. */
const ORDENES = new Set(["run_command", "execute_command", "batch"]);
/** Herramientas de `trabajo` que solo leen un archivo (no escriben). */
const APERTURA = new Set(["open_file", "open_workbook", "open_presentation"]);
const CLAVES_RUTA = new Set(["path", "file", "dir", "out", "src", "dst", "from", "to", "ruta", "archivo", "carpeta"]);
const PARECE_RUTA = /^(\/|~|file:|\\|[a-zA-Z]:)/;
const PROFUNDIDAD = 6;

/** Unifica separadores y colapsa repetidos: comparación de texto, nunca de disco. */
const normaliza = (r: string): string => r.replace(/\\/g, "/").replace(/\/{2,}/g, "/");

/**
 * True solo si la ruta es absoluta, está limpia (sin `..`, `~`, `file:`, UNC ni byte nulo)
 * y coincide con una raíz o cuelga de ella por `/`.
 */
export function rutaDentro(ruta: string, raices: readonly string[]): boolean {
  if (!ruta || ruta.includes("\0")) return false;
  if (ruta.includes("~") || ruta.toLowerCase().includes("file:")) return false;
  if (ruta.includes("\\\\")) return false;
  const n = normaliza(ruta);
  if (!n.startsWith("/") || n.includes("..")) return false;
  return raices.some((raiz) => {
    const h = normaliza(raiz);
    return n === h || n.startsWith(`${h}/`);
  });
}

/** Toda cadena de los parámetros que sea una ruta: por clave conocida o por su forma. */
export function rutasEnParametros(p: Record<string, unknown>): string[] {
  const rutas: string[] = [];
  const mira = (v: unknown, clave: string, d: number): void => {
    if (d > PROFUNDIDAD) return;
    if (typeof v === "string") {
      if (CLAVES_RUTA.has(clave.toLowerCase()) || PARECE_RUTA.test(v)) rutas.push(v);
    } else if (Array.isArray(v)) {
      v.forEach((x) => mira(x, clave, d + 1));
    } else if (v !== null && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) mira(x, k, d + 1);
    }
  };
  for (const [k, v] of Object.entries(p)) mira(v, k, 1);
  return rutas;
}

/** ¿Hay algún `trusted: true` en cualquier parte de los parámetros? */
function hayTrusted(v: unknown, d: number): boolean {
  if (d > PROFUNDIDAD || v === null || typeof v !== "object") return false;
  if (Array.isArray(v)) return v.some((x) => hayTrusted(x, d + 1));
  return Object.entries(v).some(([k, x]) => (k === "trusted" && x === true) || hayTrusted(x, d + 1));
}

/** Una herramienta de `trabajo` escribe, salvo las que solo abren un archivo. */
export function escribeHerramienta(app: AppArtcraft, herramienta: string): boolean {
  return HERRAMIENTAS[app].trabajo.includes(herramienta) && !APERTURA.has(herramienta);
}

/** `command` de una entrada de `commands[]`, o null si no es texto. */
const comandoDe = (c: unknown): string | null => {
  if (typeof c !== "object" || c === null) return null;
  const cmd = (c as { command?: unknown }).command;
  return typeof cmd === "string" ? cmd : null;
};

export function evaluarLlamada(l: LlamadaArtcraft): Veredicto {
  const t = HERRAMIENTAS[l.app];
  const deniega = (motivo: string, es: boolean): Veredicto => ({ decision: "denegar", motivo, escribe: es });
  const escribe = escribeHerramienta(l.app, l.herramienta);
  const conocida = t.libre.includes(l.herramienta) || t.trabajo.includes(l.herramienta);
  if (!conocida) {
    return deniega(
      t.vetadas.includes(l.herramienta)
        ? `«${l.herramienta}» está vetada en ${l.app}: solo la persona, desde la ventana de la app.`
        : `«${l.herramienta}» no está en la lista permitida de ${l.app}.`,
      false,
    );
  }
  if ((l.origen === "ia" || l.origen === "agente") && VENTANA.has(l.herramienta))
    return deniega("Un agente no maneja la ventana de la app.", false);
  if (hayTrusted(l.parametros, 1)) return deniega("«trusted: true» está vetado: los scripts llegan desactivados.", escribe);
  if (ORDENES.has(l.herramienta)) {
    const ordenes = [
      typeof l.parametros.command === "string" ? l.parametros.command : null,
      ...(Array.isArray(l.parametros.commands) ? l.parametros.commands.map(comandoDe) : []),
    ].filter((o): o is string => o !== null);
    if (ordenes.some((o) => PREFIJOS_VETADOS[l.app].some((p) => o.startsWith(p))))
      return deniega(`Orden vetada en ${l.app}: toca un prefijo prohibido (colaboración, complementos o scripts).`, escribe);
  }
  const todas = [...l.raices.lectura, ...l.raices.escritura];
  for (const ruta of rutasEnParametros(l.parametros)) {
    if (!rutaDentro(ruta, todas)) return deniega("Hay una ruta fuera del directorio de trabajo.", escribe);
    if (escribe && !rutaDentro(ruta, l.raices.escritura))
      return deniega("Escribir solo vale dentro de la raíz de escritura del directorio de trabajo.", escribe);
  }
  if (!escribe) return { decision: "permitir", motivo: `Lectura libre: «${l.herramienta}» está en la lista de ${l.app}.`, escribe: false };
  const d = decidir({ rol: l.rol, origen: l.origen, ambito: l.ambito, accion: "editar-estructura" });
  if (!d.permitido) return deniega(d.motivo, true);
  return {
    decision: d.confirmar ? "confirmar" : "permitir",
    motivo: d.motivo,
    escribe: true,
  };
}

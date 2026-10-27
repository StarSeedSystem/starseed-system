/* Pasarela ArtCraft · POLÍTICA (contrato `architecture/artcraft-y-rare.md` §3.2–§3.3).
 * Decide si una llamada de un agente al MCP de FigCraft, GridCraft o DeckCraft
 * se PERMITE, necesita CONFIRMACIÓN o se DENIEGA. Módulo PURO: sin `node:*`, sin red.
 * `politica-tablas.ts` lleva los datos; aquí solo la lógica. */
import { decidir } from "@/lib/protomolecula/permisos";
import type { Ambito, Origen, Rol } from "@/lib/protomolecula/tipos";
import { HERRAMIENTAS, PREFIJOS_VETADOS } from "./politica-tablas";
import type { AppArtcraft } from "./politica-tablas";

export interface RaicesTrabajo {
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

export function rutaDentro(ruta: string, raices: readonly string[]): boolean {
  if (ruta.length === 0 || ruta.includes("\0") || ruta.includes("~") || /file:/i.test(ruta)) return false;
  if (ruta.startsWith("\\")) return false; // UNC («\\servidor\c») o relativa a la unidad en Windows
  const n = ruta.replace(/\\/g, "/").replace(/\/+/g, "/");
  if (n.includes("..") || !/^(?:\/|[a-zA-Z]:\/)/.test(n)) return false; // subida, actual o relativa
  // Las raíces llegan ya normalizadas; se re-normaliza por prudencia (barra final fuera).
  return raices.some((r) => {
    const rn = r.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/+$/, "");
    if (rn.length === 0) return false;
    return n === rn || n.startsWith(rn + "/");
  });
}

/** Claves de parámetro que llevan rutas (§3.1: la pasarela inspecciona todas las cadenas). */
const CLAVES_RUTA = ["path", "file", "dir", "out", "src", "dst", "from", "to", "ruta", "archivo", "carpeta"];
/** Parece ruta: empieza por `/`, una `\`, `~`, `file:` o letra de unidad. */
const pareceRuta = (v: string): boolean => /^(?:\/|\\|~|file:|[a-zA-Z]:[\\/])/i.test(v);

export function rutasEnParametros(parametros: unknown): string[] {
  const salidas: string[] = [];
  const revisar = (v: unknown, prof: number): void => {
    if (v === null || typeof v !== "object" || prof > 6) return;
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === "string") {
        if (CLAVES_RUTA.includes(k.toLowerCase()) || pareceRuta(val)) salidas.push(val);
      } else if (val !== null && typeof val === "object") revisar(val, prof + 1);
    }
  };
  revisar(parametros, 1);
  return salidas;
}
const LECTURA = ["open_file", "open_workbook", "open_presentation"];
const COMANDOS = ["run_command", "execute_command", "batch"];
const VENTANA = ["pointer", "key", "type_text", "select", "call_app", "select_tool"];

/** Escritura = las de `trabajo` salvo las de lectura; `export`/`save_*` son de ese grupo. */
const esEscritura = (app: AppArtcraft, herramienta: string): boolean => {
  const tablas = HERRAMIENTAS[app];
  return !!tablas && tablas.trabajo.includes(herramienta) && !LECTURA.includes(herramienta);
};

/** `trusted: true` en cualquier parte de los parámetros deniega (§2.3, GridCraft). */
const hayTrusted = (v: unknown, prof = 1): boolean => {
  if (v === null || typeof v !== "object" || prof > 8) return false;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (k.toLowerCase() === "trusted" && x === true) return true;
    if (x !== null && typeof x === "object" && hayTrusted(x, prof + 1)) return true;
  }
  return false;
};

/** Comandos vetados: `parametros.command` y cada `parametros.commands[].command` (o cadena suelta). */
const comandoVetado = (app: AppArtcraft, parametros: Record<string, unknown>): boolean => {
  const textos: string[] = [];
  const c = parametros["command"];
  if (typeof c === "string") textos.push(c);
  const cs = parametros["commands"];
  if (Array.isArray(cs))
    for (const x of cs)
      if (typeof x === "string") textos.push(x);
      else if (x !== null && typeof x === "object" && typeof (x as Record<string, unknown>)["command"] === "string")
        textos.push((x as Record<string, unknown>)["command"] as string);
  return textos.some((t) => PREFIJOS_VETADOS[app].some((p) => t.startsWith(p)));
};

export function evaluarLlamada(l: LlamadaArtcraft): Veredicto {
  const t = HERRAMIENTAS[l.app];
  const escribe = !!t && esEscritura(l.app, l.herramienta);
  const v = (decision: Veredicto["decision"], motivo: string): Veredicto => ({ decision, motivo, escribe });
  if (!t) return v("denegar", "Aplicación desconocida para la pasarela.");
  if (VENTANA.includes(l.herramienta) && ["ia", "agente"].includes(l.origen))
    return v("denegar", "Las herramientas de ventana las maneja la persona, nunca una IA o un agente.");
  const lista = COMANDOS.includes(l.herramienta);
  const clasifica = t.libre.includes(l.herramienta) ? "libre" : t.trabajo.includes(l.herramienta) ? "trabajo" : t.vetadas.includes(l.herramienta) ? "vetada" : "desconocida";
  if (clasifica === "vetada" || clasifica === "desconocida") return v("denegar", clasifica === "vetada" ? `La herramienta «${l.herramienta}» está vetada por la política.` : `La herramienta «${l.herramienta}» no está en la lista permitida.`);
  if (lista && comandoVetado(l.app, l.parametros)) return v("denegar", `Comando vetado dentro de «${l.herramienta}» por prefijo prohibido.`);
  if (hayTrusted(l.parametros)) return v("denegar", "Hay un valor «trusted» activado: confiar los scripts lo hace una persona.");
  const rutas = rutasEnParametros(l.parametros);
  if (rutas.length > 0) {
    const todas = [...l.raices.lectura, ...l.raices.escritura];
    if (!rutas.every((r) => rutaDentro(r, todas))) return v("denegar", "Hay una ruta inválida o fuera del directorio de trabajo.");
    if (escribe && !rutas.every((r) => rutaDentro(r, l.raices.escritura))) return v("denegar", "Escribir exige una ruta dentro de la raíz de escritura.");
  }
  if (!escribe) return v("permitir", "Lectura libre del directorio de trabajo.");
  const d = decidir({ rol: l.rol, origen: l.origen, ambito: l.ambito, accion: "editar-estructura" });
  if (!d.permitido) return v("denegar", d.motivo);
  if (d.confirmar) return v("confirmar", `Escribir en «${l.ambito}» pide confirmación.`);
  return v("permitir", "Escritura en el directorio de trabajo del ámbito.");
}

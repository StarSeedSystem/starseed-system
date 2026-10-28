/**
 * ArtCraft · POLÍTICA de la pasarela (pura). Contrato: `architecture/artcraft-y-rare.md` §3.
 * Decide si una llamada de un agente a FigCraft, GridCraft o DeckCraft se permite, se confirma o se
 * deniega. Sin red, sin disco y sin `node:*`. Las tablas de §3.2 viajan aquí para que el módulo se
 * sostenga solo; `politica-tablas.ts` las publica como datos en su propia parte de la cadena.
 */
import { decidir } from "@/lib/protomolecula/permisos";
import type { Ambito, Origen, Rol } from "@/lib/protomolecula/tipos";

export type AppArtcraft = "figcraft" | "gridcraft" | "deckcraft";
export const APPS_ARTCRAFT: readonly AppArtcraft[] = ["figcraft", "gridcraft", "deckcraft"];
export interface TablaHerramientas { libre: readonly string[]; trabajo: readonly string[]; vetadas: readonly string[]; }

export const HERRAMIENTAS: Record<AppArtcraft, TablaHerramientas> = {
  figcraft: { libre: ["list_commands", "inspect_document", "get_node", "screenshot", "inspect_ui", "undo", "redo"], trabajo: ["create_node", "set_properties", "batch", "run_command", "export", "open_file", "save_file"], vetadas: ["pointer", "key", "type_text", "select"] },
  gridcraft: { libre: ["list_commands", "list_functions", "inspect_workbook", "read_range", "get_cell", "evaluate_formula", "screenshot"], trabajo: ["write_range", "set_cell", "format_range", "insert_chart", "create_table", "sort_range", "filter", "new_workbook", "open_workbook", "save_workbook", "execute_command", "undo", "redo"], vetadas: ["select"] },
  deckcraft: { libre: ["list_commands", "inspect_document", "inspect_slide", "render_slide", "screenshot"], trabajo: ["new_presentation", "open_presentation", "save_presentation", "export", "add_slide", "add_shape", "add_text_box", "set_text", "insert_picture", "insert_table", "insert_chart", "batch", "run_command", "go_to_slide"], vetadas: ["call_app", "pointer", "key", "type_text", "select", "select_tool"] },
};
export const PREFIJOS_VETADOS: Record<AppArtcraft, readonly string[]> = {
  figcraft: ["collab.", "plugin.", "widget.insert"], gridcraft: ["automate."], deckcraft: [],
};

export interface RaicesTrabajo { lectura: readonly string[]; escritura: readonly string[]; }
export interface LlamadaArtcraft {
  app: AppArtcraft; herramienta: string; parametros: Record<string, unknown>;
  origen: Origen; ambito: Ambito; rol: Rol | null; raices: RaicesTrabajo;
}
export type Veredicto = { decision: "permitir" | "confirmar" | "denegar"; motivo: string; escribe: boolean };

const VENTANA = new Set(["pointer", "key", "type_text", "select", "select_tool", "call_app"]);
const CLAVE_RUTA = /^(path|file|dir|out|src|dst|from|to|ruta|archivo|carpeta)$/i;
const PARECE_RUTA = (v: string): boolean => v.startsWith("/") || v.startsWith("~") || /^file:/i.test(v) || v.startsWith("\\\\") || v.startsWith("//") || /^[A-Za-z]:/.test(v);
const normalizar = (r: string): string => r.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
const veredicto = (decision: Veredicto["decision"], motivo: string, escribe: boolean): Veredicto => ({ decision, motivo, escribe });

function dentroDe(ruta: string, raices: readonly string[]): boolean {
  if (typeof ruta !== "string" || !ruta || ruta.includes("\0") || ruta.includes("~") || ruta.includes("..")) return false;
  if (ruta.startsWith("\\\\")) return false;
  const unificado = ruta.replace(/\\/g, "/");
  if (/^[A-Za-z]:/.test(unificado)) return false;
  const n = normalizar(unificado).replace(/\/+$/, "");
  if (!n.startsWith("/")) return false;
  return raices.some((raiz) => {
    const r = normalizar(raiz);
    if (r === "/") return true;
    const limpia = r.replace(/\/+$/, "");
    return limpia.startsWith("/") && (n === limpia || n.startsWith(`${limpia}/`));
  });
}
export const rutaDentro = (ruta: string, raices: RaicesTrabajo): boolean => dentroDe(ruta, raices.lectura) || dentroDe(ruta, raices.escritura);

function recorrerRutas(valor: unknown, clave: string | null, prof: number, salida: string[]): void {
  if (prof > 6) return;
  if (typeof valor === "string") { if ((clave !== null && CLAVE_RUTA.test(clave)) || PARECE_RUTA(valor)) salida.push(valor); return; }
  if (Array.isArray(valor)) { for (const v of valor) recorrerRutas(v, clave, prof + 1, salida); return; }
  if (valor && typeof valor === "object") for (const [k, v] of Object.entries(valor as Record<string, unknown>)) recorrerRutas(v, k, prof + 1, salida);
}
export function rutasEnParametros(p: Record<string, unknown>): string[] {
  const salida: string[] = [];
  for (const [k, v] of Object.entries(p)) recorrerRutas(v, k, 0, salida);
  return salida;
}

function tieneTrusted(valor: unknown, prof: number): boolean {
  if (prof > 12) return false;
  if (Array.isArray(valor)) return valor.some((v) => tieneTrusted(v, prof + 1));
  if (valor && typeof valor === "object") return Object.entries(valor as Record<string, unknown>).some(([k, v]) => (k === "trusted" && v === true) || tieneTrusted(v, prof + 1));
  return false;
}

function comandosDe(p: Record<string, unknown>): string[] {
  const cs: string[] = [];
  if (typeof p.command === "string") cs.push(p.command);
  for (const c of Array.isArray(p.commands) ? p.commands : []) {
    if (typeof c === "string") cs.push(c);
    else if (c && typeof c === "object" && typeof (c as Record<string, unknown>).command === "string") cs.push((c as Record<string, unknown>).command as string);
  }
  return cs;
}

/** Decide una llamada de la pasarela: lista permitida, prefijos vetados, rutas y ámbito. */
export function evaluarLlamada(l: LlamadaArtcraft): Veredicto {
  const { app, herramienta, parametros, origen, ambito, rol, raices } = l;
  const tabla = HERRAMIENTAS[app];
  if (!tabla) return veredicto("denegar", `La app «${app}» no está en la pasarela.`, false);
  const escribe = tabla.trabajo.includes(herramienta) || herramienta === "export" || herramienta.startsWith("save_");
  const prefijoHerramienta = PREFIJOS_VETADOS[app].find((p) => herramienta.startsWith(p));
  if (tabla.vetadas.includes(herramienta) || prefijoHerramienta) {
    return veredicto("denegar", `«${herramienta}» está vetada: solo la persona, desde la ventana de la app.`, escribe);
  }
  if (!tabla.libre.includes(herramienta) && !tabla.trabajo.includes(herramienta)) {
    return veredicto("denegar", `«${herramienta}» no figura en la lista permitida de ${app}.`, false);
  }
  if ((origen === "ia" || origen === "agente") && VENTANA.has(herramienta)) {
    return veredicto("denegar", `«${herramienta}» mueve la ventana: una IA o un agente no la manejan.`, false);
  }
  if (tieneTrusted(parametros, 0)) return veredicto("denegar", "«trusted: true» desactiva la protección de scripts: prohibido.", false);
  if (herramienta === "run_command" || herramienta === "execute_command" || herramienta === "batch") {
    const comandos = comandosDe(parametros);
    const prefijo = PREFIJOS_VETADOS[app].find((p) => comandos.some((c) => c.startsWith(p)));
    if (prefijo) return veredicto("denegar", `Un comando con el prefijo «${prefijo}» está vetado en ${app}.`, escribe);
  }
  for (const ruta of rutasEnParametros(parametros)) {
    if (!rutaDentro(ruta, raices)) return veredicto("denegar", "Una ruta de la llamada se sale del directorio de trabajo.", escribe);
    if (escribe && !dentroDe(ruta, raices.escritura)) return veredicto("denegar", "Para escribir, la ruta debe quedar dentro de la raíz de escritura.", true);
  }
  if (!escribe) return veredicto("permitir", "Lectura dentro del directorio de trabajo.", false);
  const d = decidir({ rol, origen, ambito, accion: "editar-estructura" });
  if (!d.permitido) return veredicto("denegar", d.motivo, true);
  if (ambito === "grupo" || ambito === "publica" || d.confirmar) return veredicto("confirmar", "Escritura fuera de lo personal: pide confirmación.", true);
  return veredicto("permitir", d.motivo, true);
}

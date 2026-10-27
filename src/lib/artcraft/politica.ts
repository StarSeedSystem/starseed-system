/**
 * ArtCraft · POLÍTICA de la pasarela (Ola 1025C). Módulo PURO: sin `node:*`, sin React, sin red.
 * Decide si una llamada al MCP de FigCraft, GridCraft o DeckCraft se permite, confirma o deniega.
 * Contrato: `architecture/artcraft-y-rare.md` §3.2 (lista) y §3.3 (confirmación por ámbito).
 */
import { decidir } from "@/lib/protomolecula/permisos";
import type { Ambito, Origen, Rol } from "@/lib/protomolecula/tipos";
import { HERRAMIENTAS, PREFIJOS_VETADOS } from "./politica-tablas";
import type { AppArtcraft } from "./politica-tablas";

export interface RaicesTrabajo { lectura: readonly string[]; escritura: readonly string[] }
export interface LlamadaArtcraft {
  app: AppArtcraft; herramienta: string; parametros: Record<string, unknown>;
  origen: Origen; ambito: Ambito; rol: Rol | null; raices: RaicesTrabajo;
}
export interface Veredicto { decision: "permitir" | "confirmar" | "denegar"; motivo: string; escribe: boolean }

const CLAVES_RUTA = new Set(["path", "file", "dir", "out", "src", "dst", "from", "to", "ruta", "archivo", "carpeta"]);
const SIN_ESCRITURA = new Set(["open_file", "open_workbook", "open_presentation", "undo", "redo"]);
const DE_VENTANA = new Set(["pointer", "key", "type_text", "select", "call_app", "select_tool"]);
const CON_COMMANDOS = new Set(["run_command", "execute_command", "batch"]);

const unificar = (ruta: string): string => ruta.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
const problemaDeRuta = (ruta: string): string | null => {
  if (!ruta || ruta.includes("\0")) return "La ruta está vacía o tiene un byte nulo.";
  if (/^\\\\/.test(ruta)) return "No se admiten rutas UNC.";
  const u = unificar(ruta);
  if (/(^|\/)file:/i.test(u)) return "No se admiten rutas file:.";
  if (u.includes("~") || u.includes("..")) return "No se admiten rutas con ~ ni con ..";
  if (!u.startsWith("/") && !/^[A-Za-z]:\//.test(u)) return "La ruta es relativa.";
  return null;
};
const listaDeRaices = (x: readonly string[] | RaicesTrabajo): readonly string[] =>
  Array.isArray(x) ? (x as readonly string[]) : [...(x as RaicesTrabajo).lectura, ...(x as RaicesTrabajo).escritura];
const normalizarRaiz = (r: string): string => (unificar(r) === "/" ? "/" : unificar(r).replace(/\/+$/, ""));

export function rutaDentro(ruta: string, raices: readonly string[] | RaicesTrabajo): boolean {
  if (problemaDeRuta(ruta) !== null) return false;
  const rutaUnificada = unificar(ruta);
  return listaDeRaices(raices).some((raiz) => {
    if (problemaDeRuta(raiz) !== null) return false;
    const base = normalizarRaiz(raiz);
    return base === "/" ? rutaUnificada.startsWith("/") : rutaUnificada === base || rutaUnificada.startsWith(`${base}/`);
  });
}
const pareceRuta = (valor: string): boolean =>
  valor.startsWith("/") || valor.startsWith("~") || /^file:/i.test(valor)
  || valor.startsWith("\\\\") || /^[A-Za-z]:/.test(valor);

export function rutasEnParametros(parametros: unknown): string[] {
  const rutas: string[] = [];
  const vistos = new WeakSet<object>();
  const visitar = (valor: unknown, clave: string | null, nivel: number): void => {
    if (nivel > 6) return;
    if (typeof valor === "string") {
      if ((clave !== null && CLAVES_RUTA.has(clave.toLowerCase())) || pareceRuta(valor)) rutas.push(valor);
      return;
    }
    if (valor === null || typeof valor !== "object" || vistos.has(valor)) return;
    vistos.add(valor);
    if (Array.isArray(valor)) {
      for (const elemento of valor) visitar(elemento, clave, nivel + 1);
      return;
    }
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) visitar(v, k, nivel + 1);
  };
  visitar(parametros, null, 0);
  return rutas;
}
const veredicto = (decision: Veredicto["decision"], motivo: string, escribe: boolean): Veredicto =>
  ({ decision, motivo, escribe });
const denegar = (motivo: string, escribe = false): Veredicto => veredicto("denegar", motivo, escribe);
const hayTrusted = (valor: unknown, nivel = 0, vistos = new WeakSet<object>()): boolean => {
  if (nivel > 8 || valor === null || typeof valor !== "object" || vistos.has(valor)) return false;
  vistos.add(valor);
  if (Array.isArray(valor)) return valor.some((elemento) => hayTrusted(elemento, nivel + 1, vistos));
  const objeto = valor as Record<string, unknown>;
  if (objeto.trusted === true) return true;
  return Object.values(objeto).some((hijo) => hayTrusted(hijo, nivel + 1, vistos));
};
const comandosDe = (p: Record<string, unknown>): string[] => {
  const comandos: string[] = typeof p.command === "string" ? [p.command] : [];
  if (Array.isArray(p.commands)) for (const item of p.commands) {
    const comando = item !== null && typeof item === "object" ? (item as Record<string, unknown>).command : null;
    if (typeof comando === "string") comandos.push(comando);
  }
  return comandos;
};
const escribeCon = (h: string, enTrabajo: boolean): boolean =>
  (enTrabajo && !SIN_ESCRITURA.has(h)) || h === "export" || h.startsWith("save_");

export function evaluarLlamada(l: LlamadaArtcraft): Veredicto {
  const t = HERRAMIENTAS[l.app];
  if (!t) return denegar(`La aplicación «${l.app}» no está en la pasarela.`);
  const h = l.herramienta, libre = t.libre.includes(h), trabajo = t.trabajo.includes(h);
  const escribe = escribeCon(h, trabajo);
  if (t.vetadas.includes(h)) return denegar(`La herramienta «${h}» está vetada en ${l.app}.`, escribe);
  if (DE_VENTANA.has(h) && (l.origen === "ia" || l.origen === "agente"))
    return denegar("Las herramientas de ventana no las maneja una IA ni un agente.", escribe);
  const prefijos = PREFIJOS_VETADOS[l.app] ?? [];
  const propio = prefijos.find((p) => h.startsWith(p));
  if (propio) return denegar(`La herramienta «${h}» pertenece a una familia vetada (${propio}).`, escribe);
  if (!libre && !trabajo) return denegar(`La herramienta «${h}» no está en la lista permitida de ${l.app}.`, escribe);
  if (hayTrusted(l.parametros)) return denegar("Los parámetros piden trusted: una llamada automática no confía en scripts.", escribe);
  if (trabajo && CON_COMMANDOS.has(h)) for (const c of comandosDe(l.parametros)) {
    const p = prefijos.find((x) => c.startsWith(x));
    if (p) return denegar(`El comando usa la familia vetada «${p}».`, escribe);
  }
  const raices = escribe ? l.raices.escritura : [...l.raices.lectura, ...l.raices.escritura];
  if (rutasEnParametros(l.parametros).some((r) => !rutaDentro(r, raices)))
    return denegar(escribe
      ? "Una ruta de escritura queda fuera de la carpeta de salida."
      : "Una ruta queda fuera del directorio de trabajo.", escribe);
  if (libre || !escribe) return veredicto("permitir", "Herramienta de lectura dentro del directorio de trabajo.", false);
  const d = decidir({ rol: l.rol, origen: l.origen, ambito: l.ambito, accion: "editar-estructura" });
  if (!d.permitido) return denegar(d.motivo, true);
  return d.confirmar
    ? veredicto("confirmar", "Escritura en un espacio compartido: se pide confirmación.", true)
    : veredicto("permitir", "Escritura en la carpeta de salida del espacio personal.", true);
}

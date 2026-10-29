/**
 * FigCraft → UiSpec (contrato `architecture/artcraft-y-rare.md` §4.4).
 * La interfaz es DATO: se leen marcos con nombre `ss:*` y se emite vocabulario
 * cerrado. Nunca se emite HTML, script ni URL `javascript:`.
 *
 * Módulo PURO: sin `node:*`, sin React, sin red ni disco. Nunca lanza.
 * Los nombres de campo de FigCraft se leen de forma tolerante; VERIFICARLOS
 * contra un `inspect_document` real en la Mac antes de fiarse del mapeo.
 */
import { validarContraInvariantes } from "@/lib/nucleo/invariantes";
import { LONGITUD_MAXIMA_CADENA, MAXIMO_BLOQUES, PROFUNDIDAD_MAXIMA, pareceCodigo, validarUiSpec } from "@/lib/nucleo/ui-spec";
import type { BloqueUi, TipoBloque, UiSpec } from "@/lib/nucleo/ui-spec";

export interface NodoFig { id: string; nombre: string; tipo: string; hijos: NodoFig[]; texto?: string; layout?: unknown; fills?: unknown }
export interface InformeFig { mapeados: number; ignorados: { nodo: string; motivo: string }[]; avisos: string[] }
export interface ResultadoUiSpec { spec: UiSpec | null; informe: InformeFig }

const TIPOS: Record<string, TipoBloque> = { panel: "panel", rejilla: "rejilla", widget: "widget", lista: "lista", texto: "texto", acciones: "acciones", embebido: "embebido" };
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const textoDe = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

/** Lectura tolerante: acepta lo conocido y descarta el resto sin fallar. */
export function normalizarNodo(raw: unknown): NodoFig | null {
  if (!esObjeto(raw)) return null;
  const id = textoDe(raw.id) ?? textoDe(raw.name) ?? "";
  const nombre = textoDe(raw.name) ?? id;
  const tipo = textoDe(raw.type) ?? textoDe(raw.nodeType) ?? "unknown";
  const children = Array.isArray(raw.children) ? raw.children : [];
  const layout = esObjeto(raw.layout) ? raw.layout : esObjeto(raw.autoLayout) ? raw.autoLayout : undefined;
  const hijos = children.map(normalizarNodo).filter((n): n is NodoFig => n !== null);
  return { id, nombre, tipo, layout, fills: raw.fills, texto: textoDe(raw.text) ?? textoDe(raw.characters), hijos };
}

function raicesDe(documento: unknown): NodoFig[] {
  if (Array.isArray(documento)) return documento.map(normalizarNodo).filter((n): n is NodoFig => n !== null);
  if (!esObjeto(documento)) return [];
  if (esObjeto(documento.document)) return raicesDe(documento.document);
  if (Array.isArray(documento.nodes)) return documento.nodes.map(normalizarNodo).filter((n): n is NodoFig => n !== null);
  const nodo = normalizarNodo(documento);
  return nodo ? [nodo] : [];
}

/** Id derivado del nombre saneado y desambiguado dentro del documento. */
function idUnico(nombre: string, tipo: TipoBloque, ctx: Ctx): string {
  const base = nombre.replace(/^ss:/i, "").replace(/[^a-z0-9._:-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 72);
  const raiz = /^[a-z0-9]/.test(base) ? base : `${tipo}-bloque`;
  let id = raiz;
  for (let n = 2; ctx.ids.has(id); n += 1) id = `${raiz}-${n}`;
  ctx.ids.add(id);
  return id;
}

function depurarTexto(original: string, etiqueta: string, ctx: Ctx): string | undefined {
  const limpio = original.trim();
  if (!limpio) return undefined;
  if (pareceCodigo(limpio)) { ctx.avisos.push(`Texto con aspecto de código descartado en «${etiqueta}».`); return undefined; }
  if (limpio.length > LONGITUD_MAXIMA_CADENA) {
    ctx.avisos.push(`Texto recortado a ${LONGITUD_MAXIMA_CADENA} caracteres en «${etiqueta}».`);
    return limpio.slice(0, LONGITUD_MAXIMA_CADENA);
  }
  return limpio;
}

interface Ctx { ids: Set<string>; bloques: number; ignorados: { nodo: string; motivo: string }[]; avisos: string[] }

function mapear(nodo: NodoFig, profundidad: number, ctx: Ctx): BloqueUi[] {
  const etiqueta = nodo.nombre.trim() || nodo.id || "sin nombre";
  if (profundidad > PROFUNDIDAD_MAXIMA) {
    ctx.ignorados.push({ nodo: etiqueta, motivo: `Profundidad excesiva (máximo ${PROFUNDIDAD_MAXIMA}).` });
    return [];
  }
  const clave = /^ss:([a-z]+)/i.exec(nodo.nombre.trim());
  const tipo = clave ? TIPOS[clave[1].toLowerCase()] : undefined;
  if (!tipo) {
    const esSs = /^ss:/i.test(nodo.nombre.trim());
    ctx.ignorados.push({ nodo: etiqueta, motivo: esSs ? `Tipo «ss:${clave?.[1] ?? ""}» desconocido.` : "No empieza por «ss:»: se ignora." });
    return nodo.hijos.flatMap((hijo) => mapear(hijo, profundidad + 1, ctx));
  }
  if (ctx.bloques >= MAXIMO_BLOQUES) {
    const aviso = `Máximo de ${MAXIMO_BLOQUES} bloques alcanzado: se ignoran los restantes.`;
    if (!ctx.avisos.includes(aviso)) ctx.avisos.push(aviso);
    return [];
  }
  ctx.bloques += 1;
  const id = idUnico(nodo.nombre, tipo, ctx);
  const props: Record<string, unknown> = {};
  if (tipo === "texto" && nodo.texto !== undefined) {
    const contenido = depurarTexto(nodo.texto, id, ctx);
    if (contenido !== undefined) props.contenido = contenido;
  }
  const bloque: BloqueUi = { tipo, id, props };
  const hijos = nodo.hijos.flatMap((hijo) => mapear(hijo, profundidad + 1, ctx));
  if (hijos.length > 0) bloque.hijos = hijos;
  return [bloque];
}

const informeDe = (ctx: Ctx): InformeFig => ({ mapeados: ctx.bloques, ignorados: ctx.ignorados, avisos: ctx.avisos });

/** Convierte el JSON de `inspect_document`/`get_node` en una `UiSpec` segura. */
export function figcraftAUiSpec(documento: unknown, o: { superficie?: string } = {}): ResultadoUiSpec {
  const ctx: Ctx = { ids: new Set(), bloques: 0, ignorados: [], avisos: [] };
  const bloques = raicesDe(documento).flatMap((nodo) => mapear(nodo, 1, ctx));
  if (bloques.length === 0) {
    ctx.avisos.push("El documento no contiene ningún marco «ss:*»: no hay interfaz que convertir.");
    return { spec: null, informe: informeDe(ctx) };
  }
  const { spec, problemas } = validarUiSpec({ version: 1, superficie: o.superficie ?? "os:artcraft", bloques });
  ctx.avisos.push(...problemas);
  if (!spec) return { spec: null, informe: informeDe(ctx) };
  // Una spec nueva no retira superficies; la puerta queda explícita para el día en que se compare.
  for (const v of validarContraInvariantes({ rutasOcultas: [], superficiesQuitadas: [], permisosPedidos: [] })) {
    ctx.avisos.push(`Invariante «${v.invariante}»: ${v.que}`);
  }
  return { spec, informe: informeDe(ctx) };
}

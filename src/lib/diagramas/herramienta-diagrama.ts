/**
 * DGM1018F · Herramienta de agente `diagrama.crear` (contrato architecture/diagramas.md §3-2, tarea F).
 * `pedidoDiagrama` arma el contexto para el modelo (tipo elegido a ojo o pedido, guía del tipo de la
 * skill diagram-design MIT · vendida en vendor/habilidades/diagram-design/, tamaño, perfil de marca)
 * y `recibirDiagrama` extrae el HTML y lo pasa por fuentes-locales y aislar-diagrama. PURO, sin `any`.
 */

import { prepararDiagrama } from "./aislar-diagrama";
import { sustituirFuentes, type FuenteDisponible } from "./fuentes-locales";
import { bloquePerfil, type PerfilDiagrama } from "./perfil-marca";

/** Los 45 tipos de la skill: los slugs de `references/type-*.md`. */
export const TIPOS_DIAGRAMA = ["architecture", "architecture-delta", "it-state", "data-flow", "db-schema",
  "dependency", "deployment", "dp-integration", "dp-security-matrix", "er", "exploded", "fishbone",
  "flowchart", "gantt", "heatmap", "high-level", "timeline", "process", "medallion", "nested", "tree",
  "org-chart", "kanban", "layers", "line", "loop", "polar", "quadrant", "radar", "sankey", "scatter",
  "sequence", "service-blueprint", "state", "story-map", "swimlane", "uml-class", "venn", "pyramid",
  "bar", "waterfall", "treemap", "wardley", "journey", "axonometric-plan"] as const;
export type TipoDiagrama = (typeof TIPOS_DIAGRAMA)[number]; export type TamanoDiagrama = "tarjeta" | "resumen" | "completa";
/** Entrada, contexto armado y respuesta aislada de la herramienta. */
export interface PeticionDiagrama { peticion: string; tipo?: string; tamano?: TamanoDiagrama; animado?: boolean; perfil?: PerfilDiagrama; }
export interface ContextoDiagrama { tipo: TipoDiagrama; tamano: TamanoDiagrama; animado: boolean; avisos: string[]; instruccion: string; }
export interface OpcionesRecibir { fuentes?: FuenteDisponible[]; animado?: boolean; tipo?: string; }
export interface RespuestaDiagrama { ok: boolean; srcdoc?: string; sandbox: string; tipo: TipoDiagrama; motivos: string[]; }
/** Alias en español (normalizados sin tildes) hacia el slug de la skill. */
const ALIAS_TIPO: Record<string, TipoDiagrama> = {
  arquitectura: "architecture", delta: "architecture-delta", "estado-de-ti": "it-state", "flujo-de-datos": "data-flow",
  flujo: "flowchart", "diagrama-de-flujo": "flowchart", secuencia: "sequence", estados: "state",
  "maquina-de-estados": "state", "entidad-relacion": "er", entidad: "er", organigrama: "org-chart",
  jerarquia: "org-chart", arbol: "tree", capas: "layers", "pila-de-capas": "layers", despiece: "exploded",
  "planta-axonometrica": "axonometric-plan", "linea-de-tiempo": "timeline", cronologia: "timeline", carriles: "swimlane",
  gantt: "gantt", kanban: "kanban", sankey: "sankey", venn: "venn", piramide: "pyramid", embudo: "pyramid",
  "espina-de-pescado": "fishbone", wardley: "wardley", "viaje-de-usuario": "journey", "mapa-de-calor": "heatmap",
  cascada: "waterfall", barras: "bar", "mapa-de-arbol": "treemap", "clases-uml": "uml-class",
  dependencias: "dependency", despliegue: "deployment", radar: "radar", cuadrante: "quadrant",
  bucle: "loop", perspectivas: "quadrant", plot: "scatter",
};
/** Guía corta de cada tipo, resumida de `references/type-<slug>.md` de la skill. */
const GUIA_TIPO: Partial<Record<TipoDiagrama, string>> = {
  architecture: "bloques por niveles con flechas de dependencia, caja por servicio y protocolo en subetiqueta",
  flowchart: "decisiones y bifurcaciones: óvalo inicio/fin, rectángulo de paso, rombo de decisión con salidas etiquetadas",
  sequence: "actores con líneas de vida e interacciones ordenadas hacia abajo, anotaciones HTTP/API",
  state: "estados con transiciones etiquetadas por evento, inicial y final marcados",
  er: "entidades con sus campos y relaciones con cardinalidad explícita en notación crow",
  "org-chart": "jerárquico vertical de una persona por nodo, con conexiones ortogonales",
  layers: "capas apiladas, una por plano, con la dependencia de abajo a arriba",
  timeline: "hitos ordenados por fecha sobre una línea de eje, con fechas en subetiqueta mono",
  journey: "fases del recorrido con emociones y puntos de dolor por fase",
};
/** minúsculas, sin tildes y con separador uniforme: para comparar tipos y aliases. */
const normalizar = (s: string): string =>
  s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** El tipo por lo que se escribió a mano, o a ojo por la petición; avisa SIEMPRE que adivine. */
function resolverTipo(peticion: string, tipo?: string): { tipo: TipoDiagrama; avisos: string[] } {
  const avisos: string[] = [];
  const porEntrada = tipo ? normalizar(tipo) : "";
  if (porEntrada) {
    const slug = (ALIAS_TIPO[porEntrada] ?? (TIPOS_DIAGRAMA as readonly string[]).find((t) => t === porEntrada)) as TipoDiagrama | undefined;
    if (slug) return { tipo: slug, avisos };
    avisos.push(`No conozco el tipo «${tipo}»: uso los ${TIPOS_DIAGRAMA.length} de la skill. Detección a ojo…`);
  }
  const p = normalizar(peticion);
  /** Palabra completa entre separadores: nunca «er» dentro de «servidor». */
  const comoToken = (s: string) => p === s || p.startsWith(`${s}-`) || p.endsWith(`-${s}`) || p.includes(`-${s}-`);
  const encontrado = (Object.entries(ALIAS_TIPO) as [string, TipoDiagrama][]).find(([alias, slug]) =>
    comoToken(alias) || comoToken(normalizar(slug)));
  if (encontrado) { avisos.push(`Tipo elegido a ojo: «${encontrado[1]}». Si no es ese, dilo con la lista de tipos.`); return { tipo: encontrado[1], avisos }; }
  avisos.push("Petición sin tipo claro: uso «flowchart» (el más general). Puedes pedir otro de la lista.");
  return { tipo: "flowchart", avisos };
}

/** Resumen de una sola línea: lo del tipo concreto, o el patrón genérico de la skill. */
const guiaDe = (tipo: TipoDiagrama): string =>
  (GUIA_TIPO[tipo] ?? "dibuja el patrón semántico del tipo según la guía que ya conoces") + ".";

const TEXTO_TAMANO: Record<TamanoDiagrama, string> = {
  tarjeta: "minimalista para caber en una tarjeta o un mensaje: lo esencial, casi sin texto",
  resumen: "una sola vista legible de un vistazo, con título corto y sin apartes",
  completa: "editorial completa con título, apartes y anotaciones, como la guía de la skill",
};
const REGLAS_SANDBOX = "Reglas del OS: UN documento HTML completo con UN único <svg> inline y estilos en <style> del propio archivo; nada de <link>, <iframe> ni formularios, manejadores on*, javascript: ni red ni recursos externos. Las fuentes las pone el OS: no pidas Google Fonts (cada referencia de fuente se sustituye por las locales). El HTML se muestra solo dentro de un iframe sandbox sin permisos.";

/** Arma el contexto para el modelo: tipo, guía del tipo, tamaño, marca de contexto y reglas del sandbox. */
export function pedidoDiagrama(entrada: PeticionDiagrama): ContextoDiagrama {
  const avisos: string[] = [];
  const peticion = (entrada.peticion ?? "").trim();
  if (!peticion) avisos.push("Petición vacía: uso título genérico, responde primero al humano con lo que necesitas.");
  const resuelto = resolverTipo(peticion, entrada.tipo);
  avisos.push(...resuelto.avisos);
  const tamano: TamanoDiagrama = entrada.tamano && entrada.tamano !== "completa" ? entrada.tamano : "completa";
  const animado = entrada.animado === true;
  const partes = [
    `Escribe un diagrama del tipo «${resuelto.tipo}»: ${guiaDe(resuelto.tipo)}`,
    `Petición: «${peticion || "un diagrama del tema que venimos hablando"}»`,
    `Tamaño: ${tamano} (${TEXTO_TAMANO[tamano]}).`,
    animado ? "Lleva una animación corta en JavaScript embebido: se mostrará en iframe con scripts permitidos y sin más permisos." : "Estático: sin JavaScript.",
    REGLAS_SANDBOX,
  ];
  if (entrada.perfil) partes.push("Marca del contexto (guía de estilo con perfil activo):\n" + bloquePerfil(entrada.perfil));
  return { tipo: resuelto.tipo, tamano, animado, avisos, instruccion: partes.join("\n") };
}

/** Extrae el HTML de la respuesta: primera valla con documento, o el texto si ya es HTML. */
function extraerHtml(respuesta: string): string | null {
  const vallas = [...respuesta.matchAll(/```(?:html)?\s*\n?([\s\S]*?)```/gi)].map((m) => m[1]);
  const patron = /<!doctype html|<html[\s>]|<svg[\s>]/i;
  const conHtml = vallas.find((v) => patron.test(v));
  if (conHtml) return conHtml.trim();
  const suelto = respuesta.trim();
  return patron.test(suelto) ? suelto : null;
}

/** Extrae el HTML, lo pasa por fuentes-locales y aislar-diagrama: nunca se muestra fuera del iframe sandbox. */
export function recibirDiagrama(respuesta: string, opciones: OpcionesRecibir = {}): RespuestaDiagrama {
  const tipo = resolverTipo("", opciones.tipo).tipo;
  const html = extraerHtml(respuesta ?? "");
  if (!html) return { ok: false, sandbox: "", tipo, motivos: ["La respuesta no trae HTML de diagrama: repite el pedido."] };
  const local = sustituirFuentes(html, opciones.fuentes ?? []);
  const r = prepararDiagrama(local, { permitirAnimacion: opciones.animado === true });
  return { ok: r.ok, srcdoc: r.srcdoc, sandbox: r.sandbox, tipo, motivos: r.motivos };
}

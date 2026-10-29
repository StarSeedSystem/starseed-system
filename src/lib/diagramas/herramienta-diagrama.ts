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
  "architecture-delta": "migración con dos topologías sincronizadas, antes y después: qué sobrevive, qué aparece y qué desaparece",
  "it-state": "paisaje TI heredado agrupado por fases o departamentos: el ANTES de una modernización",
  "data-flow": "cómo se mueve el dato entre roles de la organización: quién lo inicia, lo procesa, lo publica y lo consume",
  "db-schema": "esquema físico real: tablas con tipos SQL, restricciones, índices y claves foráneas entre columnas",
  dependency: "qué depende de qué entre paquetes o servicios, con nodos de más de un padre y ciclos que un árbol no expresa",
  deployment: "dónde corre el software de verdad: hosts, pods y servicios en zonas de entorno o red, con réplicas y versiones",
  "dp-integration": "topología de integración de plataforma de datos: qué sistemas entran, qué superficies salen y con qué protocolo",
  "dp-security-matrix": "matriz de permisos: cada fila un componente de la plataforma, cada columna un rol, concesión o negación explícitas",
  exploded: "un objeto en proyección con sus piezas separadas a lo largo de un eje y etiquetadas: desmontaje o despiece",
  fishbone: "causa raíz: un efecto a la cabeza, causas agrupadas por categoría y subcausas colgando de cada una",
  gantt: "tareas con fechas de inicio y fin agrupadas en fases: solapamientos, pistas paralelas e hitos de un vistazo",
  heatmap: "matriz de datos cruzados: destaca la combinación fila × columna que sobresale al escanear la tabla entera de golpe",
  "high-level": "vista de extremo a extremo del stack de datos (ingesta → almacenamiento → consulta → análisis) con banner de fases",
  process: "proceso de negocio por pasos con actores: qué hace cada uno, qué dato entra y sale y con qué herramienta",
  medallion: "niveles del mismo conjunto de datos por calidad y acceso: bruto, anonimizado, limpio y agregado de negocio",
  nested: "jerarquía por contención: límites de alcance, zonas de confianza o radio de impacto; lo interior es lo específico",
  tree: "jerarquía de nodos y ramas: organigrama, taxonomía, árbol de ficheros o descomposición de decisiones",
  kanban: "censo del trabajo en curso por estado: en cola, en movimiento, atascado y dónde se rebasa el límite de WIP, sin conectores",
  line: "tendencia continua en el tiempo o un índice secuencial: el mensaje es la dirección y el ritmo del cambio",
  loop: "ciclos de refuerzo: el último paso realimenta al primero y el nudo central acumula estado; se ven ambos movimientos",
  polar: "una serie cuantitativa en 4-8 categorías cuyo orden en el sentido del reloj es significativo",
  quadrant: "cuadrante 2×2 de decisión: impacto × esfuerzo, alcance × frecuencia, mapa de portafolio",
  radar: "3-5 entidades comparadas en 3-5 criterios cuantitativos sobre una misma escala normalizada de 0 a N",
  sankey: "a dónde va una cantidad cuando se reparte en pocas etapas: el grosor de cada banda lleva el dato",
  scatter: "correlación y dispersión de dos variables continuas: relación, grupos y valores atípicos",
  "service-blueprint": "cómo corre un servicio por etapas: lo que ve el cliente, lo que ve el frente y lo que queda oculto, con línea de visibilidad",
  "story-map": "mapa de historias de Jeff Patton: narrativa de izquierda a derecha, prioridad de arriba a abajo y el corte de la primera entrega",
  swimlane: "procesos entre funciones: cada carril un responsable y las flechas cruzan los traspasos entre equipos",
  "uml-class": "estructura estática del modelo: clases con su compartimento de operaciones y relaciones tipadas (herencia, composición, dependencia)",
  venn: "intersección de dominios: atributos compartidos entre conjuntos, «donde A se encuentra B»",
  pyramid: "jerarquía de niveles de importancia de la masa a la cima; también embudo de conversión",
  bar: "cantidades discretas por categoría o intervalo: una cifra por categoría, la comparación entre barras es el mensaje",
  waterfall: "cómo un total inicial se convierte en el final por contribuciones con signo: puente presupuestario o fuga de conversión",
  treemap: "partes de un todo donde el tamaño relativo manda: uso de disco, desglose de gasto o cuota de mercado",
  wardley: "componentes de una cadena de valor contra su grado de evolución: qué construir, qué comprar y qué está por moverse",
  "axonometric-plan": "una planta o emplazamiento visto desde arriba y en ángulo, con lo que hay sobre él: salas, caminos, zonas",
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

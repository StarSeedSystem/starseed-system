/**
 * Protomolécula · Átomo «Diagrama con Diagram Design» (Ola 1018D · DGM1018H). Contrato:
 * architecture/diagramas.md §3–§4 y protomolecula.md §11.1. Plan PURO: arma el pedido con la
 * herramienta `diagrama.crear` (DGM1018F); el HTML resultante se muestra SOLO dentro de un
 * iframe sandbox sin `allow-same-origin` ni red, con fuentes locales del OS (nunca Google
 * Fonts en tiempo de uso). Skill MIT de Cathryn Lavery en vendor/habilidades/diagram-design/.
 */
import type { DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";
import type { ValorParametro } from "@/lib/protomolecula/tipos";
import { TIPOS_DIAGRAMA, pedidoDiagrama, type TipoDiagrama } from "@/lib/diagramas/herramienta-diagrama";

/** Tipos visibles en el panel: el registro acota cada parámetro a 32 opciones; el plan acepta los 45. */
export const TIPOS_PANEL = ["architecture", "flowchart", "sequence", "state", "er", "org-chart", "tree",
  "layers", "timeline", "swimlane", "quadrant", "radar", "loop", "venn", "pyramid", "bar", "waterfall",
  "treemap", "heatmap", "gantt", "sankey", "fishbone", "wardley", "kanban", "journey", "service-blueprint",
  "deployment", "dependency", "uml-class", "story-map", "db-schema", "exploded"] as const;

export type TemaDiagrama = "claro" | "oscuro";
export type MarcaDiagrama = "starseed" | "neutro";

export const DIAGRAMA: DefinicionAtomo = {
  herramientaId: "diagram-design",
  nombre: "Diagrama con Diagram Design",
  categoria: "arquitectura",
  integracion: "iframe-aislado",
  control: "total",
  parametros: [
    { id: "tipo", nombre: "Tipo de diagrama", tipo: "opcion", opciones: [...TIPOS_PANEL], defecto: "flowchart", sinonimos: ["diagrama", "clase de diagrama"] },
    { id: "tema", nombre: "Tema", tipo: "opcion", opciones: ["claro", "oscuro"], defecto: "claro", sinonimos: ["modo", "claro u oscuro"] },
    { id: "animado", nombre: "Animado", tipo: "booleano", defecto: false, sinonimos: ["animación", "con movimiento"] },
    { id: "ancho", nombre: "Ancho", tipo: "numero", min: 320, max: 1920, paso: 8, unidad: "px", defecto: 720, sinonimos: ["tamaño", "anchura"] },
    { id: "marca", nombre: "Perfil de marca", tipo: "opcion", opciones: ["starseed", "neutro"], defecto: "starseed", sinonimos: ["marca", "guía de estilo"] },
  ],
  entradas: ["texto", "datos", "draw.io", "mermaid", "excalidraw"],
  salidas: ["html", "svg", "png"],
  ficha: { web: "https://github.com/cathrynlavery/diagram-design", repo: "cathrynlavery/diagram-design", licencia: "MIT" },
};

const param = (id: string) => DIAGRAMA.parametros.find((p) => p.id === id);
/** El valor declarado por el panel, o el defecto del propio parámetro. */
function cadenaDe(valores: Record<string, ValorParametro | undefined> | undefined, id: string): string {
  const p = param(id), v = String(valores?.[id] ?? "");
  return p?.opciones?.includes(v) ? v : String(p?.defecto ?? "");
}
/** Acota el ancho entre 320 y 1920 px, por múltiplos de 8 (rejilla de la skill): nunca rompe un viewport real. */
function numeroDe(valores: Record<string, ValorParametro | undefined> | undefined, id: string): number {
  const v = valores?.[id], n = typeof v === "number" && Number.isFinite(v) ? v : Number(param(id)?.defecto ?? 720);
  return Math.min(1920, Math.max(320, Math.round(n / 8) * 8));
}

/** Pasos del plan (arquitectura/diagramas.md §3): escribir → fuentes locales → aislar → mostrar → exportar a mano. */
function pasosDe(tipo: TipoDiagrama, tema: TemaDiagrama, animado: boolean, marca: MarcaDiagrama, ancho: number): string[] {
  return [
    `escribir el HTML del tipo «${tipo}»: documento completo con un único <svg> inline y estilos en su propio <style>`,
    `plantilla ${tema === "claro" ? "template.html" : "template-dark.html"} de la skill, con el estilo del tema ${tema}`,
    "sustituir cada fuente por las locales del OS: nunca Google Fonts en tiempo de uso",
    "pasar el HTML por aislar-diagrama: si no pasa la validación se muestra el motivo, no el diagrama",
    `mostrarlo SOLO en un iframe sandbox sin allow-same-origin, sin red y sin recursos externos, a ${ancho} px de ancho`,
    animado ? "scripts de la animación dentro del sandbox y sin ningún permiso más" : "sin JavaScript: diagrama estático",
    marca === "starseed" ? "perfil «starseed»: colores y tipografías de los tokens del contexto (perfil-marca)" : "perfil «neutro»: piel por defecto de la skill",
    "exportar SVG o PNG solo si se pide (exportar-diagrama): la exportación nunca se produce sola",
  ];
}
/** Resultado del plan: lo que el cableado (F1B y adelante) convierte en pedido, iframe y vivienda. */
export interface PlanDiagrama {
  tipo: TipoDiagrama;
  tamano: "completa";
  tema: TemaDiagrama;
  animado: boolean;
  ancho: number;
  marca: MarcaDiagrama;
  avisos: string[];
  pasos: string[];
  instruccion: string;
}

/** El plan PURO: mismos valores, mismo plan y sin mutar la entrada. La marca real y el iframe van en el cableado. */
export function planDiagrama(
  valores?: Record<string, ValorParametro | undefined>,
  peticion = "",
): PlanDiagrama {
  const pedido = pedidoDiagrama({
    peticion,
    tipo: valores?.tipo === undefined ? undefined : String(valores.tipo),
    animado: valores?.animado === true,
  });
  const tema = cadenaDe(valores, "tema") as TemaDiagrama;
  const marca = cadenaDe(valores, "marca") as MarcaDiagrama;
  const ancho = numeroDe(valores, "ancho");
  /** Sin petición no cabe el aviso de la herramienta (es la suya, no del átomo): los avisos que quedan son de tipo. */
  const avisos = peticion.trim() ? pedido.avisos : pedido.avisos.filter((a) => !a.startsWith("Petición vacía"));
  return {
    tipo: pedido.tipo, tamano: pedido.tamano, tema, animado, ancho, marca, avisos,
    pasos: pasosDe(pedido.tipo, tema, valores?.animado === true, marca, ancho),
    instruccion: pedido.instruccion,
  };
}

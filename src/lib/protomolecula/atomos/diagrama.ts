/**
 * Protomolécula · Átomo «Diagrama» (Ola 1018D · DGM1018H). Contrato: architecture/diagramas.md §3
 * y protomolecula.md §11.1. Sobre la skill diagram-design de Cathryn Lavery (MIT, vendida en
 * vendor/habilidades/diagram-design/): el HTML con SVG se muestra SOLO en un iframe `sandbox` sin
 * `allow-same-origin`, sin red ni recursos externos; las fuentes las sirve el OS (nunca Google
 * Fonts en tiempo de uso). El plan es PURO: la validación del HTML es `aislar-diagrama` (tarea C)
 * y la exportación svg/png la hacen en `src/lib/diagramas` (tarea I).
 */
import type { DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";
import type { ValorParametro } from "@/lib/protomolecula/tipos";
import type { TipoDiagrama } from "@/lib/diagramas/herramienta-diagrama";

/** Familias que engloban los 45 tipos (cada tipo en UNA sola, sin huecos ni repeticiones). La
 * opción «tipo» del panel no supera las 32 opciones que admite el registro (MAX_OPCIONES), así
 * que se escoge familia + variante (índice dentro de la familia, 1-based). */
export const FAMILIAS_DIAGRAMA = {
  esquematico: ["architecture", "architecture-delta", "it-state", "high-level", "deployment",
    "dependency", "dp-integration", "dp-security-matrix", "exploded", "axonometric-plan"],
  flujo: ["flowchart", "sequence", "state", "loop", "data-flow", "sankey", "waterfall"],
  proceso: ["process", "swimlane", "service-blueprint", "kanban", "journey", "story-map"],
  tiempo: ["timeline", "gantt"],
  jerarquia: ["tree", "org-chart", "nested", "pyramid", "layers", "fishbone", "wardley"],
  datos: ["er", "db-schema", "uml-class", "medallion"],
  grafica: ["bar", "line", "scatter", "heatmap", "treemap", "radar", "polar"],
  comparativa: ["quadrant", "venn"],
} as const satisfies Record<string, readonly TipoDiagrama[]>;
export type FamiliaDiagrama = keyof typeof FAMILIAS_DIAGRAMA;

/** Anchos del lienzo (references/output-spec.md §2): viewBox del SVG, rampa tipográfica y el
 * `min-width` honesto que mantiene la escala del dibujo en pantallas estrechas. */
const ANCHOS = {
  "doc-inline": { viewBox: "0 0 960 600", rampa: "estandar", minAncho: 960 },
  "doc-wide": { viewBox: "0 0 1280 720", rampa: "estandar", minAncho: 1280 },
  "slide-16x9": { viewBox: "0 0 1280 720", rampa: "presentacion", minAncho: 1280 },
  "slide-4x3": { viewBox: "0 0 1024 768", rampa: "presentacion", minAncho: 1024 },
  "social-og": { viewBox: "0 0 1200 632", rampa: "presentacion", minAncho: 1200 },
  "social-square": { viewBox: "0 0 1080 1080", rampa: "presentacion", minAncho: 1080 },
  "print-a4": { viewBox: "0 0 1120 792", rampa: "impresion", minAncho: 1120 },
  fit: { viewBox: "0 0 960 600", rampa: "estandar", minAncho: 960 },
} as const;
export type AnchoDiagrama = keyof typeof ANCHOS;

/** Pieles de la guía de estilo (style-guide.md): la clara es la de la skill por defecto y la
 * oscura la misma plantilla en modo oscuro que ya normaliza el perfil de marca del contexto. */
export const TEMAS_DIAGRAMA = {
  claro: { papel: "#f5f5f5", papel2: "#ececec", tinta: "#2d3142", secundaria: "#4f5d75", acento: "#bf4520" },
  oscuro: { papel: "#2d3142", papel2: "#393e53", tinta: "#f5f5f5", secundaria: "#bfc0c0", acento: "#f08a59" },
} as const;
export type TemaDiagrama = keyof typeof TEMAS_DIAGRAMA;

/** Perfiles de marca declarables; «contexto» toma los tokens de tema de la persona, página o grupo. */
const PERFILES = ["contexto", "astraura", "cafe", "materia-viva", "ninguno"] as const;

export const DIAGRAMA: DefinicionAtomo = {
  herramientaId: "diagram-design",
  nombre: "Diagrama (Diagram Design)",
  categoria: "arquitectura",
  integracion: "iframe-aislado",
  control: "total",
  parametros: [
    { id: "familia", nombre: "Familia", tipo: "opcion", opciones: Object.keys(FAMILIAS_DIAGRAMA), defecto: "flujo", sinonimos: ["grupo de tipos", "estilo de diagrama"] },
    { id: "variante", nombre: "Tipo dentro de la familia", tipo: "entero", min: 1, max: 10, paso: 1, defecto: 1, sinonimos: ["índice del tipo", "subtipo"] },
    { id: "tema", nombre: "Tema", tipo: "opcion", opciones: ["claro", "oscuro"], defecto: "claro", sinonimos: ["modo", "piel"] },
    { id: "animado", nombre: "Animado", tipo: "booleano", defecto: false, sinonimos: ["con animación", "movimiento"] },
    { id: "ancho", nombre: "Ancho", tipo: "opcion", opciones: Object.keys(ANCHOS), defecto: "doc-inline", sinonimos: ["tamaño", "lienzo"] },
    { id: "perfil", nombre: "Perfil de marca", tipo: "opcion", opciones: [...PERFILES], defecto: "contexto", sinonimos: ["marca", "identidad"] },
  ],
  entradas: ["texto", "datos", "draw.io", "mermaid", "excalidraw"],
  salidas: ["html", "svg", "png"],
  ficha: { web: "https://github.com/cathrynlavery/diagram-design", repo: "cathrynlavery/diagram-design", licencia: "MIT" },
};

/** Atributo `sandbox` del iframe que lo mostrará: scripts solo si la animación los necesita y
 * SIN `allow-same-origin` jamás (architecture/diagramas.md §3-3). */
export function sandboxDe(animado: boolean): string {
  return animado ? "allow-scripts" : "";
}

/** Tipo efectivo: familia válida y variante acotada 1..n de ESA familia; nada explota. */
export function resolverTipo(valores?: Record<string, ValorParametro | undefined>): { familia: FamiliaDiagrama; tipo: TipoDiagrama; variante: number } {
  const v = valores ?? {};
  const familia = FAMILIAS_DIAGRAMA[v.familia as keyof typeof FAMILIAS_DIAGRAMA] ? (v.familia as FamiliaDiagrama) : "flujo";
  const lista = FAMILIAS_DIAGRAMA[familia];
  const n = typeof v.variante === "number" && Number.isFinite(v.variante) ? Math.round(v.variante) : 1;
  const i = Math.min(Math.max(n, 1), lista.length) - 1;
  return { familia, tipo: lista[i], variante: i + 1 };
}

/** El plan PURO de un diagrama: mismos valores, mismo plan. Árbitro de tema/ancho/perfil incluido. */
export interface PlanDiagrama {
  tipo: TipoDiagrama;
  familia: FamiliaDiagrama;
  variante: number;
  tema: TemaDiagrama;
  tokens: (typeof TEMAS_DIAGRAMA)[TemaDiagrama];
  animado: boolean;
  sandbox: string;
  ancho: AnchoDiagrama;
  viewBox: string;
  minAncho: number;
  rampa: "estandar" | "presentacion" | "impresion";
  perfil: (typeof PERFILES)[number];
  /** La skill siempre entrega primero el HTML; svg y png salen de él (output-spec.md §1). */
  formato: "html";
}

export function planDiagrama(valores?: Record<string, ValorParametro | undefined>): PlanDiagrama {
  const v = valores ?? {};
  const { familia, tipo, variante } = resolverTipo(v);
  const tema = (TEMAS_DIAGRAMA[v.tema as TemaDiagrama] ? v.tema : "claro") as TemaDiagrama;
  const animado = v.animado === true;
  const ancho = (ANCHOS[v.ancho as AnchoDiagrama] ? v.ancho : "doc-inline") as AnchoDiagrama;
  const lienzo = ANCHOS[ancho];
  const perfil = (PERFILES as readonly string[]).includes(String(v.perfil)) ? (String(v.perfil) as (typeof PERFILES)[number]) : "contexto";
  return { tipo, familia, variante, tema, tokens: { ...TEMAS_DIAGRAMA[tema] }, animado, sandbox: sandboxDe(animado),
    ancho, viewBox: lienzo.viewBox, minAncho: lienzo.minAncho, rampa: lienzo.rampa, perfil, formato: "html" };
}

/**
 * Protomolécula · Átomo «diagrama» (DGM1018H · Ola 1018D, tarea H): Diagram Design en
 * una molécula. Contrato: architecture/diagramas.md §3–§4; skill MIT de Cathryn Lavery
 * (vendor/habilidades/diagram-design/, citada en la atribución). El HTML que produce el
 * visor se muestra SOLO en un iframe `sandbox` sin `allow-same-origin`, sin red ni
 * recursos externos (fuentes del OS, §3). El registro admite max. 32 opciones por
 * parámetro, así que los 45 tipos de la habilidad van en tres parámetros por familia
 * (16 + 12 + 17) y el grupo dice cuál manda. Todo el plan es PURO: sin red ni disco.
 */
import type { DefinicionAtomo, Parametro } from "@/lib/protomolecula/registro-atomos";
import type { ValorParametro } from "@/lib/protomolecula/tipos";
import { ATRIBUCION_DIAGRAMAS, TIPOS_DIAGRAMA, type TipoDiagrama } from "@/ai/astraura/habilidades/diagramas";

export type FamiliaDiagrama = "estructura" | "proceso" | "datos";
export const FAMILIAS: readonly FamiliaDiagrama[] = ["estructura", "proceso", "datos"];
export const FUENTES = ["texto", "datos", "drawio", "mermaid", "excalidraw"] as const;
export type FuenteDiagrama = (typeof FUENTES)[number];
export const MARCAS = ["perfil", "pagina", "grupo", "ninguna"] as const;
export type MarcaDiagrama = (typeof MARCAS)[number];
export const SALIDAS = ["html", "svg", "png"] as const;
export type SalidaDiagrama = (typeof SALIDAS)[number];

/** Los ids de los 45 tipos de la habilidad, repartidos por familia. */
const IDS: Record<FamiliaDiagrama, string[]> = {
  estructura: ["architecture", "architecture-delta", "it-state", "nested", "tree", "org-chart", "layers", "exploded", "axonometric-plan", "deployment", "dependency", "uml-class", "db-schema", "er", "high-level", "dp-integration"],
  proceso: ["flowchart", "sequence", "state", "timeline", "swimlane", "process", "data-flow", "gantt", "kanban", "journey", "service-blueprint", "story-map"],
  datos: ["quadrant", "radar", "polar", "loop", "venn", "pyramid", "bar", "waterfall", "treemap", "heatmap", "line", "scatter", "medallion", "dp-security-matrix", "sankey", "fishbone", "wardley"],
};

/** Por familia, los tipos completos de la habilidad, en su orden original. */
export const TIPOS_POR_FAMILIA = {
  estructura: TIPOS_DIAGRAMA.filter((t) => IDS.estructura.includes(t.id)),
  proceso: TIPOS_DIAGRAMA.filter((t) => IDS.proceso.includes(t.id)),
  datos: TIPOS_DIAGRAMA.filter((t) => IDS.datos.includes(t.id)),
} satisfies Record<FamiliaDiagrama, TipoDiagrama[]>;

const nombres = (g: FamiliaDiagrama): string[] => TIPOS_POR_FAMILIA[g].map((t) => t.nombre);

export const DIAGRAMA: DefinicionAtomo = {
  herramientaId: "diagram-design",
  nombre: "Diagrama (Diagram Design)",
  categoria: "arquitectura",
  integracion: "iframe-aislado",
  control: "total",
  parametros: [
    { id: "grupo", nombre: "Familia de tipos", tipo: "opcion", opciones: [...FAMILIAS], defecto: "estructura", sinonimos: ["tipo de diagrama", "familia"] },
    { id: "tipo-estructura", nombre: "Tipo (estructura)", tipo: "opcion", opciones: nombres("estructura"), defecto: "Arquitectura", sinonimos: ["tipos de sistema y jerarquía"] },
    { id: "tipo-proceso", nombre: "Tipo (proceso)", tipo: "opcion", opciones: nombres("proceso"), defecto: "Flujo", sinonimos: ["tipos de flujo y curso del trabajo"] },
    { id: "tipo-datos", nombre: "Tipo (datos)", tipo: "opcion", opciones: nombres("datos"), defecto: "Cuadrante", sinonimos: ["tipos de datos y análisis"] },
    { id: "tema", nombre: "Tema", tipo: "opcion", opciones: ["claro", "oscuro"], defecto: "claro", sinonimos: ["piel", "modo claro u oscuro"] },
    { id: "animado", nombre: "Animado", tipo: "booleano", defecto: false, sinonimos: ["animación", "movimiento"] },
    { id: "ancho", nombre: "Ancho", tipo: "numero", min: 320, max: 3840, paso: 20, unidad: "px", defecto: 960, sinonimos: ["tamaño", "anchura"] },
    { id: "marca", nombre: "Perfil de marca", tipo: "opcion", opciones: [...MARCAS], defecto: "perfil", sinonimos: ["marca del contexto", "tokens del tema"] },
    { id: "salida", nombre: "Formato de salida", tipo: "opcion", opciones: [...SALIDAS], defecto: "html", sinonimos: ["formato", "exportar"] },
  ],
  entradas: ["texto", "datos", "draw.io", "mermaid", "excalidraw"],
  salidas: [...SALIDAS],
  ficha: { web: "https://github.com/cathrynlavery/diagram-design", repo: "https://github.com/cathrynlavery/diagram-design", licencia: "MIT" },
};

export interface EntradaDiagrama {
  valores?: Record<string, ValorParametro | undefined>;
  /** De dónde sale el contenido del diagrama (texto, datos o un import a redibujar). */
  fuente?: FuenteDiagrama;
}

export interface PlanDiagrama {
  tipo: string; tipoNombre: string; grupo: FamiliaDiagrama;
  tema: "claro" | "oscuro"; animado: boolean; ancho: number; alto: number; tamano: string;
  marca: MarcaDiagrama; salida: SalidaDiagrama; fuente: FuenteDiagrama; redibujar: boolean;
  atribucion: string; avisos: string[];
}

const paramPor = (id: string): Parametro => {
  const p = DIAGRAMA.parametros.find((q) => q.id === id);
  if (!p) throw new Error(`Parámetro desconocido del átomo diagrama: ${id}`);
  return p;
};
const opcionDe = (valores: EntradaDiagrama["valores"], id: string): string => {
  const p = paramPor(id), v = String(valores?.[id] ?? "");
  return p.opciones?.includes(v) ? v : String(p.defecto);
};
const numeroDe = (valores: EntradaDiagrama["valores"], id: string): number => {
  const p = paramPor(id), v = valores?.[id];
  const n = typeof v === "number" && Number.isFinite(v) ? v : Number(p.defecto);
  return p.min !== undefined && p.max !== undefined ? Math.min(p.max, Math.max(p.min, n)) : n;
};

/** Alto del lienzo con φ = 1.618, reducida a 1.25 en pantallas de 430 px o menos (armonía.md). */
export function altoDe(ancho: number): number {
  return Math.round(ancho / (ancho <= 430 ? 1.25 : 1.618));
}

/** Tamaño de referencia del output-spec de la habilidad, según el ancho pedido. */
export function tamanoDe(ancho: number): "doc-inline" | "doc-wide" | "slide-16x9" | "print-a4-landscape" {
  if (ancho <= 520) return "doc-inline";
  if (ancho <= 960) return "doc-wide";
  if (ancho <= 1400) return "slide-16x9";
  return "print-a4-landscape";
}

/** El plan PURO del átomo: determinista, no genera el HTML ni toca nada. */
export function planDiagrama(e: EntradaDiagrama): PlanDiagrama {
  const valores = e.valores;
  const grupo = opcionDe(valores, "grupo") as FamiliaDiagrama;
  const tipoNombre = opcionDe(valores, `tipo-${grupo}`);
  const tipo = TIPOS_POR_FAMILIA[grupo].find((t) => t.nombre === tipoNombre) ?? TIPOS_POR_FAMILIA[grupo][0];
  const ancho = numeroDe(valores, "ancho");
  const fuente = (FUENTES as readonly string[]).includes(e.fuente ?? "") ? (e.fuente as FuenteDiagrama) : "texto";
  const redibujar = fuente !== "texto" && fuente !== "datos";
  const avisos: string[] = [];
  if (valores?.animado === true) avisos.push("Animado: SOLO en un iframe sandbox sin allow-same-origin, sin red ni recursos externos.");
  if (redibujar) avisos.push(`${fuente}: se redibuja, nunca se convierte; se cuenta lo que se fusiona o se suelta (informe de fidelidad).`);
  return {
    tipo: tipo.id, tipoNombre, grupo,
    tema: opcionDe(valores, "tema") as "claro" | "oscuro",
    animado: valores?.animado === true,
    ancho, alto: altoDe(ancho), tamano: tamanoDe(ancho),
    marca: opcionDe(valores, "marca") as MarcaDiagrama,
    salida: opcionDe(valores, "salida") as SalidaDiagrama,
    fuente, redibujar, atribucion: ATRIBUCION_DIAGRAMAS, avisos,
  };
}

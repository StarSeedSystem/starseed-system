/**
 * Protomolécula · Átomo «Diagrama» (Ola 1018D · DGM1018H). Envuelve la skill MIT diagram-design
 * (vendor/habilidades/diagram-design/, cathrynlavery/diagram-design, v2.6.110) para que un diagrama
 * viva como átomo y se combine con otros. Contrato: architecture/diagramas.md §3–§4 y
 * protomolecula.md §11.1. El plan es PURO: no lee disco, no pinta y no pide red. Todo HTML se
 * muestra SOLO en un iframe `sandbox` sin `allow-same-origin`, con CSP que bloquea la red y fuentes
 * del OS (nunca Google Fonts en uso); lo aplica `src/lib/diagramas/aislar-diagrama.ts`.
 */
import type { DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";
import type { ValorParametro } from "@/lib/protomolecula/tipos";

export type FamiliaDiagrama = "estructura" | "proceso" | "datos" | "comparacion";
/** Un tipo de los 45 de la skill, con la referencia que hay que cargar antes de dibujarlo. */
export interface TipoDiagrama { id: string; nombre: string; familia: FamiliaDiagrama; referencia: string }
const t = (id: string, nombre: string, familia: FamiliaDiagrama): TipoDiagrama => ({ id, nombre, familia, referencia: `references/type-${id}.md` });

/** Los 45 tipos de diagram-design 2.6.110, en el orden de su guía visual (MIT). */
export const TIPOS_DIAGRAMA: readonly TipoDiagrama[] = [
  t("architecture", "Arquitectura", "estructura"), t("architecture-delta", "Delta de arquitectura", "estructura"), t("it-state", "Estado actual de TI", "estructura"),
  t("flowchart", "Flujo", "proceso"), t("sequence", "Secuencia", "proceso"), t("state", "Máquina de estados", "proceso"),
  t("er", "Entidad-relación", "datos"), t("db-schema", "Esquema de base de datos", "datos"), t("timeline", "Línea de tiempo", "proceso"),
  t("swimlane", "Carriles", "proceso"), t("quadrant", "Cuadrante", "comparacion"), t("radar", "Radar", "comparacion"),
  t("polar", "Polar", "comparacion"), t("loop", "Bucle", "proceso"), t("nested", "Anidado", "estructura"),
  t("tree", "Árbol", "estructura"), t("org-chart", "Organigrama", "estructura"), t("layers", "Pila de capas", "estructura"),
  t("exploded", "Despiece axonométrico", "estructura"), t("axonometric-plan", "Planta axonométrica", "estructura"), t("venn", "Venn", "comparacion"),
  t("pyramid", "Pirámide y embudo", "comparacion"), t("bar", "Barras", "comparacion"), t("waterfall", "Cascada", "datos"),
  t("treemap", "Treemap", "datos"), t("heatmap", "Mapa de calor", "datos"), t("line", "Líneas", "datos"),
  t("gantt", "Gantt", "proceso"), t("scatter", "Dispersión", "datos"), t("sankey", "Sankey", "datos"),
  t("fishbone", "Espina de pescado", "proceso"), t("uml-class", "Clases UML", "estructura"),
  t("high-level", "Arquitectura de alto nivel", "estructura"), t("process", "Proceso", "proceso"), t("medallion", "Medallón", "datos"),
  t("data-flow", "Flujo de datos", "datos"), t("dp-integration", "Integración de plataforma de datos", "datos"), t("dp-security-matrix", "Matriz de seguridad", "datos"),
  t("wardley", "Mapa de Wardley", "estructura"), t("kanban", "Kanban", "proceso"), t("journey", "Viaje de usuario", "proceso"),
  t("service-blueprint", "Blueprint de servicio", "proceso"), t("deployment", "Despliegue", "estructura"), t("dependency", "Dependencias", "estructura"),
  t("story-map", "Story map", "proceso"),
];

/** El registro admite 32 opciones por parámetro (protomolecula.md §11.1); los 13 tipos más
 * especializados viven en `tipo-avanzado`, que manda cuando no está en «ninguno». */
const NO_AVANZADO = "ninguno";
const AVANZADOS: readonly string[] = ["high-level", "process", "medallion", "data-flow", "dp-integration",
  "dp-security-matrix", "wardley", "kanban", "journey", "service-blueprint", "deployment", "dependency", "story-map"];
export const OPCIONES_TIPO: readonly string[] = TIPOS_DIAGRAMA.filter((d) => !AVANZADOS.includes(d.id)).map((d) => d.id);
export const OPCIONES_TIPO_AVANZADO: readonly string[] = [NO_AVANZADO, ...AVANZADOS];

/** Identidades gráficas del OS (`memory/diseno/identidades.md`) que el diagrama puede heredar. */
export const PERFILES_MARCA = {
  starseed: "StarSeed OS", astraura: "Astraura", genesis: "Genesis",
  cafe: "StarSeed Café", "materia-viva": "Materia Viva", audiomorphic: "Audiomorphic",
} as const;

export const DIAGRAMA: DefinicionAtomo = {
  herramientaId: "diagram-design", nombre: "Diagrama (Diagram Design)", categoria: "arquitectura",
  integracion: "iframe-aislado", control: "total",
  parametros: [
    { id: "tipo", nombre: "Tipo de diagrama", tipo: "opcion", opciones: [...OPCIONES_TIPO], defecto: "architecture", sinonimos: ["tipo de diagrama", "clase de diagrama"] },
    { id: "tipo-avanzado", nombre: "Tipo avanzado (manda si no es «ninguno»)", tipo: "opcion", opciones: [...OPCIONES_TIPO_AVANZADO], defecto: NO_AVANZADO, sinonimos: ["tipo especializado", "tipo avanzado"] },
    { id: "tema", nombre: "Tema", tipo: "opcion", opciones: ["claro", "oscuro"], defecto: "claro", sinonimos: ["piel", "modo de color"] },
    { id: "animado", nombre: "Animado", tipo: "booleano", defecto: false, sinonimos: ["con movimiento", "animación"] },
    { id: "ancho", nombre: "Ancho", tipo: "entero", min: 320, max: 3840, paso: 4, unidad: "px", defecto: 1280, sinonimos: ["anchura", "tamaño"] },
    { id: "perfil", nombre: "Perfil de marca", tipo: "opcion", opciones: Object.keys(PERFILES_MARCA), defecto: "starseed", sinonimos: ["marca", "identidad"] },
  ],
  entradas: ["texto", "datos", "draw.io", "Mermaid", "Excalidraw"], salidas: ["html", "svg", "png"],
  ficha: { web: "https://github.com/cathrynlavery/diagram-design", repo: "cathrynlavery/diagram-design", licencia: "MIT" },
};

/** Cómo se muestra el HTML: origen opaco, sin red, sin recursos externos y con fuentes del OS. */
export interface AislamientoDiagrama { sandbox: string; csp: string; fuentes: "sistema"; red: false; recursosExternos: false }
const CSP_BASE = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:";

/** Sin animación no se ejecuta nada; con ella solo scripts inline, nunca `allow-same-origin`. */
export function aislamientoDe(animado: boolean): AislamientoDiagrama {
  return { sandbox: animado ? "allow-scripts" : "", csp: animado ? `${CSP_BASE}; script-src 'unsafe-inline'` : CSP_BASE,
    fuentes: "sistema", red: false, recursosExternos: false };
}

export interface PlanDiagrama {
  tipo: TipoDiagrama; tema: "claro" | "oscuro"; animado: boolean; ancho: number;
  perfil: { id: string; nombre: string }; entradas: string[]; salidas: string[]; aislamiento: AislamientoDiagrama;
}

export function tipoPorId(id: string): TipoDiagrama | undefined {
  return TIPOS_DIAGRAMA.find((d) => d.id === id);
}

function tipoDe(valores?: Record<string, ValorParametro | undefined>): TipoDiagrama {
  const avanzado = String(valores?.["tipo-avanzado"] ?? NO_AVANZADO);
  const elegido = avanzado !== NO_AVANZADO && tipoPorId(avanzado) ? avanzado : String(valores?.tipo ?? "");
  return tipoPorId(elegido) ?? TIPOS_DIAGRAMA[0];
}

function anchoDe(valores?: Record<string, ValorParametro | undefined>): number {
  const defecto = DIAGRAMA.parametros.find((p) => p.id === "ancho")?.defecto;
  const v = valores?.ancho;
  const n = typeof v === "number" && Number.isFinite(v) ? v : Number(defecto ?? 1280);
  const acotado = Math.min(3840, Math.max(320, Math.round(n)));
  return Math.min(3840, Math.max(320, Math.round(acotado / 4) * 4));
}

function perfilDe(valor: ValorParametro | undefined): { id: string; nombre: string } {
  const opciones = Object.keys(PERFILES_MARCA);
  const id = opciones.includes(String(valor ?? "")) ? String(valor) : "starseed";
  return { id, nombre: PERFILES_MARCA[id as keyof typeof PERFILES_MARCA] };
}

/** El plan PURO: mismos valores, mismo plan. No lee reloj, disco ni red. */
export function planDiagrama(valores?: Record<string, ValorParametro | undefined>): PlanDiagrama {
  const animado = valores?.animado === true;
  return { tipo: tipoDe(valores), tema: String(valores?.tema ?? "") === "oscuro" ? "oscuro" : "claro", animado,
    ancho: anchoDe(valores), perfil: perfilDe(valores?.perfil), entradas: [...DIAGRAMA.entradas],
    salidas: [...DIAGRAMA.salidas], aislamiento: aislamientoDe(animado) };
}

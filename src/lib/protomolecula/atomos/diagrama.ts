/**
 * Protomolécula · Átomo «Diagrama» (Ola 1018D · DGM1018H) — herramienta `diagram-design`.
 * La skill (copia en `vendor/habilidades/diagram-design/`, https://github.com/cathrynlavery/diagram-design, MIT)
 * dibuja 45 tipos como UN archivo HTML con SVG. Este átomo es PURO: no genera el HTML (lo escribe Astraura
 * con la marca del contexto) ni toca red, disco o navegador; el HTML se ve solo en iframe aislado,
 * sin `allow-same-origin` ni recursos externos. Contrato: architecture/diagramas.md §3–§4 y protomolecula.md §11.1.
 */
import type { DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";
import type { ValorParametro } from "@/lib/protomolecula/tipos";
import { ATOMO_DIAGRAMA, ID_VISTA_DIAGRAMA, vistaDeDiagrama } from "@/lib/protomolecula/bloque-protomolecula";

export type TipoDiagrama = "architecture" | "architecture-delta" | "it-state" | "deployment" | "dependency" | "flowchart" | "sequence" | "state" | "swimlane" | "data-flow"
  | "process" | "loop" | "er" | "db-schema" | "high-level" | "medallion" | "dp-integration" | "dp-security-matrix" | "uml-class" | "tree" | "org-chart"
  | "nested" | "layers" | "story-map" | "kanban" | "pyramid" | "exploded" | "axonometric-plan" | "venn" | "quadrant" | "radar" | "polar" | "bar" | "line"
  | "scatter" | "treemap" | "heatmap" | "waterfall" | "timeline" | "gantt" | "journey" | "service-blueprint" | "sankey" | "fishbone" | "wardley";

export type FamiliaDiagrama = "estructura" | "flujo" | "datos" | "jerarquia" | "espacio" | "comparativa" | "tiempo" | "mapas";

/** Los 45 tipos de la skill (references/type-*.md), repartidos en 8 familias. */
const GRUPOS: readonly [FamiliaDiagrama, readonly TipoDiagrama[]][] = [
  ["estructura", ["architecture", "architecture-delta", "it-state", "deployment", "dependency"]], ["flujo", ["flowchart", "sequence", "state", "swimlane", "data-flow", "process", "loop"]],
  ["datos", ["er", "db-schema", "high-level", "medallion", "dp-integration", "dp-security-matrix", "uml-class"]], ["jerarquia", ["tree", "org-chart", "nested", "layers", "story-map", "kanban", "pyramid"]],
  ["espacio", ["exploded", "axonometric-plan", "venn", "quadrant", "radar", "polar"]], ["comparativa", ["bar", "line", "scatter", "treemap", "heatmap", "waterfall"]],
  ["tiempo", ["timeline", "gantt", "journey", "service-blueprint"]], ["mapas", ["sankey", "fishbone", "wardley"]],
];
export const TIPOS_DIAGRAMA: TipoDiagrama[] = GRUPOS.flatMap(([, tipos]) => [...tipos]);
export const FAMILIAS_DIAGRAMA: readonly FamiliaDiagrama[] = GRUPOS.map(([familia]) => familia);
/** Mapa completo: cada uno de los 45 tipos con su familia. */
export const FAMILIA_DE_TIPO = Object.fromEntries(GRUPOS.flatMap(([f, ts]) => ts.map((t) => [t, f]))) as Record<TipoDiagrama, FamiliaDiagrama>;
/** El tipo de serie de cada familia, cuando el control solo sabe la familia. */
export const TIPO_POR_FAMILIA = Object.fromEntries(GRUPOS.map(([f, ts]) => [f, ts[0]])) as Record<FamiliaDiagrama, TipoDiagrama>;
/** Alias en español (sin tildes, slug): lo que Laya o una persona dicta llega aquí. */
const ALIAS: Record<string, TipoDiagrama> = {
  "delta-de-arquitectura": "architecture-delta", "estado-de-ti": "it-state", "pila-de-capas": "layers", despiece: "exploded", planta: "axonometric-plan",
  arquitectura: "architecture", dependencias: "dependency", "diagrama-de-flujo": "flowchart", "maquina-de-estados": "state", "entidad-relacion": "er",
  despliegue: "deployment", secuencia: "sequence", "linea-de-tiempo": "timeline", carriles: "swimlane", cuadrante: "quadrant", bucle: "loop",
  ciclo: "loop", anidado: "nested", arbol: "tree", organigrama: "org-chart", piramide: "pyramid", embudo: "pyramid",
  barras: "bar", cascada: "waterfall", "mapa-de-calor": "heatmap", dispersion: "scatter", espina: "fishbone", "espina-de-pescado": "fishbone", viaje: "journey", uml: "uml-class", esquema: "db-schema",
};
const TEMAS = ["claro", "oscuro"] as const; export const MARCAS = ["os", "neutro", "heredado", "personal"] as const;
export type TemaDiagrama = (typeof TEMAS)[number]; export type MarcaDiagrama = (typeof MARCAS)[number];

export function familiaDe(tipo: TipoDiagrama): FamiliaDiagrama { return FAMILIA_DE_TIPO[tipo]; }
export function tiposDeFamilia(familia: FamiliaDiagrama): TipoDiagrama[] { return GRUPOS.find(([f]) => f === familia)?.[1].slice() ?? []; }
/** Acepta el id canónico de la skill o su alias en español; lo desconocido no se inventa. */
export function normalizarTipoDiagrama(valor: string | undefined): TipoDiagrama | null {
  const clave = typeof valor === "string" ? valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") : "";
  if ((TIPOS_DIAGRAMA as readonly string[]).includes(clave)) return clave as TipoDiagrama;
  return ALIAS[clave] ?? null;
}
export function normalizarTemaDiagrama(valor: string | undefined): TemaDiagrama {
  return valor === "oscuro" ? "oscuro" : "claro";
}
/** Límites editoriales de la skill (SKILL.md §7): máx. 9 nodos, 12 aristas y 2 acentos. */
export const LIMITES_DIAGRAMA = { nodos: 9, aristas: 12, acentos: 2 } as const; export type LimitesDiagrama = typeof LIMITES_DIAGRAMA;
/** Devuelve el motivo del exceso, o null si lo pedido cabe en el editorial de la skill. */
export function validarLimites(nodos?: number, aristas?: number, acentos?: number): string | null {
  const pedido: [string, number, number][] = [["nodos", nodos ?? 0, LIMITES_DIAGRAMA.nodos], ["aristas", aristas ?? 0, LIMITES_DIAGRAMA.aristas], ["acentos", acentos ?? 0, LIMITES_DIAGRAMA.acentos]];
  for (const [nombre, bruto, tope] of pedido) {
    const n = typeof bruto === "number" && Number.isFinite(bruto) && bruto > 0 ? Math.round(bruto) : 0;
    if (n > tope) return `Máximo ${tope} ${nombre}: pedidos ${n}.`;
  }
  return null;
}
export interface EntradaDiagrama {
  id: string; autor: string; creado: string;
  valores?: Record<string, ValorParametro | undefined>;
  /** Un tipo concreto entre los 45; si falta o es desconocido, decide la familia. */
  tipo?: string; nodos?: number; aristas?: number; acentos?: number;
}
export interface PlanDiagrama {
  formato: "diagrama-diagram-design"; version: 1;
  id: string; tipo: TipoDiagrama; familia: FamiliaDiagrama; tema: TemaDiagrama;
  animado: boolean; ancho: number; alto: number; marca: MarcaDiagrama;
  limites: LimitesDiagrama; exportar: string[]; importar: string[]; creado: string;
}

const ANCHO_MIN = 480, ANCHO_MAX = 2560, ANCHO_DEFECTO = 960;
const acotar = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.round(v)));
const textoDe = (v: unknown, defecto: string): string => (typeof v === "string" && v.trim() ? v.trim() : defecto);
/** Lee un parámetro «opcion»: lo declarado vale, lo demás va al defecto. */
const opcionDe = (valores: Record<string, ValorParametro | undefined> | undefined, id: string, opciones: readonly string[], defecto: string): string => {
  const v = valores?.[id];
  return typeof v === "string" && opciones.includes(v) ? v : defecto;
};
const fechaSegura = (v: string): string => (Number.isNaN(Date.parse(v)) ? "1970-01-01T00:00:00.000Z" : new Date(v).toISOString());
const altoDe = (ancho: number): number => (ancho >= 1280 ? 720 : 600);
/** El plan PURO: mismos valores, mismo plan; la entrada no se muta. El HTML lo escribe Astraura. */
export function planDiagrama(entrada: EntradaDiagrama): PlanDiagrama {
  const familia = opcionDe(entrada.valores, "tipo", FAMILIAS_DIAGRAMA, "estructura") as FamiliaDiagrama;
  const tipo = normalizarTipoDiagrama(entrada.tipo ?? textoDe(entrada.valores?.tipo, "")) ?? TIPO_POR_FAMILIA[familia];
  const ancho = acotar(Number.isFinite(entrada.valores?.ancho as number) ? (entrada.valores?.ancho as number) : ANCHO_DEFECTO, ANCHO_MIN, ANCHO_MAX);
  return {
    formato: "diagrama-diagram-design", version: 1, id: textoDe(entrada.id, "diagrama"), tipo, familia: FAMILIA_DE_TIPO[tipo],
    tema: normalizarTemaDiagrama(textoDe(entrada.valores?.tema, "")), animado: entrada.valores?.animado === true,
    ancho, alto: altoDe(ancho), marca: opcionDe(entrada.valores, "marca", MARCAS, "os") as MarcaDiagrama,
    limites: { ...LIMITES_DIAGRAMA }, exportar: ["html", "svg", "png"], importar: ["draw.io", "Mermaid", "Excalidraw"], creado: fechaSegura(entrada.creado),
  };
}

/** La correspondencia del bloque decide qué vista pinta este átomo (diagramas.md §4). */
export const DIAGRAMA: DefinicionAtomo = {
  herramientaId: ATOMO_DIAGRAMA, nombre: "Diagrama", categoria: "arquitectura",
  integracion: "iframe-aislado", control: "total",
  vista: vistaDeDiagrama(ATOMO_DIAGRAMA) ? { tipo: "componente", id: ID_VISTA_DIAGRAMA } : undefined,
  parametros: [
    { id: "tipo", nombre: "Familia del diagrama", tipo: "opcion", opciones: [...FAMILIAS_DIAGRAMA], defecto: "estructura", sinonimos: ["tipo", "diagrama", "forma"] },
    { id: "tema", nombre: "Tema", tipo: "opcion", opciones: [...TEMAS], defecto: "claro", sinonimos: ["modo", "apariencia"] },
    { id: "animado", nombre: "Animado", tipo: "booleano", defecto: false, sinonimos: ["animación", "movimiento", "guía de movimiento"] },
    { id: "ancho", nombre: "Ancho del canvas", tipo: "numero", min: ANCHO_MIN, max: ANCHO_MAX, paso: 80, unidad: "px", defecto: ANCHO_DEFECTO, sinonimos: ["tamaño", "lienzo"] },
    { id: "marca", nombre: "Perfil de marca", tipo: "opcion", opciones: [...MARCAS], defecto: "os", sinonimos: ["perfil", "identidad", "marca"] },
  ],
  entradas: ["texto", "datos", "draw.io", "Mermaid", "Excalidraw"], salidas: ["html", "svg", "png"],
  ficha: { web: "https://github.com/cathrynlavery/diagram-design", repo: "cathrynlavery/diagram-design", licencia: "MIT" }, // la skill es MIT (§1)
};

/** Atributos del iframe: los scripts de la animación corren, pero el origen del OS no existe ahí. */
export const SANDBOX_DIAGRAMA = 'sandbox="allow-scripts" referrerpolicy="no-referrer"';
/** CSP del documento contenedor: nada de red ni recursos externos (§3; nunca Google Fonts). */
export const CSP_DIAGRAMA = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src 'none'; base-uri 'none'; form-action 'none'";

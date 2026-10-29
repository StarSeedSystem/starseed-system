// Herramienta de agente `diagrama.crear` (architecture/diagramas.md §2-2 y §4-F).
// Basada en la skill MIT Diagram Design de Cathryn Lavery
// (vendor/habilidades/diagram-design/): elige el tipo, arma el contexto con su guía
// de `references/type-*.md` y el perfil de marca, y valida el HTML antes de mostrarlo.
// Módulo PURO: sin red, disco ni `any`; la guía y las fuentes se inyectan desde fuera.

import { TIPOS_DIAGRAMA } from "@/ai/astraura/habilidades/diagramas";
import { prepararDiagrama } from "./aislar-diagrama";
import { sustituirFuentes, type FuenteDisponible } from "./fuentes-locales";
import { bloquePerfil, type PerfilDiagrama } from "./perfil-marca";

export const ATRIBUCION_DIAGRAMA =
  "Diagram Design de Cathryn Lavery (github.com/cathrynlavery/diagram-design), licencia MIT.";
export const RUTA_GUIAS = "vendor/habilidades/diagram-design/references";
export const TAMANOS_DIAGRAMA = ["tarjeta", "resumen", "completa"] as const;
export type TamanoDiagrama = (typeof TAMANOS_DIAGRAMA)[number];

/** Lo que pide un chat, agente o bot para que el modelo dibuje el diagrama. */
export interface PedidoDiagrama {
  peticion: string;
  /** Id de `TIPOS_DIAGRAMA`; si falta o no existe, se deduce de la petición. */
  tipo?: string;
  /** Perfil de marca ya resuelto desde los tokens del contexto (tarea E). */
  perfil: PerfilDiagrama;
  tamano?: TamanoDiagrama;
  animado?: boolean;
  /** Contenido de `references/type-<id>.md`; lo lee quien tiene disco, no este módulo. */
  guia?: string;
  /** Reloj inyectable para la cabecera del perfil (por defecto, ahora). */
  reloj?: () => Date;
}

export interface TipoElegido {
  tipo: string;
  nombre: string;
  guia: string;
  frase: string;
  motivos: string[];
}

/** Lo que devuelve `recibirDiagrama`: el HTML ya aislado o los motivos del rechazo. */
export interface ResultadoDiagramaCreado {
  ok: boolean;
  srcdoc?: string;
  sandbox: string;
  tipo: string;
  motivos: string[];
}

/** Señales de la petición → tipo de la skill, de la más concreta a la más general. */
const SENALES: readonly [string, RegExp][] = [
  ["flowchart", /flujo|decisi[oó]n|ramas|triaje/i],
  ["sequence", /secuencia|protocolo|llamadas|api/i],
  ["state", /estados?|transici[oó]n|guardia/i],
  ["er", /entidad|relaci[oó]n|modelo de datos|cardinalidad/i],
  ["gantt", /gantt|cronograma|tareas|fases/i],
  ["timeline", /l[ií]nea de tiempo|hitos|historial/i],
  ["sankey", /sankey|reparto|caudal/i],
  ["wardley", /wardley|cadena de valor/i],
  ["kanban", /kanban|wip|en curso/i],
  ["layers", /capas|pila|abstracci[oó]n/i],
  ["architecture", /arquitectura|componentes|infraestructura|despliegue/i],
];

const POR_ID = new Map(TIPOS_DIAGRAMA.map((t) => [t.id, t]));

const INSTRUCCION_TAMANO: Record<TamanoDiagrama, string> = {
  tarjeta: "Versión mínima para una tarjeta o un mensaje: solo el núcleo, sin subtítulos largos.",
  resumen: "Versión de resumen: el núcleo y las relaciones imprescindibles, con textos breves.",
  completa: "Versión completa: el diagrama editorial entero, con título, leyenda y notas justas.",
};

/** Elige el tipo por id o por las señales de la petición; nunca lanza. */
export function elegirTipoDiagrama(peticion: string, tipo?: string): TipoElegido {
  const motivos: string[] = [];
  const pedido = (tipo ?? "").trim().toLowerCase();
  const directo = pedido ? POR_ID.get(pedido) : undefined;
  if (pedido && !directo) motivos.push(`No conozco el tipo «${tipo}»: lo deduzco de la petición.`);
  const inferido = SENALES
    .map(([id, senal]) => (senal.test(peticion) ? POR_ID.get(id) : undefined))
    .find((t) => t !== undefined);
  const elegido = directo ?? inferido ?? POR_ID.get("architecture") ?? TIPOS_DIAGRAMA[0];
  if (!directo && !inferido) motivos.push("No deduje el tipo: uso architecture; Laya puede elegir otro.");
  return {
    tipo: elegido.id,
    nombre: elegido.nombre,
    frase: elegido.frase,
    guia: `${RUTA_GUIAS}/type-${elegido.id}.md`,
    motivos,
  };
}

export function pedidoDiagrama(pedido: PedidoDiagrama): string {
  throw new Error("pendiente");
}

export function recibirDiagrama(
  respuesta: string,
  fuentes: FuenteDisponible[] = [],
): ResultadoDiagramaCreado {
  throw new Error("pendiente");
}

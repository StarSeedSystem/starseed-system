/**
 * Ventana de la Protomolécula (Ola 1026P · PRO1026P1) · tipos propios de la ventana.
 * Solo tipos y constantes puras (sin React, sin `node:*`): los importan componentes de cliente.
 * Lo que comparte con el resto de la ola vive en `@/lib/protomolecula/peticion/contrato`.
 */
import type {
  EntidadProto,
  FalloPeticion,
  ModoEdicion,
  PlanPeticion,
  VeredictoGobierno,
} from "@/lib/protomolecula/peticion/contrato";

export type PestanaVentana = "crear" | "controles" | "vinculos" | "gobierno" | "apariencia";

/** Resultado de ejecutar un plan. `deshacer` es opcional: solo se enseña el botón si quien ejecutó lo ofrece. */
export interface ResultadoVentana {
  ok: boolean;
  hechos: string[];
  pendientes: string[];
  motivo?: string;
  deshacer?: () => void | Promise<void>;
}

/** Quién originó el plan: una persona con un botón, o Astraura interpretando un texto. */
export type OrigenPlan = "humano" | "ia";

/** Por qué falla una petición: lo del contrato, más los fallos propios de la ventana. */
export type TipoFallo = FalloPeticion["error"] | "fallo" | "tarda";

export type EstadoPeticion =
  | { fase: "reposo" }
  | { fase: "planificando"; texto: string }
  | { fase: "plan"; texto: string; plan: PlanPeticion; veredicto: VeredictoGobierno; origen: OrigenPlan }
  | { fase: "propuesta"; plan: PlanPeticion; veredicto: VeredictoGobierno }
  | { fase: "ejecutando"; plan: PlanPeticion }
  | { fase: "hecho"; plan: PlanPeticion; resultado: ResultadoVentana }
  | { fase: "error"; texto: string; tipo: TipoFallo; motivo: string };

export type IconoHerramienta =
  | "objeto3d" | "imagen" | "fondo" | "pizarra" | "xr" | "lienzo" | "rama" | "molecula"
  | "propuesta" | "gobierno" | "convertir" | "mensaje" | "diseno" | "orden" | "seleccion";

export type AccionHerramienta =
  /** Rellena la barra de petición (y, si se indica, el modo) para que la persona termine la frase. */
  | { tipo: "rellenar"; texto: string; modo?: ModoEdicion }
  /** Plan ya hecho con el vocabulario cerrado: no gasta IA. */
  | { tipo: "plan"; plan: PlanPeticion }
  /** Abre el lienzo completo de la Protomolécula (la única que sale del contexto, y lo dice). */
  | { tipo: "lienzo" }
  /** Lleva a otra pestaña de esta misma ventana. */
  | { tipo: "pestana"; destino: PestanaVentana };

export interface HerramientaVentana {
  id: string;
  nombre: string;
  ayuda: string;
  icono: IconoHerramienta;
  accion: AccionHerramienta;
}

/** Entrada del historial local de peticiones. */
export interface EntradaHistorial {
  texto: string;
  modo: ModoEdicion;
  /** Ruta desde la que se pidió (para mostrar el contexto sin guardar más). */
  ruta: string;
  /** Etiqueta corta de lo que había delante, p. ej. «Grupo · Semilla». */
  donde?: string;
  /** Milisegundos desde 1970. */
  en: number;
}

export const MAX_TEXTO_PETICION = 600;
export const MAX_HISTORIAL = 8;

export type { EntidadProto };

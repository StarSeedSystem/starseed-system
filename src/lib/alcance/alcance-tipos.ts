// Alcance del agente de imaginación (INV1025O): tipos compartidos entre el
// panel de Genesis, el almacén privado de objetivos y la evaluación de envío.
// Módulo puro, apto para cliente: nada de node:*.

/** Medio por el que sale un mensaje del alcance. `red` jamás se automatiza. */
export type MedioAlcance =
  | "correo-propio"
  | "correo-usuario"
  | "formulario"
  | "github"
  | "red";

/** Ciclo de vida de un envío de alcance. */
export type EstadoEnvio =
  | "pendiente"
  | "aprobada"
  | "enviada"
  | "respondida"
  | "sin-respuesta"
  | "rebotada"
  | "no-contactar";

/** Importancia del objetivo: sin dato se trata como alto (R8). */
export type NivelAlcance = "alto" | "medio" | "bajo";

/** Objetivo del alcance tal y como lo ve la evaluación de envío. */
export interface DestinoAlcance {
  /** Referencia opaca obj-…: nunca la dirección en memoria pública (R5). */
  id: string;
  nombrePublico: string;
  nivel: NivelAlcance;
  medio: MedioAlcance;
  /** Canal que la propia entidad publica. Vacío si no lo hay (R1). */
  canalPublicado: string;
}

/** Un envío ya salido, tal y como queda en el registro de envíos. */
export interface EnvioPrevio {
  destinoId: string;
  fecha: string;
  estado: EstadoEnvio;
  /** true cuando el envío fue el recordatorio único a los N días. */
  recordatorio: boolean;
}

/** Límites y ajustes del alcance. El automático nace apagado y sin validar. */
export interface AjustesAlcance {
  automatico: { activo: boolean; validado: boolean };
  limite_diario: number;
  recordatorio_dias: number;
  pausa_rechazo_dias: number;
  pausa_no_contactar_dias: number;
}

export const AJUSTES_DEFECTO: AjustesAlcance = {
  automatico: { activo: false, validado: false },
  limite_diario: 5,
  recordatorio_dias: 14,
  pausa_rechazo_dias: 90,
  pausa_no_contactar_dias: 180,
};

/** Pie del mensaje: identidad real del remitente y forma de no recibir más. */
export interface PieAlcance {
  identidad: string;
  baja: string;
}

/** Propuesta del alcance tal y como la muestra y aprueba Genesis. */
export interface PropuestaAlcance {
  id: string;
  medio: MedioAlcance;
  asunto: string;
  cuerpo: string;
  enlaces: string[];
  pie: PieAlcance;
  estado: "esperando-aprobacion" | "aprobada";
  /** true solo cuando aprobó una persona: los agentes no mueven esto (R2). */
  aprobadaPorHumano: boolean;
  /** Huella SHA-256 del texto tal y como se aprobó; si el texto cambia, caduca. */
  huellaAprobada: string;
  /** true si este envío lo sacaría el automático (solo nivel bajo y correo-propio). */
  automatico: boolean;
  /** true si este envío es el recordatorio único a los N días. */
  recordatorio: boolean;
}

/** Resultado de la última comprobación de un enlace del mensaje. */
export interface EnlaceVerificado {
  url: string;
  codigo: number;
  verificadoEn: string;
}

/** Confirmación escrita: solo vale si la puso una persona (R2). */
export interface ConfirmacionEscrita {
  texto: string;
  porPersona: boolean;
}

/** Entrada completa de evaluarEnvio: reloj y registros inyectados. */
export interface EntradaEnvio {
  propuesta: PropuestaAlcance;
  destino: DestinoAlcance;
  ajustes?: AjustesAlcance;
  registro: EnvioPrevio[];
  suprimidos: string[];
  ahora: Date;
  enlaces: EnlaceVerificado[];
  confirmacion: ConfirmacionEscrita;
}

/** Veredicto: puede salir solo si no hay ni un motivo. */
export interface VeredictoEnvio {
  puede: boolean;
  motivos: string[];
}

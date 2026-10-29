/**
 * Tipos del catálogo de rutas de «Contenido vivo» (CVV1028, tarea A).
 *
 * Módulo puro: sin red, sin React y sin `node:*`. Lo consumen el selector de
 * ruta (tarea B) y el panel de comparación (tarea H).
 */

/** Los tres niveles de contenido vivo del contrato §1. */
export type NivelVivo = 1 | 2 | 3;

/** Tareas para las que se elige una ruta local o un servicio externo. */
export type TareaViva =
  | "escena-3d"
  | "fotograma-clave"
  | "foto"
  | "clip-pelicula"
  | "foto-viva"
  | "grafico-vivo"
  | "revision-texto"
  | "comprobacion";

/** Una ruta se ejecuta en la neurona (local) o sale a un servicio (externo). */
export type TipoRuta = "local" | "externo";

/** Lo que la ruta necesita para poder usarse. */
export type RequisitoRuta = "gpu" | "neurona-capaz" | "conector" | "cuenta";

/** Si el contenido no sale de la neurona o viaja a un servicio externo. */
export type PrivacidadRuta = "local" | "sale-de-la-neurona";

/** Candidato del catálogo, con lo medido y lo que falta por medir. */
export interface Ruta {
  /** Identificador estable, único en el catálogo. */
  id: string;
  /** Nombre legible para la interfaz. */
  nombre: string;
  /** Local o servicio externo. */
  tipo: TipoRuta;
  /** Tareas que esta ruta sabe hacer. */
  tareas: TareaViva[];
  /** Calidad conocida por tarea, de 0 a 1. */
  calidad: Partial<Record<TareaViva, number>>;
  /** Créditos (o llamadas, si la ruta usa cupo) por unidad de trabajo. */
  creditosPorUnidad: number;
  /** Qué es una unidad: una imagen, un clip de 5 s, una escena… */
  unidad: string;
  /** Requisitos técnicos o de cuenta. */
  requiere: RequisitoRuta[];
  /** Dónde se procesa el contenido. */
  privacidad: PrivacidadRuta;
  /** Licencia de uso del motor o del servicio. */
  licencia: string;
  /** Si el uso comercial está permitido. */
  comercial: boolean;
  /** Latencia típica en segundos. */
  latenciaS: number;
  /** Fecha `AAAA-MM-DD` si está medido, o `por-verificar`. */
  verificado: string;
  /** Dónde consta el dato: documento, enlace oficial o script. */
  fuente: string;
  /** Enlace para conectar el servicio a la cuenta, página o grupo. */
  enlaceConectar?: string;
}

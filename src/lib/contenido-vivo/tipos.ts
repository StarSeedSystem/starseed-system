/**
 * Tipos del contenido vivo (CVV1028, `architecture/contenido-vivo.md` §1 y §3).
 * Puro: sin red, React ni Node. Los usan la elección de ruta, el panel y los conectores.
 */

/** Los tres niveles de la skill: 1 · 3D vivo, 2 · película e imágenes, 3 · gráficos vivos. */
export type NivelVivo = 1 | 2 | 3;

/** Cada tarea que una ruta puede resolver. */
export type TareaViva =
  | "escena-3d"
  | "fotograma-clave"
  | "foto"
  | "clip-pelicula"
  | "foto-viva"
  | "grafico-vivo"
  | "revision-texto"
  | "comprobacion";

/** Lo que una ruta necesita para funcionar en este ámbito. */
export type RequisitoRuta = "gpu" | "neurona-capaz" | "conector" | "cuenta";

/** Fecha medida (AAAA-MM-DD) o marca de que aún no se ha comprobado. */
export type Verificacion = "por-verificar" | `${number}-${number}-${number}`;

/** Una ruta local o un servicio externo que resuelve una o varias tareas. */
export interface Ruta {
  id: string;
  nombre: string;
  tipo: "local" | "externo";
  tareas: TareaViva[];
  /** Calidad estimada de 0 a 1 por cada tarea que la ruta cubre. */
  calidad: Partial<Record<TareaViva, number>>;
  creditosPorUnidad: number;
  unidad: string;
  requiere: RequisitoRuta[];
  privacidad: "local" | "sale-de-la-neurona";
  licencia: string;
  comercial: boolean;
  latenciaS: number;
  verificado: Verificacion;
  fuente: string;
  /** Enlace para conectar el servicio a la cuenta, página o grupo. */
  enlaceConectar?: string;
  /** Cupo diario conocido y cuándo se reinicia (solo si el contrato lo mide). */
  cupo?: { porDia: number; reinicio: string };
  /** Matices del contrato que no caben en los demás campos. */
  nota?: string;
}

// Contenido vivo: tipos compartidos del contrato `architecture/contenido-vivo.md` §3.

/** Nivel de contenido vivo: 1 es 3D jugable, 2 película e imágenes, 3 gráficos vivos. */
export type NivelVivo = 1 | 2 | 3;

/** Tareas que puede pedir una pieza viva de su ruta de producción. */
export type TareaViva =
  | "escena-3d"
  | "fotograma-clave"
  | "foto"
  | "clip-pelicula"
  | "foto-viva"
  | "grafico-vivo"
  | "revision-texto"
  | "comprobacion";

export type TipoRuta = "local" | "externo";

export type RequisitoRuta = "gpu" | "neurona-capaz" | "conector" | "cuenta";

export type PrivacidadRuta = "local" | "sale-de-la-neurona";

/** Calidad conocida por tarea, de 0 a 1, solo de lo que ya se juzgó. */
export type CalidadPorTarea = Partial<Record<TareaViva, number>>;

/**
 * Una ruta candidata: cómo se produce lo que pide la tarea, a qué coste
 * y con qué condiciones de privacidad, licencia y verificación.
 */
export interface Ruta {
  id: string;
  nombre: string;
  tipo: TipoRuta;
  tareas: TareaViva[];
  calidad: CalidadPorTarea;
  /** Créditos que gasta una unidad de producción; 0 si no se cobra. */
  creditosPorUnidad: number;
  /** Qué es esa unidad: una escena, una imagen, un clip. */
  unidad: string;
  requiere: RequisitoRuta;
  privacidad: PrivacidadRuta;
  licencia: string;
  /** Si el resultado puede usarse en producción comercial. */
  comercial: boolean;
  /** Latencia esperada en segundos; 0 si ocurre en el navegador. */
  latenciaS: number;
  /** Fecha de medición AAAA-MM-DD, o «por-verificar» si no está medido. */
  verificado: string;
  fuente: string;
  /** Enlace para conectar el servicio externo a la cuenta, página o grupo. */
  enlaceConectar?: string;
}

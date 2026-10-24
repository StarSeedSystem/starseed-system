// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Conversión de archivos · carpetas vigiladas (PURO)
// ----------------------------------------------------------------------------
// Reglas «carpeta de la Biblioteca → formato» guardadas en la clave
// `starseed.conversion.vigiladas.v1`. Función pura que decide qué archivos
// nuevos convertir (sin repetir, sin bucles, nunca convertir un resultado).
// Contrato: `architecture/conversion-archivos.md` · CNV1023G.
// ════════════════════════════════════════════════════════════════════════════

/** Clave de persistencia en la memoria del OS. */
export const CLAVE_VIGILADAS = "starseed.conversion.vigiladas.v1";

/** Regla: de qué carpeta a qué formato se convierte todo lo que entra. */
export interface ReglaVigilada {
  carpeta: string;      // nombre de la carpeta de la Biblioteca (p. ej. "Fotos del móvil")
  a: string;           // formato destino (p. ej. "jpg")
}

/** Información de un archivo presente en una carpeta vigilada. */
export interface ArchivoVigilado {
  ruta: string;         // ruta relativa dentro de la Biblioteca
  nombre: string;       // nombre del archivo con extensión
  carpeta: string;      // nombre de la carpeta contenedora
}

/** Resultado de la decisión de conversión para un archivo. */
export interface DecisionConversion {
  archivo: ArchivoVigilado;
  convertir: boolean;
  destino?: string;     // formato destino si se convierte
  razon?: string;       // motivo breve en español (para la UI)
}

/** Reglas predeterminadas basadas en el contrato de Biblioteca. */
export const REGLAS_PREDETERMINADAS: ReglaVigilada[] = [
  { carpeta: "Fotos del móvil", a: "jpg" },
  { carpeta: "Documentos", a: "pdf" },
  { carpeta: "Música", a: "mp3" },
];

export { tipoReglas, archivosConvertidos, esResultadoConversion };

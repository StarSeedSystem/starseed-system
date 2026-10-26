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

function extDe(nombre: string): string {
  const m = nombre.match(/\.([^.]+)$/);
  return (m ? m[1] : "").toLowerCase();
}

/** Obtiene las reglas aplicables a una carpeta (predeterminadas si no se pasa nada). */
export function tipoReglas(carpeta: string, reglas?: ReglaVigilada[]): ReglaVigilada[] {
  const r = reglas ?? REGLAS_PREDETERMINADAS;
  return r.filter((reg) => reg.carpeta === carpeta);
}

/** Historial por ruta o por nombre (convierta la misma carpeta, el nombre ya está). */
function enHistorial(archivo: ArchivoVigilado, historial?: ArchivoVigilado[]): boolean {
  return (historial ?? []).some((h) => h.ruta === archivo.ruta || h.nombre === archivo.nombre);
}

/**
 * ¿Este archivo parece ser un resultado de conversión ya hecho?
 * Un archivo es resultado si:
 *   - su extensión coincide con el destino de conversión (con ese formato
 *     ya se cumple la regla, convertirlo de nuevo sería un bucle); o
 *   - está en el historial de archivos ya convertidos (por ruta o nombre).
 */
export function esResultadoConversion(
  archivo: ArchivoVigilado,
  destino: string,
  historial?: ArchivoVigilado[],
): boolean {
  if (extDe(archivo.nombre) === destino.toLowerCase().trim()) return true;
  return enHistorial(archivo, historial);
}

/**
 * Decide qué archivos nuevos convertir según las reglas de la Biblioteca.
 * Nunca convierte un archivo que ya esté en el historial ni un archivo cuyo
 * formato sea el destino (evita bucles). Siempre devuelve argumentos en lista.
 */
export function archivosConvertidos(
  archivos: ArchivoVigilado[],
  reglas?: ReglaVigilada[],
  historial?: ArchivoVigilado[],
): DecisionConversion[] {
  const resultado: DecisionConversion[] = [];
  const reglasActivas = reglas ?? REGLAS_PREDETERMINADAS;

  for (const archivo of archivos) {
    const reglasCarpeta = tipoReglas(archivo.carpeta, reglasActivas);
    if (reglasCarpeta.length === 0) {
      resultado.push({
        archivo,
        convertir: false,
        razon: `Sin regla de vigilancia para «${archivo.carpeta}»`,
      });
      continue;
    }
    // Una sola regla por archivo: la primera aplicable.
    const reg = reglasCarpeta[0];
    const destino = reg.a.toLowerCase();
    const extArchivo = extDe(archivo.nombre);

    // Evitar bucles: archivo cuyo formato ya es el destino.
    if (extArchivo === destino) {
      resultado.push({
        archivo,
        convertir: false,
        destino,
        razon: `Ya está en formato ${destino}; no se convierte de nuevo.`,
      });
      continue;
    }
    // Evitar repetir: archivo ya en el historial de vigiladas (por ruta o nombre).
    if (enHistorial(archivo, historial)) {
      resultado.push({
        archivo,
        convertir: false,
        destino,
        razon: "Este archivo ya fue convertido antes (historial de vigiladas).",
      });
      continue;
    }
    // Archivo nuevo en carpeta vigilada → convertir.
    resultado.push({
      archivo,
      convertir: true,
      destino,
      razon: `Carpeta vigilada «${archivo.carpeta}» → ${destino}.`,
    });
  }
  return resultado;
}



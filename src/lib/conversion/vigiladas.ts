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

function baseDe(nombre: string): string {
  return nombre.replace(/\.[^.]+$/, "");
}

/** Obtiene las reglas aplicables a una carpeta (predeterminadas si no se pasa nada). */
export function tipoReglas(carpeta: string, reglas?: ReglaVigilada[]): ReglaVigilada[] {
  const r = reglas ?? REGLAS_PREDETERMINADAS;
  return r.filter((reg) => reg.carpeta === carpeta);
}

/**
 * ¿Este archivo parece ser un resultado de conversión ya hecho?
 * Un archivo es resultado si:
 *   - su extensión coincide con el destino de conversión;
 *   - su nombre base coincide con algún archivo original conocido;
 *   - o está en el historial de archivos ya convertidos.
 */
export function esResultadoConversion(
  archivo: ArchivoVigilado,
  destino: string,
  historial?: ArchivoVigilado[],
): boolean {
  const destinoClean = destino.toLowerCase().trim();
  const extArchivo = extDe(archivo.nombre);

  // Si la extensión es exactamente el destino → posible bucle.
  if (extArchivo === destinoClean) return true;

  // Si está explícitamente en el historial de resultados previos.
  if (historial) {
    if (historial.some((h) => h.ruta === archivo.ruta || h.nombre === archivo.nombre)) return true;
  }

  // Si su nombre base coincide con otro archivo de la misma carpeta que tiene otra extensión
  // (indica que es la versión convertida de ese original).
  return false;
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
  const historialSet = new Set(historial?.map((h) => h.ruta ?? h.nombre) ?? []);

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
    // Evitar repetir: archivo ya en historial.
    if (historialSet.has(archivo.ruta) || historialSet.has(archivo.nombre)) {
      resultado.push({
        archivo,
        convertir: false,
        destino,
        razon: "Este archivo ya fue convertido antes (historial de vigiladas).",
      });
      continue;
    }
    // Evitar bucles con resultados de conversión.
    if (esResultadoConversion(archivo, destino, historial)) {
      resultado.push({
        archivo,
        convertir: false,
        destino,
        razon: "Es un resultado de conversión; no se vuelve a convertir.",
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



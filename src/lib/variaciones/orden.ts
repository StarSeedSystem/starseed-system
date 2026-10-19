export type SortMode = "aurora" | "novedades" | "populares" | "relevantes" | "alfabetico";

export interface Variacion {
  id: string;
  titulo: string;
  descripcion: string;
  version: string; // semver
  familia: string;
  licencia: string;
  etiquetas: string[];
  creado: Date;
  descargas: number; // number of downloads
  valoracionMedia: number; // average rating (0-5)
  valoracionCount: number; // number of ratings
}

/**
 * Compara versiones semver de forma tolerante (mayor primero).
 */
function compareVersionDesc(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return db - da;
  }
  return 0;
}

/**
 * Ordena un array de variaciones según el modo especificado.
 * @param variaciones - Array de variaciones a ordenar.
 * @param modo - Modo de ordenamiento.
 * @returns Nuevo array con las variaciones ordenadas.
*/
export function ordenarVariaciones(
  variaciones: Variacion[],
  modo: SortMode
): Variacion[] {
  // Create a copy to avoid mutating the original array
  const copia = [...variaciones];

  switch (modo) {
    case "aurora":
      // Para aurora, usaríamos una puntuación consciente del contexto, pero como no tenemos contexto en esta función pura,
      // recurrimos a ordenar por título como marcador de posición.
      // En una implementación real, el objeto de variación incluiría una puntuación auroraPrecalculada basada en el contexto y el ADN.
      copia.sort((a, b) => a.titulo.localeCompare(b.titulo));
      break;

    case "novedades":
      copia.sort((a, b) => {
        // Comparar versiones descendentemente (mayor primero)
        const versionCompare = compareVersionDesc(a.version, b.version);
        if (versionCompare !== 0) return versionCompare;
        // Si las versiones son iguales, ordenar por título ascendente
        return a.titulo.localeCompare(b.titulo);
      });
      break;

    case "populares":
      copia.sort((a, b) => {
        // Ordenar por descargas descendentemente (como proxy de popularidad)
        if (a.descargas !== b.descargas) {
          return b.descargas - a.descargas;
        }
        // Si las descargas son iguales, ordenar por número de etiquetas descendentemente
        if (a.etiquetas.length !== b.etiquetas.length) {
          return b.etiquetas.length - a.etiquetas.length;
        }
        // Luego por título ascendente
        return a.titulo.localeCompare(b.titulo);
      });
      break;

    case "relevantes":
      copia.sort((a, b) => {
        // Ordenar por calificación media descendentemente
        if (a.valoracionMedia !== b.valoracionMedia) {
          return b.valoracionMedia - a.valoracionMedia;
        }
        // Si las calificaciones son iguales, ordenar por número de calificaciones descendentemente
        if (a.valoracionCount !== b.valoracionCount) {
          return b.valoracionCount - a.valoracionCount;
        }
        // Luego por título ascendente
        return a.titulo.localeCompare(b.titulo);
      });
      break;

    case "alfabetico":
      copia.sort((a, b) => a.titulo.localeCompare(b.titulo));
      break;
  }

  return copia;
}
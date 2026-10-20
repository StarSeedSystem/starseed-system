import { FilaMedidor } from "./medidores";
import { grupoDeFila, GrupoBloqueada } from "./bloqueadas";
import type { EstadoRevisorBloqueadas } from "./bloqueadas";
import type { FilaContable } from "./conteo-operativo";

/**
 * Unifica el cálculo de bloqueadas para usar en el medidor, la pastilla y la sección.
 * @param filasBloqueadas - Filas que ya tienen su grupo asignado por `bloqueadas.ts`
 * @param progreso - Estado de las tareas en el mapa de progreso
 * @param colasVivas - Tareas en colas vivas (fila y ejecutables)
 * @returns Objeto con problemas, enCadena y resumen
 */
export function unificarBloqueadas({
  filasBloqueadas,
  progreso,
  colasVivas,
}: {
  filasBloqueadas: FilaMedidor[];
  progreso: Record<string, { estado: string; t?: string; nota?: string }>;
  colasVivas: FilaContable[];
}): {
  problemas: FilaMedidor[];
  enCadena: FilaMedidor[];
  resumen: { valor: number; enCadena: number; pastilla: string; texto: string };
} {
  // Separate filasBloqueadas into enCadena and problemas (alex and atascada)
  const enCadena: FilaMedidor[] = [];
  const problemasDesdeBloqueadas: FilaMedidor[] = [];
  const idsProcesados = new Set<string>();

  for (const fila of filasBloqueadas) {
    if (fila.grupo === "cadena") {
      enCadena.push(fila);
      idsProcesados.add(fila.id);
    } else if (fila.grupo === "alex" || fila.grupo === "atascada") {
      problemasDesdeBloqueadas.push(fila);
      idsProcesados.add(fila.id);
    }
  }

  // Process colasVivas for unresolved tasks with specific states
  const problemasDesdeColas: FilaMedidor[] = [];
  const estadoRegex = /^(rechazada|fallo.*|sin_cambios|interrumpida)$/i;

  for (const tarea of colasVivas) {
    if (!estadoRegex.test(tarea.estado)) continue;
    // Check if we already have this id (to avoid duplicates)
    if (idsProcesados.has(tarea.id)) continue;
    idsProcesados.add(tarea.id);

    // Convert FilaContable to FilaMedidor with minimal fields
    const filaMedidor: FilaMedidor = {
      id: tarea.id,
      titulo: tarea.id, // fallback to id if we don't have a title
      estado: tarea.estado,
      porque: `Estado en cola viva: ${tarea.estado}`,
      acciones: [],
      historica: false,
      // grupo is left undefined as it's not classified by bloqueadas.ts
    };
    problemasDesdeColas.push(filaMedidor);
  }

  // Combine problemas
  const problemas = [...problemasDesdeBloqueadas, ...problemasDesdeColas];

  // Compute resumen
  const valor = problemas.length;
  const enCadenaCount = enCadena.length;
  const pastilla = enCadenaCount > 0 ? `${enCadenaCount} en cadena · ábrelo para ver por qué` : "ábrelo para ver por qué";
  const texto = `${problemas.length} problemas, ${enCadenaCount} en cadena`;

  return {
    problemas,
    enCadena,
    resumen: {
      valor,
      enCadena: enCadenaCount,
      pastilla,
      texto,
    },
  };
}
// Procesos prestados: resumen de préstamos de recursos entre neuronas.
// Módulo puro. Contrato: architecture/apps-en-la-malla.md §4.

import { type ProcesoActivo } from "./procesos";

export interface PrestamoRecurso {
  quien: string;
  que: string;
  desde: number;
  consumo: number | null; // null si no se mide
}

export interface ResumenPrestamos {
  filas: PrestamoRecurso[];
  totalConsumo: number;
  totalSesiones: number;
}

export function resumenPrestamos(
  prestamosDados: PrestamoRecurso[],
  prestamosTomados: PrestamoRecurso[],
  ahora: number
): ResumenPrestamos {
  // Combinar y ordenar cronológicamente
  const filas = [...prestamosDados, ...prestamosTomados].sort((a, b) => b.desde - a.desde);

  const totalConsumo = filas.reduce((sum, p) => sum + (p.consumo ?? 0), 0);

  return {
    filas,
    totalConsumo,
    totalSesiones: filas.length,
  };
}

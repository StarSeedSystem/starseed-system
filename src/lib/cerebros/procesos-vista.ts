// Vista del pilar «Procesos activos»: filtros por tipo con cuentas reales,
// estado en palabras y parseo del id de una ventana en segundo plano.
// Módulo puro, sin red ni disco. Contrato: architecture/cerebros-fusion-telepatia.md §7.

import { ETIQUETA_TIPO, type EstadoProceso, type ProcesoActivo, type TipoProceso } from "./procesos";

/** Estado del proceso dichas en palabras para la interfaz. */
export const ETIQUETA_ESTADO: Record<EstadoProceso, string> = {
  "en-marcha": "en marcha",
  esperando: "esperando",
  pausado: "pausado",
  fallando: "fallando",
};

/** Un filtro pulsable del panel: tipo, etiqueta y cuántos procesos reales hay. */
export interface CuentaTipo {
  tipo: TipoProceso;
  etiqueta: string;
  cuenta: number;
}

/** Cuentas reales por tipo (ETIQUETA_TIPO), en su orden, respetando los tipos
 * visibles de las preferencias: lista vacía = los 9 tipos; con lista, solo las
 * claves conocidas. Un tipo sin procesos reales no enseña filtro. */
export function cuentasPorTipo(
  procesos: ProcesoActivo[],
  preferidos: TipoProceso[],
): CuentaTipo[] {
  const orden = Object.keys(ETIQUETA_TIPO) as TipoProceso[];
  const visibles = new Set((preferidos.length > 0 ? preferidos : orden).filter((t) => t in ETIQUETA_TIPO));
  const cuenta = new Map<TipoProceso, number>();
  for (const p of procesos) {
    if (visibles.has(p.tipo)) cuenta.set(p.tipo, (cuenta.get(p.tipo) ?? 0) + 1);
  }
  return orden
    .filter((t) => (cuenta.get(t) ?? 0) > 0)
    .map((t) => ({ tipo: t, etiqueta: ETIQUETA_TIPO[t], cuenta: cuenta.get(t) ?? 0 }));
}

/** La lista del panel reducida a los tipos de filtro activos ([] = todos). */
export function procesosSeleccionados(
  procesos: ProcesoActivo[],
  activos: TipoProceso[],
): ProcesoActivo[] {
  if (activos.length === 0) return procesos;
  const presentes = new Set(activos);
  return procesos.filter((p) => presentes.has(p.tipo));
}

/** Del id `ventana:<escritorio>:<ventana>` saca sus dos partes; null si el id
 * no es de ventana. El id de la ventana puede a su vez contener «:». */
export function partesVentana(
  id: string,
): { desktopId: string; winId: string } | null {
  const prefijo = "ventana:";
  if (!id.startsWith(prefijo)) return null;
  const resto = id.slice(prefijo.length);
  const corte = resto.indexOf(":");
  if (corte <= 0 || corte === resto.length - 1) return null;
  return { desktopId: resto.slice(0, corte), winId: resto.slice(corte + 1) };
}

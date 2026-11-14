/**
 * capas — las capas conmutables del Mapa, su escala de color y su leyenda (MAP1114B).
 * La leyenda y el pintado salen de las MISMAS tablas: no pueden discrepar.
 * Solo se pinta lo medido; sin dato = gris / contorno hueco.
 * Puro: sin React, sin red, sin `node:*`.
 */

import { ANTENNA_COLOR, ANTENNA_LABEL, type AntennaKind } from "@/ai/astraura/mesh/signals";

export type CapaId = "senal" | "conciencia" | "antenas" | "capacidades" | "publico";

export interface CapaDef {
  id: CapaId;
  etiqueta: string;
  descripcion: string;
  /** Fase del contrato en que se completa; las de fase 2 aún no se activan. */
  fase: 1 | 2;
}

export const CAPAS_MAPA: readonly CapaDef[] = [
  { id: "senal", etiqueta: "Señal", descripcion: "Calidad medida del enlace con cada neurona", fase: 1 },
  { id: "conciencia", etiqueta: "Capas de conciencia", descripcion: "Qué capas de Astraura anuncia cada neurona", fase: 1 },
  { id: "antenas", etiqueta: "Antenas y medios", descripcion: "Qué antenas y medios tiene cada neurona", fase: 1 },
  { id: "capacidades", etiqueta: "Capacidades", descripcion: "Qué ofrece cada punto", fase: 2 },
  { id: "publico", etiqueta: "Público / privado", descripcion: "Qué es público y qué es de tu cuenta", fase: 2 },
];

export const CAPA_POR_DEFECTO: CapaId = "senal";

export function capaDisponible(id: CapaId): boolean {
  return CAPAS_MAPA.find((c) => c.id === id)?.fase === 1;
}

export const COLOR_DESCONOCIDO = "#64748b";

/** Calidad 0..1 → rojo (mala) → ámbar → verde (buena). `null` = sin métrica = gris. */
export function colorCalidad(q: number | null | undefined): string {
  if (typeof q !== "number" || !Number.isFinite(q)) return COLOR_DESCONOCIDO;
  if (q < 0.34) return "#f87171";
  if (q < 0.67) return "#fbbf24";
  return "#34d399";
}

export const TRAMOS_CALIDAD: readonly { etiqueta: string; color: string }[] = [
  { etiqueta: "Mala", color: "#f87171" },
  { etiqueta: "Regular", color: "#fbbf24" },
  { etiqueta: "Buena", color: "#34d399" },
];

export type CapaConcienciaId = "local" | "mesh" | "nube" | "colectiva";

export const COLOR_CONCIENCIA: Record<CapaConcienciaId, string> = {
  local: "#34d399",
  mesh: "#38bdf8",
  nube: "#a78bfa",
  colectiva: "#f472b6",
};

export const ETIQUETA_CONCIENCIA: Record<CapaConcienciaId, string> = {
  local: "Local",
  mesh: "Malla",
  nube: "Nube",
  colectiva: "Colectiva",
};

export const ORDEN_CONCIENCIA: readonly CapaConcienciaId[] = ["local", "mesh", "nube", "colectiva"];

/** Antenas que el Mapa distingue en la fase 1, con los mismos colores y nombres del radar. */
export const ANTENAS_MAPA: readonly AntennaKind[] = ["ip", "account", "lora", "ble", "serial"];

export interface ItemLeyenda {
  etiqueta: string;
  color: string;
  /** Contorno hueco = sin dato. */
  hueco?: boolean;
}

export function leyendaDe(capa: CapaId): ItemLeyenda[] {
  switch (capa) {
    case "senal":
      return [...TRAMOS_CALIDAD, { etiqueta: "Sin medir", color: COLOR_DESCONOCIDO, hueco: true }];
    case "conciencia":
      return [
        ...ORDEN_CONCIENCIA.map((c) => ({ etiqueta: ETIQUETA_CONCIENCIA[c], color: COLOR_CONCIENCIA[c] })),
        { etiqueta: "Sin anunciar", color: COLOR_DESCONOCIDO, hueco: true },
      ];
    case "antenas":
      return [
        ...ANTENAS_MAPA.map((a) => ({ etiqueta: ANTENNA_LABEL[a], color: ANTENNA_COLOR[a] })),
        { etiqueta: "Sin medir", color: COLOR_DESCONOCIDO, hueco: true },
      ];
    default:
      return [];
  }
}

export function normalizarCapaConciencia(c: string): CapaConcienciaId | null {
  const id = c.startsWith("capa:") ? c.slice(5) : c;
  return id === "local" || id === "mesh" || id === "nube" || id === "colectiva" ? id : null;
}

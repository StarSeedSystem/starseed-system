// src/lib/network/culture-discovery.ts
// Utilidades PURAS de la fila de descubrimiento de Cultura. El momento "ahora"
// entra SIEMPRE por parámetro (en ms) para que la fecha relativa se pueda
// probar sin reloj real y sin falsificar el calendario.

import { realEventsOnly, type OsEvent } from "@/lib/os-social";

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Fecha relativa en español entre el momento `ahoraMs` y el evento `eventoMs`
 * (ambos en milisegundos desde época). Compara días naturales en la zona
 * horaria local del usuario y redondea para absorber cambios de horario.
 */
export function fechaRelativaEs(ahoraMs: number, eventoMs: number): string {
  const ahora = new Date(ahoraMs);
  const evento = new Date(eventoMs);
  const inicioAhora = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()));
  const inicioEvento = new Date(Date.UTC(evento.getUTCFullYear(), evento.getUTCMonth(), evento.getUTCDate()));
  const dif = Math.round((inicioEvento.getTime() - inicioAhora.getTime()) / DIA_MS);

  switch (dif) {
    case 0:
      return "hoy";
    case 1:
      return "mañana";
    case 2:
      return "pasado mañana";
    default:
      return dif > 2 ? `en ${dif} días` : `hace ${Math.abs(dif)} días`;
  }
}

/**
 * Primer evento REAL y futura haber del listado, o `null` si no queda ninguno
 * por venir. Ordenado por fecha: "lo más inmediato" que exige la fila.
 */
export function proximoEvento(eventos: OsEvent[], ahoraMs: number): OsEvent | null {
  const futuros = realEventsOnly(eventos)
    .filter((e): e is OsEvent & { startsAt: string } => typeof e.startsAt === "string" && new Date(e.startsAt).getTime() >= ahoraMs)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  return futuros[0] ?? null;
}

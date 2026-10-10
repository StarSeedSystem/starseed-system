/**
 * fichas-base — las piezas mínimas de una ficha: un dato con su fuente, «no medido» con su motivo
 * y «hace N min». Aparte para que `enlaces`, `aparatos` y `fichas` las compartan sin ciclos.
 * Puro: sin React, sin red, sin `node:*`.
 */

import type { Dato, EstadoDato } from "./tipos-vivo";

export function dato(etiqueta: string, valor: string, fuente: string, estado: EstadoDato = "medido", nota?: string): Dato {
  return nota ? { etiqueta, valor, fuente, estado, nota } : { etiqueta, valor, fuente, estado };
}

/** Lo que el instrumento no dio: se dice «no medido» y por qué. */
export function noMedido(etiqueta: string, fuente: string, motivo: string): Dato {
  return dato(etiqueta, "no medido", fuente, "no-medido", motivo);
}

/** «hace 40 s», «hace 3 min», «hace 2 h», «hace 4 días»; sin dato → «sin dato». */
export function haceTexto(at: number | null | undefined, ahora: number): string {
  if (at == null || !Number.isFinite(at) || at <= 0) return "sin dato";
  const s = Math.max(0, Math.round((ahora - at) / 1000));
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}

export function porcentaje(q: number | null): string {
  return q == null ? "no medible" : `${Math.round(q * 100)} / 100`;
}

export function bytesTexto(b: number | null | undefined): string {
  if (b == null) return "sin dato";
  return b >= 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${(b / 1024).toFixed(1)} KB`;
}

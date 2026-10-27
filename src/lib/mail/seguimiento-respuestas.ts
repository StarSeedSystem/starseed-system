/**
 * Seguimiento de respuestas («Reply Zero» propio · INV1025I).
 * Módulo puro: el reloj entra inyectado y nada se envía.
 */
import type { Correo } from "./inteligente";

export interface OpcionesSeguimiento {
  /** Horas sin responder a un mensaje ajeno antes de salir en la cola. */
  horasPorResponder?: number;
  /** Días desde mi último mensaje antes de darlo por esperando. */
  diasEsperando?: number;
}

export interface ResumenSeguimiento {
  porResponder: number;
  esperando: number;
  resuelto: number;
  total: number;
}

function msDe(v: Date | number): number {
  return typeof v === "number" ? v : v.getTime();
}

/**
 * `por-responder`: el último mensaje es de otro y pasaron más de N horas.
 * `esperando`: el último es mío y pasaron más de D días.
 * `resuelto`: nada pendiente según los umbrales (o hilo vacío).
 */
export function clasificarHilo(
  hilos: readonly Correo[],
  yo: string,
  ahora: Date | number,
  opciones: OpcionesSeguimiento = {},
): "por-responder" | "esperando" | "resuelto" {
  if (!Array.isArray(hilos) || hilos.length === 0) return "resuelto";
  const ultimo = hilos[hilos.length - 1];
  const hora = Date.parse(ultimo.fecha);
  if (!Number.isFinite(hora)) return "resuelto";
  const horas = Math.max(0, msDe(ahora) - hora) / 36e5;
  if (ultimo.remitente === yo) {
    return horas / 24 >= (opciones.diasEsperando ?? 14) ? "esperando" : "resuelto";
  }
  return horas >= (opciones.horasPorResponder ?? 24) ? "por-responder" : "resuelto";
}

/** Cuenta los tres estados de una bandeja para la cola y el widget. */
export function resumenSeguimiento(
  hilos: readonly (readonly Correo[])[],
  yo: string,
  ahora: Date | number,
  opciones: OpcionesSeguimiento = {},
): ResumenSeguimiento {
  const lista = Array.isArray(hilos) ? hilos : [];
  const res: ResumenSeguimiento = { porResponder: 0, esperando: 0, resuelto: 0, total: lista.length };
  for (const h of lista) {
    const estado = clasificarHilo(h, yo, ahora, opciones);
    if (estado === "por-responder") res.porResponder += 1;
    else if (estado === "esperando") res.esperando += 1;
    else res.resuelto += 1;
  }
  return res;
}

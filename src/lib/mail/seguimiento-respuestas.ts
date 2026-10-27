/* ═══════════════════════════════════════════════════════════════════════════
   StarSeed OS · Seguimiento de respuestas (Reply Zero propio) — módulo puro
   Reloj inyectado (`ahora: Date`). No importa `os-mail.ts`. Ninguna regla envía.
   ═══════════════════════════════════════════════════════════════════════════ */

export type EstadoSeguimiento = "por-responder" | "esperando" | "resuelto";

export interface ConfigSeguimiento {
  horasEsperarRespuesta?: number; // N horas para «por-responder» (por defecto 24)
  diasEsperando?: number;         // D días para «esperando» (por defecto 14)
}

/* Tipo mínimo local para no importar `os-mail.ts`. */
export interface HiloLite {
  id: string;
  ultimoMensajeDe?: string; // quién envió el último mensaje
  miId?: string;            // id del usuario actual (inyectado, no leído de DB)
  creadoEn?: string | Date;
  ultimoMensajeEn?: string | Date;
  resuelto?: boolean;       // si está marcado como resuelto explícitamente
}

/* Esqueleto; se completa en ediciones sucesivas. */

function horasDesde(fecha: string | Date | undefined, referencia: Date): number {
  if (!fecha) return 0;
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  return (referencia.getTime() - d.getTime()) / (1000 * 60 * 60);
}

function diasDesde(fecha: string | Date | undefined, referencia: Date): number {
  return horasDesde(fecha, referencia) / 24;
}

export function clasificarHilo(
  hilo: HiloLite,
  yo: string,
  ahora: Date,
  cfg: ConfigSeguimiento = {},
): EstadoSeguimiento {
  const horasRespuesta = cfg.horasEsperarRespuesta ?? 24;
  const diasEsperando = cfg.diasEsperando ?? 14;

  if (hilo.resuelto === true) return "resuelto";

  const ultimoDe = hilo.ultimoMensajeDe ?? "";
  const ultimoEn = hilo.ultimoMensajeEn ?? hilo.creadoEn;

  if (ultimoDe && ultimoDe !== yo) {
    const horas = horasDesde(ultimoEn, ahora);
    if (horas > horasRespuesta) return "por-responder";
    return "resuelto";
  }

  if (ultimoDe === yo) {
    const dias = diasDesde(ultimoEn, ahora);
    if (dias > diasEsperando) return "esperando";
  }

  return "resuelto";
}

export function resumenSeguimiento(
  hilos: HiloLite[],
  yo: string,
  ahora: Date,
  cfg: ConfigSeguimiento = {},
): { porResponder: number; esperando: number; resuelto: number } {
  let porResponder = 0;
  let esperando = 0;
  let resuelto = 0;
  for (const h of hilos) {
    const estado = clasificarHilo(h, yo, ahora, cfg);
    if (estado === "por-responder") porResponder++;
    else if (estado === "esperando") esperando++;
    else resuelto++;
  }
  return { porResponder, esperando, resuelto };
}

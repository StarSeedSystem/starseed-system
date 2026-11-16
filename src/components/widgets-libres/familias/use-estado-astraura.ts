/"use client";

import { type EstadoAsistente } from "@/lib/widgets/astraura/estado-forma";

export interface AuroraStateSnapshot {
  supported?: boolean;
  enabled?: boolean;
  listening?: boolean;
  speaking?: boolean;
  actionStatus?: string;
  error?: boolean;
}

export interface PuenteEstado {
  speaking?: boolean;
  listening?: boolean;
  actionStatus?: string;
  error?: boolean;
}

export function snapshotAPuenteEstado(
  s: AuroraStateSnapshot | null
): PuenteEstado | null {
  if (!s) return null;
  const accionStatus = s.actionStatus ?? "";
  const tieneError =
    s.error === true ||
    accionStatus.toLowerCase().includes("error al procesar") ||
    accionStatus.toLowerCase().includes("error") ||
    accionStatus.toLowerCase().includes("fall") ||
    accionStatus.toLowerCase().includes("fail");
  return {
    speaking: s.speaking,
    listening: s.listening,
    actionStatus: accionStatus,
    error: tieneError,
  };
}

export function derivarEstado(
  s: PuenteEstado | null,
  ultimaMs: number | null,
  ahoraMs: number
): EstadoAsistente {
  if (s?.error) return "error";
  if (s?.speaking) return "hablando";
  if (s?.listening) return "escuchando";
  if (s?.actionStatus && /pens|procesa|think/i.test(s.actionStatus)) return "pensando";
  if (ultimaMs !== null && ahoraMs - ultimaMs < 60_000) return "hablando";
  return "calma";
}

export function estadoVozDelSnapshot(
  s: AuroraStateSnapshot | null
): { estado: EstadoAsistente; voz: boolean } {
  const ahora = Date.now();
  const puente = snapshotAPuenteEstado(s);
  return {
    estado: derivarEstado(puente, null, ahora),
    voz: !!(s?.supported && s?.enabled),
  };
}

export type EstadoResultado = {
  estado: EstadoAsistente;
  voz: boolean;
  escuchar: () => void;
  callar: () => void;
};

export function crearCallbacks(
  start?: () => void,
  stop?: () => void
): { escuchar: () => void; callar: () => void } {
  return {
    escuchar: () => {
      try {
        start?.();
      } catch {
        /* sin voz */
      }
    },
    callar: () => {
      try {
        stop?.();
      } catch {
        /* sin voz */
      }
    },
  };
}
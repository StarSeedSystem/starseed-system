/**
 * Veredicto WebSocket vs SSE con datos reales de `os_live_metrics` (DR1114-1)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `registrarMetrica` ya apunta el viaje ida y vuelta de cada evento por canal
 * (websocket = Supabase Realtime, sse = ntfy/avisos, http = sondeo). Este módulo
 * lee esas estadísticas y contesta UNA pregunta: ¿gana WebSocket con ventaja
 * suficiente para migrar `sendAuroraTurn` y las notificaciones especiales?
 *
 * Regla: se juzga por la MEDIANA (robusta ante colas de red) y exige un mínimo
 * de eventos por canal y una ventaja mínima en ms; sin datos suficientes no hay
 * veredicto (ganador `null`) — no se migra por falta de prueba.
 */

import {
  cargarMetricasLatencia,
  type CanalLatencia,
  type TipoMetrica,
  type VistaLatenciaMetrics,
} from "./metrics";

export type { CanalLatencia, TipoMetrica, VistaLatenciaMetrics };

export interface VeredictoCanal {
  /** Estadística de cada canal, si existe en la vista. */
  websocket: VistaLatenciaMetrics | null;
  sse: VistaLatenciaMetrics | null;
  /** Canal más rápido según la mediana; `null` si faltan datos suficientes. */
  ganador: CanalLatencia | null;
  /** mediana(sse) − mediana(websocket): positiva = WebSocket más rápido. */
  diferenciaMs: number | null;
  /** ¿Gana WebSocket con ventaja suficiente como para migrar el transporte? */
  migrar: boolean;
  /** Por qué, en español, listo para el informe de la ola. */
  motivo: string;
}

export interface OpcionesComparacion {
  /** Mínimo de eventos por canal para fiarse de la mediana. */
  minEventos?: number;
  /** Ventaja mínima de WebSocket en ms para justificar la migración. */
  ventajaMinimaMs?: number;
  /** Qué tipo de métrica se compara (por defecto `latency`). */
  tipo?: TipoMetrica;
}

export const MIN_EVENTOS_DEFECTO = 20;
export const VENTAJA_MINIMA_DEFECTO_MS = 50;

const sinDatos = (websocket: VistaLatenciaMetrics | null, sse: VistaLatenciaMetrics | null, motivo: string): VeredictoCanal => ({
  websocket,
  sse,
  ganador: null,
  diferenciaMs: null,
  migrar: false,
  motivo,
});

/** Puro: compara las estadísticas ya cargadas y emite el veredicto. Nunca lanza. */
export function decidirMigracion(
  stats: VistaLatenciaMetrics[],
  opciones?: OpcionesComparacion,
): VeredictoCanal {
  const minEventos = Math.max(1, opciones?.minEventos ?? MIN_EVENTOS_DEFECTO);
  const ventajaMinimaMs = Math.max(0, opciones?.ventajaMinimaMs ?? VENTAJA_MINIMA_DEFECTO_MS);
  const tipo = opciones?.tipo ?? "latency";

  const porTipo = stats.filter((s) => s.tipo === tipo);
  const websocket = porTipo.find((s) => s.canal === "websocket") ?? null;
  const sse = porTipo.find((s) => s.canal === "sse") ?? null;

  if (!websocket || !sse) return sinDatos(websocket, sse, "Falta estadística de alguno de los dos canales en la última hora.");

  if (websocket.total_eventos < minEventos || sse.total_eventos < minEventos) {
    return sinDatos(websocket, sse, `Pocos eventos para fiarse de la mediana (mínimo ${minEventos} por canal).`);
  }

  const diferenciaMs = sse.latencia_mediana_ms - websocket.latencia_mediana_ms;
  const ganador: CanalLatencia = diferenciaMs >= 0 ? "websocket" : "sse";

  if (diferenciaMs < ventajaMinimaMs) {
    return {
      websocket,
      sse,
      ganador,
      diferenciaMs,
      migrar: false,
      motivo:
        ganador === "websocket"
          ? `WebSocket es más rápido pero la ventaja (${diferenciaMs} ms) no llega al mínimo de ${ventajaMinimaMs} ms.`
          : `SSE es más rápido (${Math.abs(diferenciaMs)} ms); no hay nada que migrar.`,
    };
  }

  return {
    websocket,
    sse,
    ganador: "websocket",
    diferenciaMs,
    migrar: true,
    motivo: `WebSocket gana por ${diferenciaMs} ms de mediana con ${websocket.total_eventos} eventos: migrar sendAuroraTurn y las notificaciones especiales.`,
  };
}

/** Carga las estadísticas de la vista y aplica `decidirMigracion` sobre ellas. */
export async function compararCanales(opciones?: OpcionesComparacion): Promise<VeredictoCanal> {
  const stats = await cargarMetricasLatencia();
  return decidirMigracion(Array.isArray(stats) ? stats : [], opciones);
}

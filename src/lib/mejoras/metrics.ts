/**
 * Métricas de latencia percibida en tiempo real (DR1114-1 · WebSocket vs SSE)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tabla `os_live_metrics` registra:
 *   · latencia: viaje de ida y vuelta en milisegundos
 *   · event_delay: tiempo entre evento y procesamiento
 *   · notification: latencia de notificaciones ( mensaje, llamada, etc.)
 *
 * Canales soportados:
 *   · websocket: Supabase Realtime (predisposición conectividad)
 *   · sse: Server-Sent Events (ntfy.sh, avisos-mensajes)
 *   · http: polling tradicional
 *
 * Uso: registrar un evento de latencia percibida real y comparar WebSocket vs SSE.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type CanalLatencia = "websocket" | "sse" | "http";

export type TipoMetrica = "latency" | "event_delay" | "notification";

export interface MetricaViva {
  id: number;
  t: Date;
  tipo: TipoMetrica;
  canal: CanalLatencia;
  origen: string;
  destino?: string | null;
  latenciaMs: number;
  datos?: Record<string, unknown>;
}

export interface VistaLatenciaMetrics {
  tipo: TipoMetrica;
  canal: CanalLatencia;
  total_eventos: number;
  latencia_promedio_ms: number;
  latencia_mediana_ms: number;
  latencia_maxima_ms: number;
  latencia_minima_ms: number;
  ultimo_evento: string;
}

let _cliente: SupabaseClient | null = null;

export function crearClienteMetricas(): SupabaseClient {
  if (!_cliente) {
    // Lazy import para evitar problemas de SSR
    _cliente = require("@/utils/supabase/client").createClient() as SupabaseClient;
  }
  return _cliente;
}

// Para tests: permitir inyección del cliente
export function _setClienteMetricas(cliente: SupabaseClient | null): void {
  _cliente = cliente;
}

// ── Registro de métrica (server-side) ───────────────────────────────────────

/**
 * Registra una métrica de latencia percibida en la tabla `os_live_metrics`.
 * Defensiva: si falla, no tumba al llamador (fire-and-forget).
 */
export async function registrarMetrica(
  tipo: TipoMetrica,
  canal: CanalLatencia,
  origen: string,
  latenciaMs: number,
  opciones?: {
    destino?: string;
    datos?: Record<string, unknown>;
  },
): Promise<{ ok: boolean; id?: number; error?: string }> {
  try {
    const cliente = _cliente ?? crearClienteMetricas();
    const { data, error } = await cliente.from("os_live_metrics").insert({
      tipo,
      canal,
      origen,
      destino: opciones?.destino ?? null,
      latenciaMs,
      datos: opciones?.datos ?? null,
    }).select("id").single();

    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data?.id ?? undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error desconocido" };
  }
}

// ── Lectura de métricas (client-side) ───────────────────────────────────────

/**
 * Carga estadísticas de latencia por canal y tipo para la última hora.
 * Usado para comparar WebSocket vs SSE.
 */
export async function cargarMetricasLatencia(
  desde?: Date,
  hasta?: Date,
): Promise<VistaLatenciaMetrics[]> {
  try {
    const cliente = _cliente ?? crearClienteMetricas();

    const { data, error } = await cliente
      .from("vista_latencia_metrics")
      .select("*")
      .order("tipo", { ascending: true })
      .order("canal", { ascending: true });

    if (error) {
      return [];
    }

    return (data as VistaLatenciaMetrics[]) ?? [];
  } catch {
    return [];
  }
}

/**
 * Carga métricas detalladas para un origen específico.
 */
export async function cargarMetricasPorOrigen(
  origen: string,
  horas: number = 1,
): Promise<MetricaViva[]> {
  try {
    const cliente = _cliente ?? crearClienteMetricas();
    const desde = new Date(Date.now() - horas * 60 * 60 * 1000);

    const { data, error } = await cliente
      .from("os_live_metrics")
      .select("*")
      .eq("origen", origen)
      .gte("t", desde.toISOString())
      .order("t", { ascending: false });

    if (error) {
      return [];
    }

    return (data as MetricaViva[]) ?? [];
  } catch {
    return [];
  }
}
/**
 * Instrumento de medición de latencia percibida (DR1114-1 · WebSocket vs SSE).
 *
 * Envuelve cualquier operación asíncrona, mide su duración real y la registra
 * en `os_live_metrics` (vía `registrarMetrica`) junto al canal que se quiera
 * comparar: "websocket" (Supabase Realtime), "sse" (ntfy.sh) o "http".
 *
 * Defensivo: el registro es fire-and-forget (si falla, no tumba al llamador)
 * y el error de la operación envuelta se registra y luego se re-lanza tal cual.
 *
 * Uso en la comparación en uso real:
 *   const res = await medirYRegistrar("notification", "sse", "aviso-mensajes", () => enviar(...));
 *   const res = await medirYRegistrar("notification", "websocket", "aviso-mensajes", () => enviar(...));
 * Al acumular muestras de ambos canales, `compararWebSocketSse` da el veredicto
 * y, si `migrar` es `true`, se mueven `sendAuroraTurn` y las notificaciones
 * especiales al canal ganador.
 */

import {
  registrarMetrica,
  type CanalLatencia,
  type TipoMetrica,
} from "./metrics";

export interface MedidaCanal<T> {
  resultado: T;
  latenciaMs: number;
  registro: { ok: boolean; id?: number; error?: string };
}

export interface OpcionesMedida {
  destino?: string;
  datos?: Record<string, unknown>;
  /** Reloj inyectable (ms); por defecto `Date.now()`. */
  ahora?: () => number;
}

export function medirYRegistrar<T>(
  tipo: TipoMetrica,
  canal: CanalLatencia,
  origen: string,
  operacion: () => Promise<T>,
  opciones?: OpcionesMedida,
): Promise<MedidaCanal<T>> {
  return medirImpl(tipo, canal, origen, operacion, opciones);
}

async function medirImpl<T>(
  tipo: TipoMetrica,
  canal: CanalLatencia,
  origen: string,
  operacion: () => Promise<T>,
  opciones?: OpcionesMedida,
): Promise<MedidaCanal<T>> {
  const ahora = opciones?.ahora ?? (() => Date.now());
  const inicio = ahora();
  let latenciaMs = 0;
  let registro: MedidaCanal<T>["registro"] = { ok: false, error: "sin registro" };
  try {
    const resultado = await operacion();
    latenciaMs = Math.max(0, Math.round(ahora() - inicio));
    registro = await registrarMetrica(tipo, canal, origen, latenciaMs, {
      destino: opciones?.destino,
      datos: opciones?.datos,
    });
    return { resultado, latenciaMs, registro };
  } catch (e) {
    latenciaMs = Math.max(0, Math.round(ahora() - inicio));
    registro = await registrarMetrica(tipo, canal, origen, latenciaMs, {
      destino: opciones?.destino,
      datos: { ...(opciones?.datos ?? {}), fallo: e instanceof Error ? e.message : "error" },
    });
    throw e;
  }
}

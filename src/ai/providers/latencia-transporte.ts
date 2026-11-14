/**
 * Latencia percibida por transporte (DR1114-1 · Dream 2026-11-14).
 *
 * El Dream pidió «comprobar en uso real si el WebSocket mejora la latencia»
 * antes de migrar `sendAuroraTurn` y las notificaciones especiales. El
 * transporte WS ya existe (`astraura-158-ws.ts`, con reserva a SSE), pero
 * NADIE mide de verdad la latencia percibida de cada vía, así que hoy la
 * decisión «si gana, migrar» se tomaría a ciegas.
 *
 * Este módulo mide y guarda, POR TURNO REAL del proveedor Astraura 1.58:
 *   · `transporte`  — «ws» (comprometido por WebSocket) o «sse» (reserva).
 *   · `ttftMs`      — latencia percibida: ms hasta el PRIMER token que llega
 *                     al consumidor (time-to-first-token). `null` si el turno
 *                     no llegó a emitir nada.
 *   · `ms`          — turno completo.
 *
 * Solo se registran turnos con consumidor en vivo (`onChunk`): sin streaming
 * no hay latencia percibida que comparar. Solo turnos con éxito: un fallo no
 * compite como transporte. La persistencia es local (localStorage, patrón del
 * registro de rutas del router) y el aviso va por CustomEvent: cero eventos
 * de red, cero presupuesto Supabase. Con el resumen y `ganaTransporte`,
 * cualquiera (panel o script) puede leer el veredicto sin rehacer la lógica.
 */

export type TransporteTurno = "ws" | "sse";

/** Una medición de un turno real. */
export interface MuestraLatencia {
  /** Fecha del turno (`Date.now`). */
  t: number;
  transporte: TransporteTurno;
  /** Ms hasta el primer token visible al consumidor; null si no emitió. */
  ttftMs: number | null;
  /** Ms del turno completo. */
  ms: number;
}

/** Resumen de un transporte sobre sus muestras acumuladas. */
export interface ResumenTransporte {
  transporte: TransporteTurno;
  turnos: number;
  /** Cuántos turnos emitieron primer token (los que entran en las medias). */
  conTtft: number;
  ttftMedioMs: number | null;
  ttftMedianoMs: number | null;
}

/** Detalle del aviso (CustomEvent) y valor de retorno del registro. */
export interface DetalleLatencia {
  muestra: MuestraLatencia;
  resumen: { ws: ResumenTransporte; sse: ResumenTransporte };
  veredicto: "ws" | "sse" | "sin-datos";
}

/** Almacén mínimo que se necesita (el `localStorage` real lo cumple). */
export interface AlmacenLatencia {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const LATENCIA_TRANSPORTE_KEY = "starseed.astraura.latencia-transporte.v1";
export const LATENCIA_TRANSPORTE_EVENT = "starseed:latencia-transporte";
/** Máximo de muestras guardadas (mismo techo que el registro de rutas). */
export const LATENCIA_TRANSPORTE_MAX = 40;

/** Mediana pura; null con la lista vacía. */
export function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
}

/** Resumen de las muestras de UN transporte (puro). */
export function resumenTransporte(muestras: MuestraLatencia[], transporte: TransporteTurno): ResumenTransporte {
  const delTurno = muestras.filter((x) => x.transporte === transporte);
  const conTtft = delTurno.map((x) => x.ttftMs).filter((v): v is number => v !== null);
  const medio = conTtft.length ? conTtft.reduce((a, b) => a + b, 0) / conTtft.length : null;
  const med = mediana(conTtft);
  return {
    transporte,
    turnos: delTurno.length,
    conTtft: conTtft.length,
    ttftMedioMs: medio === null ? null : Math.round(medio),
    ttftMedianoMs: med === null ? null : Math.round(med),
  };
}

/**
 * Veredicto del Dream: ¿el WebSocket gana DE VERDAD? Compara la mediana de
 * `ttftMs` de cada transporte; exige `minMuestras` en los dos (por defecto 5)
 * y un margen (`margenMs`, por defecto 100 ms): por menos que eso, empate —
 * migrar no compensaría la incomodidad de cambiar. Si no hay datos suficientes
 * (o medianas vacías), «sin-datos».
 */
export function ganaTransporte(
  ws: MuestraLatencia[],
  sse: MuestraLatencia[],
  opciones?: { minMuestras?: number; margenMs?: number },
): "ws" | "sse" | "sin-datos" {
  const min = Math.max(1, opciones?.minMuestras ?? 5);
  const margen = Math.max(0, opciones?.margenMs ?? 100);
  const wsCon = ws.filter((x) => x.ttftMs !== null);
  const sseCon = sse.filter((x) => x.ttftMs !== null);
  if (wsCon.length < min || sseCon.length < min) return "sin-datos";
  const wsMediana = mediana(wsCon.map((x) => x.ttftMs as number));
  const sseMediana = mediana(sseCon.map((x) => x.ttftMs as number));
  if (wsMediana === null || sseMediana === null) return "sin-datos";
  const diferencia = sseMediana - wsMediana;
  if (Math.abs(diferencia) < margen) return "sin-datos";
  return diferencia > 0 ? "ws" : "sse";
}

export interface DependenciasLatencia {
  almacen?: AlmacenLatencia;
  avisar?: (detalle: DetalleLatencia) => void;
}

/**
 * Registra una muestra: la añade al registro local (techo `LATENCIA_TRANSPORTE_MAX`),
 * calcula el resumen de los DOS transportes y avisa con el veredicto. SSR-safe:
 * sin almacén (servidor, o navegador sin localStorage) devuelve `null` y no
 * toca nada. Inyectable (`deps`) para pruebas sin `window`; por defecto usa el
 * `localStorage` real y avisa por `CustomEvent` en `window`, patrón del
 * registro de rutas del router. Nunca lanza: la medición nunca rompe un turno.
 */
export function registrarMuestraLatencia(m: MuestraLatencia, deps?: DependenciasLatencia): DetalleLatencia | null {
  try {
    const almacen = deps?.almacen ?? (typeof window !== "undefined" ? window.localStorage : null);
    if (!almacen) return null;
    const previas = leerMuestras(almacen);
    const log = [...previas, m].slice(-LATENCIA_TRANSPORTE_MAX);
    almacen.setItem(LATENCIA_TRANSPORTE_KEY, JSON.stringify(log));
    const detalle: DetalleLatencia = {
      muestra: m,
      resumen: {
        ws: resumenTransporte(log, "ws"),
        sse: resumenTransporte(log, "sse"),
      },
      veredicto: ganaTransporte(
        log.filter((x) => x.transporte === "ws"),
        log.filter((x) => x.transporte === "sse"),
      ),
    };
    if (deps?.avisar) deps.avisar(detalle);
    else if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent<DetalleLatencia>(LATENCIA_TRANSPORTE_EVENT, { detail: detalle }));
    }
    return detalle;
  } catch {
    return null;
  }
}

/** Lee el registro guardado; corrompido o vacío, []. */
export function leerMuestras(almacen: AlmacenLatencia): MuestraLatencia[] {
  try {
    const crudo = almacen.getItem(LATENCIA_TRANSPORTE_KEY);
    const p = crudo ? (JSON.parse(crudo) as unknown) : [];
    return Array.isArray(p) ? (p as MuestraLatencia[]) : [];
  } catch {
    return [];
  }
}

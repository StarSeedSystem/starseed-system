/**
 * relevo/ruta — coste de un camino y elección con histéresis (REL1111I · 2026-11-11).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Contrato: `architecture/red-sin-dependencias.md` §14.2. Módulo PURO.
 *
 * Métrica: milisegundos que tarda en cruzar un trozo de referencia (`BYTES_REFERENCIA`, el trozo de archivo por relevo)
 * cada tramo = ida y vuelta medida + tiempo de serialización a la capacidad medida; el camino suma sus tramos más un
 * coste fijo por relevo (`COSTE_RELEVO_MS`: la cola y el reenvío de la neurona de en medio). Sin medida se usa el valor de
 * diseño del carril (como `conectores/fichas.ts`): nada se inventa por encima de eso y la interfaz dice «sin medir».
 *
 * Reglas de elección (en este orden):
 *   1 · un carril DIRECTO con el destino gana siempre (con directo no se relevea: lo que funciona hoy no cambia);
 *   2 · se descartan los relevos vetados (dijeron que no, o no llegó el acuse por ellos hace poco);
 *   3 · si la ruta actual sigue siendo posible, solo se cambia por otra que cueste un `HISTERESIS` menos (25 %, como los
 *       carriles de Wi‑Fi de MLL1111C): dos relevos parecidos no se alternan con cada medida;
 *   4 · si la actual ya no es posible, la mejor que quede.
 * Nunca lanza.
 */

export const BYTES_REFERENCIA = 24 * 1024;
export const COSTE_RELEVO_MS = 25;
export const HISTERESIS = 0.25;

/** Valores de diseño por carril (sin medida). */
const DISENO: Record<string, { kbps: number; rttMs: number }> = {
  ble: { kbps: 150, rttMs: 90 },
  nativo: { kbps: 20_000, rttMs: 8 },
  local: { kbps: 20_000, rttMs: 10 },
  cuenta: { kbps: 5_000, rttMs: 60 },
};

export interface TramoMedido {
  carril: string;
  kbps: number | null;
  rttMs: number | null;
}

export function costeTramo(t: TramoMedido): number {
  const d = DISENO[t.carril] ?? { kbps: 500, rttMs: 100 };
  const kbps = typeof t.kbps === "number" && t.kbps > 0 ? t.kbps : d.kbps;
  const rtt = typeof t.rttMs === "number" && t.rttMs >= 0 ? t.rttMs : d.rttMs;
  return rtt + (BYTES_REFERENCIA * 8) / kbps;
}

export interface RutaCandidata {
  /** null = directo. */
  relevo: string | null;
  tramos: TramoMedido[];
}

export interface RutaElegida extends RutaCandidata {
  costeMs: number;
}

export function costeRuta(r: RutaCandidata): number {
  return r.tramos.reduce((s, t) => s + costeTramo(t), 0) + (r.relevo ? COSTE_RELEVO_MS : 0);
}

export type MotivoRuta = "directo" | "inicial" | "mejor" | "caida" | "vetada" | "se-mantiene" | "sin-ruta";

export interface DecisionRuta {
  ruta: RutaElegida | null;
  motivo: MotivoRuta;
  /** ¿Es distinta de la anterior? */
  cambia: boolean;
}

/**
 * Elige la ruta. `actual` es la que se usaba (o null); `vetados` son relevos que no se deben usar ahora.
 */
export function elegirRuta(candidatas: readonly RutaCandidata[], actual: { relevo: string | null } | null, vetados: ReadonlySet<string> = new Set()): DecisionRuta {
  const con = candidatas.map((c) => ({ ...c, costeMs: costeRuta(c) }));
  const directa = con.filter((c) => c.relevo === null).sort((a, b) => a.costeMs - b.costeMs)[0];
  if (directa) return { ruta: directa, motivo: actual && actual.relevo === null ? "se-mantiene" : "directo", cambia: !actual || actual.relevo !== null };
  const validas = con.filter((c) => c.relevo !== null && !vetados.has(c.relevo)).sort((a, b) => a.costeMs - b.costeMs || String(a.relevo).localeCompare(String(b.relevo)));
  const mejor = validas[0];
  if (!mejor) return { ruta: null, motivo: "sin-ruta", cambia: !!actual };
  if (!actual) return { ruta: mejor, motivo: "inicial", cambia: true };
  const sigue = validas.find((c) => c.relevo === actual.relevo);
  if (sigue) {
    if (mejor.relevo !== sigue.relevo && mejor.costeMs < sigue.costeMs * (1 - HISTERESIS)) return { ruta: mejor, motivo: "mejor", cambia: true };
    return { ruta: sigue, motivo: "se-mantiene", cambia: false };
  }
  const vetada = actual.relevo !== null && vetados.has(actual.relevo) && con.some((c) => c.relevo === actual.relevo);
  return { ruta: mejor, motivo: vetada ? "vetada" : "caida", cambia: true };
}

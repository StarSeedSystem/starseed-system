/**
 * StarSeed OS — ASTRAURA · CAPA DE VIABILIDAD LOCAL (Ola 302 · zAU2).
 * ============================================================================
 * La SALUD del backend 1.58 (`GET /api/starseed/health` → `{"status":"online"}`)
 * solo comprueba que el PROCESO responde. Medido en la Mac de Alex (8 GB de
 * RAM, 59 MB libres, 11,5 GB de swap): health «online» en 0,1 s mientras el
 * `POST /completion` tardaba MÁS DE 4 MINUTOS sin producir 32 tokens (llama-
 * server con `-t 2 -ub 24 -b 24`, obligatorio para no hacer segfault). El chat
 * se quedaba colgado esperando a un motor «sano» que no podía generar.
 *
 * Este módulo es la capa distinta que faltaba — VIABILIDAD ≠ salud:
 * ¿puede ESTA neurona, AHORA, generar a una velocidad usable? Recibe una
 * MEDIDA (tokens producidos, milisegundos tardados, RAM libre si se conoce) y
 * emite un veredicto HONESTO con las cifras, para que el router declare el
 * 1.58 local «no viable» y releeve en vez de colgar el turno.
 *
 * Módulo PURO (Adenda 63/153): sin red, sin `node:*`, sin `window`, sin I/O.
 * Apto para navegador y para `next build` (CLAUDE.md §«Publicar»). Todas las
 * funciones son TOTALES y NUNCA lanzan: datos sucios se sanean, no explotan.
 * ============================================================================
 */

/* ────────────────────────── 1. Tipos ────────────────────────── */

export interface MedidaLocal {
  /** Tokens REALMENTE producidos por el motor local en la medición (0 si no salió ninguno). */
  tokens: number;
  /** Milisegundos que tardó la medición. */
  ms: number;
  /** MB de RAM libre de la neurona; `null` si no se pudo medir (null = NO bloquea). */
  memoriaLibreMb: number | null;
}

export interface Veredicto {
  /** ¿Puede esta neurona usar el motor local AHORA a velocidad usable? */
  viable: boolean;
  /** Explicación en español, concreta y HONESTA, con la cifra medida. */
  motivo: string;
  /** Tokens/s medidos; `null` si la medición no permite calcularlo (ms ≤ 0). */
  tokensPorSegundo: number | null;
  /** Minutos de enfriamiento del motor local antes de volver a probarlo. */
  enfriarMinutos: number;
}

/* ────────────────────────── 2. Constantes ────────────────────────── */

export const TPS_MINIMO = 2;
export const MEMORIA_MINIMA_MB = 300;

/* ────────────────────────── 3. Viabilidad ────────────────────────── */

/**
 * ¿Puede ESTA neurona, AHORA, generar a una velocidad usable?
 *
 * No viable si los tok/s medidos quedan por debajo de `TPS_MINIMO` o si la RAM
 * libre (cuando consta) queda por debajo de `MEMORIA_MINIMA_MB`. El motivo
 * siempre incluye la CIFRA MEDIDA — veredicto honesto, sin eufemismos — y
 * `enfriarMinutos` es 10 (no viable) o 0 (viable). Función TOTAL: ms ≤ 0 o
 * tokens negativos no la rompen, se sanean.
 */
export function evaluarViabilidad(m: MedidaLocal): Veredicto {
  const tokens = Number.isFinite(m?.tokens) && m.tokens > 0 ? m.tokens : 0;
  const ms = Number.isFinite(m?.ms) && m.ms > 0 ? m.ms : 0;
  const memoria = Number.isFinite(m?.memoriaLibreMb) ? m.memoriaLibreMb : null;

  const tps = ms > 0 ? (tokens * 1000) / ms : null;

  // RAM constatada por debajo del mínimo: el motor local no cabe, aunque los
  // tok/s de una medición vieja digan lo contrario (medida de 32 tokens en
  // 4 min = 0,13 tok/s, pero el motivo debe nombrar la causa raíz).
  if (memoria !== null && memoria < MEMORIA_MINIMA_MB) {
    return {
      viable: false,
      motivo: `quedan ${memoria} MB de RAM libre: el motor local no cabe`,
      tokensPorSegundo: tps,
      enfriarMinutos: 10,
    };
  }

  if (tps === null) {
    return {
      viable: false,
      motivo: "la medición no permite calcular tokens/s: esta neurona no puede con el motor local ahora mismo",
      tokensPorSegundo: null,
      enfriarMinutos: 10,
    };
  }

  if (tps < TPS_MINIMO) {
    const tpsTxt = Math.round(tps * 10) / 10;
    return {
      viable: false,
      motivo: `el motor local va a ${tpsTxt} tokens/s: esta neurona no puede con él ahora mismo`,
      tokensPorSegundo: tps,
      enfriarMinutos: 10,
    };
  }

  const tpsTxt = Math.round(tps * 10) / 10;
  return {
    viable: true,
    motivo: `el motor local va a ${tpsTxt} tokens/s y quedan ${memoria === null ? "RAM desconocida" : `${memoria} MB`} libre: velocidad usable`,
    tokensPorSegundo: tps,
    enfriarMinutos: 0,
  };
}

/* ────────────────────────── 4. Presupuesto del primer token ────────────────────────── */

/**
 * Milisegundos que se conceden al motor local para emitir su PRIMER token
 * antes de rendirse y relevar a otra fuente. Con memoria holgada (≥ 400 MB)
 * son 12 000 ms; si la RAM libre baja de 400 MB el presupuesto se recorta a
 * 6 000 ms (la máquina está paginando: no esperar 4 minutos a lo inevitable).
 * Siempre se devuelve un valor dentro de [3000, 20000] — un `memoriaLibreMb`
 * sucio (null, NaN) se trata como memoria holgada, nunca bloquea.
 */
export function presupuestoPrimerToken(m: { memoriaLibreMb: number | null }): number {
  const memoria = Number.isFinite(m?.memoriaLibreMb) ? m.memoriaLibreMb : null;

  const presupuesto = memoria !== null && memoria < 400 ? 6000 : 12000;

  return Math.min(20000, Math.max(3000, Math.round(presupuesto)));
}

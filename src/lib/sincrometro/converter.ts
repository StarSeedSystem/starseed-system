// src/lib/sincrometro/converter.ts
/**
 * Conversores deterministas entre fechas ISO y los tres modos del sincrómetro.
 *
 * Todos reciben/retornan información derivada — la fuente de verdad sigue
 * siendo la fecha ISO `YYYY-MM-DD` almacenada en `CalendarItem.date`.
 */

import {
  ZODIAC_RANGES,
  LUNAR_PHASES,
  KNOWN_NEW_MOON_MS,
  SYNODIC_MONTH_DAYS,
  type ZodiacRange,
  type LunarPhaseMeta,
  type ZodiacSign,
  type LunarPhase,
} from './types';

// ── Helpers de fecha ────────────────────────────────────────────────────────

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── Modo astrológico ────────────────────────────────────────────────────────

/**
 * Devuelve el rango zodiacal al que pertenece la fecha dada.
 * Usa las fechas canónicas de astrología tropical occidental.
 */
export function getZodiacForDate(date: Date): ZodiacRange {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const sorted = [...ZODIAC_RANGES].sort((a, b) => {
    if (a.startMonth !== b.startMonth) return a.startMonth - b.startMonth;
    return a.startDay - b.startDay;
  });
  // Find the latest range whose start ≤ (month, day). Wrap at end of year.
  let match: ZodiacRange = sorted[sorted.length - 1];
  for (const range of sorted) {
    if (range.startMonth < month || (range.startMonth === month && range.startDay <= day)) {
      match = range;
    }
  }
  // Capricornio wraps year-end: if month is January and day < 20, it's Capricornio (Dec 22..Jan 19).
  if (month === 1 && day < 20) {
    return ZODIAC_RANGES.find(r => r.id === 'capricornio')!;
  }
  return match;
}

/** Devuelve el rango zodiacal al que pertenece la fecha ISO dada. */
export function getZodiacForISO(iso: string): ZodiacRange {
  return getZodiacForDate(parseISODate(iso));
}

/**
 * Construye una lista ordenada de los signos zodiacales con su fecha de
 * inicio para un año concreto, en orden cronológico (Capricornio diciembre).
 */
export function buildZodiacYear(year: number): {
  sign: ZodiacRange;
  startISO: string;
  endISO: string;
}[] {
  const sorted = [...ZODIAC_RANGES].sort((a, b) => {
    if (a.startMonth !== b.startMonth) return a.startMonth - b.startMonth;
    return a.startDay - b.startDay;
  });
  const ranges = sorted.map(s => {
    const start = new Date(year, s.startMonth - 1, s.startDay);
    return { sign: s, start };
  });
  return ranges.map((r, i) => {
    const next = ranges[(i + 1) % ranges.length];
    const endDate = new Date(
      i === ranges.length - 1 ? year + 1 : year,
      next.start.getMonth(),
      next.start.getDate() - 1
    );
    return {
      sign: r.sign,
      startISO: toISODate(r.start),
      endISO: toISODate(endDate),
    };
  });
}

// ── Modo lunar ──────────────────────────────────────────────────────────────

/** Calcula la fracción del ciclo sinódico (0..1) para una fecha dada. */
export function getLunarCyclePosition(date: Date): number {
  const elapsedMs = date.getTime() - KNOWN_NEW_MOON_MS;
  const elapsedDays = elapsedMs / 86_400_000;
  const phase = (elapsedDays % SYNODIC_MONTH_DAYS) / SYNODIC_MONTH_DAYS;
  return phase < 0 ? phase + 1 : phase;
}

/** Devuelve la metainformación de la fase lunar para una fecha dada. */
export function getLunarPhaseForDate(date: Date): LunarPhaseMeta {
  const pos = getLunarCyclePosition(date);
  let match: LunarPhaseMeta = LUNAR_PHASES[0];
  for (const phase of LUNAR_PHASES) {
    if (pos >= phase.start) match = phase;
  }
  return match;
}

export function getLunarPhaseForISO(iso: string): LunarPhaseMeta {
  return getLunarPhaseForDate(parseISODate(iso));
}

/**
 * Encuentra todas las lunas nuevas dentro de una ventana de fechas.
 * Útil para enumerar "meses lunares" en una rejilla.
 */
export function findNewMoonsInRange(startISO: string, endISO: string): string[] {
  const start = parseISODate(startISO);
  const end = parseISODate(endISO);
  const result: string[] = [];

  // Empezar desde la luna nueva conocida y avanzar
  let cycleStart = new Date(KNOWN_NEW_MOON_MS);
  while (cycleStart < end) {
    if (cycleStart >= start) result.push(toISODate(cycleStart));
    cycleStart = new Date(cycleStart.getTime() + SYNODIC_MONTH_DAYS * 86_400_000);
  }
  return result;
}

/**
 * Devuelve los inicios de cada una de las 8 fases dentro del mes lunar
 * que contiene la fecha de referencia.
 */
export function buildLunarMonth(referenceISO: string): {
  phase: LunarPhaseMeta;
  startISO: string;
  approxDay: number;
}[] {
  const ref = parseISODate(referenceISO);
  // Find the most recent new moon ≤ ref
  let lastNewMoon = new Date(KNOWN_NEW_MOON_MS);
  while (lastNewMoon.getTime() + SYNODIC_MONTH_DAYS * 86_400_000 < ref.getTime()) {
    lastNewMoon = new Date(lastNewMoon.getTime() + SYNODIC_MONTH_DAYS * 86_400_000);
  }
  return LUNAR_PHASES.map(phase => {
    const startMs = lastNewMoon.getTime() + phase.start * SYNODIC_MONTH_DAYS * 86_400_000;
    return {
      phase,
      startISO: toISODate(new Date(startMs)),
      approxDay: Math.round(phase.start * SYNODIC_MONTH_DAYS),
    };
  });
}

// ── Bucketing universal ─────────────────────────────────────────────────────

/**
 * Devuelve un "id de cubo" que identifica el segmento temporal de un día
 * según el modo activo. Útil para agrupar eventos en la vista.
 *
 *   gregoriano  → 'YYYY-MM' (mes calendario)
 *   astrologico → 'YYYY-{zodiac}' (signo zodiacal)
 *   lunar       → 'NEWMOON-YYYY-MM-DD' (fecha de la luna nueva más reciente)
 */
export function bucketForISO(iso: string, mode: 'gregoriano' | 'astrologico' | 'lunar'): string {
  const d = parseISODate(iso);
  if (mode === 'gregoriano') {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  if (mode === 'astrologico') {
    const z = getZodiacForDate(d);
    return `${d.getFullYear()}-${z.id}`;
  }
  // Lunar: bucket by the new moon that started the current cycle
  let lastNewMoon = new Date(KNOWN_NEW_MOON_MS);
  while (lastNewMoon.getTime() + SYNODIC_MONTH_DAYS * 86_400_000 < d.getTime()) {
    lastNewMoon = new Date(lastNewMoon.getTime() + SYNODIC_MONTH_DAYS * 86_400_000);
  }
  return `NEWMOON-${toISODate(lastNewMoon)}`;
}

export type { ZodiacSign, LunarPhase };

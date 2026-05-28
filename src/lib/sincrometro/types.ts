// src/lib/sincrometro/types.ts
/**
 * Sincrómetro — Sistema de coordenadas temporales múltiples para el SOSD.
 *
 * Un "sincrómetro" es un instrumento para medir el tiempo y la simultaneidad
 * entre ciclos cósmicos, biológicos y sociales. Reemplaza la idea reductiva
 * de "calendario" (que es solo un modo entre varios) por una capa que permite
 * al usuario navegar el tiempo usando el sistema de coordenadas que le hable:
 *
 *   - `gregoriano`  → Calendario convencional gregoriano (default).
 *   - `astrologico` → Ciclos de los signos zodiacales (Aries → Piscis).
 *   - `lunar`       → Fases lunares (Nueva → Creciente → Llena → Menguante).
 *
 * Invariante crítico: todos los eventos, recordatorios y alarmas se guardan
 * en una sola fuente de verdad indexada por fecha ISO (YYYY-MM-DD). Cada
 * modo es solo una VISTA distinta sobre los mismos datos. Cambiar de modo
 * NUNCA modifica los datos subyacentes — solo cómo se organizan visualmente.
 */

export type SincrometroMode = 'gregoriano' | 'astrologico' | 'lunar';

export interface SincrometroModeMeta {
  id: SincrometroMode;
  label: string;
  description: string;
  icon: string; // nombre de un icono de lucide-react
  glyph: string; // símbolo unicode para representación compacta
}

export const SINCROMETRO_MODES: SincrometroModeMeta[] = [
  {
    id: 'gregoriano',
    label: 'Convencional',
    description: 'Calendario gregoriano (días, semanas, meses).',
    icon: 'CalendarDays',
    glyph: '☀',
  },
  {
    id: 'astrologico',
    label: 'Astrológico',
    description: 'Ciclos de los doce signos zodiacales tropicales.',
    icon: 'Sparkles',
    glyph: '♈',
  },
  {
    id: 'lunar',
    label: 'Lunar',
    description: 'Fases de la Luna (Nueva, Creciente, Llena, Menguante).',
    icon: 'Moon',
    glyph: '☾',
  },
];

// ── Signos zodiacales ───────────────────────────────────────────────────────

export type ZodiacSign =
  | 'aries' | 'tauro' | 'geminis' | 'cancer'
  | 'leo' | 'virgo' | 'libra' | 'escorpio'
  | 'sagitario' | 'capricornio' | 'acuario' | 'piscis';

export interface ZodiacRange {
  id: ZodiacSign;
  label: string;
  glyph: string;
  element: 'fuego' | 'tierra' | 'aire' | 'agua';
  /** Día y mes de inicio (gregoriano). */
  startMonth: number; // 1-12
  startDay: number;   // 1-31
  /** Color base en hex sin #. */
  color: string;
}

/**
 * Fechas de los signos zodiacales en astrología tropical occidental.
 * Aproximación canónica (las fechas exactas varían ±1 día por año bisiesto).
 */
export const ZODIAC_RANGES: ZodiacRange[] = [
  { id: 'capricornio', label: 'Capricornio', glyph: '♑', element: 'tierra', startMonth: 12, startDay: 22, color: '94a3b8' },
  { id: 'acuario',     label: 'Acuario',     glyph: '♒', element: 'aire',   startMonth: 1,  startDay: 20, color: '38bdf8' },
  { id: 'piscis',      label: 'Piscis',      glyph: '♓', element: 'agua',   startMonth: 2,  startDay: 19, color: '8b5cf6' },
  { id: 'aries',       label: 'Aries',       glyph: '♈', element: 'fuego',  startMonth: 3,  startDay: 21, color: 'ef4444' },
  { id: 'tauro',       label: 'Tauro',       glyph: '♉', element: 'tierra', startMonth: 4,  startDay: 20, color: '10b981' },
  { id: 'geminis',     label: 'Géminis',     glyph: '♊', element: 'aire',   startMonth: 5,  startDay: 21, color: 'fbbf24' },
  { id: 'cancer',      label: 'Cáncer',      glyph: '♋', element: 'agua',   startMonth: 6,  startDay: 21, color: '60a5fa' },
  { id: 'leo',         label: 'Leo',         glyph: '♌', element: 'fuego',  startMonth: 7,  startDay: 23, color: 'f97316' },
  { id: 'virgo',       label: 'Virgo',       glyph: '♍', element: 'tierra', startMonth: 8,  startDay: 23, color: '84cc16' },
  { id: 'libra',       label: 'Libra',       glyph: '♎', element: 'aire',   startMonth: 9,  startDay: 23, color: 'ec4899' },
  { id: 'escorpio',    label: 'Escorpio',    glyph: '♏', element: 'agua',   startMonth: 10, startDay: 23, color: '7c3aed' },
  { id: 'sagitario',   label: 'Sagitario',   glyph: '♐', element: 'fuego',  startMonth: 11, startDay: 22, color: 'c084fc' },
];

// ── Fases lunares ───────────────────────────────────────────────────────────

export type LunarPhase =
  | 'nueva'
  | 'creciente_visible'   // primer cuarto creciente
  | 'gibosa_creciente'
  | 'llena'
  | 'gibosa_menguante'
  | 'menguante_visible'   // último cuarto menguante
  | 'balsamica'           // creciente cóncava previa a la nueva
  | 'creciente_cubierta'; // creciente convexa tras la nueva

export interface LunarPhaseMeta {
  id: LunarPhase;
  label: string;
  glyph: string;
  /** Fracción del ciclo donde inicia la fase [0..1). */
  start: number;
  color: string;
}

/**
 * Ocho fases lunares estandarizadas, en orden cronológico desde la luna nueva.
 * El ciclo sinódico real dura ~29.53 días.
 */
export const LUNAR_PHASES: LunarPhaseMeta[] = [
  { id: 'nueva',                label: 'Luna Nueva',          glyph: '🌑', start: 0.000, color: '0f172a' },
  { id: 'creciente_cubierta',   label: 'Creciente Cubierta',  glyph: '🌒', start: 0.063, color: '1e293b' },
  { id: 'creciente_visible',    label: 'Cuarto Creciente',    glyph: '🌓', start: 0.230, color: '475569' },
  { id: 'gibosa_creciente',     label: 'Gibosa Creciente',    glyph: '🌔', start: 0.355, color: '94a3b8' },
  { id: 'llena',                label: 'Luna Llena',          glyph: '🌕', start: 0.480, color: 'f8fafc' },
  { id: 'gibosa_menguante',     label: 'Gibosa Menguante',    glyph: '🌖', start: 0.605, color: 'cbd5e1' },
  { id: 'menguante_visible',    label: 'Cuarto Menguante',    glyph: '🌗', start: 0.730, color: '64748b' },
  { id: 'balsamica',            label: 'Balsámica',           glyph: '🌘', start: 0.855, color: '334155' },
];

export const SYNODIC_MONTH_DAYS = 29.530588;
/** Referencia: 6 enero 2000 18:14 UTC fue una luna nueva conocida. */
export const KNOWN_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14, 0);

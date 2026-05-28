// src/lib/sincrometro/horoscopes.ts
/**
 * Horóscopos multi-tradición: Occidental, Chino, Védico (Jyotish) y Maya (Tzolkin).
 *
 * Todos los cálculos son deterministas y no dependen de APIs externas para que
 * cada día del Sincrómetro pueda mostrar instantáneamente su perfil astrológico.
 *
 * Referencias canónicas:
 *   - Occidental: signos tropicales (ya en `types.ts`).
 *   - Chino: ciclo de 12 animales (rata→cerdo) + 5 elementos. Año lunar nuevo
 *     entre ene-feb; aquí usamos aproximación por año gregoriano.
 *   - Védico: signos siderales (rashi) con corrección de Ayanamsa (~24°).
 *     Cada signo dura 1 mes solar sideral.
 *   - Maya: Tzolkin de 260 días = 20 sellos × 13 tonos. Día base canónico:
 *     11 ago 3114 a.C. = 4 Ahau (inicio de la 5ª era).
 */

import { ZODIAC_RANGES, type ZodiacRange } from './types';
import { parseISODate, getZodiacForDate } from './converter';

// ── Horóscopo Occidental ────────────────────────────────────────────────

export interface WesternProfile {
  sign: ZodiacRange;
  /** Modalidad: cardinal, fijo, mutable. */
  modality: 'cardinal' | 'fijo' | 'mutable';
  /** Regente planetario tradicional. */
  ruler: string;
  /** Horóscopo del día. */
  reading: string;
}

const WESTERN_MODALITY: Record<string, WesternProfile['modality']> = {
  aries: 'cardinal', cancer: 'cardinal', libra: 'cardinal', capricornio: 'cardinal',
  tauro: 'fijo', leo: 'fijo', escorpio: 'fijo', acuario: 'fijo',
  geminis: 'mutable', virgo: 'mutable', sagitario: 'mutable', piscis: 'mutable',
};

const WESTERN_RULER: Record<string, string> = {
  aries: 'Marte', tauro: 'Venus', geminis: 'Mercurio', cancer: 'Luna',
  leo: 'Sol', virgo: 'Mercurio', libra: 'Venus', escorpio: 'Plutón',
  sagitario: 'Júpiter', capricornio: 'Saturno', acuario: 'Urano', piscis: 'Neptuno',
};

const WESTERN_READINGS: Record<string, string[]> = {
  aries:     ['Iniciativa fértil. Lanza una idea.', 'Tu acción inspira a otros hoy.', 'Coraje sin rigidez.'],
  tauro:     ['Cultiva la estabilidad.', 'Disfruta lo tangible.', 'Construye con paciencia.'],
  geminis:   ['Conversaciones reveladoras.', 'Aprende algo nuevo.', 'Conecta personas.'],
  cancer:    ['Honra tu hogar interior.', 'La empatía es tu fuerza.', 'Cierra ciclos emocionales.'],
  leo:       ['Brilla sin necesidad de aprobación.', 'Tu corazón guía la creación.', 'Generosidad creativa.'],
  virgo:     ['Refina los detalles.', 'Sirve desde la inteligencia.', 'Orden interno antes que externo.'],
  libra:     ['Equilibrio en las decisiones.', 'Belleza como brújula.', 'Diálogo justo.'],
  escorpio:  ['Profundiza, no te disperses.', 'Lo oculto se revela.', 'Transformación radical.'],
  sagitario: ['Expande tu visión.', 'Aventura con propósito.', 'Verdad sin dogma.'],
  capricornio:['Construye legado, no fachada.', 'Madurez con humor.', 'Estructura libera.'],
  acuario:   ['Innova desde la conciencia colectiva.', 'Independencia en comunidad.', 'Visión ciberdélica.'],
  piscis:    ['Confía en lo no visible.', 'La compasión es radical.', 'Sueña con anclas.'],
};

export function getWesternProfile(iso: string): WesternProfile {
  const sign = getZodiacForDate(parseISODate(iso));
  const dayOfYear = (parseISODate(iso).getTime() / 86_400_000) | 0;
  const readings = WESTERN_READINGS[sign.id] ?? ['Día equilibrado.'];
  return {
    sign,
    modality: WESTERN_MODALITY[sign.id] ?? 'cardinal',
    ruler: WESTERN_RULER[sign.id] ?? '—',
    reading: readings[Math.abs(dayOfYear) % readings.length],
  };
}

// ── Horóscopo Chino ─────────────────────────────────────────────────────

export const CHINESE_ANIMALS = [
  { id: 'rata',      label: 'Rata',      glyph: '🐀' },
  { id: 'buey',      label: 'Buey',      glyph: '🐂' },
  { id: 'tigre',     label: 'Tigre',     glyph: '🐅' },
  { id: 'conejo',    label: 'Conejo',    glyph: '🐇' },
  { id: 'dragon',    label: 'Dragón',    glyph: '🐉' },
  { id: 'serpiente', label: 'Serpiente', glyph: '🐍' },
  { id: 'caballo',   label: 'Caballo',   glyph: '🐎' },
  { id: 'cabra',     label: 'Cabra',     glyph: '🐐' },
  { id: 'mono',      label: 'Mono',      glyph: '🐒' },
  { id: 'gallo',     label: 'Gallo',     glyph: '🐓' },
  { id: 'perro',     label: 'Perro',     glyph: '🐕' },
  { id: 'cerdo',     label: 'Cerdo',     glyph: '🐖' },
];

export const CHINESE_ELEMENTS = [
  { id: 'madera', label: 'Madera', color: '#10b981' },
  { id: 'fuego',  label: 'Fuego',  color: '#ef4444' },
  { id: 'tierra', label: 'Tierra', color: '#a16207' },
  { id: 'metal',  label: 'Metal',  color: '#94a3b8' },
  { id: 'agua',   label: 'Agua',   color: '#0ea5e9' },
];

export interface ChineseProfile {
  yearAnimal: { id: string; label: string; glyph: string };
  yearElement: { id: string; label: string; color: string };
  dayAnimal: { id: string; label: string; glyph: string };
  yin_yang: 'yin' | 'yang';
  reading: string;
}

/**
 * Año chino aproximado (sin corregir por Año Nuevo Lunar, que cae entre el
 * 21 ene y el 20 feb). Usamos (year - 4) % 12 → idx en CHINESE_ANIMALS.
 */
export function getChineseProfile(iso: string): ChineseProfile {
  const d = parseISODate(iso);
  const year = d.getFullYear();
  const yearIdx = ((year - 4) % 12 + 12) % 12;
  const elementIdx = Math.floor((((year - 4) % 10) + 10) % 10 / 2);
  const dayIdx = (Math.floor(d.getTime() / 86_400_000) % 12 + 12) % 12;
  const yinYang: 'yin' | 'yang' = year % 2 === 0 ? 'yang' : 'yin';

  const readings = [
    'La armonía nace de la flexibilidad.',
    'Sigue el flujo del Qi de hoy.',
    'Tu animal del día abre una puerta.',
    'Honra el ciclo, no fuerces el resultado.',
    'Equilibrio Yin-Yang en cada decisión.',
  ];
  const reading = readings[(d.getDate() + dayIdx) % readings.length];

  return {
    yearAnimal: CHINESE_ANIMALS[yearIdx],
    yearElement: CHINESE_ELEMENTS[elementIdx],
    dayAnimal: CHINESE_ANIMALS[dayIdx],
    yin_yang: yinYang,
    reading,
  };
}

// ── Horóscopo Védico (Jyotish) ──────────────────────────────────────────

export const VEDIC_RASHIS = [
  { id: 'mesha',    label: 'Mesha (Aries)',          glyph: '♈', deity: 'Mangala' },
  { id: 'vrishabha',label: 'Vrishabha (Tauro)',      glyph: '♉', deity: 'Shukra' },
  { id: 'mithuna',  label: 'Mithuna (Géminis)',      glyph: '♊', deity: 'Budha' },
  { id: 'karka',    label: 'Karka (Cáncer)',         glyph: '♋', deity: 'Chandra' },
  { id: 'simha',    label: 'Simha (Leo)',            glyph: '♌', deity: 'Surya' },
  { id: 'kanya',    label: 'Kanya (Virgo)',          glyph: '♍', deity: 'Budha' },
  { id: 'tula',     label: 'Tula (Libra)',           glyph: '♎', deity: 'Shukra' },
  { id: 'vrishchika',label:'Vrishchika (Escorpio)',  glyph: '♏', deity: 'Mangala' },
  { id: 'dhanus',   label: 'Dhanus (Sagitario)',     glyph: '♐', deity: 'Brihaspati' },
  { id: 'makara',   label: 'Makara (Capricornio)',   glyph: '♑', deity: 'Shani' },
  { id: 'kumbha',   label: 'Kumbha (Acuario)',       glyph: '♒', deity: 'Shani' },
  { id: 'meena',    label: 'Meena (Piscis)',         glyph: '♓', deity: 'Brihaspati' },
];

export interface VedicProfile {
  rashi: typeof VEDIC_RASHIS[number];
  /** Tithi aproximada (1..15 creciente, 16..30 menguante). */
  tithi: number;
  /** Nakshatra aproximada (1..27). */
  nakshatra: number;
  reading: string;
}

const NAKSHATRA_NAMES = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra',
  'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni',
  'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha',
  'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishta',
  'Shatabhisha', 'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati',
];

export function getNakshatraName(idx1: number): string {
  return NAKSHATRA_NAMES[(idx1 - 1 + 27) % 27];
}

/**
 * Rashi sideral aproximado: signo tropical menos ~24 días (Ayanamsa de
 * Lahiri). En astrología védica el sol entra en cada rashi una vez al mes.
 */
export function getVedicProfile(iso: string): VedicProfile {
  const d = parseISODate(iso);
  // Aproximación: corremos ~24 días atrás para pasar de tropical a sideral
  const sideralDate = new Date(d.getTime() - 24 * 86_400_000);
  const tropical = getZodiacForDate(sideralDate);
  // Mapeo tropical→rashi (mismo orden)
  const idx = ZODIAC_RANGES.findIndex((z) => z.id === tropical.id);
  const rashi = VEDIC_RASHIS[idx >= 0 ? idx : 0];

  // Tithi y nakshatra aproximados por día
  const dayCount = Math.floor(d.getTime() / 86_400_000);
  const tithi = (dayCount % 30) + 1;
  const nakshatra = (dayCount % 27) + 1;

  const readings = [
    'Karma manifiesto: actúa con dharma.',
    'Tu rashi pide concentración interior.',
    'La devoción suaviza los planetas adversos.',
    'Día propicio para mantras y meditación.',
    'Honra a tu deidad regente.',
  ];

  return {
    rashi,
    tithi,
    nakshatra,
    reading: readings[(d.getDate() + nakshatra) % readings.length],
  };
}

// ── Horóscopo Maya (Tzolkin) ────────────────────────────────────────────

export const MAYA_SEALS = [
  { id: 'imix',    label: 'Imix (Cocodrilo)',  glyph: '𑓎' },
  { id: 'ik',      label: 'Ik (Viento)',       glyph: '𑓏' },
  { id: 'akbal',   label: 'Akbal (Noche)',     glyph: '𑓐' },
  { id: 'kan',     label: 'Kan (Semilla)',     glyph: '𑓑' },
  { id: 'chicchan',label: 'Chicchan (Serpiente)', glyph: '𑓒' },
  { id: 'cimi',    label: 'Cimi (Enlazador)',  glyph: '𑓓' },
  { id: 'manik',   label: 'Manik (Mano)',      glyph: '𑓔' },
  { id: 'lamat',   label: 'Lamat (Estrella)',  glyph: '𑓕' },
  { id: 'muluc',   label: 'Muluc (Luna)',      glyph: '𑓖' },
  { id: 'oc',      label: 'Oc (Perro)',        glyph: '𑓗' },
  { id: 'chuen',   label: 'Chuen (Mono)',      glyph: '𑓘' },
  { id: 'eb',      label: 'Eb (Humano)',       glyph: '𑓙' },
  { id: 'ben',     label: 'Ben (Caminante)',   glyph: '𑓚' },
  { id: 'ix',      label: 'Ix (Mago)',         glyph: '𑓛' },
  { id: 'men',     label: 'Men (Águila)',      glyph: '𑓜' },
  { id: 'cib',     label: 'Cib (Guerrero)',    glyph: '𑓝' },
  { id: 'caban',   label: 'Caban (Tierra)',    glyph: '𑓞' },
  { id: 'etznab',  label: 'Etznab (Espejo)',   glyph: '𑓟' },
  { id: 'cauac',   label: 'Cauac (Tormenta)',  glyph: '𑓠' },
  { id: 'ahau',    label: 'Ahau (Sol)',        glyph: '☉' },
];

export const MAYA_TONES = [
  'Magnético', 'Lunar', 'Eléctrico', 'Autoexistente', 'Entonado',
  'Rítmico', 'Resonante', 'Galáctico', 'Solar', 'Planetario',
  'Espectral', 'Cristal', 'Cósmico',
];

export interface MayaProfile {
  seal: typeof MAYA_SEALS[number];
  tone: { number: number; name: string };
  kin: number;
  reading: string;
}

/**
 * Día base canónico del Tzolkin: 11 ago 3114 a.C. = 4 Ahau (kin 60).
 * Para fechas modernas usamos un offset deterministicamente conocido para
 * el 1 ene 2026 (calculado contra el calendario José Argüelles "Dreamspell"):
 *   1 ene 2026 = kin 64 (Semilla magnética, signo 4 / tono 12)
 *
 * Nota: existe debate académico entre los Tzolkin tradicional (cuenta larga
 * maya) y el Dreamspell. Usamos Dreamspell aquí por ser el más popular para
 * usuarios contemporáneos.
 */
const REFERENCE_ISO = '2026-01-01';
const REFERENCE_KIN = 64; // 1 ene 2026 en Dreamspell

export function getMayaProfile(iso: string): MayaProfile {
  const d = parseISODate(iso);
  const ref = parseISODate(REFERENCE_ISO);
  const days = Math.floor((d.getTime() - ref.getTime()) / 86_400_000);
  const kin = ((REFERENCE_KIN - 1 + days) % 260 + 260) % 260 + 1; // 1..260

  const sealIdx = (kin - 1) % 20;
  const toneIdx = (kin - 1) % 13;
  const seal = MAYA_SEALS[sealIdx];
  const tone = { number: toneIdx + 1, name: MAYA_TONES[toneIdx] };

  const readings = [
    'Sintoniza con el pulso galáctico.',
    'Tu sello revela un don olvidado.',
    'La sincronía no es casual.',
    'Tono y sello danzan juntos hoy.',
    'Cada kin es una llave.',
  ];
  const reading = readings[(d.getDate() + toneIdx) % readings.length];

  return { seal, tone, kin, reading };
}

// ── Agregador ───────────────────────────────────────────────────────────

export interface AstroProfile {
  western: WesternProfile;
  chinese: ChineseProfile;
  vedic: VedicProfile;
  maya: MayaProfile;
}

export function getAstroProfile(iso: string): AstroProfile {
  return {
    western: getWesternProfile(iso),
    chinese: getChineseProfile(iso),
    vedic: getVedicProfile(iso),
    maya: getMayaProfile(iso),
  };
}

// ── Clima básico (mock determinista) ────────────────────────────────────

export interface BasicWeather {
  tempC: number;
  condition: 'sol' | 'parcial' | 'nubes' | 'lluvia' | 'tormenta' | 'nieve';
  glyph: string;
  description: string;
}

/**
 * Clima generado deterministamente a partir del ISO para vista previa.
 * En producción se reemplaza por un conector real (Open-Meteo, etc.).
 */
export function getBasicWeather(iso: string): BasicWeather {
  const d = parseISODate(iso);
  const seed = (d.getFullYear() * 1000 + (d.getMonth() + 1) * 31 + d.getDate()) % 100;
  const conditions: BasicWeather[] = [
    { tempC: 18 + (seed % 12), condition: 'sol',      glyph: '☀',  description: 'Despejado' },
    { tempC: 14 + (seed % 10), condition: 'parcial',  glyph: '⛅', description: 'Parcialmente nublado' },
    { tempC: 10 + (seed % 8),  condition: 'nubes',    glyph: '☁',  description: 'Nublado' },
    { tempC: 8 + (seed % 6),   condition: 'lluvia',   glyph: '🌧', description: 'Lluvia' },
    { tempC: 6 + (seed % 4),   condition: 'tormenta', glyph: '⛈', description: 'Tormenta' },
    { tempC: -2 + (seed % 4),  condition: 'nieve',    glyph: '❄',  description: 'Nieve' },
  ];
  return conditions[seed % conditions.length];
}

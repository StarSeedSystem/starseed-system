/**
 * StarSeed OS — CAMR · REGULACIÓN Y PERFIL LEGAL (Ola 1005C · CAMR1005A).
 * ============================================================================
 * §5 del contrato CAMR. AMPLÍA (importa, no copia) las regiones LoRa de
 * `../antennas.ts` con:
 *   · canales Wi-Fi de 2,4, 5 y 6 GHz y su PIRE por región;
 *   · bandas de radioaficionado HF/VHF/UHF que exigen indicativo;
 *   · PIRE = potencia + ganancia − pérdidas;
 *   · contabilidad de ciclo de trabajo por sub-banda (ventana de 1 h);
 *   · en bandas de radioaficionado el cifrado del contenido está PROHIBIDO.
 *
 * Módulo PURO y determinista. Nunca lanza.
 */

import { REGION_BANDS } from "../antennas";
import type { ParametrosRadio } from "./tipos";

/* ── Wi-Fi por región (canales y PIRE, EIRP dBm) ──────────────────────────── */

export interface CanalWifi {
  /** Número de canal (1, 36, 320…). */
  canal: number;
  /** Frecuencia central (MHz). */
  frecMhz: number;
  /** PIRE máxima legal (dBm). */
  pireDbm: number;
}

export interface PerfilWifiRegion {
  region: string;
  g24: CanalWifi[];
  g5: CanalWifi[];
  g6: CanalWifi[];
}

/* ── Bandas de radioaficionado (exigen indicativo registrado) ─────────────── */

export interface BandaRadioaficionado {
  key: string; // p.ej. "ham-40m"
  nombre: string;
  gama: "HF" | "VHF" | "UHF";
  freqStartMhz: number;
  freqEndMhz: number;
  /** Potencia máxima orientativa (dBm) según licencia estándar. */
  potenciaDbm: number;
}

/* ── Ciclo de trabajo por sub-banda (ventana deslizante de 1 h) ───────────── */

export interface VentanaCiclo {
  /** sub-banda → usos ({at, durMs}) no expirados. */
  porSubbanda: Record<string, Array<{ at: number; durMs: number }>>;
}

export interface PerfilLegal {
  /** Región LoRa de antennas.ts o null si el medio no es LoRa. */
  regionLora: string | null;
  /** Región Wi-Fi ("EU", "US", "JP"…) o null. */
  regionWifi: string | null;
  /** Indicativo de radioaficionado del operador, o null. */
  indicativo: string | null;
}

/* ── Datos: Wi-Fi por región ──────────────────────────────────────────────── */

function canales24(fin: number, pireDbm: number): CanalWifi[] {
  const out: CanalWifi[] = [];
  for (let c = 1; c <= fin; c++) {
    out.push({ canal: c, frecMhz: 2407 + 5 * c, pireDbm });
  }
  return out;
}

function canales5(lista: Array<[number, number]>, pireDbm: number): CanalWifi[] {
  return lista.map(([canal, frecMhz]) => ({ canal, frecMhz, pireDbm }));
}

const C5_UNII: Array<[number, number]> = [
  [36, 5180], [40, 5200], [44, 5220], [48, 5240],
  [52, 5260], [56, 5280], [60, 5300], [64, 5320],
];

/** Canal 1 de 6 GHz = 5 950 MHz; numeración de 20 MHz desde el 1. */
function canales6(fin: number, pireDbm: number): CanalWifi[] {
  const out: CanalWifi[] = [];
  for (let c = 1; c <= fin; c += 4) {
    out.push({ canal: c, frecMhz: 5950 + 5 * c, pireDbm });
  }
  return out;
}

export const PERFILES_WIFI: Record<string, PerfilWifiRegion> = {
  EU: {
    region: "EU",
    g24: canales24(13, 20),
    g5: [...canales5(C5_UNII, 23), ...canales5([[100, 5500], [120, 5600], [140, 5700]], 30)],
    g6: canales6(93, 23), // LPI: 23 dBm hasta 6 425 MHz
  },
  US: {
    region: "US",
    g24: canales24(11, 30),
    g5: [...canales5(C5_UNII, 30), ...canales5([[149, 5745], [157, 5785], [165, 5825]], 36)],
    g6: canales6(233, 30), // LPI toda la banda UNII-5/8
  },
  JP: {
    region: "JP",
    g24: canales24(14, 20), // el 14 solo DSSS/CCK
    g5: canales5(C5_UNII, 23),
    g6: canales6(93, 23),
  },
};

/* ── Datos: bandas de radioaficionado (plan CEPT/IARU-R1 de referencia) ───── */

export const BANDAS_RADIOAFICIONADO: Record<string, BandaRadioaficionado> = {
  "ham-80m": { key: "ham-80m", nombre: "80 m", gama: "HF", freqStartMhz: 3.5, freqEndMhz: 3.8, potenciaDbm: 30 },
  "ham-40m": { key: "ham-40m", nombre: "40 m", gama: "HF", freqStartMhz: 7.0, freqEndMhz: 7.2, potenciaDbm: 30 },
  "ham-20m": { key: "ham-20m", nombre: "20 m", gama: "HF", freqStartMhz: 14.0, freqEndMhz: 14.35, potenciaDbm: 30 },
  "ham-2m": { key: "ham-2m", nombre: "2 m", gama: "VHF", freqStartMhz: 144, freqEndMhz: 146, potenciaDbm: 30 },
  "ham-70cm": { key: "ham-70cm", nombre: "70 cm", gama: "UHF", freqStartMhz: 430, freqEndMhz: 440, potenciaDbm: 30 },
};

/* ── Funciones puras ──────────────────────────────────────────────────────── */

/** PIRE (EIRP, dBm) = potencia en el conector + ganancia − pérdidas. */
export function pire(potenciaDbm: number, gananciaDbi: number, perdidasDb: number): number {
  return potenciaDbm + gananciaDbi - perdidasDb;
}

/** ¿La banda admite cifrar el contenido? En radioaficionado, NUNCA. */
export function permiteCifrado(banda: string): boolean {
  return !BANDAS_RADIOAFICIONADO[banda];
}

/** ¿Es una banda de radioaficionado? */
export function esBandaRadioaficionado(banda: string): boolean {
  return banda in BANDAS_RADIOAFICIONADO;
}

/* ── Ciclo de trabajo (ventana deslizante de 1 h por sub-banda) ───────────── */

/** Ventana legal de contabilidad: 1 hora. */
export const VENTANA_CICLO_MS = 3_600_000;

export function ventanaCicloVacia(): VentanaCiclo {
  return { porSubbanda: {} };
}

/**
 * Registra una transmisión y devuelve la ventana nueva. Inmutable: no toca
 * la ventana de entrada. Limpia los usos caducados de la sub-banda.
 */
export function registraTransmision(
  ventana: VentanaCiclo,
  subbanda: string,
  at: number,
  durMs: number,
): VentanaCiclo {
  const usados = (ventana.porSubbanda[subbanda] ?? []).filter((u) => at - u.at < VENTANA_CICLO_MS);
  return { porSubbanda: { ...ventana.porSubbanda, [subbanda]: [...usados, { at, durMs }] } };
}

/** Tiempo de aire consumido en la ventana vigente a `ahora` (ms). */
export function aireConsumidoMs(ventana: VentanaCiclo, subbanda: string, ahora: number): number {
  return (ventana.porSubbanda[subbanda] ?? [])
    .filter((u) => ahora - u.at < VENTANA_CICLO_MS)
    .reduce((s, u) => s + u.durMs, 0);
}

/** ¿Cabe una transmisión de `durMs` dentro del duty (%) de la sub-banda? */
export function cabeEnCiclo(
  ventana: VentanaCiclo,
  subbanda: string,
  dutyPct: number,
  durMs: number,
  ahora: number,
): boolean {
  const consumido = aireConsumidoMs(ventana, subbanda, ahora);
  return consumido + durMs <= (dutyPct / 100) * VENTANA_CICLO_MS;
}

/* ── Veredicto legal de una transmisión ───────────────────────────────────── */

export interface PeticionTransmision {
  /** Banda lógica: clave de REGION_BANDS, "wifi-2g"/"wifi-5g"/"wifi-6g" o "ham-*". */
  banda: string;
  radio: ParametrosRadio;
  /** Duración de la transmisión (ms) para el ciclo de trabajo. */
  durMs?: number;
  /** Instante (epoch ms); por defecto no se evalúa ciclo. */
  ahora?: number;
  /** Ventana de ciclo actual (si se quiere evaluar duty). */
  ventana?: VentanaCiclo;
  /** ¿El contenido iría cifrado? En radioaficionado está prohibido. */
  cifrado?: boolean;
}

export type VeredictoLey = { ok: boolean; motivos: string[] };

/**
 * dentroDeLey — juzga una transmisión contra el perfil legal activo.
 * Devuelve todos los motivos de infracción (ok = no hay ninguno).
 */
export function dentroDeLey(p: PeticionTransmision, perfil: PerfilLegal): VeredictoLey {
  const motivos: string[] = [];
  const { banda, radio } = p;
  const frec = radio.frecuenciaMhz;

  if (esBandaRadioaficionado(banda)) {
    const b = BANDAS_RADIOAFICIONADO[banda];
    if (!perfil.indicativo) {
      motivos.push(`la banda ${b.nombre} exige el indicativo del operador`);
    }
    if (p.cifrado === true) {
      motivos.push(`en ${b.nombre} está prohibido cifrar el contenido (se firma, que sí está permitido)`);
    }
    if (frec < b.freqStartMhz || frec > b.freqEndMhz) {
      motivos.push(`${frec} MHz está fuera de ${b.nombre} (${b.freqStartMhz}–${b.freqEndMhz} MHz)`);
    }
    if (radio.potenciaDbm > b.potenciaDbm) {
      motivos.push(`potencia ${radio.potenciaDbm} dBm supera el tope de ${b.nombre} (${b.potenciaDbm} dBm)`);
    }
    return { ok: motivos.length === 0, motivos };
  }

  if (banda === "wifi-2g" || banda === "wifi-5g" || banda === "wifi-6g") {
    const region = perfil.regionWifi ? PERFILES_WIFI[perfil.regionWifi] : undefined;
    if (!region) {
      motivos.push("sin región Wi-Fi fijada no se puede evaluar la PIRE legal");
      return { ok: false, motivos };
    }
    const gama = banda === "wifi-2g" ? region.g24 : banda === "wifi-5g" ? region.g5 : region.g6;
    const canal = gama.find((c) => Math.abs(c.frecMhz - frec) < 0.001);
    if (!canal) {
      motivos.push(`${frec} MHz no es un canal Wi-Fi permitido en ${region.region}`);
      return { ok: false, motivos };
    }
    const p = pire(radio.potenciaDbm, radio.gananciaAntenaDbi ?? 0, radio.perdidasDb ?? 0);
    if (p > canal.pireDbm) {
      motivos.push(
        `PIRE ${redondea(p)} dBm supera el tope del canal ${canal.canal} en ${region.region} (${canal.pireDbm} dBm)`,
      );
    }
    return { ok: motivos.length === 0, motivos };
  }

  const regionLora = REGION_BANDS[banda] ?? (perfil.regionLora ? REGION_BANDS[perfil.regionLora] : undefined);
  if (!regionLora) {
    motivos.push(`banda desconocida: ${banda}`);
    return { ok: false, motivos };
  }
  if (frec < regionLora.freqStartMhz || frec > regionLora.freqEndMhz) {
    motivos.push(
      `${frec} MHz está fuera de ${regionLora.key} (${regionLora.freqStartMhz}–${regionLora.freqEndMhz} MHz)`,
    );
  }
  if (radio.potenciaDbm > regionLora.powerDbm) {
    motivos.push(`potencia ${radio.potenciaDbm} dBm supera el tope de ${regionLora.key} (${regionLora.powerDbm} dBm)`);
  }
  if (p.ventana && p.durMs !== undefined && p.ahora !== undefined) {
    if (!cabeEnCiclo(p.ventana, regionLora.key, regionLora.dutyPct, p.durMs, p.ahora)) {
      motivos.push(
        `ciclo de trabajo de ${regionLora.key} agotado (${regionLora.dutyPct} % en la última hora)`,
      );
    }
  }
  return { ok: motivos.length === 0, motivos };
}

function redondea(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * StarSeed OS — CAMR · RADIO COGNITIVA (Ola 1005C · CAMR1005B).
 * ============================================================================
 * §2 del contrato CAMR: motor de política PURO y determinista.
 *   recomendar(historial, vecinos, perfil, actual) → { params, porque, cambio }
 *   · modulación adaptativa (preset LoRa / MCS Wi-Fi) con histéresis;
 *   · TPC comunitario (mínima potencia con margen; sube solo el puente único);
 *   · canal más limpio del plan legal, con umbral y anuncio previo;
 *   · PIRE direccional y acimut recomendado;
 *   · vigilarCambio: reversión si la métrica empeora durante T.
 * Ninguna salida viola `dentroDeLey`. Nunca lanza.
 */

import { dentroDeLey, pire } from "./regulacion";
import type { PerfilLegal } from "./regulacion";
import type { Medicion, ParametrosRadio } from "./tipos";

/* ── Tipos de entrada ─────────────────────────────────────────────────────── */

export interface VecinoCognitivo {
  id: string;
  snrDb: number | null;
  rssiDbm: number | null;
  /** true si este vecino es el único puente hacia una parte de la malla. */
  esPuenteUnico: boolean;
  /** Acimut en grados hacia el vecino (para antena orientable), si se sabe. */
  acimutDeg?: number | null;
}

export interface CanalMedido {
  frecMhz: number;
  ruidoDbm: number;
  /** Ocupación 0..1 (survey Wi-Fi o CAD de LoRa). */
  ocupacion: number;
}

export interface PerfilCognitivo {
  legal: PerfilLegal;
  /** Banda lógica activa (clave REGION_BANDS, "wifi-*" o "ham-*"). */
  banda: string;
  /** true si el enlace es Wi-Fi (usa MCS), false si es LoRa (usa preset). */
  esWifi: boolean;
  /** ¿La antena se puede orientar? */
  orientable: boolean;
  gananciaAntenaDbi: number;
  perdidasDb: number;
  /** Margen de SNR objetivo hacia el vecino necesario (dB). */
  objetivoSnrDb: number;
  /** Tope de potencia del equipo (dBm), además del legal. */
  potenciaMaxEquipoDbm: number;
}

export interface Recomendacion {
  params: ParametrosRadio;
  porque: string[];
  /** true si params difieren de `actual` en algo operativo. */
  cambio: boolean;
  /** true si hay que avisar a los vecinos antes de un cambio de canal. */
  anuncioPrevio: boolean;
  /** Acimut sugerido si la antena es orientable. */
  acimutDeg?: number;
}

/* ── Escalera de modulación (0 = más rápido, último = más alcance) ─────────── */

export interface NivelLora {
  preset: string;
  spreadFactor: number;
  anchoBandaMhz: number;
  codingRate: string;
  /** SNR mínimo de enganche (dB, aproximación Semtech). */
  snrMinDb: number;
}

export const ESCALERA_LORA: readonly NivelLora[] = [
  { preset: "SHORT_TURBO", spreadFactor: 7, anchoBandaMhz: 0.5, codingRate: "4/5", snrMinDb: -7.5 },
  { preset: "SHORT_FAST", spreadFactor: 7, anchoBandaMhz: 0.25, codingRate: "4/5", snrMinDb: -7.5 },
  { preset: "SHORT_SLOW", spreadFactor: 8, anchoBandaMhz: 0.125, codingRate: "4/5", snrMinDb: -10 },
  { preset: "MEDIUM_FAST", spreadFactor: 9, anchoBandaMhz: 0.25, codingRate: "4/5", snrMinDb: -12.5 },
  { preset: "MEDIUM_SLOW", spreadFactor: 9, anchoBandaMhz: 0.125, codingRate: "4/5", snrMinDb: -12.5 },
  { preset: "LONG_TURBO", spreadFactor: 10, anchoBandaMhz: 0.5, codingRate: "4/5", snrMinDb: -15 },
  { preset: "LONG_FAST", spreadFactor: 11, anchoBandaMhz: 0.25, codingRate: "4/8", snrMinDb: -17.5 },
  { preset: "LONG_MODERATE", spreadFactor: 11, anchoBandaMhz: 0.125, codingRate: "4/8", snrMinDb: -17.5 },
  { preset: "LONG_SLOW", spreadFactor: 12, anchoBandaMhz: 0.125, codingRate: "4/8", snrMinDb: -20 },
];

/** Subir de velocidad exige esta mejora sostenida; bajar es inmediato. */
export const MEJORAS_SUBIDA = 3;
/** Margen de seguridad sobre el SNR mínimo del nivel (dB). */
export const MARGEN_SNR_DB = 2;
/** BER/PER a partir de la cual se fuerza un nivel más robusto. */
export const BER_MALA = 0.05;
/** Mejora mínima de limpieza (dB) para proponer cambio de canal. */
export const UMBRAL_CANAL_DB = 2;
export const MCS_MAX = 11;

/* ── Modulación adaptativa ────────────────────────────────────────────────── */

/** Nivel LoRa deseado por margen de SNR y BER/PER (sin histéresis). */
export function nivelLoraDeseado(snrDb: number | null, ber: number | null): number {
  const snr = snrDb ?? -30;
  let nivel = ESCALERA_LORA.length - 1;
  for (let i = 0; i < ESCALERA_LORA.length; i++) {
    if (snr >= ESCALERA_LORA[i].snrMinDb + MARGEN_SNR_DB) {
      nivel = i;
      break;
    }
  }
  if (ber !== null && ber > BER_MALA) {
    nivel = Math.min(nivel + 1, ESCALERA_LORA.length - 1);
  }
  return nivel;
}

/** MCS Wi-Fi deseado (~3 dB por escalón desde 2 dB). */
export function mcsDeseado(snrDb: number | null, ber: number | null): number {
  const snr = snrDb ?? -10;
  let mcs = Math.max(0, Math.min(MCS_MAX, Math.floor((snr - 2) / 3)));
  if (ber !== null && ber > BER_MALA) mcs = Math.max(0, mcs - 1);
  return mcs;
}

/** Histéresis: ¿las últimas N medidas aguantan un nivel tan rápido como `nivel`? */
export function mejoraSostenida(historial: Medicion[], esWifi: boolean, nivel: number): boolean {
  if (historial.length < MEJORAS_SUBIDA) return false;
  const cola = historial.slice(-MEJORAS_SUBIDA);
  return cola.every((m) =>
    esWifi
      ? mcsDeseado(m.snrDb, m.ber) >= nivel
      : nivelLoraDeseado(m.snrDb, m.ber) <= nivel,
  );
}

/** Nivel LoRa actual inferido de los parámetros (índice de ESCALERA_LORA). */
export function nivelLoraActual(actual: ParametrosRadio): number {
  const i = ESCALERA_LORA.findIndex(
    (n) => n.spreadFactor === actual.spreadFactor && n.anchoBandaMhz === actual.anchoBandaMhz,
  );
  return i >= 0 ? i : ESCALERA_LORA.length - 1;
}

/* ── TPC comunitario ──────────────────────────────────────────────────────── */

/** Tope de potencia en el conector para no violar la ley ni el equipo. */
export function topePotenciaDbm(perfil: PerfilCognitivo, frecMhz: number): number {
  const legal = buscaTopeLegal(perfil, frecMhz);
  return Math.min(legal, perfil.potenciaMaxEquipoDbm);
}

function buscaTopeLegal(perfil: PerfilCognitivo, frecMhz: number): number {
  for (let p = perfil.potenciaMaxEquipoDbm; p >= -20; p--) {
    const v = dentroDeLey(
      {
        banda: perfil.banda,
        radio: {
          frecuenciaMhz: frecMhz,
          potenciaDbm: p,
          gananciaAntenaDbi: perfil.gananciaAntenaDbi,
          perdidasDb: perfil.perdidasDb,
        },
      },
      perfil.legal,
    );
    if (v.ok) return p;
  }
  return -20;
}

/**
 * Potencia comunitaria: la mínima que da el margen objetivo hacia el vecino
 * necesario más desfavorecido. Baja a quien le sobra señal; solo sube de verdad
 * si hay un puente único que la necesita. Nunca supera el tope legal/equipo.
 */
export function potenciaComunitaria(
  actualDbm: number,
  vecinos: VecinoCognitivo[],
  perfil: PerfilCognitivo,
  frecMhz: number,
): { potenciaDbm: number; nota: string } {
  const tope = topePotenciaDbm(perfil, frecMhz);
  if (vecinos.length === 0) {
    return { potenciaDbm: Math.min(actualDbm, tope), nota: "sin vecinos: se mantiene la potencia" };
  }
  const snrs = vecinos.map((v) => v.snrDb).filter((s): s is number => s !== null);
  const peor = snrs.length > 0 ? Math.min(...snrs) : null;
  const hayPuente = vecinos.some((v) => v.esPuenteUnico);
  let pot = actualDbm;
  let nota = "potencia ya equilibrada";
  if (peor !== null && peor < perfil.objetivoSnrDb) {
    const delta = Math.ceil(perfil.objetivoSnrDb - peor);
    if (hayPuente || delta <= 1) {
      pot = actualDbm + delta;
      nota = hayPuente
        ? `sube ${delta} dB: un puente único necesita margen (${peor} < ${perfil.objetivoSnrDb} dB)`
        : `sube ${delta} dB: el vecino más lejano está al límite (${peor} dB)`;
    } else {
      nota = `falta margen (${peor} < ${perfil.objetivoSnrDb} dB) pero nadie es puente único: no se ahoga la malla`;
    }
  } else if (peor !== null && peor > perfil.objetivoSnrDb + 3 && !hayPuente) {
    pot = actualDbm - 1;
    nota = `sobra señal (peor vecino ${peor} dB): baja 1 dB para no ahogar la malla`;
  }
  pot = Math.min(pot, tope);
  if (pot === tope && actualDbm > tope) nota = "recortada al tope legal/del equipo";
  return { potenciaDbm: pot, nota };
}

/* ── Espectro limpio ──────────────────────────────────────────────────────── */

/** Puntuación de limpieza (menor = más limpio): ruido + penalización por ocupación. */
export function suciedadCanal(c: CanalMedido): number {
  return c.ruidoDbm + 10 * c.ocupacion;
}

/**
 * Canal más limpio del plan legal. Solo propone cambio si mejora más que
 * UMBRAL_CANAL_DB y la frecuencia candidata pasa `dentroDeLey`.
 */
export function canalMasLimpio(
  canales: CanalMedido[],
  actualMhz: number,
  perfil: PerfilCognitivo,
): { frecMhz: number; mejoraDb: number; cambio: boolean } {
  const legales = canales.filter((c) =>
    dentroDeLey({ banda: perfil.banda, radio: { frecuenciaMhz: c.frecMhz, potenciaDbm: 0 } }, perfil.legal).ok,
  );
  if (legales.length === 0) return { frecMhz: actualMhz, mejoraDb: 0, cambio: false };
  const mejor = legales.reduce((a, b) => (suciedadCanal(a) <= suciedadCanal(b) ? a : b));
  const actual = canales.find((c) => Math.abs(c.frecMhz - actualMhz) < 0.001);
  const mejora = actual ? suciedadCanal(actual) - suciedadCanal(mejor) : Number.POSITIVE_INFINITY;
  const cambio = Math.abs(mejor.frecMhz - actualMhz) >= 0.001 && mejora > UMBRAL_CANAL_DB;
  return { frecMhz: cambio ? mejor.frecMhz : actualMhz, mejoraDb: cambio ? mejora : 0, cambio };
}

/* ── PIRE direccional ─────────────────────────────────────────────────────── */

/** PIRE resultante de unos parámetros (dBm). */
export function pireDe(params: ParametrosRadio, perfil: PerfilCognitivo): number {
  return pire(
    params.potenciaDbm,
    params.gananciaAntenaDbi ?? perfil.gananciaAntenaDbi,
    params.perdidasDb ?? perfil.perdidasDb,
  );
}

/** Acimut recomendado: el del vecino con mejor SNR (null si no hay datos). */
export function acimutRecomendado(vecinos: VecinoCognitivo[]): number | null {
  const con = vecinos.filter(
    (v): v is VecinoCognitivo & { acimutDeg: number } => typeof v.acimutDeg === "number",
  );
  if (con.length === 0) return null;
  const mejor = con.reduce((a, b) => ((a.snrDb ?? -99) >= (b.snrDb ?? -99) ? a : b));
  return mejor.acimutDeg;
}

/* ── Motor: recomendar ────────────────────────────────────────────────────── */

export function recomendar(
  historial: Medicion[],
  vecinos: VecinoCognitivo[],
  perfil: PerfilCognitivo,
  actual: ParametrosRadio,
  canales?: CanalMedido[],
): Recomendacion {
  const porque: string[] = [];
  const params: ParametrosRadio = { ...actual };
  const ultima = historial[historial.length - 1] ?? null;

  if (ultima) {
    if (perfil.esWifi) {
      const deseado = mcsDeseado(ultima.snrDb, ultima.ber);
      constObjetivo(perfil, actual, deseado, historial, params, porque);
    } else {
      const deseado = nivelLoraDeseado(ultima.snrDb, ultima.ber);
      constObjetivo(perfil, actual, deseado, historial, params, porque);
    }
  } else {
    porque.push("sin mediciones: se conservan los parámetros actuales");
  }

  const tpc = potenciaComunitaria(params.potenciaDbm, vecinos, perfil, params.frecuenciaMhz);
  params.potenciaDbm = tpc.potenciaDbm;
  porque.push(tpc.nota);

  let anuncioPrevio = false;
  if (canales && canales.length > 0) {
    const canal = canalMasLimpio(canales, params.frecuenciaMhz, perfil);
    if (canal.cambio) {
      params.frecuenciaMhz = canal.frecMhz;
      anuncioPrevio = true;
      porque.push(`canal más limpio a ${canal.frecMhz} MHz (mejora ${canal.mejoraDb.toFixed(1)} dB): se anuncia antes a los vecinos`);
    } else {
      porque.push("el canal actual sigue siendo aceptable (mejora por debajo del umbral)");
    }
  }

  params.gananciaAntenaDbi = perfil.gananciaAntenaDbi;
  params.perdidasDb = perfil.perdidasDb;
  porque.push(`PIRE resultante: ${pireDe(params, perfil).toFixed(1)} dBm`);

  let acimutDeg: number | undefined;
  if (perfil.orientable) {
    const a = acimutRecomendado(vecinos);
    if (a !== null) {
      acimutDeg = a;
      porque.push(`antena orientable: acimut recomendado ${a}° hacia el vecino con mejor métrica`);
    }
  }

  const legal = dentroDeLey({ banda: perfil.banda, radio: params }, perfil.legal);
  if (!legal.ok) {
    porque.push(`ajuste legal final: ${legal.motivos.join("; ")} — se recorta la potencia`);
    params.potenciaDbm = topePotenciaDbm(perfil, params.frecuenciaMhz);
  }

  const cambio =
    params.frecuenciaMhz !== actual.frecuenciaMhz ||
    params.potenciaDbm !== actual.potenciaDbm ||
    params.spreadFactor !== actual.spreadFactor ||
    params.anchoBandaMhz !== actual.anchoBandaMhz ||
    params.codingRate !== actual.codingRate ||
    params.mcs !== actual.mcs;
  return { params, porque, cambio, anuncioPrevio, acimutDeg };
}

/** Aplica la decisión de modulación con histéresis a `params` (muta params). */
function constObjetivo(
  perfil: PerfilCognitivo,
  actual: ParametrosRadio,
  deseado: number,
  historial: Medicion[],
  params: ParametrosRadio,
  porque: string[],
): void {
  if (perfil.esWifi) {
    const nivelAct = actual.mcs ?? 0;
    if (deseado > nivelAct) {
      const ok = mejoraSostenida(historial, true, deseado);
      params.mcs = ok ? deseado : nivelAct;
      porque.push(
        ok
          ? `MCS sube a ${deseado}: mejora sostenida en ${MEJORAS_SUBIDA} medidas`
          : `SNR permitiría MCS ${deseado}, falta mejora sostenida (histéresis)`,
      );
    } else if (deseado < nivelAct) {
      params.mcs = deseado;
      porque.push(`MCS baja a ${deseado}: el enlace lo exige de inmediato`);
    }
    return;
  }
  const nivelAct = nivelLoraActual(actual);
  if (deseado < nivelAct) {
    if (mejoraSostenida(historial, false, deseado)) {
      aplicaNivel(params, deseado);
      porque.push(`preset ${ESCALERA_LORA[deseado].preset}: mejora sostenida en ${MEJORAS_SUBIDA} medidas`);
    } else {
      porque.push(`cabría ${ESCALERA_LORA[deseado].preset}, falta mejora sostenida (histéresis)`);
    }
  } else if (deseado > nivelAct) {
    aplicaNivel(params, deseado);
    porque.push(`preset ${ESCALERA_LORA[deseado].preset}: se baja de inmediato para no perder el enlace`);
  }
}

function aplicaNivel(params: ParametrosRadio, i: number): void {
  const n = ESCALERA_LORA[i];
  params.spreadFactor = n.spreadFactor;
  params.anchoBandaMhz = n.anchoBandaMhz;
  params.codingRate = n.codingRate;
}

/* ── Seguridad del cambio: vigilancia y reversión ─────────────────────────── */

export interface VigilanciaCambio {
  revertir: boolean;
  paramsAnteriores?: ParametrosRadio;
  porque: string;
}

function calidad(m: Medicion): number {
  const porPerdida = m.perdida === null ? 0.7 : 1 - Math.min(1, Math.max(0, m.perdida));
  const porSnr = m.snrDb === null ? 0.5 : Math.min(1, Math.max(0, (m.snrDb + 20) / 30));
  return 0.6 * porPerdida + 0.4 * porSnr;
}

/**
 * Tras aplicar un cambio, vigila las mediciones posteriores. Si la calidad
 * empeora respecto a la anterior y el empeoramiento dura al menos `duraMs`,
 * devuelve la reversión a los parámetros previos.
 */
export function vigilarCambio(
  anterior: Medicion,
  posteriores: Medicion[],
  paramsAnteriores: ParametrosRadio,
  duraMs: number,
): VigilanciaCambio {
  if (posteriores.length === 0) {
    return { revertir: false, porque: "sin mediciones posteriores todavía" };
  }
  const base = calidad(anterior);
  const peores = posteriores.filter((m) => calidad(m) < base - 0.05);
  const duracion = posteriores[posteriores.length - 1].at - posteriores[0].at;
  if (peores.length === posteriores.length && duracion >= duraMs) {
    return {
      revertir: true,
      paramsAnteriores,
      porque: `empeoramiento sostenido ${Math.round(duracion / 1000)} s: se revierte al parámetro anterior`,
    };
  }
  return {
    revertir: false,
    porque: peores.length === 0 ? "la métrica aguanta tras el cambio" : "empeora, pero aún dentro de la vigilia",
  };
}


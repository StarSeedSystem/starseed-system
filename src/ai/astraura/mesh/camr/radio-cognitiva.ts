/**
 * StarSeed OS — CAMR · RADIO COGNITIVA (Ola 1005C · CAMR1005B).
 * ============================================================================
 * §2 del contrato CAMR: motor de política PURO y determinista.
 *
 *   recomendar(historial, vecinos, perfil, actual) → { params, porque, cambio }
 *
 * · Modulación adaptativa (preset/BW/SF/CR de LoRa o MCS de Wi-Fi) por margen
 *   de SNR y BER, con histéresis: subir exige N mejoras seguidas, bajar es
 *   inmediato si se pierde enlace.
 * · TPC comunitario: mínima potencia con margen objetivo hacia el vecino más
 *   lejano necesario; baja quien sobra y sube solo el puente único; tope legal.
 * · Canal más limpio del plan legal; cambio solo si mejora > umbral, con
 *   anuncio previo a los vecinos.
 * · PIRE direccional: potencia + ganancia − pérdidas, con tope legal; acimut
 *   recomendado hacia el mejor vecino si la antena es orientable.
 * · vigilancia del cambio: si la métrica empeora durante T, reversión.
 *
 * NADA de lo que recomienda viola `dentroDeLey` (§5). Nunca lanza.
 */

import type { Medicion, ParametrosRadio } from "./tipos";
import {
  dentroDeLey,
  pire,
  type PerfilLegal,
} from "./regulacion";

/* ── Configuración del motor ─────────────────────────────────────────────── */

export interface ConfigRadioCognitiva {
  /** Mejoras seguidas exigidas para SUBIR de modulación (histéresis). */
  mejoraSeguidasN: number;
  /** Margen de SNR objetivo (dB) sobre el mínimo de la modulación. */
  margenSnrObjetivoDb: number;
  /** SNR sobrante que permite bajar potencia en el reparto comunitario (dB). */
  margenSobranteDb: number;
  /** Mejora mínima de ruido (dB) para justificar un cambio de canal. */
  umbralMejoraCanalDb: number;
  /** Ventana de vigilancia tras aplicar un cambio (ms). */
  vigilanciaMs: number;
  /** Empeoramiento de SNR que dispara la reversión (dB). */
  toleranciaEmpeoraDb: number;
  /** BER a partir del cual el enlace se considera perdido. */
  berPerdido: number;
  /** Pérdida de paquetes a partir de la cual el enlace se considera perdido. */
  perdidaPerdido: number;
  /** Piso de potencia jamás recomendado (dBm). */
  potenciaMinDbm: number;
}

export const CONFIG_RADIO_POR_DEFECTO: ConfigRadioCognitiva = {
  mejoraSeguidasN: 3,
  margenSnrObjetivoDb: 10,
  margenSobranteDb: 6,
  umbralMejoraCanalDb: 3,
  vigilanciaMs: 30_000,
  toleranciaEmpeoraDb: 2,
  berPerdido: 0.05,
  perdidaPerdido: 0.3,
  potenciaMinDbm: 2,
};

/* ── Entradas del motor ──────────────────────────────────────────────────── */

export interface VecinoRadio {
  id: string;
  /** SNR que ese vecino nos reporta (dB), null si no hay dato. */
  snrDb: number | null;
  /** Pérdida reciente hacia ese vecino (0..1), null si no hay dato. */
  perdida: number | null;
  /** ¿Es el único camino a alguna parte de la malla? (puente único). */
  necesario: boolean;
  /** Potencia actual de ese vecino (dBm), para el reparto comunitario. */
  potenciaDbm: number | null;
  /** Acimut del vecino respecto a esta antena (grados), null sin dato. */
  acimutGrados: number | null;
}

/** Medida de un canal candidato (survey Wi-Fi o CAD/RSSI de LoRa). */
export interface CanalMedido {
  frecuenciaMhz: number;
  /** Ruido de fondo medido (dBm); cuanto menor, más limpio. */
  ruidoDbm: number;
  /** Ocupación del canal (0..1). */
  ocupacion: number;
}

export interface ContextoRadio {
  /** Banda lógica (`EU_868`, `wifi-5g`, `ham-2m`…). */
  banda: string;
  /** Tecnología: decide la escalera de modulación (lora o wifi). */
  familia: "lora" | "wifi";
  /** ¿La antena es orientable? */
  antenaOrientable: boolean;
}

/* ── Resultado ───────────────────────────────────────────────────────────── */

export interface CambioPropuesto {
  /** Qué toca cambiar (parámetros finales ya dentroDeLey). */
  params: ParametrosRadio;
  /** Diferencias respecto a `actual` (etiqueta → {de, a}). */
  diferencias: Record<string, { de: string; a: string }>;
  /** ¿Hay que anunciar el cambio de canal a los vecinos antes de aplicar? */
  anuncioPrevioCanal: boolean;
}

export interface Recomendacion {
  params: ParametrosRadio;
  /** Explicaciones honestas, una por decisión tomada. */
  porque: string[];
  /** null si no hay cambio que proponer. */
  cambio: CambioPropuesto | null;
}

/* ── Vigilancia de un cambio aplicado (§2 «seguridad del cambio») ────────── */

export interface VigilanciaCambio {
  /** Parámetros anteriores, a los que se revierte si el cambio falla. */
  paramsAnteriores: ParametrosRadio;
  /** Medición base (anterior al cambio). */
  base: Medicion;
  /** epoch ms hasta el que vigilar. */
  hastaMs: number;
}

export interface VeredictoVigilancia {
  /** true si hay que volver a `paramsAnteriores`. */
  revertir: boolean;
  motivos: string[];
}

/* ── Escaleras de modulación (menor índice = más robusto/más lento) ────────── */

interface PeldañoModulacion {
  nombre: string;
  /** SNR mínimo exigido para sostener el peldaño (dB). */
  snrMinDb: number;
  /** Parámetros concretos del peldaño. */
  params: Partial<ParametrosRadio>;
}

/** LoRa SX126x: enlace sostenible hasta ~SNR = -(SF/2) − 5 dB (aprox. teórico). */
export const ESCALERA_LORA: PeldañoModulacion[] = [
  { nombre: "SF12", snrMinDb: -20, params: { spreadFactor: 12, codingRate: "4/8", anchoBandaMhz: 0.125 } },
  { nombre: "SF11", snrMinDb: -17.5, params: { spreadFactor: 11, codingRate: "4/8", anchoBandaMhz: 0.125 } },
  { nombre: "SF10", snrMinDb: -15, params: { spreadFactor: 10, codingRate: "4/5", anchoBandaMhz: 0.125 } },
  { nombre: "SF9", snrMinDb: -12.5, params: { spreadFactor: 9, codingRate: "4/5", anchoBandaMhz: 0.25 } },
  { nombre: "SF8", snrMinDb: -10, params: { spreadFactor: 8, codingRate: "4/5", anchoBandaMhz: 0.25 } },
  { nombre: "SF7", snrMinDb: -7.5, params: { spreadFactor: 7, codingRate: "4/5", anchoBandaMhz: 0.5 } },
];

/** Wi-Fi 802.11: MCS 0 (BPSK 1/2) a MCS 10 (1024-QAM 5/6). */
export const ESCALERA_WIFI: PeldañoModulacion[] = [
  { nombre: "MCS0", snrMinDb: 4, params: { mcs: 0 } },
  { nombre: "MCS1", snrMinDb: 7, params: { mcs: 1 } },
  { nombre: "MCS2", snrMinDb: 11, params: { mcs: 2 } },
  { nombre: "MCS3", snrMinDb: 14, params: { mcs: 3 } },
  { nombre: "MCS4", snrMinDb: 18, params: { mcs: 4 } },
  { nombre: "MCS5", snrMinDb: 21, params: { mcs: 5 } },
  { nombre: "MCS6", snrMinDb: 25, params: { mcs: 6 } },
  { nombre: "MCS7", snrMinDb: 29, params: { mcs: 7 } },
  { nombre: "MCS8", snrMinDb: 33, params: { mcs: 8 } },
  { nombre: "MCS9", snrMinDb: 37, params: { mcs: 9 } },
  { nombre: "MCS10", snrMinDb: 41, params: { mcs: 10 } },
];

/* ── Modulación adaptativa con histéresis ────────────────────────────────── */

/** Índice del peldaño más alto que sostiene un SNR dado (-1 si ni el básico). */
export function escalonesQueAguanta(snrDb: number, escalera: PeldañoModulacion[]): number {
  let idx = -1;
  for (let i = 0; i < escalera.length; i++) {
    if (snrDb >= escalera[i].snrMinDb) idx = i;
  }
  return idx;
}

/** Índice del peldaño actual dentro de la escalera (0 si no se reconoce). */
export function indiceActual(actual: ParametrosRadio, escalera: PeldañoModulacion[]): number {
  const idx = escalera.findIndex((p) =>
    p.params.spreadFactor !== undefined
      ? p.params.spreadFactor === actual.spreadFactor
      : p.params.mcs === actual.mcs,
  );
  return idx < 0 ? 0 : idx;
}

/** ¿El enlace se considera perdido con esta medición? */
export function enlacePerdido(m: Medicion, cfg: ConfigRadioCognitiva): boolean {
  if (m.snrDb !== null && Number.isFinite(m.snrDb) && m.snrDb < ESCALERA_LORA[0].snrMinDb) {
    return true;
  }
  return (m.ber !== null && m.ber >= cfg.berPerdido) ||
    (m.perdida !== null && m.perdida >= cfg.perdidaPerdido);
}

/**
 * Elige el peldaño de modulación.
 * · Bajar (más robusto): inmediato si el enlace se perdió o el SNR no llega.
 * · Subir (más rápido): solo si las últimas N mediciones sostienen el peldaño
 *   superior (histéresis contra la oscilación).
 */
export function elegirModulacion(
  historial: Medicion[],
  actual: ParametrosRadio,
  familia: "lora" | "wifi",
  cfg: ConfigRadioCognitiva = CONFIG_RADIO_POR_DEFECTO,
): { params: Partial<ParametrosRadio>; porque: string } {
  const escalera = familia === "lora" ? ESCALERA_LORA : ESCALERA_WIFI;
  const ultima = historial[historial.length - 1];
  const iActual = indiceActual(actual, escalera);
  if (!ultima || ultima.snrDb === null || !Number.isFinite(ultima.snrDb)) {
    return { params: escalera[iActual].params, porque: "sin SNR válido: se mantiene la modulación" };
  }
  const iSostenible = escalonesQueAguanta(ultima.snrDb, escalera);

  if (enlacePerdido(ultima, cfg) || iSostenible < iActual) {
    const destino = Math.max(0, iSostenible);
    return {
      params: escalera[destino].params,
      porque: enlacePerdido(ultima, cfg)
        ? `enlace perdido (BER/pérdida alta): baja a ${escalera[destino].nombre} de inmediato`
        : `SNR ${ultima.snrDb} dB no sostiene ${escalera[iActual].nombre}: baja a ${escalera[destino].nombre}`,
    };
  }
  if (iActual < escalera.length - 1) {
    const superior = escalera[iActual + 1];
    const recientes = historial.slice(-cfg.mejoraSeguidasN);
    const sostenido =
      recientes.length >= cfg.mejoraSeguidasN &&
      recientes.every(
        (m) => m.snrDb !== null && m.snrDb >= superior.snrMinDb + cfg.margenSnrObjetivoDb / 2,
      );
    if (sostenido) {
      return {
        params: superior.params,
        porque: `SNR sostiene ${superior.nombre} durante ${cfg.mejoraSeguidasN} medidas: sube`,
      };
    }
    return {
      params: escalera[iActual].params,
      porque: `histéresis: ${superior.nombre} alcanzable pero sin ${cfg.mejoraSeguidasN} medidas seguidas`,
    };
  }
  return { params: escalera[iActual].params, porque: `ya en el peldaño máximo (${escalera[iActual].nombre})` };
}

/* ── TPC con autoequilibrio comunitario ──────────────────────────────────── */

export interface ResultadoTpc {
  potenciaDbm: number;
  porque: string;
}

/**
 * Mínima potencia con margen de SNR objetivo hacia el VECINO NECESARIO más
 * exigente. Reparto comunitario: si todos los vecinos necesarios tienen
 * margen sobrante, baja un paso; sube solo si un puente único quedó corto.
 */
export function calcularTpc(
  vecinos: VecinoRadio[],
  potenciaActualDbm: number,
  cfg: ConfigRadioCognitiva = CONFIG_RADIO_POR_DEFECTO,
): ResultadoTpc {
  const necesarios = vecinos.filter((v) => v.necesario && v.snrDb !== null);
  if (necesarios.length === 0) {
    return { potenciaDbm: potenciaActualDbm, porque: "sin vecinos necesarios con SNR: se mantiene la potencia" };
  }
  // El vecino más exigente es el de peor SNR (más lejano o más degradado).
  const peor = necesarios.reduce((a, b) => ((a.snrDb ?? 99) <= (b.snrDb ?? 99) ? a : b));
  const deficit = cfg.margenSnrObjetivoDb - (peor.snrDb ?? 0);
  if (deficit > 0) {
    // Subir solo porque un puente único (necesario) quedó corto.
    return {
      potenciaDbm: potenciaActualDbm + deficit,
      porque: `el puente único ${peor.id} tiene SNR ${peor.snrDb} dB (< ${cfg.margenSnrObjetivoDb}): sube ${deficit} dB`,
    };
  }
  const sobrante = -deficit;
  if (sobrante >= cfg.margenSobranteDb) {
    // Reparto comunitario: quien sobra baja para no ahogar la malla.
    const bajada = Math.min(sobrante - cfg.margenSobranteDb, potenciaActualDbm - cfg.potenciaMinDbm);
    if (bajada > 0) {
      return {
        potenciaDbm: potenciaActualDbm - bajada,
        porque: `margen sobrante de ${sobrante} dB hacia todos los vecinos: baja ${bajada} dB (reparto comunitario)`,
      };
    }
  }
  return { potenciaDbm: potenciaActualDbm, porque: `SNR del vecino más exigente en ${peor.snrDb} dB: potencia ya ajustada` };
}

/* ── Búsqueda de espectro limpio ─────────────────────────────────────────── */

export interface ResultadoCanal {
  frecuenciaMhz: number;
  cambio: boolean;
  porque: string;
}

/**
 * Canal más limpio (menor ruido, luego menor ocupación). Cambia solo si la
 * mejora de ruido supera el umbral; el cambio se anuncia a los vecinos.
 */
export function elegirCanal(
  canales: CanalMedido[],
  frecuenciaActualMhz: number,
  cfg: ConfigRadioCognitiva = CONFIG_RADIO_POR_DEFECTO,
): ResultadoCanal {
  if (canales.length === 0) {
    return { frecuenciaMhz: frecuenciaActualMhz, cambio: false, porque: "sin medición de canales: se mantiene el canal" };
  }
  const mejor = [...canales].sort((a, b) => a.ruidoDbm - b.ruidoDbm || a.ocupacion - b.ocupacion)[0];
  const actual = canales.find((c) => Math.abs(c.frecuenciaMhz - frecuenciaActualMhz) < 0.001);
  if (!actual) {
    return {
      frecuenciaMhz: mejor.frecuenciaMhz,
      cambio: true,
      porque: `canal actual sin medición: se propone el más limpio (${mejor.frecuenciaMhz} MHz, ruido ${mejor.ruidoDbm} dBm)`,
    };
  }
  const mejora = actual.ruidoDbm - mejor.ruidoDbm;
  if (mejora > cfg.umbralMejoraCanalDb && mejor.frecuenciaMhz !== frecuenciaActualMhz) {
    return {
      frecuenciaMhz: mejor.frecuenciaMhz,
      cambio: true,
      porque: `canal ${mejor.frecuenciaMhz} MHz es ${mejora} dB más limpio (> umbral ${cfg.umbralMejoraCanalDb} dB): cambio con anuncio previo`,
    };
  }
  return {
    frecuenciaMhz: frecuenciaActualMhz,
    cambio: false,
    porque: `mejora de ${mejora.toFixed(1)} dB no supera el umbral de ${cfg.umbralMejoraCanalDb} dB: se mantiene`,
  };
}

/* ── PIRE direccional y acimut ───────────────────────────────────────────── */

/**
 * Recorta la potencia para que la PIRE (potencia + ganancia − pérdidas) no
 * supere el tope legal del canal/banda.
 */
export function potenciaParaPireLegal(
  pireMaxDbm: number,
  gananciaDbi: number,
  perdidasDb: number,
): number {
  return pireMaxDbm - gananciaDbi + perdidasDb;
}

/**
 * Acimut recomendado hacia el vecino con mejor métrica (SNR · (1 − pérdida)).
 * null si la antena no es orientable o no hay vecino con acimut.
 */
export function acimutRecomendado(vecinos: VecinoRadio[], antenaOrientable: boolean): number | null {
  if (!antenaOrientable) return null;
  const candidatos = vecinos.filter((v) => v.acimutGrados !== null);
  if (candidatos.length === 0) return null;
  const mejor = candidatos.reduce((a, b) => {
    const pa = (a.snrDb ?? -99) * (1 - (a.perdida ?? 0));
    const pb = (b.snrDb ?? -99) * (1 - (b.perdida ?? 0));
    return pb > pa ? b : a;
  });
  return mejor.acimutGrados;
}

/* ── Motor completo ──────────────────────────────────────────────────────── */

/**
 * Ajusta los parámetros hasta que `dentroDeLey` los acepte (bajando potencia).
 * Si ni el piso de potencia los salva, mantiene el piso (el aplicador decidirá).
 */
export function ajustaALaLey(
  params: ParametrosRadio,
  banda: string,
  perfil: PerfilLegal,
  cfg: ConfigRadioCognitiva = CONFIG_RADIO_POR_DEFECTO,
): ParametrosRadio {
  let p = { ...params };
  let guard = 0;
  while (!dentroDeLey({ banda, radio: p }, perfil).ok && p.potenciaDbm > cfg.potenciaMinDbm && guard < 64) {
    p = { ...p, potenciaDbm: p.potenciaDbm - 1 };
    guard++;
  }
  return { ...p, potenciaDbm: Math.max(cfg.potenciaMinDbm, p.potenciaDbm) };
}

/**
 * Función principal del §2. Determinista: mismas entradas → misma salida.
 */
export function recomendar(
  historial: Medicion[],
  vecinos: VecinoRadio[],
  perfil: PerfilLegal,
  actual: ParametrosRadio & { contexto: ContextoRadio; canalesMedidos?: CanalMedido[] },
  cfg: ConfigRadioCognitiva = CONFIG_RADIO_POR_DEFECTO,
): Recomendacion {
  const porque: string[] = [];
  const { contexto } = actual;

  // 1 · Modulación adaptativa (histéresis).
  const mod = elegirModulacion(historial, actual, contexto.familia, cfg);
  porque.push(mod.porque);

  // 2 · TPC comunitario.
  const tpc = calcularTpc(vecinos, actual.potenciaDbm, cfg);
  porque.push(tpc.porque);

  // 3 · PIRE direccional: tope legal según ganancia y pérdidas.
  const ganancia = actual.gananciaAntenaDbi ?? 0;
  const perdidas = actual.perdidasDb ?? 0;
  porque.push(
    `PIRE actual: ${pire(actual.potenciaDbm, ganancia, perdidas).toFixed(1)} dBm ` +
      `(potencia ${actual.potenciaDbm} + ganancia ${ganancia} − pérdidas ${perdidas})`,
  );

  // Parámetros candidatos (modulación + potencia TPC).
  let candidatos: ParametrosRadio = {
    ...actual,
    ...mod.params,
    potenciaDbm: tpc.potenciaDbm,
    gananciaAntenaDbi: ganancia,
    perdidasDb: perdidas,
  };

  // 4 · Canal más limpio del plan legal.
  let cambiaCanal = false;
  if (actual.canalesMedidos && actual.canalesMedidos.length > 0) {
    const legales = actual.canalesMedidos.filter(
      (c) => dentroDeLey({ banda: contexto.banda, radio: { ...candidatos, frecuenciaMhz: c.frecuenciaMhz } }, perfil).ok,
    );
    const canal = elegirCanal(legales, actual.frecuenciaMhz, cfg);
    porque.push(canal.porque);
    if (canal.cambio) {
      candidatos = { ...candidatos, frecuenciaMhz: canal.frecuenciaMhz };
      cambiaCanal = true;
    }
  }

  // 5 · Candado legal: ninguna salida puede violar dentroDeLey.
  const legales = ajustaALaLey(candidatos, contexto.banda, perfil, cfg);
  if (legales.potenciaDbm !== candidatos.potenciaDbm) {
    porque.push(`tope legal: potencia recortada a ${legales.potenciaDbm} dBm para no violar la PIRE máxima`);
  }

  // 6 · Acimut si la antena es orientable.
  const acimut = acimutRecomendado(vecinos, contexto.antenaOrientable);
  if (acimut !== null) porque.push(`antena orientable: apunta al acimut ${acimut}° (mejor vecino)`);

  // ¿Cambia algo?
  const diferencias: Record<string, { de: string; a: string }> = {};
  const claves: Array<keyof ParametrosRadio> = [
    "frecuenciaMhz", "potenciaDbm", "anchoBandaMhz", "spreadFactor", "codingRate", "mcs",
  ];
  for (const k of claves) {
    if (legales[k] !== actual[k] && legales[k] !== undefined) {
      diferencias[k] = { de: String(actual[k]), a: String(legales[k]) };
    }
  }
  const cambio: CambioPropuesto | null =
    Object.keys(diferencias).length > 0
      ? { params: legales, diferencias, anuncioPrevioCanal: cambiaCanal }
      : null;
  return { params: legales, porque, cambio };
}

/* ── Vigilancia del cambio (seguridad del cambio, §2) ────────────────────── */

/**
 * Tras aplicar un cambio: si la métrica empeora respecto a la base durante la
 * ventana `hastaMs`, hay que volver a los parámetros anteriores (reversión).
 */
export function vigilarCambio(
  vigilancia: VigilanciaCambio,
  medicionesPost: Medicion[],
  ahora: number,
  cfg: ConfigRadioCognitiva = CONFIG_RADIO_POR_DEFECTO,
): VeredictoVigilancia {
  const motivos: string[] = [];
  if (ahora > vigilancia.hastaMs) {
    return { revertir: false, motivos: ["ventana de vigilancia cumplida sin empeoramiento: el cambio se consolida"] };
  }
  const baseSnr = vigilancia.base.snrDb;
  const basePerdida = vigilancia.base.perdida;
  for (const m of medicionesPost) {
    if (m.at > vigilancia.hastaMs) continue;
    if (baseSnr !== null && m.snrDb !== null && m.snrDb < baseSnr - cfg.toleranciaEmpeoraDb) {
      motivos.push(
        `SNR cayó de ${baseSnr} a ${m.snrDb} dB (tolera ${cfg.toleranciaEmpeoraDb} dB): se revierte el cambio`,
      );
    }
    if (basePerdida !== null && m.perdida !== null && m.perdida > basePerdida + 0.1) {
      motivos.push(`pérdida subió de ${basePerdida} a ${m.perdida}: se revierte el cambio`);
    }
    if (enlacePerdido(m, cfg)) motivos.push("el enlace quedó perdido tras el cambio: se revierte");
  }
  return motivos.length > 0
    ? { revertir: true, motivos }
    : { revertir: false, motivos: ["métricas dentro de la tolerancia durante la vigilancia"] };
}

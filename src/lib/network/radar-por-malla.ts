/**
 * Radar compartido por la malla (protocolo "radar:resumen") — módulo PURO.
 * Cada neurona publica un RESUMEN de lo que oyen sus antenas locales; las
 * demás lo pintan como señales remotas, declarando de dónde sale cada dato.
 * Privacidad: jamás viajan MACs, ids de sync ni datos de posición privados.
 */
import {
  ANTENNA_COLOR, ANTENNA_LABEL, placeBySector,
  type AntennaKind, type DetectedSignal, type SignalMetric,
} from "../../ai/astraura/mesh/signals";

export const MSG_RADAR = "radar:resumen";

const ANTENAS_LOCALES: ReadonlySet<AntennaKind> = new Set(["lora", "ip", "ble", "serial"]);
const ANTENAS_VALIDAS: readonly AntennaKind[] = ["lora", "relay", "account", "ip", "ble", "serial"];
const MAX_SALIDA = 40;
const MAX_METRICAS = 10;
const MAX_MSG = 60;
const MAX_CADENA = 200;
/** Un resumen más viejo que esto se descarta (caducado). */
export const RADAR_RESUMEN_TTL_MS = 5 * 60_000;
const METRICA_PROHIBIDA = ["mac", "dirección", "id de sync"];

export interface SenalCompartida {
  id: string;
  antenna: AntennaKind;
  label: string;
  signalType: string;
  quality: number | null;
  metrics: SignalMetric[];
  lastHeard: number | null;
  distanceM: number | null;
}

export interface ResumenRadar {
  v: 1;
  neuronId: string;
  nombre: string;
  at: number;
  senales: SenalCompartida[];
}

/**
 * construirResumenRadar — solo señales de antenas LOCALES (lora/ip/ble/serial)
 * y jamás ids `remoto:` (lo remoto no se reenvía: evita eco en la malla).
 * Máx. 40 señales por calidad, máx. 10 métricas, sin métricas privadas.
 */
export function construirResumenRadar(
  senales: DetectedSignal[],
  yo: { neuronId: string; nombre: string },
  ahora: number,
): ResumenRadar {
  const propias = senales
    .filter((s) => ANTENAS_LOCALES.has(s.antenna) && !s.id.startsWith("remoto:"))
    .map<SenalCompartida>((s) => ({
      id: s.id,
      antenna: s.antenna,
      label: s.label,
      signalType: s.signalType,
      quality: s.quality,
      metrics: s.metrics
        .filter((m) => !METRICA_PROHIBIDA.some((p) => m.label.toLowerCase().includes(p)))
        .slice(0, MAX_METRICAS),
      lastHeard: s.lastHeard,
      distanceM: s.placement.distanceM,
    }))
    .sort((a, b) => (b.quality ?? -1) - (a.quality ?? -1))
    .slice(0, MAX_SALIDA);
  return { v: 1, neuronId: yo.neuronId, nombre: yo.nombre, at: ahora, senales: propias };
}

function esCadena(x: unknown): x is string {
  return typeof x === "string" && x.length <= MAX_CADENA;
}

function esSenalCompartida(x: unknown): x is SenalCompartida {
  if (typeof x !== "object" || x === null) return false;
  const s = x as Record<string, unknown>;
  if (!esCadena(s.id) || !esCadena(s.label) || !esCadena(s.signalType)) return false;
  if (!ANTENAS_VALIDAS.includes(s.antenna as AntennaKind)) return false;
  if (s.quality !== null && typeof s.quality !== "number") return false;
  if (s.lastHeard !== null && typeof s.lastHeard !== "number") return false;
  if (s.distanceM !== null && typeof s.distanceM !== "number") return false;
  if (!Array.isArray(s.metrics)) return false;
  return (s.metrics as unknown[]).every((m) => {
    if (typeof m !== "object" || m === null) return false;
    const mm = m as Record<string, unknown>;
    return esCadena(mm.label) && esCadena(mm.value);
  });
}

/** Guard estructural del mensaje entrante: tolerante a basura, nunca lanza. */
export function esMensajeRadar(x: unknown): x is { t: typeof MSG_RADAR; resumen: ResumenRadar } {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  if (o.t !== MSG_RADAR) return false;
  const r = o.resumen;
  if (typeof r !== "object" || r === null) return false;
  const rr = r as Record<string, unknown>;
  if (rr.v !== 1 || !esCadena(rr.neuronId) || !esCadena(rr.nombre)) return false;
  if (typeof rr.at !== "number" || !Number.isFinite(rr.at)) return false;
  if (!Array.isArray(rr.senales) || rr.senales.length > MAX_MSG) return false;
  return (rr.senales as unknown[]).every(esSenalCompartida);
}

/** Huella estable del resumen: ignora `at` y `lastHeard` (para mandarlo solo si cambió). */
export function huellaResumen(r: ResumenRadar): string {
  return [
    r.neuronId, r.nombre,
    ...r.senales.map((s) => [
      s.id, s.antenna, s.label, s.signalType, s.quality ?? "·", s.distanceM ?? "·",
      ...s.metrics.flatMap((m) => [m.label, m.value]),
    ].join("|")),
  ].join("~");
}

/**
 * senalesVistasPorOtras — convierte resúmenes remotos en DetectedSignal para el
 * radar propio. Todo se declara: no la oyes tú, la oye otra neurona y la
 * comparte por la malla P2P cifrada. Descarta resúmenes caducados (> 5 min).
 */
export function senalesVistasPorOtras(remotos: ResumenRadar[], ahora: number): DetectedSignal[] {
  const out: DetectedSignal[] = [];
  for (const r of remotos) {
    if (!Number.isFinite(r.at) || ahora - r.at < 0 || ahora - r.at > RADAR_RESUMEN_TTL_MS) continue;
    // La frescura atenúa la calidad declarada: un resumen viejo vale menos.
    const frescura = 1 - (ahora - r.at) / RADAR_RESUMEN_TTL_MS;
    for (const s of r.senales) {
      const quality = s.quality == null ? null : s.quality * frescura;
      const id = `remoto:${r.neuronId}:${s.id}`;
      out.push({
        id,
        antenna: s.antenna,
        antennaLabel: ANTENNA_LABEL[s.antenna],
        signalType: `${s.signalType} · la oye ${r.nombre}`,
        label: s.label,
        detail: `Esta neurona no la oye: la oye ${r.nombre} y la comparte por la malla P2P cifrada.`,
        quality,
        qualityDetail: `Calidad medida por ${r.nombre} (no por esta neurona), atenuada por la frescura del resumen.`,
        metrics: s.metrics,
        compatible: s.antenna === "lora",
        compatDetail: s.antenna === "lora"
          ? "Habla Meshtastic al alcance de la otra neurona: alcanzable retransmitiendo por la malla a través de ella."
          : "Esta señal no habla el protocolo de la malla: solo se sabe que la oye la otra neurona.",
        starseed: null,
        placement: {
          ...placeBySector(s.antenna, id, quality),
          detail: "Sin posición relativa a ti: la oye otra neurona. Se sitúa en el sector de su antena con el halo máximo.",
        },
        lastHeard: s.lastHeard,
        actions: [],
        simulated: false,
        color: ANTENNA_COLOR[s.antenna],
      });
    }
  }
  return out;
}

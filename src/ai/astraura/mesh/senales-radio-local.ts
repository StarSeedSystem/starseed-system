// Señales del radar a partir de la radio NATIVA de la Mac (Ola 375 · RDV12). PURO.
// Lo que el navegador no ve: la red Wi-Fi actual con su señal y su ruido, las redes
// cercanas y los Bluetooth emparejados. Las redes y dispositivos ajenos se VEN, no se usan.
import type { DispositivoBt, RadioLocal, RedWifi } from "@/lib/mando/radio-local-tipos";
import {
  ANTENNA_COLOR,
  ANTENNA_LABEL,
  placeByRf,
  placeBySector,
  qualityFromRssi,
  stableHash01,
  type AntennaKind,
  type DetectedSignal,
  type SignalMetric,
} from "./signals";

/** Distancia ESTIMADA por RSSI (log-distancia, exponente 2,7), acotada a 1–200 m. */
export function metrosPorRssi(rssi: number, tipo: "wifi" | "bt"): number {
  const a1m = tipo === "wifi" ? -40 : -59;
  const m = Math.pow(10, (a1m - rssi) / (10 * 2.7));
  return Math.min(200, Math.max(1, Math.round(m * 10) / 10));
}

function hash(s: string): string {
  return Math.floor(stableHash01(s) * 1e9).toString(36);
}

function metricasWifi(r: RedWifi & { velocidadMbps?: number | null; mcs?: number | null; pais?: string | null }): SignalMetric[] {
  const m: SignalMetric[] = [];
  const add = (label: string, v: string | number | null | undefined, unidad = "") => {
    if (v !== null && v !== undefined && v !== "") m.push({ label, value: `${v}${unidad}` });
  };
  add("Canal", r.canal);
  add("Banda y ancho", r.banda ? `${r.banda}${r.anchoMHz ? ` · ${r.anchoMHz} MHz` : ""}` : null);
  add("Estándar", r.phy);
  add("Seguridad", r.seguridad);
  add("Señal", r.rssiDbm, " dBm");
  add("Ruido", r.ruidoDbm, " dBm");
  if (r.rssiDbm !== null && r.ruidoDbm !== null) add("Relación señal/ruido", r.rssiDbm - r.ruidoDbm, " dB");
  add("Velocidad", r.velocidadMbps, " Mbps");
  add("MCS", r.mcs);
  add("País", r.pais);
  return m;
}

function colocar(antena: AntennaKind, id: string, rssi: number | null, tipo: "wifi" | "bt", q: number | null) {
  if (rssi === null) return placeBySector(antena, id, q);
  const metros = metrosPorRssi(rssi, tipo);
  return {
    ...placeByRf(antena, id, metros, q),
    detail: `Distancia ESTIMADA por RSSI (${rssi} dBm, modelo log-distancia): unos ${metros} m ±50 %. El rumbo es desconocido: se sitúa en el sector de su antena.`,
  };
}

function base(antena: AntennaKind, id: string, ahora: number) {
  return {
    id,
    antenna: antena,
    antennaLabel: ANTENNA_LABEL[antena],
    starseed: null,
    lastHeard: ahora,
    actions: [],
    simulated: false,
    color: ANTENNA_COLOR[antena],
  };
}

function senalWifi(r: RedWifi, actual: boolean, radio: RadioLocal): DetectedSignal {
  const id = actual ? "wifi-actual" : `wifi:${hash(`${r.ssid ?? "oculta"}|${r.canal ?? ""}`)}`;
  const q = r.rssiDbm === null ? null : qualityFromRssi(r.rssiDbm);
  return {
    ...base("ip", id, radio.at),
    signalType: actual ? "Wi-Fi · red actual (antena del sistema)" : "Wi-Fi · red cercana",
    label: r.ssid ?? (actual ? "Red Wi-Fi actual" : "Red Wi-Fi oculta"),
    detail: actual ? "La red a la que está conectada esta Mac, leída del sistema." : "Red Wi-Fi que la antena de esta Mac oye cerca.",
    quality: q,
    qualityDetail: r.rssiDbm === null ? "Sin dato de señal." : `Señal ${r.rssiDbm} dBm (−110 al límite · −40 pegado).`,
    metrics: metricasWifi(r),
    compatible: actual,
    compatDetail: actual ? "Es tu red: por ella salen la malla por IP, el relé y la sincronización." : "Red Wi-Fi ajena: se ve, no se usa.",
    placement: colocar("ip", id, r.rssiDbm, "wifi", q),
  };
}

function senalBt(d: DispositivoBt, radio: RadioLocal): DetectedSignal {
  const id = `bt:${hash(d.nombre)}`;
  const q = d.rssiDbm === null ? null : qualityFromRssi(d.rssiDbm);
  const metrics: SignalMetric[] = [];
  if (d.tipo) metrics.push({ label: "Tipo", value: d.tipo });
  if (d.fabricante) metrics.push({ label: "Fabricante", value: d.fabricante });
  if (d.bateriaPct !== null) metrics.push({ label: "Batería", value: `${d.bateriaPct} %` });
  if (d.rssiDbm !== null) metrics.push({ label: "Señal", value: `${d.rssiDbm} dBm` });
  return {
    ...base("ble", id, radio.at),
    signalType: d.conectado ? "Bluetooth · conectado" : "Bluetooth · emparejado (fuera de alcance o apagado)",
    label: d.nombre,
    detail: "Dispositivo Bluetooth emparejado con esta Mac, leído del sistema.",
    quality: q,
    qualityDetail: d.rssiDbm === null ? "El sistema no da su señal." : `Señal ${d.rssiDbm} dBm.`,
    metrics,
    compatible: false,
    compatDetail: "Accesorio Bluetooth: se ve, no habla la malla StarSeed.",
    placement: colocar("ble", id, d.rssiDbm, "bt", q),
  };
}

/** Todas las señales que la radio nativa de la Mac aporta al radar. */
export function senalesRadioLocal(radio: RadioLocal | null, _ahora: number): DetectedSignal[] {
  if (!radio) return [];
  const out: DetectedSignal[] = [];
  if (radio.wifi?.actual) out.push(senalWifi(radio.wifi.actual, true, radio));
  for (const r of radio.wifi?.cercanas ?? []) out.push(senalWifi(r, false, radio));
  for (const d of radio.bluetooth?.dispositivos ?? []) out.push(senalBt(d, radio));
  return out;
}

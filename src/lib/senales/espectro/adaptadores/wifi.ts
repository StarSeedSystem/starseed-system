import { SenalEspectro } from "../espectro";

export interface EscaneoWifi {
  canal?: number;
  frecuenciaMhz?: number;
  anchoMhz?: number;
  rssi?: number;
}

export interface SinFuente {
  medio: "wifi";
  motivo: string;
}

export interface ResultadoAdaptador {
  senales: SenalEspectro[];
  sinFuente: SinFuente[];
}

export function obtenerBandaDesdeFrecuencia(frecuenciaMhz: number | undefined): "2.4GHz" | "5GHz" | "6GHz" | undefined {
  if (!frecuenciaMhz) return undefined;
  if (frecuenciaMhz >= 2400 && frecuenciaMhz < 2500) return "2.4GHz";
  if (frecuenciaMhz >= 5150 && frecuenciaMhz < 5850) return "5GHz";
  if (frecuenciaMhz >= 6000 && frecuenciaMhz < 7125) return "6GHz";
  return undefined;
}

export function escaneoASenal(espectro: EscaneoWifi, timestamp: number): SenalEspectro {
  return {
    tipo: "wifi",
    frecuenciaMhz: espectro.frecuenciaMhz,
    banda: obtenerBandaDesdeFrecuencia(espectro.frecuenciaMhz),
    rssi: espectro.rssi,
    origen: "medida",
    timestamp,
  };
}

export function adaptadorWifi(
  conexionActual: { rttMs?: number; capacidadKbps?: number } | null,
  escaneo: EscaneoWifi[] | null = null
): ResultadoAdaptador {
  const sinFuente: SinFuente[] = [];
  const senales: SenalEspectro[] = [];
  const timestamp = Date.now();

  if (!escaneo) {
    sinFuente.push({
      medio: "wifi",
      motivo: "este aparato no deja escanear redes Wi-Fi desde la app",
    });
    if (conexionActual) {
      senales.push({
        tipo: "wifi",
        origen: "medida",
        timestamp,
      });
    }
    return { senales, sinFuente };
  }

  for (const item of escaneo) {
    senales.push(escaneoASenal(item, timestamp));
  }

  return { senales, sinFuente };
}
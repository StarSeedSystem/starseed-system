/**
 * estado-transportes — resumen puro de transportes (detectado / usable / pendiente con motivo).
 * Módulo PURO: sin node:*, sin Supabase, sin window.
 * Contrato: architecture/malla-cristalina-sio2.md §10.
 */

import type { Medio } from "./cristal/tipos";

export type EstadoTransporte = "detectado" | "usable" | "pendiente";

export interface TransporteResumen {
  medio: Medio;
  estado: EstadoTransporte;
  motivo: string;
}

export interface ResumenTransportes {
  medios: TransporteResumen[];
  contadores: Record<EstadoTransporte, number>;
}

export interface EntradaResumen {
  lora?: boolean;
}

function tipoEstadoTransporte(estado: EstadoTransporte): EstadoTransporte {
  return estado;
}

function contadorInicial(): Record<EstadoTransporte, number> {
  return { detectado: 0, usable: 0, pendiente: 0 };
}

function inc(contadores: Record<EstadoTransporte, number>, estado: EstadoTransporte): void {
  contadores[estado] += 1;
}

export function resumirTransportes(entrada: EntradaResumen = {}): ResumenTransportes {
  const contadores = contadorInicial();
  const medios: TransporteResumen[] = [];

  const add = (medio: Medio, estado: EstadoTransporte, motivo: string) => {
    medios.push({ medio, estado, motivo });
    inc(contadores, estado);
  };

  add("lora", entrada.lora ? "usable" : "detectado", entrada.lora ? "Radio Meshtastic conectada" : "Radio Meshtastic no conectada");
  add("ble", "pendiente", "Bluetooth nativo pendiente (btleplug en escritorio, plugin Kotlin en Android)");
  add("wifi-lan", "usable", "P2P local por WebRTC en la misma red");
  add("webrtc", "usable", "WebRTC (señalización por internet, tráfico por red local o internet directo)");
  add("wifi-mesh", "usable", "802.11s + batman-adv (malla Wi-Fi sin cables)");
  add("reticulum", "pendiente", "Solo detección: transporte RNS es una ola aparte");
  add("serie", "pendiente", "Serie en Windows/Android pendiente");
  add("servidor", "usable", "Relé cifrado del servidor del OS");
  add("nfc", "usable", "NFC (tramas cortas: dato público ≤ 32 KB)");

  return { medios, contadores };
}

export { tipoEstadoTransporte };
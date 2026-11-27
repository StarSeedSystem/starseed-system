// Respaldo universal sin NFC (contrato: architecture/nfc-neuronas.md §2).
// Módulo puro: sin red, disco ni Node. Elige qué vía usa cada neurona para «acercar»
// y pasa la MISMA tarjeta firmada por QR o por la confirmación de BLE muy cerca.

import { codificar, decodificar, type ResultadoDecodificar, type TarjetaNeurona } from "./tarjeta";

export type CapacidadNfc = "lector" | "emulador" | "lector_usb" | "web" | "ninguno";
export type ViaAcercar = "nfc" | "ble" | "qr";

export interface EntornoNfc {
  nfc: CapacidadNfc;
  /** La neurona tiene radio Bluetooth LE utilizable. */
  ble: boolean;
  /** La neurona tiene pantalla o cámara para mostrar o leer un QR. */
  pantalla: boolean;
}

export const PREFIJO_QR = "ssn1:";
/** RSSI mínimo (dBm) para tomar dos aparatos por «muy cerca» (unos pocos cm). */
export const RSSI_MUY_CERCA = -45;

/** Vías que ofrece la neurona, de mejor a peor. Nunca vacía si hay pantalla o BLE. */
export function viasDisponibles(e: EntornoNfc): ViaAcercar[] {
  const vias: ViaAcercar[] = [];
  if (e.nfc !== "ninguno" && e.nfc !== "web") vias.push("nfc");
  if (e.ble) vias.push("ble");
  if (e.pantalla) vias.push("qr");
  return vias;
}

/** Texto honesto de lo que puede hacer esta neurona (para `nfc_capacidad`). */
export function describirCapacidad(e: EntornoNfc): { via: ViaAcercar | null; nfc: CapacidadNfc; respaldo: ViaAcercar[] } {
  const vias = viasDisponibles(e);
  return { via: vias[0] ?? null, nfc: e.nfc, respaldo: vias.slice(1) };
}

export interface EstadoAcercar {
  rssi: number | null;
  confirmaLocal: boolean;
  confirmaRemota: boolean;
}

/** BLE solo vale con señal muy alta y confirmación en los DOS aparatos. */
export function decidirAcercarBle(s: EstadoAcercar): "esperar" | "confirmar" | "aceptar" {
  if (s.rssi === null || !Number.isFinite(s.rssi) || s.rssi < RSSI_MUY_CERCA) return "esperar";
  return s.confirmaLocal && s.confirmaRemota ? "aceptar" : "confirmar";
}

const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function aBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    s += ABC[(n >> 18) & 63] + ABC[(n >> 12) & 63];
    if (i + 1 < bytes.length) s += ABC[(n >> 6) & 63];
    if (i + 2 < bytes.length) s += ABC[n & 63];
  }
  return s;
}

export function deBase64Url(texto: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(texto) || texto.length % 4 === 1) return null;
  const salida: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const c of texto) {
    acc = (acc << 6) | ABC.indexOf(c);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      salida.push((acc >> bits) & 255);
      acc &= (1 << bits) - 1;
    }
  }
  return new Uint8Array(salida);
}

/** Texto del QR: la misma tarjeta firmada que viajaría por NDEF. */
export function tarjetaAQr(t: TarjetaNeurona): { ok: true; texto: string } | { ok: false; motivo: string } {
  const r = codificar(t);
  return r.ok ? { ok: true, texto: PREFIJO_QR + aBase64Url(r.bytes) } : r;
}

export function qrATarjeta(texto: string): ResultadoDecodificar {
  const limpio = texto.trim();
  if (!limpio.startsWith(PREFIJO_QR)) return { ok: false, motivo: "no es un QR de neurona" };
  const bytes = deBase64Url(limpio.slice(PREFIJO_QR.length));
  return bytes ? decodificar(bytes) : { ok: false, motivo: "QR ilegible" };
}

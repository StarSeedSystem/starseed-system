/**
 * Protomolécula · ADAPTADOR WEB BLUETOOTH del perfil ESTÁNDAR de ritmo cardíaco (F6, §8.3).
 * Solo `heart_rate` (0x180D) / 0x2A37. El navegador se INYECTA: aquí nunca se toca `navigator`.
 * El dato es local por defecto; viajar a la sesión lo decide `decidirOperacion`. Sin diagnóstico:
 * se entregan pulsaciones por minuto, sin interpretarlas.
 */
import type { Curva, FuenteControl } from "./vinculos-control";

export type FuentePulso = Extract<FuenteControl, { tipo: "sensor" }>;
export interface LecturaPulso { bpm: number; contacto: boolean | null }
export interface MensajePulso {
  /** Clave de `Operacion.fuente` que `metricaDeFuente` reconoce, y fuente de control de `procesar`. */
  fuente: "wearable:pulso";
  sensor: FuentePulso;
  bruto: number;
  contacto: boolean | null;
}
export interface EstadoPulso { conectado: boolean; dispositivo?: string; motivo?: string }

export const FUENTE_PULSO = "wearable:pulso" as const;
export const SENSOR_PULSO: FuentePulso = { tipo: "sensor", sensorId: FUENTE_PULSO, eje: "bpm" };
export const RANGO_PULSO = { min: 40, max: 180 } as const;
export const CURVA_PULSO: Curva = { forma: "lineal", invertir: false, zonaMuerta: 0, suavizado: 0.3, entradaMin: RANGO_PULSO.min, entradaMax: RANGO_PULSO.max };
export const SERVICIO_PULSO = "heart_rate", CARACTERISTICA_PULSO = "heart_rate_measurement";
export const SIN_BLUETOOTH = "Este navegador no ofrece Bluetooth web";
export const SIN_APARATO = "No se eligió ningún pulsómetro o se denegó el permiso";
export const SIN_PERFIL = "El aparato no ofrece el perfil estándar de ritmo cardíaco (0x180D)";
export const PULSO_PERDIDO = "El pulsómetro se ha desconectado";

/* Lo mínimo del navegador que se usa: los objetos reales de Web Bluetooth encajan. */
export interface VistaBytes { readonly byteLength: number; getUint8(i: number): number }
export interface CaracteristicaPulso {
  value?: VistaBytes | null;
  addEventListener(tipo: "characteristicvaluechanged", f: () => void): void;
  removeEventListener(tipo: "characteristicvaluechanged", f: () => void): void;
  startNotifications(): Promise<unknown>;
}
export interface ServicioPulso { getCharacteristic(nombre: string): Promise<CaracteristicaPulso> }
export interface GattPulso { connected: boolean; connect(): Promise<unknown>; disconnect(): void; getPrimaryService(nombre: string): Promise<ServicioPulso> }
export interface DispositivoPulso {
  id?: string; name?: string | null; gatt?: GattPulso | null;
  addEventListener(tipo: "gattserverdisconnected", f: () => void): void;
  removeEventListener(tipo: "gattserverdisconnected", f: () => void): void;
}
export interface NavegadorBluetooth { requestDevice(opciones: { filters: { services: string[] }[] }): Promise<DispositivoPulso> }
export type ResultadoPulso = { ok: true; dispositivo: DispositivoPulso; desconectar: () => void } | { ok: false; motivo: string };
export const hayBluetooth = (nav?: { bluetooth?: NavegadorBluetooth | null } | null): boolean =>
  typeof nav?.bluetooth?.requestDevice === "function";

/** Trama de 0x2A37 → pulsaciones y contacto. Bit 0: 8 o 16 bits; bits 1–2: contacto (3 = hay). */
export function analizarTrama(datos: ArrayLike<number> | null): LecturaPulso | null {
  if (!datos || datos.length < 2) return null;
  const flags = datos[0] & 0xff;
  const ancho = (flags & 0x01) === 0 ? 1 : 2;
  if (datos.length < 1 + ancho) return null;
  const bpm = ancho === 1 ? datos[1] & 0xff : (datos[1] & 0xff) | ((datos[2] & 0xff) << 8);
  if (bpm <= 0) return null;
  const soportaContacto = (flags & 0x06) !== 0;
  return { bpm, contacto: soportaContacto ? (flags & 0x06) === 0x06 : null };
}

const nombreError = (e: unknown): string => typeof e === "object" && e !== null && "name" in e ? String((e as { name: unknown }).name) : "";

/** Pide el aparato (solo al pulsar), se suscribe y entrega cada lectura; nunca inventa cifras. */
export async function conectarPulso(
  nav: { bluetooth?: NavegadorBluetooth | null } | null | undefined,
  alMensaje: (m: MensajePulso) => void,
  alEstado: (e: EstadoPulso) => void = () => {},
): Promise<ResultadoPulso> {
  const bluetooth = nav?.bluetooth;
  const pedir = bluetooth?.requestDevice;
  if (!bluetooth || typeof pedir !== "function") return { ok: false, motivo: SIN_BLUETOOTH };
  let dispositivo: DispositivoPulso;
  try {
    dispositivo = await pedir.call(bluetooth, { filters: [{ services: [SERVICIO_PULSO] }] });
  } catch (e) {
    const nombre = nombreError(e);
    return { ok: false, motivo: nombre === "NotFoundError" ? SIN_APARATO : `No se pudo abrir el pulsómetro${nombre ? ` (${nombre})` : ""}` };
  }
  const gatt = dispositivo.gatt;
  if (!gatt) return { ok: false, motivo: SIN_PERFIL };
  let caracteristica: CaracteristicaPulso;
  try {
    await gatt.connect();
    const servicio = await gatt.getPrimaryService(SERVICIO_PULSO);
    caracteristica = await servicio.getCharacteristic(CARACTERISTICA_PULSO);
  } catch {
    return { ok: false, motivo: SIN_PERFIL };
  }
  const alValor = () => {
    const v = caracteristica.value;
    if (!v) return;
    const bytes = Array.from({ length: v.byteLength }, (_, i) => v.getUint8(i));
    const lectura = analizarTrama(bytes);
    if (!lectura || lectura.contacto === false) return;
    alMensaje({ fuente: FUENTE_PULSO, sensor: SENSOR_PULSO, bruto: lectura.bpm, contacto: lectura.contacto });
  };
  let activo = true;
  const alDesconectar = () => { if (!activo) return; activo = false; alEstado({ conectado: false, motivo: PULSO_PERDIDO }); };
  caracteristica.addEventListener("characteristicvaluechanged", alValor);
  dispositivo.addEventListener("gattserverdisconnected", alDesconectar);
  try {
    await caracteristica.startNotifications();
  } catch {
    caracteristica.removeEventListener("characteristicvaluechanged", alValor);
    dispositivo.removeEventListener("gattserverdisconnected", alDesconectar);
    return { ok: false, motivo: SIN_PERFIL };
  }
  alEstado({ conectado: true, dispositivo: dispositivo.name || dispositivo.id || "pulsómetro" });
  return {
    ok: true,
    dispositivo,
    desconectar: () => {
      activo = false;
      caracteristica.removeEventListener("characteristicvaluechanged", alValor);
      dispositivo.removeEventListener("gattserverdisconnected", alDesconectar);
      try { gatt.disconnect(); } catch { /* ya estaba desconectado */ }
    },
  };
}

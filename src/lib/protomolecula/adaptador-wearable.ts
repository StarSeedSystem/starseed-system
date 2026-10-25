import type { MetricaSalud, Parametro, ParametroRef } from "./tipos";

export interface MedidaWearable { fuente: "wearable:pulso"; bruto: number }

export type PerfilHeartRate = {
  servicio: number; // 0x180D Heart Rate Measurement
  caracteristica: number; // 0x2A37 Heart Rate Measurement
};

export type EntradaHeartRate = {
  id: string;
  nombre: string | null;
  estado: string;
  addEventListener(tipo: "heartrate", f: (ev: EventoMedidaHeartRate) => void): void;
  removeEventListener(tipo: "heartrate", f: (ev: EventoMedidaHeartRate) => void): void;
};

export type AccesoBluetooth = {
  entradas: { forEach(f: (entrada: EntradaHeartRate) => void): void };
  addEventListener(tipo: "statechange", f: () => void): void;
  removeEventListener(tipo: "statechange", f: () => void): void;
};

export interface NavegadorBluetooth { requestBluetoothDevices?: (opciones?: { filters?: Array<{ services: string[] }> }) => Promise<AccesoBluetooth> }

export const SIN_BLUETOOTH = "Este navegador no ofrece Bluetooth Web";
export const SIN_PERMISO_BT = "No hay permiso para usar Bluetooth en este sitio: actívalo en los ajustes del navegador (al permitir un sitio, Firefox pide además aceptar el permiso del sitio)";

export const SIN_WEB_BLUETOOTH = "Este navegador no ofrece Bluetooth web";

export const hayBluetoothWeb = (nav?: NavegadorBluetooth | null): boolean =>
  typeof (nav as unknown)?.requestBluetoothDevices === "function";

export async function pedirAccesoBluetooth(
  nav?: NavegadorBluetooth | null,
  ahora: number = Date.now()
): Promise<{ ok: true; acceso: AccesoBluetooth } | { ok: false; motivo: string }> {
  const pedir = (nav as unknown)?.requestBluetoothDevices;
  if (typeof pedir !== "function") return { ok: false, motivo: SIN_WEB_BLUETOOTH };
  try {
    const acceso = await pedir.call(nav, {
      filters: [{ services: ["heart_rate"] }],
    });
    return { ok: true, acceso };
  } catch (e) {
    const nombre = typeof e === "object" && e !== null && "name" in e ? String((e as { name: unknown }).name) : "";
    if (nombre === "NotAllowedError" || nombre === "SecurityError") return { ok: false, motivo: SIN_PERMISO_BT };
    return { ok: false, motivo: `El navegador no pudo abrir Bluetooth${nombre ? ` (${nombre})` : ""}` };
  }
}

export interface EventoMedidaHeartRate {
  dispositivos: string | null;
  banderas: number;
  valor: number;
}

export function analizarMedidaHeartRate(evento: EventoMedidaHeartRate): MedidaWearable | null {
  const { dispositivos, banderas, valor } = evento;
  const tiene8Bits = (banderas & 0x01) !== 0;
  const contactoSensor = (banderas & 0x02) !== 0;
  const raw = tiene8Bits ? valor : (evento.valor * 2);
  const fuente: MedidaWearable = { fuente: "wearable:pulso", bruto: raw };
  return fuente;
}

export function conectarHeartRate(
  acceso: AccesoBluetooth,
  alMedida: (m: MedidaWearable) => void,
  alCambiarDispositivos?: (nombres: string[]) => void,
): () => void {
  const oyentes = new Map<string, { entrada: EntradaHeartRate; f: (ev: EventoMedidaHeartRate) => void }>();
  let activo = true;

  const soltar = (id: string) => {
    const o = oyentes.get(id);
    if (o) o.entrada.removeEventListener("heartrate", o.f);
    oyentes.delete(id);
  };

  const sincronizar = () => {
    if (!activo) return;
    const vivas = new Map<string, EntradaHeartRate>();
    acceso.entradas.forEach((e) => {
      if (e.estado !== "disconnected") vivas.set(e.id, e);
    });

    for (const [id, o] of [...oyentes]) {
      if (vivas.get(id) !== o.entrada) soltar(id);
    }

    for (const [id, e] of vivas) {
      if (oyentes.has(id)) continue;
      const f = (ev: EventoMedidaHeartRate) => {
        const m = analizarMedidaHeartRate(ev);
        if (m && activo) alMedida(m);
      };
      e.addEventListener("heartrate", f);
      oyentes.set(id, { entrada: e, f });
    }

    alCambiarDispositivos?.([...oyentes.values()].map((o) => o.entrada.nombre || o.entrada.id));
  };

  acceso.addEventListener("statechange", sincronizar);
  sincronizar();

  return () => {
    if (!activo) return;
    activo = false;
    acceso.removeEventListener("statechange", sincronizar);
    for (const id of [...oyentes.keys()]) soltar(id);
  };
}

export interface ParametrosHeartRate {
  bpm: Parametro;
  sf: Parametro;
}

export function obtenerParametrosHeartRate(): ParametrosHeartRate {
  return {
    bpm: { id: "bpm", nombre: "BPM", tipo: "numero", min: 40, max: 180, paso: 1, unidad: "bpm", defecto: 75 },
    sf: { id: "sf", nombre: "Variación de frecuencia cardíaca", tipo: "numero", min: 0, max: 100, paso: 1, unidad: "bpm", defecto: 0 },
  };
}

export type AdvertenciaWearable = "sin Bluetooth" | "sin permiso" | "dispositivo no conectado" | "métrica no reconocida";

export function obtenerAdvertenciaDispositivo(
  resultado: { ok: false; motivo: string } | null,
  dispositivosConectados: string[]
): AdvertenciaWearable | null {
  if (!resultado) return null;
  if (resultado.motivo.includes("Bluetooth web")) return "sin Bluetooth";
  if (resultado.motivo.includes("permiso")) return "sin permiso";
  if (dispositivosConectados.length === 0) return "dispositivo no conectado";
  return null;
}
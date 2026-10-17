import { describe, expect, it, vi } from "vitest";
import {
  analizarMedida,
  conectarBluetooth,
  hayBluetooth,
  pedirAccesoBluetooth,
  SIN_BLUETOOTH,
  SIN_PERMISO,
  type DispositivoBluetooth,
  type EventoValorCaracteristica,
  type MedidaPulso,
  type NavegadorBluetooth,
  type ServidorBluetooth,
} from "../adaptador-wearable";
import type { FuenteControl } from "../vinculos-control";

/** NO hay ningún wearable real conectado: los aparatos y el acceso del navegador están simulados aquí. */
type Oyente = (ev: EventoValorCaracteristica) => void;
const dispositivo = (id: string, name: string | null) => {
  const oyentes = new Set<Oyente>();
  const gattServidor: ServidorBluetooth = { getPrimaryService: () => Promise.resolve(servicioBluetooth()) };
  return { id, name, gatt: gattServidor, oyentes, addEventListener: (_t: "gattserverdisconnected", f: Oyente) => void oyentes.add(f), removeEventListener: (_t: "gattserverdisconnected", f: Oyente) => void oyentes.delete(f) };
};
const servicioBluetooth = (): ServicioBluetooth => ({ getCharacteristic: () => Promise.resolve(caracteristicaBluetooth()) });
const caracteristicaBluetooth = (): CaracteristicaBluetooth => {
  const oyentes = new Set<Oyente>();
  return { startNotifications: () => Promise.resolve(), stopNotifications: () => Promise.resolve(), addEventListener: (_t: "characteristicvaluechanged", f: Oyente) => void oyentes.add(f), removeEventListener: (_t: "characteristicvaluechanged", f: Oyente) => void oyentes.delete(f) };
};
const crearMedida = (bytes: number[]): MedidaPulso => {
  const datos = new DataView(new Uint8Array(bytes).buffer);
  const resultado = analizarMedida(datos);
  if (!resultado) throw new Error("No se pudo generar medida de prueba");
  return resultado;
};

describe("analizarMedida: bytes → fuente y valor bruto", () => {
  it("UINT8 con contacto", () => {
    expect(analizarMedida(new DataView(new Uint8Array([0x02, 80]).buffer))).toEqual({
      fuente: { tipo: "sensor", sensorId: "wearable:pulso", eje: "contacto" },
      bruto: 80
    });
  });
  it("UINT8 sin contacto", () => {
    expect(analizarMedida(new DataView(new Uint8Array([0x00, 60]).buffer))).toEqual({
      fuente: { tipo: "sensor", sensorId: "wearable:pulso", eje: "sin_contacto" },
      bruto: 60
    });
  });
  it("UINT16 con contacto", () => {
    expect(analizarMedida(new DataView(new Uint8Array([0x03, 0x78, 0x00]).buffer))).toEqual({
      fuente: { tipo: "sensor", sensorId: "wearable:pulso", eje: "contacto" },
      bruto: 120
    });
  });
  it("UINT16 sin contacto", () => {
    expect(analizarMedida(new DataView(new Uint8Array([0x01, 0x64, 0x00]).buffer))).toEqual({
      fuente: { tipo: "sensor", sensorId: "wearable:pulso", eje: "sin_contacto" },
      bruto: 100
    });
  });
  it("ignora datos nulos", () => {
    expect(analizarMedida(null)).toBeNull();
  });
});

describe("hayBluetooth: detección de disponibilidad", () => {
  it("devuelve false si no hay objeto bluetooth", () => {
    expect(hayBluetooth({})).toBe(false);
    expect(hayBluetooth(undefined)).toBe(false);
  });
  it("devuelve true si hay requestDevice", () => {
    const nav = { bluetooth: { requestDevice: () => Promise.resolve({} as DispositivoBluetooth) } };
    expect(hayBluetooth(nav)).toBe(true);
  });
  it("devuelve false si no hay requestDevice", () => {
    const nav = { bluetooth: {} };
    expect(hayBluetooth(nav)).toBe(false);
  });
});

describe("pedirAccesoBluetooth: el permiso solo se pide al pulsar «Conectar wearable»", () => {
  it("sin Web Bluetooth dice el motivo; denegado da el suyo; concedido devuelve el dispositivo", async () => {
    expect(await pedirAccesoBluetooth({})).toEqual({ ok: false, motivo: SIN_BLUETOOTH });
    const negado = { bluetooth: { requestDevice: () => Promise.reject(Object.assign(new Error("no"), { name: "NotAllowedError" })) } };
    expect(await pedirAccesoBluetooth(negado)).toEqual({ ok: false, motivo: SIN_PERMISO });
    const disp = dispositivo("dev-1", "Pulsera XYZ");
    const pedir = vi.fn(async () => disp);
    const r = await pedirAccesoBluetooth({ bluetooth: { requestDevice: pedir } });
    expect(r.ok && r.dispositivo).toBe(disp);
    expect(pedir).toHaveBeenCalledWith({ filters: [{ services: ["heart_rate"] }], optionalServices: [] });
  });
});

describe("conectarBluetooth: manejo de conexiones y notificaciones", () => {
  it("entrega cada medida con el estado de contacto", () => {
    const disp = dispositivo("dev-1", "Pulsera XYZ");
    const medidas: MedidaPulso[] = [];
    const desconectar = conectarBluetooth(disp, (m) => medidas.push(m));
    const caracteristica = caracteristicaBluetooth();
    const oyente = Array.from(caracteristica.oyentes)[0];
    oyente({ target: { value: new DataView(new Uint8Array([0x02, 80]).buffer) } });
    oyente({ target: { value: new DataView(new Uint8Array([0x00, 60]).buffer) } });
    expect(medidas.length).toBe(2);
    expect(medidas[0].fuente.eje).toBe("contacto");
    expect(medidas[0].bruto).toBe(80);
    expect(medidas[1].fuente.eje).toBe("sin_contacto");
    expect(medidas[1].bruto).toBe(60);
    desconectar();
  });
  it("desconectar: no llega nada más", () => {
    const disp = dispositivo("dev-1", "Pulsera XYZ");
    const recibir = vi.fn();
    const desconectar = conectarBluetooth(disp, recibir);
    const caracteristica = caracteristicaBluetooth();
    const oyente = Array.from(caracteristica.oyentes)[0];
    oyente({ target: { value: new DataView(new Uint8Array([0x02, 80]).buffer) } });
    recibir.mockClear();
    desconectar();
    oyente({ target: { value: new DataView(new Uint8Array([0x02, 90]).buffer) } });
    expect(recibir).toHaveBeenCalledTimes(0);
  });
});
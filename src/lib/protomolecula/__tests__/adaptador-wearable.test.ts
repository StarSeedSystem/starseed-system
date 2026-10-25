import { describe, expect, it } from "vitest";
import { analizarMedidaHeartRate, conectarHeartRate, type EntradaHeartRate, type AccesoBluetooth } from "../adaptador-wearable";

type Oyente = (ev: { dispositivos: string | null; banderas: number; valor: number }) => void;

const entrada = (id: string, nombre: string | null, estado = "connected") => {
  const oyentes = new Set<Oyente>();
  return {
    id,
    nombre,
    estado,
    addEventListener: (_tipo: "heartrate", f: Oyente) => oyentes.add(f),
    removeEventListener: (_tipo: "heartrate", f: Oyente) => oyentes.delete(f),
    enviar: (ev: { dispositivos: string | null; banderas: number; valor: number }) => oyentes.forEach((f) => f(ev)),
  };
};

const acceso = (...entradas: ReturnType<typeof entrada>[]) => {
  const avisos = new Set<() => void>();
  return {
    entradas,
    avisos,
    addEventListener: (_tipo: "statechange", f: () => void) => avisos.add(f),
    removeEventListener: (_tipo: "statechange", f: () => void) => avisos.delete(f),
  };
};

describe("analizarMedidaHeartRate: trama de heart rate Bluetooth estándar → medida normalizada", () => {
  it("8 bits de banderas, sin contacto, valor de 60 bpm → medida", () => {
    const evento = { dispositivos: "reloj-x", banderas: 0x01, valor: 60 };
    const resultado = analizarMedidaHeartRate(evento);
    expect(resultado).toEqual({ fuente: "wearable:pulso", bruto: 60 });
  });

  it("8 bits de banderas, contacto sensor, valor de 80 bpm → medida", () => {
    const evento = { dispositivos: "reloj-x", banderas: 0x03, valor: 80 };
    const resultado = analizarMedidaHeartRate(evento);
    expect(resultado).toEqual({ fuente: "wearable:pulso", bruto: 80 });
  });

  it("16 bits de banderas, sin contacto, valor de 70 bpm → medida", () => {
    const evento = { dispositivos: "reloj-x", banderas: 0x01, valor: 70 };
    const resultado = analizarMedidaHeartRate(evento);
    expect(resultado).toEqual({ fuente: "wearable:pulso", bruto: 70 });
  });

  it("banderas desconocidas → se ignoran, valor de 90 bpm → medida", () => {
    const evento = { dispositivos: "reloj-x", banderas: 0x05, valor: 90 };
    const resultado = analizarMedidaHeartRate(evento);
    expect(resultado).toEqual({ fuente: "wearable:pulso", bruto: 90 });
  });
});

describe("conectarHeartRate", () => {
  it("recibe medidas de todos los dispositivos conectados y usa el nombre del aparato (o su id si no tiene nombre)", () => {
    const relog = entrada("in-1", "myWatch");
    const ranillo = entrada("in-2", null);
    const recibido: { fuente: string; bruto: number }[] = [];

    conectarHeartRate(acceso(relog, ranillo), (m) => recibido.push(m));

    relog.enviar({ dispositivos: "myWatch", banderas: 0x01, valor: 72 });
    ranillo.enviar({ dispositivos: "in-2", banderas: 0x01, valor: 85 });

    expect(recibido).toEqual([
      { fuente: "wearable:pulso", bruto: 72 },
      { fuente: "wearable:pulso", bruto: 85 },
    ]);
  });

  it("detecta altas y bajas de conexión", () => {
    const relojsito = entrada("in-1", "reloj1", "disconnected");
    const relojito = entrada("in-2", "reloj2", "connected");
    const activos: string[] = [];

    conectarHeartRate(acceso(relojsito, relojito), () => {}, (nombres) => activos.push(...nombres));

    expect(activos).toEqual(["reloj2"]);
  });
});
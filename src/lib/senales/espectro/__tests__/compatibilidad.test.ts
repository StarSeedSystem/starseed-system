/**
 * Tests de compatibilidad: radio, región LoRa, malla, estación y SDR (MAP1116B).
 */

import { describe, it, expect } from "vitest";
import { compatiblesDe, MOTIVO_SIN_DATOS, type EquipoCompat } from "../compatibilidad";
import type { Compatibilidad, SenalEspectro } from "../tipos";

function senal(over: Partial<SenalEspectro> = {}): SenalEspectro {
  return {
    id: "s1", medio: "wifi", banda: "wifi-2.4", frecuenciaKhz: 2412000, anchoKhz: 20000,
    fuerzaDbm: -50, calidad: 0.8, origen: "medida", capa: "propia", fuente: "prueba",
    medidoEn: 1_700_000_000_000, zona: null, compatibles: [], ...over,
  };
}

function uno(s: SenalEspectro, equipo: EquipoCompat, con: Compatibilidad["con"]): Compatibilidad {
  const c = compatiblesDe(s, equipo).find((x) => x.con === con);
  if (!c) throw new Error(`falta la compatibilidad con ${con}`);
  return c;
}

interface Caso {
  nombre: string;
  senal?: Partial<SenalEspectro>;
  equipo: EquipoCompat;
  con: Compatibilidad["con"];
  posible: boolean;
  motivo: string;
}

const CASOS: readonly Caso[] = [
  { nombre: "Wi-Fi con radio", equipo: { radios: ["wifi"] }, con: "wifi", posible: true, motivo: "Wi-Fi" },
  { nombre: "Wi-Fi sin radio", equipo: { radios: ["bluetooth"] }, con: "wifi", posible: false, motivo: "no declara Wi-Fi" },
  { nombre: "Bluetooth con radio", senal: { medio: "bluetooth", banda: "ble-2.4", frecuenciaKhz: 2441000 }, equipo: { radios: ["bluetooth"] }, con: "bluetooth", posible: true, motivo: "Bluetooth" },
  { nombre: "Bluetooth sin radio", senal: { medio: "bluetooth", banda: "ble-2.4", frecuenciaKhz: 2441000 }, equipo: { radios: ["wifi"] }, con: "bluetooth", posible: false, motivo: "este aparato no tiene Bluetooth que el sistema deje usar" },
  { nombre: "LoRa misma región", senal: { medio: "lora", banda: "lora-868", frecuenciaKhz: 868100 }, equipo: { radios: ["lora"], regionLora: "EU_868" }, con: "lora", posible: true, motivo: "misma banda" },
  { nombre: "LoRa región distinta", senal: { medio: "lora", banda: "lora-868", frecuenciaKhz: 868100 }, equipo: { radios: ["lora"], regionLora: "US" }, con: "lora", posible: false, motivo: "no se pueden enlazar" },
  { nombre: "LoRa sin región", senal: { medio: "lora", banda: "lora-868", frecuenciaKhz: 868100 }, equipo: { radios: ["lora"] }, con: "lora", posible: false, motivo: MOTIVO_SIN_DATOS },
  { nombre: "LoRa sin radio", senal: { medio: "lora", banda: "lora-868", frecuenciaKhz: 868100 }, equipo: { radios: ["wifi"], regionLora: "EU_868" }, con: "lora", posible: false, motivo: "no tiene radio LoRa" },
  { nombre: "LoRa sin frecuencia", senal: { medio: "lora", banda: "lora-868", frecuenciaKhz: null }, equipo: { radios: ["lora"], regionLora: "EU_868" }, con: "lora", posible: false, motivo: MOTIVO_SIN_DATOS },
  { nombre: "Celular con radio", senal: { medio: "celular", banda: "celular-b3", frecuenciaKhz: 1842500 }, equipo: { radios: ["celular"] }, con: "celular", posible: true, motivo: "celular" },
  { nombre: "Celular sin radio", senal: { medio: "celular", banda: "celular-b3", frecuenciaKhz: 1842500 }, equipo: { radios: [] }, con: "celular", posible: false, motivo: "radio celular" },
  { nombre: "Malla con transporte común", senal: { medio: "malla", banda: "ble", frecuenciaKhz: null }, equipo: { radios: ["bluetooth"] }, con: "neurona", posible: true, motivo: "transporte" },
  { nombre: "Malla sin transporte común", senal: { medio: "malla", banda: "ble", frecuenciaKhz: null }, equipo: { radios: ["wifi"] }, con: "neurona", posible: false, motivo: "no habla el transporte" },
  { nombre: "Malla sin dato de transporte", senal: { medio: "malla", banda: "?", frecuenciaKhz: null }, equipo: { radios: ["bluetooth"] }, con: "neurona", posible: false, motivo: MOTIVO_SIN_DATOS },
  { nombre: "Estación pública", senal: { medio: "estacion", banda: "estacion", frecuenciaKhz: null, capa: "publica" }, equipo: { radios: [] }, con: "estacion", posible: true, motivo: "publicó" },
  { nombre: "Estación privada ajena", senal: { medio: "estacion", banda: "estacion", frecuenciaKhz: null, capa: "privada" }, equipo: { radios: [] }, con: "estacion", posible: false, motivo: "privada" },
  { nombre: "Estación propia", senal: { medio: "estacion", banda: "estacion", frecuenciaKhz: null, capa: "propia" }, equipo: { radios: [] }, con: "estacion", posible: true, motivo: "tu estación" },
  { nombre: "SDR presente", senal: { medio: "sdr", banda: "sdr", frecuenciaKhz: 100000000 }, equipo: { radios: [], sdr: true }, con: "sdr", posible: true, motivo: "SDR conectado" },
  { nombre: "SDR ausente", senal: { medio: "sdr", banda: "sdr", frecuenciaKhz: 100000000 }, equipo: { radios: [] }, con: "sdr", posible: false, motivo: "no tiene un SDR" },
];

describe("compatiblesDe", () => {
  for (const caso of CASOS) {
    it(`${caso.nombre}: ${caso.posible ? "posible" : "no posible"}`, () => {
      const c = uno(senal(caso.senal), caso.equipo, caso.con);
      expect(c.posible).toBe(caso.posible);
      expect(c.motivo).toContain(caso.motivo);
    });
  }

  it("sin radios no afirma nada: todo sale posible:false", () => {
    const lista = compatiblesDe(senal(), { radios: [] });
    expect(lista.length).toBeGreaterThan(0);
    expect(lista.every((c) => c.posible === false)).toBe(true);
  });

  it("LoRa 2,4 GHz usa su banda aunque se solape con Wi-Fi", () => {
    const c = uno(senal({ medio: "lora", banda: "lora-2.4", frecuenciaKhz: 2441750 }), { radios: ["lora"], regionLora: "LORA_24" }, "lora");
    expect(c.posible).toBe(true);
  });

  it("la estación pública no promete una posición exacta", () => {
    const c = uno(senal({ medio: "estacion", banda: "estacion", frecuenciaKhz: null, capa: "publica" }), { radios: [] }, "estacion");
    expect(c.posible).toBe(true);
    expect(c.motivo).toContain("nunca una posición exacta");
  });

  it("una señal de internet no inventa enlaces", () => {
    const lista = compatiblesDe(senal({ medio: "internet", banda: "internet", frecuenciaKhz: null }), { radios: ["internet"] });
    expect(lista).toEqual([]);
  });

  it("un SDR ausente tampoco hace posible escuchar una Wi-Fi", () => {
    const c = uno(senal(), { radios: ["wifi"] }, "sdr");
    expect(c.posible).toBe(false);
    expect(c.motivo).toContain("no tiene un SDR");
  });
});

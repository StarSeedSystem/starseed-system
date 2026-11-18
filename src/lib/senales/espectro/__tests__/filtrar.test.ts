import { describe, expect, it } from "vitest";
import { filtrarSenales, contarSinDatoFrecuencia } from "../filtrar";
import type { SenalEspectro, Medio, OrigenDato, CapaRed } from "../tipos";
import type { FiltroSenales, RangoKhz } from "@/components/mesh/mapa-senales/geo/panel-filtros-senales-tipos";

const crearSenal = (overrides: Partial<SenalEspectro> = {}): SenalEspectro => ({
  id: "s1",
  medio: "wifi",
  banda: "Wi-Fi 2,4 GHz",
  frecuenciaKhz: 2437000,
  anchoKhz: 20000,
  fuerzaDbm: -45,
  calidad: 0.8,
  origen: "medida",
  capa: "publica",
  fuente: "escaneo del sistema",
  medidoEn: Date.now(),
  zona: "zona-1",
  vinculo: { tipo: "neurona", id: "n1" },
  compatibles: [],
  ...overrides,
});

const FILTRO_VACIO: FiltroSenales = {
  frecuencia: { minKhz: null, maxKhz: null },
  ancho: { minKhz: null, maxKhz: null },
  capas: [],
  medios: [],
  origenes: [],
  soloCompatibles: false,
  texto: "",
};

describe("filtrarSenales", () => {
  it("devuelve todas las señales con filtro vacío", () => {
    const senales = [crearSenal({ id: "s1" }), crearSenal({ id: "s2", medio: "bluetooth" })];
    const resultado = filtrarSenales(senales, FILTRO_VACIO);
    expect(resultado).toHaveLength(2);
  });

  it("filtra por rango de frecuencia (minKhz)", () => {
    const senales = [
      crearSenal({ id: "s1", frecuenciaKhz: 2400000 }),
      crearSenal({ id: "s2", frecuenciaKhz: 2500000 }),
      crearSenal({ id: "s3", frecuenciaKhz: 5000000 }),
    ];
    const filtro: FiltroSenales = { ...FILTRO_VACIO, frecuencia: { minKhz: 2450000, maxKhz: null } };
    const resultado = filtrarSenales(senales, filtro);
    expect(resultado).toHaveLength(2);
    expect(resultado.map((s) => s.id)).toEqual(["s2", "s3"]);
  });

  it("filtra por rango de frecuencia (maxKhz)", () => {
    const senales = [
      crearSenal({ id: "s1", frecuenciaKhz: 2400000 }),
      crearSenal({ id: "s2", frecuenciaKhz: 2500000 }),
      crearSenal({ id: "s3", frecuenciaKhz: 5000000 }),
    ];
    const filtro: FiltroSenales = { ...FILTRO_VACIO, frecuencia: { minKhz: null, maxKhz: 2450000 } };
    const resultado = filtrarSenales(senales, filtro);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe("s1");
  });

  it("filtra por rango de frecuencia (min y max)", () => {
    const senales = [
      crearSenal({ id: "s1", frecuenciaKhz: 2400000 }),
      crearSenal({ id: "s2", frecuenciaKhz: 2450000 }),
      crearSenal({ id: "s3", frecuenciaKhz: 2500000 }),
    ];
    const filtro: FiltroSenales = { ...FILTRO_VACIO, frecuencia: { minKhz: 2420000, maxKhz: 2480000 } };
    const resultado = filtrarSenales(senales, filtro);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe("s2");
  });

  it("excluye señales sin frecuencia cuando hay filtro de frecuencia", () => {
    const senales = [
      crearSenal({ id: "s1", frecuenciaKhz: 2437000 }),
      crearSenal({ id: "s2", frecuenciaKhz: null }),
    ];
    const filtro: FiltroSenales = { ...FILTRO_VACIO, frecuencia: { minKhz: 2400000, maxKhz: 2500000 } };
    const resultado = filtrarSenales(senales, filtro);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe("s1");
  });

  it("filtra por rango de ancho de banda", () => {
    const senales = [
      crearSenal({ id: "s1", anchoKhz: 20000 }),
      crearSenal({ id: "s2", anchoKhz: 40000 }),
      crearSenal({ id: "s3", anchoKhz: 80000 }),
    ];
    const filtro: FiltroSenales = { ...FILTRO_VACIO, ancho: { minKhz: 30000, maxKhz: 60000 } };
    const resultado = filtrarSenales(senales, filtro);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe("s2");
  });

  it("filtra por capa (capas)", () => {
    const senales = [
      crearSenal({ id: "s1", capa: "publica" }),
      crearSenal({ id: "s2", capa: "privada" }),
      crearSenal({ id: "s3", capa: "comunidad" }),
    ];
    const filtro: FiltroSenales = { ...FILTRO_VACIO, capas: ["publica", "comunidad"] };
    const resultado = filtrarSenales(senales, filtro);
    expect(resultado).toHaveLength(2);
    expect(resultado.map((s) => s.id)).toEqual(["s1", "s3"]);
  });

  it("filtra por medio", () => {
    const senales = [
      crearSenal({ id: "s1", medio: "wifi" }),
      crearSenal({ id: "s2", medio: "bluetooth" }),
      crearSenal({ id: "s3", medio: "lora" }),
    ];
    const filtro: FiltroSenales = { ...FILTRO_VACIO, medios: ["wifi", "lora"] };
    const resultado = filtrarSenales(senales, filtro);
    expect(resultado).toHaveLength(2);
    expect(resultado.map((s) => s.id)).toEqual(["s1", "s3"]);
  });

  it("filtra por origen del dato", () => {
    const senales = [
      crearSenal({ id: "s1", origen: "medida" }),
      crearSenal({ id: "s2", origen: "declarada" }),
      crearSenal({ id: "s3", origen: "estimada" }),
    ];
    const filtro: FiltroSenales = { ...FILTRO_VACIO, origenes: ["medida", "estimada"] };
    const resultado = filtrarSenales(senales, filtro);
    expect(resultado).toHaveLength(2);
    expect(resultado.map((s) => s.id)).toEqual(["s1", "s3"]);
  });

  it("filtra por texto (busca en medio, banda, fuente, zona, vinculo)", () => {
    const senales = [
      crearSenal({ id: "s1", medio: "wifi", banda: "Wi-Fi 2,4 GHz", fuente: "escaneo", zona: "casa" }),
      crearSenal({ id: "s2", medio: "bluetooth", banda: "BLE", fuente: "sistema", zona: "oficina" }),
    ];
    const filtroWifi: FiltroSenales = { ...FILTRO_VACIO, texto: "wifi" };
    const filtroCasa: FiltroSenales = { ...FILTRO_VACIO, texto: "casa" };
    const filtroOficina: FiltroSenales = { ...FILTRO_VACIO, texto: "oficina" };

    expect(filtrarSenales(senales, filtroWifi)).toHaveLength(1);
    expect(filtrarSenales(senales, filtroCasa)).toHaveLength(1);
    expect(filtrarSenales(senales, filtroOficina)).toHaveLength(1);
  });

  it("combina múltiples filtros (frecuencia + capa + medio)", () => {
    const senales = [
      crearSenal({ id: "s1", frecuenciaKhz: 2437000, capa: "publica", medio: "wifi" }),
      crearSenal({ id: "s2", frecuenciaKhz: 2437000, capa: "privada", medio: "wifi" }),
      crearSenal({ id: "s3", frecuenciaKhz: 5000000, capa: "publica", medio: "wifi" }),
      crearSenal({ id: "s4", frecuenciaKhz: 2437000, capa: "publica", medio: "bluetooth" }),
    ];
    const filtro: FiltroSenales = {
      ...FILTRO_VACIO,
      frecuencia: { minKhz: 2400000, maxKhz: 2500000 },
      capas: ["publica"],
      medios: ["wifi"],
    };
    const resultado = filtrarSenales(senales, filtro);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe("s1");
  });

  it("filtro vacío de capas/medios/origenes no filtra", () => {
    const senales = [
      crearSenal({ id: "s1", capa: "publica", medio: "wifi", origen: "medida" }),
      crearSenal({ id: "s2", capa: "privada", medio: "bluetooth", origen: "declarada" }),
    ];
    const filtro: FiltroSenales = { ...FILTRO_VACIO, capas: [], medios: [], origenes: [] };
    const resultado = filtrarSenales(senales, filtro);
    expect(resultado).toHaveLength(2);
  });
});

describe("contarSinDatoFrecuencia", () => {
  it("cuenta señales sin frecuencia", () => {
    const senales = [
      crearSenal({ id: "s1", frecuenciaKhz: 2437000 }),
      crearSenal({ id: "s2", frecuenciaKhz: null }),
      crearSenal({ id: "s3", frecuenciaKhz: 5000000 }),
      crearSenal({ id: "s4", frecuenciaKhz: null }),
    ];
    expect(contarSinDatoFrecuencia(senales)).toBe(2);
  });

  it("devuelve 0 si todas tienen frecuencia", () => {
    const senales = [
      crearSenal({ id: "s1", frecuenciaKhz: 2437000 }),
      crearSenal({ id: "s2", frecuenciaKhz: 5000000 }),
    ];
    expect(contarSinDatoFrecuencia(senales)).toBe(0);
  });

  it("devuelve 0 para array vacío", () => {
    expect(contarSinDatoFrecuencia([])).toBe(0);
  });
});
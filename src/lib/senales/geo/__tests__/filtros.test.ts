import { describe, expect, it } from "vitest";
import { filtrarSenales, contarFiltradas, filtroEsVacio, FILTRO_INICIAL } from "../filtros";
import type { SenalEspectro } from "../../espectro/tipos";
import type { FiltroSenales } from "@/components/mesh/mapa-senales/geo/panel-filtros-senales-tipos";

const senalBase: SenalEspectro = {
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
  medidoEn: 1_700_000_000_000,
  zona: "abcde",
  vinculo: { tipo: "neurona", id: "n1" },
  compatibles: [{ con: "neurona", que: "conexión", posible: true, motivo: "mismo canal" }],
};

const senales: readonly SenalEspectro[] = [
  { ...senalBase, id: "s1", medio: "wifi", frecuenciaKhz: 2437000, anchoKhz: 20000, origen: "medida", capa: "publica" },
  { ...senalBase, id: "s2", medio: "bluetooth", frecuenciaKhz: 2441000, anchoKhz: 1000, origen: "medida", capa: "privada" },
  { ...senalBase, id: "s3", medio: "lora", frecuenciaKhz: 868500, anchoKhz: 125000, origen: "declarada", capa: "publica" },
  { ...senalBase, id: "s4", medio: "wifi", frecuenciaKhz: 5500000, anchoKhz: 40000, origen: "estimada", capa: "comunidad" },
  { ...senalBase, id: "s5", medio: "celular", frecuenciaKhz: null, anchoKhz: null, origen: "medida", capa: "externa" },
];

describe("filtrarSenales", () => {
  it("con filtro vacío devuelve todas las señales con frecuencia", () => {
    const resultado = filtrarSenales(senales, FILTRO_INICIAL);
    expect(resultado).toHaveLength(4);
    expect(resultado.map((s) => s.id)).toEqual(["s1", "s2", "s3", "s4"]);
  });

  it("filtra por rango de frecuencia", () => {
    const filtro: FiltroSenales = { ...FILTRO_INICIAL, frecuencia: { minKhz: 2400000, maxKhz: 2500000 } };
    const resultado = filtrarSenales(senales, filtro);
    expect(resultado.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("filtra por rango de ancho", () => {
    const filtro: FiltroSenales = { ...FILTRO_INICIAL, ancho: { minKhz: 10000, maxKhz: 50000 } };
    const resultado = filtrarSenales(senales, filtro);
    expect(resultado.map((s) => s.id)).toEqual(["s1", "s4"]);
  });

  it("filtra por capa de red", () => {
    const filtro: FiltroSenales = { ...FILTRO_INICIAL, capas: ["publica"] };
    const resultado = filtrarSenales(senales, filtro);
    expect(resultado.map((s) => s.id)).toEqual(["s1", "s3"]);
  });

  it("filtra por medio", () => {
    const filtro: FiltroSenales = { ...FILTRO_INICIAL, medios: ["wifi"] };
    const resultado = filtrarSenales(senales, filtro);
    expect(resultado.map((s) => s.id)).toEqual(["s1", "s4"]);
  });

  it("filtra por origen del dato", () => {
    const filtro: FiltroSenales = { ...FILTRO_INICIAL, origenes: ["medida"] };
    const resultado = filtrarSenales(senales, filtro);
    expect(resultado.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("filtra por texto", () => {
    const filtro: FiltroSenales = { ...FILTRO_INICIAL, texto: "lora" };
    const resultado = filtrarSenales(senales, filtro);
    expect(resultado.map((s) => s.id)).toEqual(["s3"]);
  });

  it("filtra solo compatibles", () => {
    const filtro: FiltroSenales = { ...FILTRO_INICIAL, soloCompatibles: true };
    const resultado = filtrarSenales(senales, filtro);
    expect(resultado.map((s) => s.id)).toEqual(["s1", "s2", "s3", "s4"]);
  });

  it("combina múltiples filtros", () => {
    const filtro: FiltroSenales = {
      ...FILTRO_INICIAL,
      frecuencia: { minKhz: 2400000, maxKhz: 2500000 },
      medios: ["wifi", "bluetooth"],
      origenes: ["medida"],
    };
    const resultado = filtrarSenales(senales, filtro);
    expect(resultado.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("señales sin frecuencia nunca pasan filtros de frecuencia/ancho", () => {
    const filtro: FiltroSenales = { ...FILTRO_INICIAL };
    const resultado = filtrarSenales(senales, filtro);
    expect(resultado.find((s) => s.id === "s5")).toBeUndefined();
  });
});

describe("contarFiltradas", () => {
  it("cuenta visibles y ocultas sin dato", () => {
    const filtro: FiltroSenales = { ...FILTRO_INICIAL, medios: ["wifi"] };
    const { visibles, ocultasSinDato } = contarFiltradas(senales, filtro);
    expect(visibles).toBe(2);
    expect(ocultasSinDato).toBe(1);
  });

  it("con filtro vacío: visibles = con frecuencia, ocultasSinDato = sin frecuencia", () => {
    const { visibles, ocultasSinDato } = contarFiltradas(senales, FILTRO_INICIAL);
    expect(visibles).toBe(4);
    expect(ocultasSinDato).toBe(1);
  });
});

describe("filtroEsVacio", () => {
  it("filtro inicial es vacío", () => {
    expect(filtroEsVacio(FILTRO_INICIAL)).toBe(true);
  });

  it("cualquier cambio lo hace no vacío", () => {
    expect(filtroEsVacio({ ...FILTRO_INICIAL, frecuencia: { minKhz: 1, maxKhz: null } })).toBe(false);
    expect(filtroEsVacio({ ...FILTRO_INICIAL, capas: ["publica"] })).toBe(false);
    expect(filtroEsVacio({ ...FILTRO_INICIAL, texto: "x" })).toBe(false);
  });
});
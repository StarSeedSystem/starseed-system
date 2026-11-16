/**
 * Tests de filtros del espectrómetro: criterios, «sin dato» y resumen (MAP1116B).
 */

import { describe, it, expect } from "vitest";
import { FILTRO_VACIO, filtrarConCuenta, filtrarSenales, filtroActivo, resumenFiltro, type FiltroEspectro } from "../filtros";
import type { SenalEspectro } from "../tipos";

function senal(id: string, o: Partial<SenalEspectro> = {}): SenalEspectro {
  return {
    id, medio: "wifi", banda: "2,4 GHz", frecuenciaKhz: 2437000, anchoKhz: 20000,
    fuerzaDbm: -50, calidad: 0.7, origen: "medida", capa: "propia",
    fuente: "escaneo del sistema", medidoEn: null, zona: "A1", compatibles: [], ...o,
  };
}

const ids = (xs: SenalEspectro[]) => xs.map((s) => s.id);

describe("FILTRO_VACIO", () => {
  it("devuelve todas las señales, incluso las que no tienen datos", () => {
    const lista = [senal("a"), senal("b", { frecuenciaKhz: null, anchoKhz: null }), senal("c", { medio: "lora" })];
    expect(ids(filtrarSenales(lista, FILTRO_VACIO))).toEqual(["a", "b", "c"]);
    expect(filtrarConCuenta(lista, FILTRO_VACIO).ocultasSinDato).toBe(0);
  });
});

describe("criterios por separado", () => {
  it("filtra por rango de frecuencia", () => {
    const lista = [senal("a", { frecuenciaKhz: 2437000 }), senal("b", { frecuenciaKhz: 5180000 })];
    expect(ids(filtrarSenales(lista, { frecuenciaKhz: { desde: 2400000, hasta: 2500000 } }))).toEqual(["a"]);
  });

  it("filtra por rango de ancho de banda", () => {
    const lista = [senal("a", { anchoKhz: 20000 }), senal("b", { anchoKhz: 160000 })];
    expect(ids(filtrarSenales(lista, { anchoKhz: { hasta: 40000 } }))).toEqual(["a"]);
  });

  it("filtra por capa, medio y origen", () => {
    const lista = [senal("a"), senal("b", { capa: "publica" }), senal("c", { medio: "lora" }), senal("d", { origen: "estimada" })];
    expect(ids(filtrarSenales(lista, { capas: ["publica"] }))).toEqual(["b"]);
    expect(ids(filtrarSenales(lista, { medios: ["lora"] }))).toEqual(["c"]);
    expect(ids(filtrarSenales(lista, { origenes: ["estimada"] }))).toEqual(["d"]);
  });

  it("soloCompatibles deja únicamente las compatibles posibles", () => {
    const lista = [
      senal("a", { compatibles: [{ con: "lora", que: "puente", posible: true, motivo: "mismo nodo" }] }),
      senal("b", { compatibles: [{ con: "lora", que: "puente", posible: false, motivo: "sin radio" }] }),
      senal("c"),
    ];
    expect(ids(filtrarSenales(lista, { soloCompatibles: true }))).toEqual(["a"]);
  });

  it("filtra por texto sin distinguir mayúsculas y busca en banda y fuente", () => {
    const lista = [senal("a"), senal("b", { banda: "5 GHz", fuente: "enlace de la malla" })];
    expect(ids(filtrarSenales(lista, { texto: "wi-fi" }))).toEqual([]);
    expect(ids(filtrarSenales(lista, { texto: "MALLA" }))).toEqual(["b"]);
    expect(ids(filtrarSenales(lista, { texto: "  " }))).toEqual(["a", "b"]);
    expect(ids(filtrarSenales(lista, { texto: "" }))).toEqual(["a", "b"]);
  });

  it("combina capa, medio y frecuencia", () => {
    const lista = [
      senal("a", { capa: "publica" }),
      senal("b", { capa: "publica", medio: "lora" }),
      senal("c", { capa: "publica", medio: "lora", frecuenciaKhz: 868500 }),
    ];
    const f: FiltroEspectro = { capas: ["publica"], medios: ["lora"], frecuenciaKhz: { hasta: 1000000 } };
    expect(ids(filtrarSenales(lista, f))).toEqual(["c"]);
  });
});

describe("sin dato y rangos", () => {
  it("una señal sin frecuencia no pasa y se cuenta una sola vez", () => {
    const lista = [senal("a"), senal("b", { frecuenciaKhz: null, anchoKhz: null })];
    const r = filtrarConCuenta(lista, { frecuenciaKhz: { desde: 2400000 }, anchoKhz: { desde: 1000 } });
    expect(ids(r.visibles)).toEqual(["a"]);
    expect(r.ocultasSinDato).toBe(1);
  });

  it("una señal sin ancho de banda no pasa un filtro de ancho", () => {
    const lista = [senal("a"), senal("b", { anchoKhz: null })];
    const r = filtrarConCuenta(lista, { anchoKhz: { hasta: 40000 } });
    expect(ids(r.visibles)).toEqual(["a"]);
    expect(r.ocultasSinDato).toBe(1);
  });

  it("corrige rangos invertidos", () => {
    const lista = [senal("a", { frecuenciaKhz: 2437000 }), senal("b", { frecuenciaKhz: 5180000 })];
    expect(ids(filtrarSenales(lista, { frecuenciaKhz: { desde: 2500000, hasta: 2400000 } }))).toEqual(["a"]);
    const anchos = [senal("a", { anchoKhz: 20000 }), senal("b", { anchoKhz: 160000 })];
    expect(ids(filtrarSenales(anchos, { anchoKhz: { desde: 40000, hasta: 20000 } }))).toEqual(["a"]);
  });
});

describe("filtroActivo y resumenFiltro", () => {
  it("detecta si hay algún criterio real", () => {
    expect(filtroActivo(FILTRO_VACIO)).toBe(false);
    expect(filtroActivo({ capas: [] })).toBe(false);
    expect(filtroActivo({ texto: "   " })).toBe(false);
    expect(filtroActivo({ frecuenciaKhz: {} })).toBe(false);
    expect(filtroActivo({ texto: "lora" })).toBe(true);
    expect(filtroActivo({ soloCompatibles: true })).toBe(true);
    expect(filtroActivo({ frecuenciaKhz: { desde: 100 } })).toBe(true);
  });

  it("resume los criterios en palabras", () => {
    expect(resumenFiltro(FILTRO_VACIO)).toBe("sin filtros");
    expect(
      resumenFiltro({ frecuenciaKhz: { desde: 2400000, hasta: 2483500 }, anchoKhz: { desde: 20000, hasta: 40000 }, capas: ["publica"] }),
    ).toBe("2,4 GHz · 20-40 MHz · pública");
  });
});

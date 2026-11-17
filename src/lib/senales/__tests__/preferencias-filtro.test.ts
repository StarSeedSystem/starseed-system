// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLAVE_PREFERENCIAS_MAPA,
  PREFERENCIAS_POR_DEFECTO,
  sanearPreferencias,
  leerPreferenciasMapa,
  guardarPreferenciasMapa,
} from "../preferencias-mapa";
import { FILTRO_VACIO, type FiltroEspectro } from "../espectro/filtros";

describe("sanearPreferencias — filtroEspectro", () => {
  it("cualquier basura en filtroEspectro da objeto vacío (copia, no la misma referencia)", () => {
    for (const crudo of [null, undefined, 3, "x", [], true, { frecuenciaKhz: "no" }]) {
      const p = sanearPreferencias({ filtroEspectro: crudo });
      expect(p.filtroEspectro).toEqual(FILTRO_VACIO);
      expect(p.filtroEspectro).not.toBe(FILTRO_VACIO); // copia, no la misma referencia
    }
  });

  it("filtro con rangos no finitos descarta lo inválido y conserva lo finito", () => {
    const p = sanearPreferencias({
      filtroEspectro: {
        frecuenciaKhz: { desde: NaN, hasta: Infinity },
        anchoKhz: { desde: -100, hasta: "mucho" },
      },
    });
    // -100 es finito, así que se conserva anchoKhz.desde
    expect(p.filtroEspectro).toEqual({ anchoKhz: { desde: -100 } });
  });

  it("filtro con rangos válidos se conserva", () => {
    const p = sanearPreferencias({
      filtroEspectro: {
        frecuenciaKhz: { desde: 100000, hasta: 200000 },
        anchoKhz: { desde: 1000 },
      },
    });
    expect(p.filtroEspectro).toEqual({
      frecuenciaKhz: { desde: 100000, hasta: 200000 },
      anchoKhz: { desde: 1000 },
    });
  });

  it("filtro con capas/medios/orígenes inválidos se limpian", () => {
    const p = sanearPreferencias({
      filtroEspectro: {
        capas: ["propia", "inventada", "publica", 7],
        medios: ["wifi", "desconocido", "lora"],
        origenes: ["medida", "supuesta", "estimada"],
      },
    });
    expect(p.filtroEspectro).toEqual({
      capas: ["propia", "publica"],
      medios: ["wifi", "lora"],
      origenes: ["medida", "estimada"],
    });
  });

  it("soloCompatibles y texto se sanean correctamente", () => {
    const p = sanearPreferencias({
      filtroEspectro: {
        soloCompatibles: "sí",
        texto: "  buscar  ",
      },
    });
    // soloCompatibles solo se guarda si es true explícito
    expect(p.filtroEspectro).toEqual({ texto: "buscar" });

    const p2 = sanearPreferencias({
      filtroEspectro: {
        soloCompatibles: true,
        texto: "  exacto  ",
      },
    });
    expect(p2.filtroEspectro).toEqual({ soloCompatibles: true, texto: "exacto" });
  });

  it("filtro vacío tras sanear da objeto vacío (copia)", () => {
    const p = sanearPreferencias({
      filtroEspectro: {
        frecuenciaKhz: {},
        capas: [],
      },
    });
    expect(p.filtroEspectro).toEqual(FILTRO_VACIO);
    expect(p.filtroEspectro).not.toBe(FILTRO_VACIO);
  });
});

describe("persistencia — filtroEspectro", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    try { window.localStorage.clear(); } catch { /* sin almacenamiento */ }
  });

  it("guarda y lee de vuelta el filtroEspectro, saneado", () => {
    const filtro: FiltroEspectro = {
      frecuenciaKhz: { desde: 50000, hasta: 150000 },
      capas: ["publica"],
      medios: ["lora"],
      soloCompatibles: true,
      texto: "test",
    };
    guardarPreferenciasMapa({ ...PREFERENCIAS_POR_DEFECTO, filtroEspectro: filtro });
    const guardado = JSON.parse(window.localStorage.getItem(CLAVE_PREFERENCIAS_MAPA)!);
    expect(guardado.filtroEspectro).toMatchObject(filtro);
    const leido = leerPreferenciasMapa();
    expect(leido.filtroEspectro).toMatchObject(filtro);
  });

  it("preferencias viejas sin filtroEspectro se leen con FILTRO_VACIO", () => {
    const viejas = { ...PREFERENCIAS_POR_DEFECTO, altura: "frescura" };
    delete (viejas as Record<string, unknown>).filtroEspectro;
    window.localStorage.setItem(CLAVE_PREFERENCIAS_MAPA, JSON.stringify(viejas));
    const leido = leerPreferenciasMapa();
    expect(leido.filtroEspectro).toEqual(FILTRO_VACIO);
    expect(leido.altura).toBe("frescura");
  });

  it("JSON roto o almacenamiento que lanza no rompen filtroEspectro", () => {
    window.localStorage.setItem(CLAVE_PREFERENCIAS_MAPA, "{no es json");
    expect(leerPreferenciasMapa().filtroEspectro).toEqual(FILTRO_VACIO);

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("bloqueado"); });
    expect(leerPreferenciasMapa().filtroEspectro).toEqual(FILTRO_VACIO);

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("bloqueado"); });
    expect(() => guardarPreferenciasMapa(PREFERENCIAS_POR_DEFECTO)).not.toThrow();
  });
});
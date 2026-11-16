// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLAVE_PREFERENCIAS_MAPA,
  FILTRO_VACIO,
  PREFERENCIAS_POR_DEFECTO,
  guardarPreferenciasMapa,
  leerPreferenciasMapa,
  sanearPreferencias,
} from "../preferencias-mapa";
import type { FiltroEspectro } from "../espectro/filtros";

describe("sanearPreferencias — filtroEspectro", () => {
  it("crudo roto o inválido devuelve FILTRO_VACIO (objeto vacío)", () => {
    for (const crudo of [null, undefined, 3, "x", [], true, { frecuenciaKhz: "no" }, { capas: "propia" }]) {
      const p = sanearPreferencias({ ...PREFERENCIAS_POR_DEFECTO, filtroEspectro: crudo });
      expect(p.filtroEspectro).toEqual({});
    }
  });

  it("conserva campos válidos del filtro y descarta los inválidos", () => {
    const p = sanearPreferencias({
      ...PREFERENCIAS_POR_DEFECTO,
      filtroEspectro: {
        frecuenciaKhz: { desde: 100000, hasta: 500000 },
        anchoKhz: { hasta: 20000 },
        capas: ["propia", "publica", "inventada"],
        medios: ["lora", "wifi", "desconocido"],
        origenes: ["medida", "estimada", "otro"],
        soloCompatibles: true,
        texto: "  prueba  ",
      },
    });
    expect(p.filtroEspectro).toEqual({
      frecuenciaKhz: { desde: 100000, hasta: 500000 },
      anchoKhz: { hasta: 20000 },
      capas: ["propia", "publica"],
      medios: ["lora", "wifi"],
      origenes: ["medida", "estimada"],
      soloCompatibles: true,
      texto: "prueba",
    });
  });

  it("rango con desde > hasta se corrige y números no finitos se descartan", () => {
    const p = sanearPreferencias({
      ...PREFERENCIAS_POR_DEFECTO,
      filtroEspectro: {
        frecuenciaKhz: { desde: 500000, hasta: 100000 },
        anchoKhz: { desde: NaN, hasta: Infinity },
      },
    });
    expect(p.filtroEspectro.frecuenciaKhz).toEqual({ desde: 100000, hasta: 500000 });
    expect(p.filtroEspectro.anchoKhz).toBeUndefined();
  });

  it("texto vacío o solo espacios no se guarda", () => {
    const p1 = sanearPreferencias({ ...PREFERENCIAS_POR_DEFECTO, filtroEspectro: { texto: "" } });
    const p2 = sanearPreferencias({ ...PREFERENCIAS_POR_DEFECTO, filtroEspectro: { texto: "   " } });
    expect(p1.filtroEspectro.texto).toBeUndefined();
    expect(p2.filtroEspectro.texto).toBeUndefined();
  });
});

describe("persistencia — filtroEspectro", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    try { window.localStorage.clear(); } catch { /* sin almacenamiento */ }
  });

  it("guarda y lee de vuelta el filtro, saneado", () => {
    const filtro: FiltroEspectro = {
      frecuenciaKhz: { desde: 100000, hasta: 500000 },
      capas: ["publica"],
      medios: ["lora"],
      soloCompatibles: true,
      texto: "test",
    };
    guardarPreferenciasMapa({ ...PREFERENCIAS_POR_DEFECTO, filtroEspectro: filtro });
    const guardado = JSON.parse(window.localStorage.getItem(CLAVE_PREFERENCIAS_MAPA)!);
    expect(guardado.filtroEspectro).toMatchObject(filtro);
    const leido = leerPreferenciasMapa();
    expect(leido.filtroEspectro).toEqual(filtro);
  });

  it("preferencias viejas sin filtroEspectro se leen con FILTRO_VACIO (objeto vacío)", () => {
    const viejas = { ...PREFERENCIAS_POR_DEFECTO, altura: "saltos", ocultas: ["serial"] };
    delete (viejas as Record<string, unknown>).filtroEspectro;
    window.localStorage.setItem(CLAVE_PREFERENCIAS_MAPA, JSON.stringify(viejas));
    const leido = leerPreferenciasMapa();
    expect(leido.altura).toBe("saltos");
    expect(leido.ocultas).toEqual(["serial"]);
    expect(leido.filtroEspectro).toEqual({});
  });

  it("JSON roto en localStorage no rompe y usa FILTRO_VACIO (objeto vacío)", () => {
    window.localStorage.setItem(CLAVE_PREFERENCIAS_MAPA, "{no es json");
    const leido = leerPreferenciasMapa();
    expect(leido.filtroEspectro).toEqual({});
  });
});
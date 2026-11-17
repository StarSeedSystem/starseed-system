// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { COMPARTIR } from "../cristal/puertas-internet";
import {
  CLAVE_PREFERENCIAS_RED,
  PREFERENCIAS_POR_DEFECTO,
  aPreferenciasCompartida,
  cambioDeAperturaRed,
  guardarPreferenciasRed,
  leerPreferenciasRed,
  sanearPreferenciasRed,
} from "../preferencias-red-compartida";

describe("por defecto todo apagado", () => {
  it("ni el interruptor, ni el nivel, ni el modo automático arrancan encendidos", () => {
    expect(PREFERENCIAS_POR_DEFECTO).toEqual({
      compartir: false,
      maximoCon: "nadie",
      soloWifi: true,
      kbpsSubidaMax: 1024,
      reservaBateriaPct: 30,
      automatico: false,
      compartirMedidas: false,
    });
    expect(leerPreferenciasRed()).toEqual(PREFERENCIAS_POR_DEFECTO);
  });
});

describe("sanearPreferenciasRed", () => {
  it("cualquier basura da los valores por defecto (copia, no referencia compartida)", () => {
    for (const crudo of [null, undefined, 3, "x", [], true]) {
      expect(sanearPreferenciasRed(crudo)).toEqual(PREFERENCIAS_POR_DEFECTO);
    }
  });

  it("conserva lo válido y descarta lo desconocido", () => {
    expect(sanearPreferenciasRed({
      compartir: true, maximoCon: "grupo", soloWifi: false,
      kbpsSubidaMax: 2048, reservaBateriaPct: 50, automatico: true, compartirMedidas: true,
      inventado: "sí",
    })).toEqual({
      compartir: true, maximoCon: "grupo", soloWifi: false,
      kbpsSubidaMax: 2048, reservaBateriaPct: 50, automatico: true, compartirMedidas: true,
    });
  });

  it("maximoCon fuera de COMPARTIR vuelve a «nadie» y los números se acotan", () => {
    const sucio = sanearPreferenciasRed({
      maximoCon: "todos", kbpsSubidaMax: 999999, reservaBateriaPct: 200,
    });
    expect(sucio.maximoCon).toBe("nadie");
    expect(sucio.kbpsSubidaMax).toBe(102400);
    expect(sucio.reservaBateriaPct).toBe(90);
    expect(sanearPreferenciasRed({ kbpsSubidaMax: -5 }).kbpsSubidaMax).toBe(64);
    expect(sanearPreferenciasRed({ reservaBateriaPct: -10 }).reservaBateriaPct).toBe(0);
    expect(sanearPreferenciasRed({ kbpsSubidaMax: "mucho" }).kbpsSubidaMax).toBe(1024);
    expect(sanearPreferenciasRed({ reservaBateriaPct: "media" }).reservaBateriaPct).toBe(30);
  });

  it("solo Wi-Fi queda encendido salvo un «false» explícito; los booleanos exigen «true»", () => {
    expect(sanearPreferenciasRed({ soloWifi: false }).soloWifi).toBe(false);
    expect(sanearPreferenciasRed({ soloWifi: "no" }).soloWifi).toBe(true);
    expect(sanearPreferenciasRed({ compartir: 1 }).compartir).toBe(false);
    expect(sanearPreferenciasRed({ automatico: "sí" }).automatico).toBe(false);
    expect(sanearPreferenciasRed({ compartirMedidas: true }).compartirMedidas).toBe(true);
  });
});

describe("cambioDeAperturaRed", () => {
  const p = (maximoCon: (typeof COMPARTIR)[number]) => ({ ...PREFERENCIAS_POR_DEFECTO, maximoCon });

  it("subir el nivel avisa y bajarlo o no moverse no", () => {
    expect(cambioDeAperturaRed(null, p("nadie"))).toEqual({ aviso: false });
    expect(cambioDeAperturaRed(PREFERENCIAS_POR_DEFECTO, p("grupo"))).toEqual({ aviso: true });
    expect(cambioDeAperturaRed(PREFERENCIAS_POR_DEFECTO, p("publico"))).toEqual({ aviso: true });
    expect(cambioDeAperturaRed(p("publico"), PREFERENCIAS_POR_DEFECTO)).toEqual({ aviso: false });
    expect(cambioDeAperturaRed(p("vinculos"), p("vinculos"))).toEqual({ aviso: false });
  });

  it("toda pareja de niveles de COMPARTIR se ordena bien", () => {
    for (const [i, de] of COMPARTIR.entries()) {
      for (const a of COMPARTIR) {
        expect(cambioDeAperturaRed(p(de), p(a)).aviso).toBe(COMPARTIR.indexOf(a) > i);
      }
    }
  });
});

describe("aPreferenciasCompartida", () => {
  it("traduce los topes del aparato a la forma que consume el motor", () => {
    expect(aPreferenciasCompartida({ ...PREFERENCIAS_POR_DEFECTO, maximoCon: "grupo", compartirMedidas: true })).toEqual({
      compartirMaximo: "grupo", soloWifi: true, kbpsSubidaMax: 1024, permitirMedida: true, reservaBateriaMinPct: 30,
    });
  });
});

describe("persistencia en el aparato", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    try { window.localStorage.clear(); } catch { /* sin almacenamiento */ }
  });

  it("guarda y lee de vuelta, saneado", () => {
    guardarPreferenciasRed({ ...PREFERENCIAS_POR_DEFECTO, compartir: true, maximoCon: "vinculos" });
    expect(JSON.parse(window.localStorage.getItem(CLAVE_PREFERENCIAS_RED)!))
      .toMatchObject({ compartir: true, maximoCon: "vinculos" });
    expect(leerPreferenciasRed()).toMatchObject({ compartir: true, maximoCon: "vinculos" });
  });

  it("un JSON roto, un valor raro guardado o un almacenamiento que lanza no rompen nada", () => {
    window.localStorage.setItem(CLAVE_PREFERENCIAS_RED, "{no es json");
    expect(leerPreferenciasRed()).toEqual(PREFERENCIAS_POR_DEFECTO);
    window.localStorage.setItem(CLAVE_PREFERENCIAS_RED, JSON.stringify({ maximoCon: "invasion" }));
    expect(leerPreferenciasRed().maximoCon).toBe("nadie");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("bloqueado"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("bloqueado"); });
    expect(leerPreferenciasRed()).toEqual(PREFERENCIAS_POR_DEFECTO);
    expect(() => guardarPreferenciasRed(PREFERENCIAS_POR_DEFECTO)).not.toThrow();
  });
});

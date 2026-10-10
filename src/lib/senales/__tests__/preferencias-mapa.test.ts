// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLAVE_PREFERENCIAS_MAPA, PREFERENCIAS_POR_DEFECTO, guardarPreferenciasMapa, leerPreferenciasMapa,
  sanearPreferencias,
} from "../preferencias-mapa";

describe("sanearPreferencias", () => {
  it("cualquier basura da los valores por defecto (y copias, no la referencia compartida)", () => {
    for (const crudo of [null, undefined, 3, "x", [], true]) {
      const p = sanearPreferencias(crudo);
      expect(p).toEqual(PREFERENCIAS_POR_DEFECTO);
      expect(p.ocultas).not.toBe(PREFERENCIAS_POR_DEFECTO.ocultas);
    }
  });

  it("conserva lo válido y descarta lo desconocido", () => {
    const p = sanearPreferencias({
      vista: "plano", altura: "frescura", etiquetas: "seleccion",
      ocultas: ["ble", "ble", "lora", "satelite", 7, null], cuenta: "otra", ocultarDesconectados: true, girar: true,
      soloStarSeed: true,
    });
    expect(p).toEqual({
      vista: "plano", altura: "frescura", etiquetas: "seleccion",
      ocultas: ["ble", "lora"], cuenta: "otra", ocultarDesconectados: true, girar: true, verPublicos: true,
    });
  });

  it("ver los datos públicos de otras cuentas está encendido por defecto y solo un «false» explícito lo apaga", () => {
    expect(PREFERENCIAS_POR_DEFECTO.verPublicos).toBe(true);
    expect(sanearPreferencias({ verPublicos: false }).verPublicos).toBe(false);
    expect(sanearPreferencias({ verPublicos: "no" }).verPublicos).toBe(true);
  });

  it("una altura o vista inventada vuelve al valor por defecto", () => {
    const p = sanearPreferencias({ vista: "holograma", altura: "temperatura", etiquetas: "ninguna", cuenta: "vecinos", ocultarDesconectados: "sí", girar: 1 });
    expect(p).toEqual(PREFERENCIAS_POR_DEFECTO);
  });
});

describe("persistencia en el dispositivo", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    try { window.localStorage.clear(); } catch { /* sin almacenamiento */ }
  });

  it("guarda y lee de vuelta, saneado", () => {
    guardarPreferenciasMapa({ ...PREFERENCIAS_POR_DEFECTO, altura: "saltos", ocultas: ["serial"] });
    expect(JSON.parse(window.localStorage.getItem(CLAVE_PREFERENCIAS_MAPA)!)).toMatchObject({ altura: "saltos", ocultas: ["serial"] });
    expect(leerPreferenciasMapa()).toMatchObject({ altura: "saltos", ocultas: ["serial"] });
  });

  it("un JSON roto o un almacenamiento que lanza no rompen nada", () => {
    window.localStorage.setItem(CLAVE_PREFERENCIAS_MAPA, "{no es json");
    expect(leerPreferenciasMapa()).toEqual(PREFERENCIAS_POR_DEFECTO);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("bloqueado"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("bloqueado"); });
    expect(leerPreferenciasMapa()).toEqual(PREFERENCIAS_POR_DEFECTO);
    expect(() => guardarPreferenciasMapa(PREFERENCIAS_POR_DEFECTO)).not.toThrow();
  });
});

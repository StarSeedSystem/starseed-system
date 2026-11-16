import { describe, it, expect, beforeEach } from "vitest";
import { PREFERENCIAS_POR_DEFECTO, leerPreferenciasRed, sanearPreferenciasRed, guardarPreferenciasRed } from "../preferencias-red-compartida";

describe("preferencias-red-compartida", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    global.localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      get length() { return store.size; },
    } as Storage;
  });

  it("debe retornar preferencias por defecto apagadas", () => {
    const prefs = leerPreferenciasRed();
    expect(prefs).toEqual(PREFERENCIAS_POR_DEFECTO);
    expect(prefs.interruptor).toBe(false);
  });

  it("debe sanear basura retornando los valores por defecto", () => {
    const basura = { interruptor: "no", maximoCon: "desconocido" };
    const saneado = sanearPreferenciasRed(basura);
    expect(saneado).toEqual(PREFERENCIAS_POR_DEFECTO);
  });

  it("debe sanear números fuera de rango a valores acotados", () => {
    const entrada = { kbpsSubidaMax: -100, reservaBateriaPct: 999 };
    const saneado = sanearPreferenciasRed(entrada);
    expect(saneado.kbpsSubidaMax).toBe(64);
    expect(saneado.reservaBateriaPct).toBe(90);
  });

  it("debe sanear maximoCon a valores válidos", () => {
    const entrada = { maximoCon: "amigos" };
    const saneado = sanearPreferenciasRed(entrada);
    expect(saneado.maximoCon).toBe("amigos");
  });

  it("subir nivel de maximoCon debe devolver aviso", () => {
    localStorage.setItem("starseed.preferencias.red.compartida", JSON.stringify({ ...PREFERENCIAS_POR_DEFECTO, maximoCon: "nadie" }));
    
    const resultado = guardarPreferenciasRed({ ...PREFERENCIAS_POR_DEFECTO, maximoCon: "publico" });
    expect(resultado.aviso).toBe(true);
  });

  it("bajar nivel de maximoCon no debe devolver aviso", () => {
    localStorage.setItem("starseed.preferencias.red.compartida", JSON.stringify({ ...PREFERENCIAS_POR_DEFECTO, maximoCon: "publico" }));
    
    const resultado = guardarPreferenciasRed({ ...PREFERENCIAS_POR_DEFECTO, maximoCon: "nadie" });
    expect(resultado.aviso).toBeFalsy();
  });

  it("ida y vuelta: guardar y leer debe conservar los valores", () => {
    const nuevas = { ...PREFERENCIAS_POR_DEFECTO, interruptor: true, maximoCon: "amigos" as const, kbpsSubidaMax: 2048 };
    guardarPreferenciasRed(nuevas);
    
    const leidas = leerPreferenciasRed();
    expect(leidas.interruptor).toBe(true);
    expect(leidas.maximoCon).toBe("amigos");
    expect(leidas.kbpsSubidaMax).toBe(2048);
  });
});

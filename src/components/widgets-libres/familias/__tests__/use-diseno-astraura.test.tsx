import { describe, it, expect } from "vitest";
import { useDisenoAstraura } from "../use-diseno-astraura";

describe("useDisenoAstraura", () => {
  it("el primer render sin ajustes es auto", () => {
    const [eleccion] = useDisenoAstraura({});
    expect(eleccion).toBe("auto");
  });

  it("lee del widget si existe settings.astrauraDiseno", () => {
    const widget = { settings: { astrauraDiseno: "voz" } };
    const [eleccion] = useDisenoAstraura(widget);
    expect(eleccion).toBe("voz");
  });

  it("valor inválido en el widget → auto", () => {
    const widget = { settings: { astrauraDiseno: "invalido" } };
    const [eleccion] = useDisenoAstraura(widget);
    expect(eleccion).toBe("auto");
  });

  it("elegir llama a onUpdateSettings con la clave", () => {
    let parche: Record<string, unknown> | undefined;
    const onUpdateSettings = (p: Record<string, unknown>) => {
      parche = p;
    };
    const [, setEleccion] = useDisenoAstraura({}, onUpdateSettings);
    setEleccion("acciones");
    expect(parche).toEqual({ astrauraDiseno: "acciones" });
  });

  it("sin widget u onUpdateSettings, usa almacenamiento local", () => {
    const storageKey = "starseed.widget.astraura.diseno.v1";
    localStorage.setItem(storageKey, "minimo");
    const [eleccion] = useDisenoAstraura();
    expect(eleccion).toBe("minimo");
    localStorage.removeItem(storageKey);
  });
});

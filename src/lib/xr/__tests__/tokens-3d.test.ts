import { describe, expect, it } from "vitest";
import { NIVELES_CALIDAD } from "../tipos";
import { PERFILES } from "../calidad-perfiles";
import { COLORES_NODO, CRISTAL, CONTRASTE_MIN_TEXTO, contraste, luminancia, mezclar, opacidadMinimaParaTexto, paramsMaterial } from "../tokens-3d";
import { disponerTrinity } from "../espacio-trinity";

describe("colores de la Trinity", () => {
  it("son los de CLAUDE.md §7", () => {
    expect(COLORES_NODO.zenith.base).toBe("#007FFF");
    expect(COLORES_NODO.horizon.vivo).toBe("#39FF14");
    expect(COLORES_NODO.horizon.base).toBe("#10B981");
    expect(COLORES_NODO.logic.vivo).toBe("#FFBF00");
    expect(COLORES_NODO.anchor.base).toBe("#DC143C");
  });
});

describe("contraste WCAG", () => {
  it("negro sobre blanco es 21:1 y un color consigo mismo 1:1", () => {
    expect(contraste("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(contraste("#123456", "#123456")).toBeCloseTo(1, 5);
  });
  it("la luminancia crece del negro al blanco y mezclar interpola", () => {
    expect(luminancia("#000000")).toBeLessThan(luminancia("#777777"));
    expect(luminancia("#777777")).toBeLessThan(luminancia("#FFFFFF"));
    expect(mezclar("#000000", 0.5, "#FFFFFF")).toBe("#808080");
    expect(mezclar("#102030", 1, "#FFFFFF")).toBe("#102030");
  });
});

describe("texto legible sobre el cristal, incluso con la habitación blanca detrás", () => {
  it("el cristal por defecto (62 %) ya cumple 4,5:1 y la opacidad mínima calculada no pasa de eso", () => {
    const minima = opacidadMinimaParaTexto();
    expect(minima).toBeLessThanOrEqual(CRISTAL.fondoA.alfa);
    expect(contraste(CRISTAL.texto, mezclar(CRISTAL.fondoA.color, CRISTAL.fondoA.alfa, "#FFFFFF"))).toBeGreaterThanOrEqual(CONTRASTE_MIN_TEXTO);
  });
  it("el segundo fondo (42 %) NO sirve para texto: queda por debajo de la mínima", () => {
    expect(CRISTAL.fondoB.alfa).toBeLessThan(opacidadMinimaParaTexto(CRISTAL.texto, CRISTAL.fondoB.color));
  });
  it("la opacidad que exige la AR (disponerTrinity) está por encima de la mínima", () => {
    const ar = disponerTrinity({ alturaOjos: 1.6, postura: "de-pie", manoDominante: "derecha", modo: "ar-passthrough" });
    expect(ar.opacidadMinima).toBeGreaterThanOrEqual(opacidadMinimaParaTexto());
  });
  it("el texto secundario también se lee sobre el cristal al 82 %", () => {
    expect(contraste(CRISTAL.textoSecundario, mezclar(CRISTAL.fondoA.color, 0.82, "#FFFFFF"))).toBeGreaterThanOrEqual(CONTRASTE_MIN_TEXTO);
  });
});

describe("material por nivel de calidad", () => {
  it("cada nivel de calidad tiene su material y el coste sube con el nivel", () => {
    const costes = NIVELES_CALIDAD.map((n) => paramsMaterial(PERFILES[n].material, "zenith").coste);
    expect(costes).toEqual([...costes].sort((a, b) => a - b));
    expect(new Set(costes).size).toBe(5);
  });
  it("sólo los dos niveles altos usan transmisión (una pasada extra de render)", () => {
    for (const n of NIVELES_CALIDAD) {
      const p = paramsMaterial(PERFILES[n].material, "logic");
      expect(p.clase === "MeshPhysicalMaterial").toBe(n === "alta" || n === "maxima");
    }
  });
  it("reducir transparencias o pedir contraste alto fuerza opacidad y borde grueso", () => {
    const plano = paramsMaterial("transmision-completa", "horizon", { reducirTransparencia: true });
    expect(plano.clase).toBe("MeshBasicMaterial");
    expect(plano.coste).toBe(0);
    const alto = paramsMaterial("translucido", "anchor", { contrasteAlto: true });
    expect(alto.opacidad).toBeGreaterThanOrEqual(0.92);
    expect(alto.borde.ancho).toBeGreaterThan(paramsMaterial("translucido", "anchor").borde.ancho);
  });
  it("la opacidad mínima del modo (AR) se respeta en todos los niveles", () => {
    for (const n of NIVELES_CALIDAD) expect(paramsMaterial(PERFILES[n].material, "zenith", { opacidadMinima: 0.82 }).opacidad).toBeGreaterThanOrEqual(0.82);
  });
  it("el borde lleva el color vivo del nodo", () => {
    expect(paramsMaterial("plano", "horizon").borde.color).toBe("#39FF14");
  });
});

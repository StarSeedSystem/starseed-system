import { describe, expect, it } from "vitest";
import { debePasarAProyeccion, decidirCuadro, esCuadroNegro, fuenteVigente, mostrarBotonFluida, rotuloFuenteMedida } from "../fuente-pantalla";

const concedida = { pantalla: { proyeccion: true, fuente_activa: "accesibilidad" } };

describe("CTL1126Css · paso a pantalla fluida", () => {
    it("pasa a proyección en cuanto la persona acepta y aún va por accesibilidad", () => {
        expect(debePasarAProyeccion(concedida, "accesibilidad")).toBe(true);
    });
    it("no pasa sin el «Sí», ni si ya es fluida, ni sin fuente", () => {
        expect(debePasarAProyeccion({ pantalla: { proyeccion: false } }, "accesibilidad")).toBe(false);
        expect(debePasarAProyeccion(concedida, "proyeccion")).toBe(false);
        expect(debePasarAProyeccion(concedida, null)).toBe(false);
        expect(debePasarAProyeccion(undefined, "accesibilidad")).toBe(false);
    });
    it("la fuente vigente es la que dice el aparato; si calla, la última", () => {
        expect(fuenteVigente({ pantalla: { fuente_activa: "proyeccion" } }, "accesibilidad")).toBe("proyeccion");
        expect(fuenteVigente({}, "accesibilidad")).toBe("accesibilidad");
        expect(fuenteVigente(null, null)).toBeNull();
    });
    it("el botón de la fluida desaparece cuando ya es fluida", () => {
        expect(mostrarBotonFluida("accesibilidad")).toBe(true);
        expect(mostrarBotonFluida("proyeccion")).toBe(false);
        expect(mostrarBotonFluida(null)).toBe(false);
    });
    it("el rótulo enseña el modo real y sus cuadros", () => {
        expect(rotuloFuenteMedida("proyeccion", 7)).toBe("Pantalla fluida (proyección) · 7,0 cuadros/s");
    });
});

describe("CTL1126Css · el primer cuadro tras el cambio no es negro", () => {
    it("detecta el cuadro negro", () => {
        expect(esCuadroNegro(0)).toBe(true);
        expect(esCuadroNegro(80)).toBe(false);
        expect(esCuadroNegro(undefined)).toBe(false);
        expect(esCuadroNegro(Number.NaN)).toBe(false);
    });
    it("tras el cambio mantiene el último bueno ante un cuadro negro", () => {
        expect(decidirCuadro({ cambiandoFuente: true, luminanciaMedia: 0, hayCuadroBueno: true })).toBe("mantener");
    });
    it("pinta el negro si no hay cuadro bueno o si no hay cambio, y pinta el cuadro con imagen", () => {
        expect(decidirCuadro({ cambiandoFuente: true, luminanciaMedia: 0, hayCuadroBueno: false })).toBe("pintar");
        expect(decidirCuadro({ cambiandoFuente: false, luminanciaMedia: 0, hayCuadroBueno: true })).toBe("pintar");
        expect(decidirCuadro({ cambiandoFuente: true, luminanciaMedia: 90, hayCuadroBueno: true })).toBe("pintar");
    });
});

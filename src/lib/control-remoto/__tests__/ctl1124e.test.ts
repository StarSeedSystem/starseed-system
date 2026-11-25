/**
 * CTL1124E · Cuadros por la malla a ritmo útil: el empuje adapta el intervalo al retardo medido
 * (con suelo y tope), descarta el cuadro viejo cuando hay uno nuevo y las lecturas no compiten
 * con la pantalla. Lógica pura: sin red, sin disco, sin reloj.
 */
import { describe, expect, it } from "vitest";
import {
    COSTE_ALTO_MS,
    EMPUJE_MIN_MS,
    EMPUJE_TOPE_MS,
    FPS_OBJETIVO_MALLA,
    descartarCuadroViejo,
    fpsDesdeIntervalo,
    intervaloEmpujeMs,
} from "../ritmo-pantalla";
import { debeCederOrden, lineaEmpuje, prioridadOrden } from "../cuadro-malla";

describe("CTL1124E · intervalo del empuje adaptado al retardo", () => {
    it("sin retardo usa el periodo base (15 fps en WebRTC, 5 en malla)", () => {
        expect(intervaloEmpujeMs(0, COSTE_ALTO_MS)).toBe(COSTE_ALTO_MS);
        expect(fpsDesdeIntervalo(intervaloEmpujeMs(0, COSTE_ALTO_MS))).toBeCloseTo(15.2, 1);
        const baseMalla = 1000 / FPS_OBJETIVO_MALLA; // 200 ms
        expect(intervaloEmpujeMs(0, baseMalla)).toBe(200);
        expect(fpsDesdeIntervalo(intervaloEmpujeMs(0, baseMalla))).toBe(5);
    });

    it("un retardo menor que el base no frena el ritmo (enlace directo a 44 ms da 5 fps)", () => {
        const baseMalla = 1000 / FPS_OBJETIVO_MALLA;
        expect(intervaloEmpujeMs(44, baseMalla)).toBe(200);
        expect(fpsDesdeIntervalo(intervaloEmpujeMs(44, baseMalla))).toBe(5);
    });

    it("un retardo mayor que el base baja el ritmo para no apilar cuadros", () => {
        expect(intervaloEmpujeMs(120, COSTE_ALTO_MS)).toBe(120);
        expect(fpsDesdeIntervalo(intervaloEmpujeMs(120, COSTE_ALTO_MS))).toBeCloseTo(8.3, 1);
    });

    it("el tope acota el intervalo y el suelo lo mantiene útil", () => {
        expect(intervaloEmpujeMs(5_000, COSTE_ALTO_MS)).toBe(EMPUJE_TOPE_MS);
        expect(intervaloEmpujeMs(0, 1)).toBe(EMPUJE_MIN_MS);
        expect(intervaloEmpujeMs(500, COSTE_ALTO_MS, 100)).toBe(100);
    });

    it("entradas no finitas no rompen: base por defecto y retardo 0", () => {
        expect(intervaloEmpujeMs(Number.NaN, Number.NaN)).toBe(COSTE_ALTO_MS);
        expect(intervaloEmpujeMs(-5, -1)).toBe(COSTE_ALTO_MS);
    });
});

describe("CTL1124E · descarte del cuadro viejo", () => {
    it("solo se descarta cuando hay pendiente y uno nuevo listo", () => {
        expect(descartarCuadroViejo(true, true)).toBe(true);
        expect(descartarCuadroViejo(true, false)).toBe(false);
        expect(descartarCuadroViejo(false, true)).toBe(false);
        expect(descartarCuadroViejo(false, false)).toBe(false);
    });
});

describe("CTL1124E · prioridad de órdenes y cesión", () => {
    it("la pantalla manda; leer-estado y leer-aparato son lecturas", () => {
        expect(prioridadOrden("pantalla-cuadro")).toBe(0);
        expect(prioridadOrden("leer-estado")).toBe(1);
        expect(prioridadOrden("leer-aparato")).toBe(1);
        expect(prioridadOrden("gesto")).toBe(2);
    });

    it("las lecturas ceden a la pantalla y la pantalla nunca cede a una lectura", () => {
        expect(debeCederOrden("leer-estado", "pantalla-cuadro")).toBe(true);
        expect(debeCederOrden("leer-aparato", "pantalla-cuadro")).toBe(true);
        expect(debeCederOrden("pantalla-cuadro", "leer-estado")).toBe(false);
        expect(debeCederOrden("pantalla-cuadro", "leer-aparato")).toBe(false);
    });

    it("dos lecturas no se ceden entre sí (misma prioridad)", () => {
        expect(debeCederOrden("leer-estado", "leer-aparato")).toBe(false);
    });
});

describe("CTL1124E · línea de registro del empuje", () => {
    it("dice intervalo, retardo, descartados y cuadros/s sin promesas", () => {
        const l = lineaEmpuje({ intervaloMs: 200, retardoMs: 44, descartados: 3, fps: 5 });
        expect(l).toContain("paso=empuje");
        expect(l).toContain("intervalo-ms=200");
        expect(l).toContain("retardo-ms=44");
        expect(l).toContain("descartados=3");
        expect(l).toContain("cuadros-s=5");
    });
});
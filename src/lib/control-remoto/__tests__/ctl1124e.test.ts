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
    contarCuadrosEnVentana,
    fpsCuadrosEnVentana,
    adaptarIntervaloParaFps,
} from "../ritmo-pantalla";
import { debeCederOrden, lineaEmpuje, prioridadOrden, lineaVia } from "../cuadro-malla";

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

describe("CTL1126B-d1 · contar y medir FPS de cuadros recibidos", () => {
    const ahora = 1_000_000;

    function cuadro(t: number, bytes: number = 100_000): { t: number; bytes: number } {
        return { t, bytes };
    }

    describe("contarCuadrosEnVentana", () => {
        it("cuenta cuadros en los últimos 3 s", () => {
            const cuadros = [
                cuadro(ahora - 4_000),
                cuadro(ahora - 3_100),
                cuadro(ahora - 2_000),
                cuadro(ahora - 1_000),
                cuadro(ahora - 500),
            ];
            expect(contarCuadrosEnVentana(cuadros, 3_000, ahora)).toBe(3);
        });

        it("devuelve 0 si no hay cuadros", () => {
            expect(contarCuadrosEnVentana([], 3_000, ahora)).toBe(0);
        });

        it("cuenta todos si están dentro de la ventana", () => {
            const cuadros = [
                cuadro(ahora - 100),
                cuadro(ahora - 200),
                cuadro(ahora - 300),
                cuadro(ahora - 400),
            ];
            expect(contarCuadrosEnVentana(cuadros, 3_000, ahora)).toBe(4);
        });
    });

    describe("fpsCuadrosEnVentana", () => {
        it("calcula FPS desde cuadros con timestamp", () => {
            const cuadros = [
                cuadro(ahora - 1000),
                cuadro(ahora - 500),
            ];
            expect(fpsCuadrosEnVentana(cuadros, ahora)).toBeCloseTo(4, 0);
        });

        it("devuelve 0 con menos de 2 cuadros", () => {
            expect(fpsCuadrosEnVentana([cuadro(ahora)], ahora)).toBe(0);
            expect(fpsCuadrosEnVentana([], ahora)).toBe(0);
        });

        it("calcula FPS correcto con varios cuadros", () => {
            const cuadros = [];
            for (let i = 0; i < 10; i++) {
                cuadros.push(cuadro(ahora - 3_000 + i * 333));
            }
            expect(fpsCuadrosEnVentana(cuadros, ahora)).toBeCloseTo(3.0, 0);
        });
    });

    describe("adaptarIntervaloParaFps", () => {
        it("usa el intervalo base para FPS objetivo", () => {
            expect(adaptarIntervaloParaFps(FPS_OBJETIVO_MALLA, 0, 100)).toBe(200);
        });

        it("adapta el intervalo al caudal real medido", () => {
            const intervalo = adaptarIntervaloParaFps(5, 0.5, 100);
            expect(intervalo).toBeGreaterThanOrEqual(200);
            const fps = fpsDesdeIntervalo(intervalo);
            expect(fps).toBeLessThanOrEqual(5);
        });

        it("respetar el techo de 500 ms retardo", () => {
            const intervalo = adaptarIntervaloParaFps(5, 600, 100);
            expect(intervalo).toBeLessThanOrEqual(EMPUJE_TOPE_MS);
        });

        it("no baja de 40 ms (25 fps)", () => {
            const intervalo = adaptarIntervaloParaFps(5, 30, 100);
            expect(intervalo).toBeGreaterThanOrEqual(EMPUJE_MIN_MS);
        });
    });
});

describe("CTL1126B-d1 · líneaVia con FPS medido", () => {
    it("muestra FPS medido cuando se proporciona", () => {
        const l = lineaVia({ via: "malla", enlace: "directo:red-local", cuadrosS: 5.2 });
        expect(l).toContain("cuadros-s=5.2");
    });

    it("muestra sin-medir cuando no hay FPS", () => {
        const l = lineaVia({ via: "malla", enlace: "directo:red-local", cuadrosS: null });
        expect(l).toContain("cuadros-s=sin-medir");
    });

    it("incluye causa cuando hay malla con causa", () => {
        const l = lineaVia({ via: "malla", enlace: "capa:turn", cuadrosS: 3.5, causa: "sin-webrtc" });
        expect(l).toContain("causa=sin-webrtc");
        expect(l).toContain("cuadros-s=3.5");
    });
});
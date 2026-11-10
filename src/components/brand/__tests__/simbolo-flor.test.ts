// ESC1110B — Flor de la Vida fundida: geometría (pura, desde las constantes) y giro con reposos cada 60°.
import { describe, expect, it } from "vitest";
import { CIRCULOS, pxAModelo } from "../simbolo-starseed-medidas";
import {
    CENTRO_DISCO_SUPERIOR, CENTRO_FLOR, OPCIONES_FLOR, PASO_FLOR, PASO_REPOSO, RADIO_ENVOLVENTE, RADIO_FLOR,
    arrastrarFlor, centrosFlor, enReposo, errorFusion, estadoFlorInicial, girarConTeclado, pasoFlor,
    reposoMasCercano, soltarFlor, suavizar, type EstadoFlor, type OpcionesFlor,
} from "../simbolo-flor";
import { MEDIDAS_FUSION } from "../simbolo-starseed-escena";

function correr(e: EstadoFlor, segundos: number, o: OpcionesFlor = OPCIONES_FLOR, dt = 1 / 60): EstadoFlor {
    let x = e;
    for (let t = 0; t < segundos; t += dt) x = pasoFlor(x, dt, o);
    return x;
}

describe("fusión con la flor (geometría)", () => {
    it("el centro de la flor es el del disco inferior y el radio de anillo es el de los discos", () => {
        expect(CENTRO_FLOR).toEqual(pxAModelo(CIRCULOS.inferior.cx, CIRCULOS.inferior.cy));
        expect(RADIO_FLOR).toBe(CIRCULOS.superior.r / 1000);
        expect(RADIO_FLOR).toBe(CIRCULOS.inferior.r / 1000);
        expect(MEDIDAS_FUSION.radioAnillo).toBe(MEDIDAS_FUSION.radioDisco);
    });

    it("el paso de la retícula es la distancia entre los centros de los discos (vesica de la marca)", () => {
        expect(PASO_FLOR).toBeCloseTo((CIRCULOS.inferior.cy - CIRCULOS.superior.cy) / 1000, 12);
        // La marca: 497 px de paso frente a 500 de radio (0,6 %): es la flor de la propia marca.
        expect(Math.abs(PASO_FLOR - RADIO_FLOR) / RADIO_FLOR).toBeLessThan(0.01);
    });

    it("19 círculos; el primer vecino cae justo encima: en el centro del disco superior", () => {
        const c = centrosFlor(0);
        expect(c).toHaveLength(19);
        const rel = [CENTRO_DISCO_SUPERIOR[0] - CENTRO_FLOR[0], CENTRO_DISCO_SUPERIOR[1] - CENTRO_FLOR[1]];
        expect(c[1][0]).toBeCloseTo(rel[0], 12);
        expect(c[1][1]).toBeCloseTo(rel[1], 12);
        // Todos dentro de la envolvente.
        for (const [x, y] of c) expect(Math.hypot(x, y) + RADIO_FLOR).toBeLessThanOrEqual(RADIO_ENVOLVENTE + 1e-9);
    });

    it("en cada posición de reposo (k·60°) el error de la fusión es 0; entre medias no", () => {
        for (let k = -6; k <= 6; k++) {
            const e = errorFusion(k * PASO_REPOSO);
            expect(e.centroSuperior).toBeLessThan(1e-12);
            expect(e.radio).toBe(0);
        }
        expect(errorFusion(PASO_REPOSO / 2).centroSuperior).toBeGreaterThan(0.2);
    });
});

describe("giro de la flor", () => {
    it("reposo más cercano y suavizado", () => {
        expect(reposoMasCercano(0.6)).toBeCloseTo(PASO_REPOSO, 12);
        expect(reposoMasCercano(-0.6)).toBeCloseTo(-PASO_REPOSO, 12);
        expect(reposoMasCercano(0.2)).toBe(0);
        expect(suavizar(0)).toBe(0);
        expect(suavizar(1)).toBe(1);
        expect(suavizar(0.5)).toBeCloseTo(0.5, 12);
    });

    it("automática: se detiene en una posición de reposo y luego se desliza 60° hasta la siguiente", () => {
        const o = { ...OPCIONES_FLOR, pausa: 2, deslizar: 1.5 };
        let e = estadoFlorInicial(0);
        e = correr(e, 1.9, o);
        expect(e.modo).toBe("pausa");
        expect(e.angulo).toBe(0);
        e = correr(e, 0.9, o); // empieza a deslizarse
        expect(e.modo).toBe("deslizando");
        expect(enReposo(e.angulo)).toBe(false);
        e = correr(e, 1.5, o);
        expect(e.modo).toBe("pausa");
        expect(e.angulo).toBeCloseTo(o.sentido * PASO_REPOSO, 12);
        expect(enReposo(e.angulo)).toBe(true);
    });

    it("arrastrada con inercia, se asienta EXACTA en la posición de reposo más cercana", () => {
        let e = estadoFlorInicial(0);
        for (let i = 0; i < 10; i++) e = arrastrarFlor(e, 0.05, 1 / 60); // 0,5 rad a 3 rad/s
        expect(e.modo).toBe("arrastre");
        e = soltarFlor(e);
        expect(e.modo).toBe("inercia");
        e = correr(e, 6);
        expect(enReposo(e.angulo, 1e-12)).toBe(true);
        expect(e.angulo).toBeGreaterThan(0.5); // el impulso la llevó hacia delante
        expect(e.velocidad).toBe(0);
    });

    it("sin inercia (movimiento reducido) salta al reposo al soltar", () => {
        let e = estadoFlorInicial(0);
        e = arrastrarFlor(e, 0.7, 0.1);
        e = soltarFlor(e, false);
        expect(e.angulo).toBeCloseTo(PASO_REPOSO, 12);
        expect(e.modo).toBe("quieta");
    });

    it("teclado: ±60° desde el reposo, animado o inmediato; encadena pulsaciones", () => {
        let e = girarConTeclado(estadoFlorInicial(0), 1);
        expect(e.modo).toBe("asentando");
        e = girarConTeclado(e, 1);
        expect(e.destino).toBeCloseTo(2 * PASO_REPOSO, 12);
        e = correr(e, 3, { ...OPCIONES_FLOR, auto: false });
        expect(e.angulo).toBeCloseTo(2 * PASO_REPOSO, 12);
        expect(e.modo).toBe("quieta");
        const inmediato = girarConTeclado(estadoFlorInicial(0), -1, true);
        expect(inmediato.angulo).toBeCloseTo(-PASO_REPOSO, 12);
    });

    it("sin giro automático, quieta para siempre", () => {
        const e = correr(estadoFlorInicial(0), 30, { ...OPCIONES_FLOR, auto: false });
        expect(e.angulo).toBe(0);
        expect(e.modo).toBe("quieta");
    });

    it("una pestaña dormida (dt enorme) no hace saltar la flor", () => {
        const e = pasoFlor({ ...estadoFlorInicial(0), modo: "inercia", velocidad: 2 }, 50);
        expect(Math.abs(e.angulo)).toBeLessThan(0.25);
    });
});

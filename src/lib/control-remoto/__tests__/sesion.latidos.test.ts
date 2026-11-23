import { describe, it, expect } from "vitest";
import { duracionDeLimite, finDeLimite, limiteNormalizado, restanteDeSesion } from "../sesion";

describe("duracionDeLimite", () => {
    it("devuelve null para sin-limite", () => {
        const desde = 1000000000000;
        expect(duracionDeLimite({ tipo: "sin-limite" }, desde)).toBeNull();
    });

    it("devuelve milisegundos para minutos", () => {
        const desde = 1000000000000;
        expect(duracionDeLimite({ tipo: "minutos", minutos: 15 }, desde)).toBe(900000);
    });

    it("corta valores negativos a 0", () => {
        const desde = 1000000000000;
        expect(duracionDeLimite({ tipo: "minutos", minutos: 0 }, desde)).toBe(0);
    });
});

describe("finDeLimite", () => {
    it("devuelve null para null", () => {
        expect(finDeLimite(null, 1000000000000)).toBeNull();
    });

    it("devuelve null para sin-limite", () => {
        expect(finDeLimite({ tipo: "sin-limite" }, 1000000000000)).toBeNull();
    });

    it("calcula fin para minutos", () => {
        const aceptadoEn = 1000000000000;
        expect(finDeLimite({ tipo: "minutos", minutos: 15 }, aceptadoEn)).toBe(1000000900000);
    });
});

describe("limiteNormalizado", () => {
    const ahora = 1000000000000;

    it("usa porDefecto cuando no hay elegido", () => {
        const filtro = { porDefecto: { tipo: "minutos", minutos: 15 }, maximo: { tipo: "sin-limite" } };
        expect(limiteNormalizado(null, filtro, ahora)).toEqual({ tipo: "minutos", minutos: 15 });
    });

    it("corta por maximo cuando excede el filtro", () => {
        const filtro = { porDefecto: { tipo: "minutos", minutos: 15 }, maximo: { tipo: "minutos", minutos: 10 } };
        expect(limiteNormalizado({ tipo: "minutos", minutos: 30 }, filtro, ahora)).toEqual({ tipo: "minutos", minutos: 10 });
    });

    it("convierte a maximo minutos cuando excede", () => {
        const filtro = { porDefecto: { tipo: "minutos", minutos: 15 }, maximo: { tipo: "minutos", minutos: 10 } };
        const largoFuturo = { tipo: "minutos", minutos: 100 * 60 * 24 };
        const resultado = limiteNormalizado(largoFuturo, filtro, ahora);
        expect(resultado.tipo).toBe("minutos");
        expect(resultado.minutos).toBeLessThanOrEqual(10);
    });
});

describe("restanteDeSesion", () => {
    it("devuelve null cuando fin es undefined", () => {
        expect(restanteDeSesion({}, 1000000000000)).toBeNull();
    });

    it("devuelve null cuando fin es null", () => {
        expect(restanteDeSesion({ fin: null }, 1000000000000)).toBeNull();
    });

    it("calcula restante positivo", () => {
        expect(restanteDeSesion({ fin: 1000000900000 }, 1000000000000)).toBe(900000);
    });

    it("corta a 0 cuando finalizado", () => {
        expect(restanteDeSesion({ fin: 999999000000 }, 1000000000000)).toBe(0);
    });
});
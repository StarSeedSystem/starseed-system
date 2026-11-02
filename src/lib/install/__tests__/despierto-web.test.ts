import { describe, it, expect } from "vitest";
import {
    decidirDespiertoWeb,
    avisoDespiertoWeb,
    etiquetaProcesoLargo,
    esProcesoLargo,
    PROCESOS_LARGOS,
} from "../despierto-web";
import type { DespiertoWebEntrada } from "../despierto-web";

function entrada(parcial: Partial<DespiertoWebEntrada> = {}): DespiertoWebEntrada {
    return {
        proceso: "estacion",
        visible: true,
        soportaWakeLock: true,
        tieneBloqueo: false,
        ...parcial,
    };
}

describe("decidirDespiertoWeb — decisión pura de pedir/soltar", () => {
    it("avisar sin soporte del navegador", () => {
        expect(decidirDespiertoWeb(entrada({ soportaWakeLock: false }))).toBe("sin-soporte");
    });

    it("soltar si un soporte ausente convive con un bloqueo residual", () => {
        expect(
            decidirDespiertoWeb(entrada({ soportaWakeLock: false, tieneBloqueo: true })),
        ).toBe("soltar");
    });

    it("soltar cuando el proceso largo termina y había bloqueo", () => {
        expect(decidirDespiertoWeb(entrada({ proceso: null, tieneBloqueo: true }))).toBe("soltar");
    });

    it("nada cuando termina y nunca hubo bloqueo", () => {
        expect(decidirDespiertoWeb(entrada({ proceso: null }))).toBe("nada");
    });

    it("pedir al empezar el proceso con la pestaña visible", () => {
        expect(decidirDespiertoWeb(entrada())).toBe("pedir");
    });

    it("nada si ya hay bloqueo vivo y el proceso sigue", () => {
        expect(decidirDespiertoWeb(entrada({ tieneBloqueo: true }))).toBe("nada");
    });

    it("soltar al ocultar la pestaña teniendo bloqueo: nadie puede retenerlo oculto", () => {
        expect(
            decidirDespiertoWeb(entrada({ visible: false, tieneBloqueo: true })),
        ).toBe("soltar");
    });

    it("nada oculto sin bloqueo: se vuelve a pedir al volver visible", () => {
        expect(decidirDespiertoWeb(entrada({ visible: false }))).toBe("nada");
    });
});

describe("avisoDespiertoWeb — el límite honesto del navegador", () => {
    it("con soporte: no puede impedir el sueño con la pantalla cerrada", () => {
        const texto = avisoDespiertoWeb(true);
        expect(texto).toContain("pantalla cerrada");
        expect(texto).toContain("app nativa");
        expect(texto).toContain("keepalive");
    });

    it("sin soporte: explica el faltante y ofrece las rutas que sí sirven", () => {
        const texto = avisoDespiertoWeb(false);
        expect(texto).toContain("Wake Lock");
        expect(texto).toContain("app nativa");
        expect(texto).toContain("keepalive");
    });
});

describe("catálogo de procesos largos", () => {
    it("el catálogo son los tres medios conocidos", () => {
        expect(PROCESOS_LARGOS).toEqual(["transmision", "estacion", "contenedor"]);
    });

    it("reconoce ids válidos y rechaza ajenos", () => {
        expect(esProcesoLargo("contenedor")).toBe(true);
        expect(esProcesoLargo("albúm")).toBe(false);
        expect(esProcesoLargo("")).toBe(false);
    });

    it("la etiqueta es legible y en español", () => {
        expect(etiquetaProcesoLargo("transmision")).toContain("Transmisión");
        expect(etiquetaProcesoLargo("estacion")).toContain("Estación");
        expect(etiquetaProcesoLargo("contenedor")).toContain("Contenedor");
    });
});

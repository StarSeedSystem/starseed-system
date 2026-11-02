/**
 * Pruebas PURAS del estado «pantalla/sistema» y del latido de energía KAL1101B
 * (`salud.despierto`). Sin red, sin disco y sin mocks: entrada → salida.
 */

import { describe, expect, it } from "vitest";

import {
    LIMITE_TAPA_HONESTO,
    esModoPantalla,
    parsearDespiertoLatido,
    textoDespiertoLatido,
    textoModoPantalla,
    type EstadoDespiertoLatido,
} from "@/lib/mando/pantalla-despierto";

const base: EstadoDespiertoLatido = {
    despierta: true,
    herramienta: "keepalive",
    bateria: 74,
    enchufada: true,
    tapa: "clamshell",
    vaADormir: false,
    seVaADormir: false,
    umbralBateria: 25,
};

describe("esModoPantalla", () => {
    it("solo acepta los dos modos reales", () => {
        expect(esModoPantalla("pantalla")).toBe(true);
        expect(esModoPantalla("sistema")).toBe(true);
        expect(esModoPantalla("pantalla-siempre")).toBe(false);
        expect(esModoPantalla(null)).toBe(false);
    });
});

describe("textoModoPantalla", () => {
    it("nombra el flag real de keepalive en cada modo", () => {
        expect(textoModoPantalla("pantalla")).toContain("--keep-display=true");
        expect(textoModoPantalla("sistema")).toContain("--keep-display=false");
        expect(textoModoPantalla("sistema")).toContain("pantalla puede apagarse");
    });
});

describe("parsearDespiertoLatido", () => {
    it("lee la capacidad dentro de salud, como la publica KAL1101B", () => {
        const estado = parsearDespiertoLatido({
            salud: {
                despierto: {
                    despierta: true,
                    herramienta: "keepalive",
                    bateria: 80,
                    enchufada: true,
                    tapa: "clamshell",
                    va_a_dormir: false,
                    se_va_a_dormir: false,
                    umbral_bateria: 25,
                },
            },
        });
        expect(estado).toEqual({ ...base, bateria: 80 });
    });

    it("acepta la capacidad suelta y sanea lo que venga roto", () => {
        const estado = parsearDespiertoLatido({
            despierta: "sí",
            herramienta: "  ",
            bateria: 500,
            enchufada: 1,
            tapa: "inventada",
            va_a_dormir: 1,
            umbral_bateria: "25",
        });
        expect(estado).toEqual({
            despierta: false,
            herramienta: null,
            bateria: null,
            enchufada: false,
            tapa: "",
            vaADormir: false,
            seVaADormir: false,
            umbralBateria: null,
        });
    });

    it("devuelve null cuando el latido no trae la capacidad", () => {
        expect(parsearDespiertoLatido(null)).toBeNull();
        expect(parsearDespiertoLatido({ salud: {} })).toBeNull();
        expect(parsearDespiertoLatido({ otra: true })).toBeNull();
    });
});

describe("textoDespiertoLatido", () => {
    it("no finge cuando no hay dato", () => {
        expect(textoDespiertoLatido(null)).toContain("Sin latido de energía");
    });

    it("dice la verdad de la tapa y que el trabajo sigue en el A1", () => {
        const texto = textoDespiertoLatido({ ...base, enchufada: false, tapa: "duerme", vaADormir: true });
        expect(texto).toContain(LIMITE_TAPA_HONESTO);
        expect(texto).toContain("batería 74 %");
    });

    it("avisa antes de dormirse con la batería baja", () => {
        const texto = textoDespiertoLatido({
            ...base, bateria: 20, enchufada: false, tapa: "duerme", vaADormir: true, seVaADormir: true,
        });
        expect(texto).toContain("Se va a dormir");
        expect(texto).toContain("A1");
        expect(texto).toContain("25 %");
    });

    it("reconoce clamshell, reposo desactivado y equipo sin tapa", () => {
        expect(textoDespiertoLatido(base)).toContain("clamshell");
        expect(textoDespiertoLatido({ ...base, tapa: "desactivada" })).toContain("disablesleep 1");
        expect(textoDespiertoLatido({ ...base, tapa: "sin-tapa" })).toContain("sin tapa");
    });
});

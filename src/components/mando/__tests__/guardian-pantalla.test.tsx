/**
 * Pruebas del guardián de pantalla (Ola 1005P · PA1005Ds): se cubren SOLO las
 * funciones puras exportadas de `guardian-pantalla.tsx` (textos de estado y el
 * saneado del cuerpo de la API). El hook y las lecturas contra la red no se
 * prueban aquí (reglas del repo: nada de mocks de módulos ni de red en tests).
 */

import { describe, expect, it } from "vitest";

import {
    estadoMac,
    estadoPantalla,
    parsearDespiertoLatido,
    parsearEstadoPantalla,
    PANTALLA_DEFECTO,
    textoDespiertoLatido,
} from "@/components/mando/guardian-pantalla";

describe("estadoPantalla", () => {
    it("describe cada estado del bloqueo de este dispositivo", () => {
        expect(estadoPantalla("activo")).toContain("mantiene la pantalla");
        expect(estadoPantalla("oculta")).toContain("segundo plano");
        expect(estadoPantalla("sin-soporte")).toContain("no permite");
        expect(estadoPantalla("suelto")).toContain("suelto");
    });
});

describe("estadoMac", () => {
    it("enseña el PID cuando el servicio está vivo", () => {
        expect(estadoMac({ servicio_vivo: true, pid: 1234 })).toBe(
            "Mac: servicio activo (PID 1234)",
        );
    });

    it("dice apagado si el servicio no vive o falta el PID", () => {
        expect(estadoMac({ servicio_vivo: false, pid: null })).toBe(
            "Mac: servicio apagado",
        );
        expect(estadoMac({ servicio_vivo: true, pid: null })).toBe(
            "Mac: servicio apagado",
        );
    });
});

describe("parsearEstadoPantalla", () => {
    it("acepta el cuerpo completo del GET", () => {
        const estado = parsearEstadoPantalla({
            activa: false,
            desde: 1728000000000,
            mac: { servicio_vivo: true, pid: 42 },
        });
        expect(estado).toEqual({
            activa: false,
            desde: 1728000000000,
            mac: { servicio_vivo: true, pid: 42 },
        });
    });

    it("devuelve null si `activa` no es boolean (cuerpo roto)", () => {
        expect(parsearEstadoPantalla(null)).toBeNull();
        expect(parsearEstadoPantalla("activa")).toBeNull();
        expect(parsearEstadoPantalla({ activa: "si" })).toBeNull();
    });

    it("tolera campos ausentes con valores seguros", () => {
        expect(parsearEstadoPantalla({ activa: true })).toEqual({
            activa: true,
            desde: null,
            mac: { servicio_vivo: false, pid: null },
        });
    });

    it("encendido por defecto: el valor inicial del cliente es activa", () => {
        expect(PANTALLA_DEFECTO.activa).toBe(true);
        expect(PANTALLA_DEFECTO.desde).toBeNull();
    });

    it("lee el modo y el latido KAL1101B cuando vienen en el cuerpo", () => {
        const estado = parsearEstadoPantalla({
            activa: true,
            modo: "sistema",
            salud: {
                despierto: {
                    despierta: true,
                    herramienta: "keepalive",
                    bateria: 74,
                    enchufada: true,
                    tapa: "clamshell",
                },
            },
        });
        expect(estado?.modo).toBe("sistema");
        expect(estado?.despierto?.herramienta).toBe("keepalive");
        expect(estado?.despierto?.tapa).toBe("clamshell");
    });

    it("ignora un modo inventado y no inventa latido", () => {
        const estado = parsearEstadoPantalla({ activa: true, modo: "siempre" });
        expect(estado?.modo).toBeUndefined();
        expect(estado?.despierto).toBeUndefined();
    });
});

describe("textoDespiertoLatido", () => {
    it("nombra la herramienta y la batería cuando el latido las trae", () => {
        const texto = textoDespiertoLatido(
            parsearDespiertoLatido({
                despierta: true,
                herramienta: "caffeinate",
                bateria: 92,
                enchufada: false,
                tapa: "",
                va_a_dormir: false,
                se_va_a_dormir: false,
                umbral_bateria: 25,
            }),
        );
        expect(texto).toContain("caffeinate");
        expect(texto).toContain("batería 92 %");
    });
});

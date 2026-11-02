/**
 * Pruebas del guardián de pantalla (Ola 1005P · PA1005Ds): se cubren SOLO las
 * funciones puras exportadas de `guardian-pantalla.tsx` (textos de estado y el
 * saneado del cuerpo de la API). El hook y las lecturas contra la red no se
 * prueban aquí (reglas del repo: nada de mocks de módulos ni de red en tests).
 */

import { describe, expect, it } from "vitest";

import {
    alternarModoVela,
    estadoMac,
    estadoPantalla,
    parsearDespiertoLatido,
    parsearEstadoPantalla,
    PANTALLA_DEFECTO,
    textoTapa,
    type EstadoDespiertoLatido,
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
});

describe("alternarModoVela", () => {
    it(" Alterna entre pantalla (Wake Lock) y sistema (keepalive) y viceversa", () => {
        expect(alternarModoVela("pantalla")).toBe("sistema");
        expect(alternarModoVela("sistema")).toBe("pantalla");
    });
});

describe("parsearDespiertoLatido", () => {
    it("acepta el estado `despierto` del latido (KAL1101B) completo", () => {
        const estado = parsearDespiertoLatido({
            despierta: true,
            herramienta: "keepalive",
            bateria: 92,
            enchufada: true,
            tapa: "clamshell",
            vaADormir: false,
            seVaADormir: false,
        });
        expect(estado).toEqual({
            despierta: true,
            herramienta: "keepalive",
            bateria: 92,
            enchufada: true,
            tapa: "clamshell",
            vaADormir: false,
            seVaADormir: false,
        });
    });

    it("devuelve null si no hay objeto legible (sin latido o salud rara)", () => {
        expect(parsearDespiertoLatido(null)).toBeNull();
        expect(parsearDespiertoLatido("duerme")).toBeNull();
        expect(parsearDespiertoLatido({ tapa: "duerme" })).toBeNull();
        expect(parsearDespiertoLatido({ despierta: 1, tapa: "clamshell" })).toBeNull();
        expect(parsearDespiertoLatido({ despierta: true, tapa: "cualquiera" })).toBeNull();
    });

    it("tolera campos ausentes (late un nodo viejo) con valores seguros", () => {
        const estado = parsearDespiertoLatido({ despierta: false });
        expect(estado).toEqual({
            despierta: false,
            herramienta: null,
            bateria: null,
            enchufada: false,
            tapa: null,
            vaADormir: null,
            seVaADormir: null,
        } satisfies EstadoDespiertoLatido);
    });
});

describe("textoTapa", () => {
    it("dice la verdad en un portátil con tapa que duerme", () => {
        expect(textoTapa("duerme")).toContain("cerrar la tapa duerme");
        expect(textoTapa("duerme")).toContain("A1");
    });

    it("clamshell: corriente y pantalla externa", () => {
        expect(textoTapa("clamshell")).toContain("pantalla externa");
    });

    it("los otros casos: sin tapa, reposo desactivado o sin dato", () => {
        expect(textoTapa("sin-tapa")).toContain("no tiene tapa");
        expect(textoTapa("desactivada")).toContain("desactivado");
        expect(textoTapa(null)).toContain("latido");
        expect(textoTapa("raro" as never)).toContain("latido");
    });
});

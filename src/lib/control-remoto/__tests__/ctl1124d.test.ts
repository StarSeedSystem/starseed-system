import { describe, it, expect } from "vitest";
import { aBase64, deBase64, partirCuadro, leerParteCuadro, ReensambladorCuadro, validarPideCuadro, nivelDe, esperaSinCuadro, planPorCamino, lineaVia, rotuloVia, causaParaMalla, PARTE_CUADRO_MAX, PARTE_CUADRO_DIRECTO, MAX_PARTES_CUADRO, MAX_CUADRO_BYTES, RE_B64, UMBRALES_MALLA, UMBRALES_MALLA_DIRECTO, PAUSA_CAPA_MS, ESPERA_ICE_MS } from "./cuadro-malla";
import { NIVELES_CUADRO } from "./ritmo-pantalla";

// Tests for pure functions in cuadro-malla.ts

describe("aBase64", () => {
    it("should convert Uint8Array to base64 string", () => {
        const uint8Array = new Uint8Array([72, 101, 108, 108, 111]);
        const result = aBase64(uint8Array);
        expect(result).toBe("SGVsbG8=");
    });
});

describe("deBase64", () => {
    it("should convert base64 string to Uint8Array", () => {
        const base64String = "SGVsbG8=";
        const result = deBase64(base64String);
        expect(result).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
    });

    it("should return null for invalid base64 string", () => {
        const invalidBase64String = "InvalidBase64";
        const result = deBase64(invalidBase64String);
        expect(result).toBeNull();
    });
});

describe("partirCuadro", () => {
    it("should split a JPEG into parts", () => {
        const jpeg = new Uint8Array(1000);
        const num = 1;
        const result = partirCuadro(jpeg, num);
        expect(result.length).toBeGreaterThan(0);
        expect(result[0].num).toBe(num);
    });

    it("should throw an error for too large JPEG", () => {
        const jpeg = new Uint8Array(MAX_CUADRO_BYTES + 1);
        const num = 1;
        expect(() => partirCuadro(jpeg, num)).toThrow("demasiado-grande");
    });
});

describe("leerParteCuadro", () => {
    it("should validate a received part", () => {
        const parte = {
            num: 1,
            i: 0,
            n: 1,
            total: 1000,
            datos: aBase64(new Uint8Array(1000))
        };
        const result = leerParteCuadro(parte);
        expect(result).toEqual(parte);
    });

    it("should return null for invalid part", () => {
        const invalidParte = {
            num: 1,
            i: 0,
            n: 1,
            total: 1000,
            datos: "invalid"
        };
        const result = leerParteCuadro(invalidParte);
        expect(result).toBeNull();
    });
});

describe("ReensambladorCuadro", () => {
    it("should assemble parts into a complete JPEG", () => {
        const reensamblador = new ReensambladorCuadro();
        const parte1 = {
            num: 1,
            i: 0,
            n: 2,
            total: 2000,
            datos: aBase64(new Uint8Array(1000))
        };
        const parte2 = {
            num: 1,
            i: 1,
            n: 2,
            total: 2000,
            datos: aBase64(new Uint8Array(1000))
        };
        reensamblador.meter(parte1);
        const result = reensamblador.meter(parte2);
        expect(result).toEqual(new Uint8Array(2000));
    });

    it("should throw an error for inconsistent parts", () => {
        const reensamblador = new ReensambladorCuadro();
        const parte1 = {
            num: 1,
            i: 0,
            n: 2,
            total: 2000,
            datos: aBase64(new Uint8Array(1000))
        };
        const parte2 = {
            num: 2,
            i: 1,
            n: 2,
            total: 2000,
            datos: aBase64(new Uint8Array(1000))
        };
        reensamblador.meter(parte1);
        expect(() => reensamblador.meter(parte2)).toThrow("cuadro-incoherente");
    });
});

describe("validarPideCuadro", () => {
    it("should validate arguments for pantalla-cuadro", () => {
        const args = { desde: 0, pide: 0, nivel: 0 };
        const result = validarPideCuadro(args);
        expect(result).toEqual(args);
    });

    it("should return null for invalid arguments", () => {
        const invalidArgs = { desde: 0, pide: 0, nivel: "invalid" };
        const result = validarPideCuadro(invalidArgs);
        expect(result).toBeNull();
    });
});

describe("nivelDe", () => {
    it("should return the correct level", () => {
        const result = nivelDe(1);
        expect(result).toEqual(NIVELES_CUADRO[1]);
    });

    it("should return the default level for invalid input", () => {
        const result = nivelDe("invalid");
        expect(result).toEqual(NIVELES_CUADRO[0]);
    });
});

describe("esperaSinCuadro", () => {
    it("should return the correct wait time", () => {
        const result = esperaSinCuadro(5);
        expect(result).toBe(120);
    });
});

describe("planPorCamino", () => {
    it("should return the correct plan for directo", () => {
        const result = planPorCamino("directo", 1);
        expect(result).toEqual({ nivel: 1, pausaMs: 0 });
    });

    it("should return the correct plan for capa", () => {
        const result = planPorCamino("capa", 1);
        expect(result).toEqual({ nivel: NIVELES_CUADRO.length - 1, pausaMs: PAUSA_CAPA_MS });
    });
});

describe("lineaVia", () => {
    it("should generate the correct line", () => {
        const result = lineaVia({ via: "webrtc", enlace: "directo", cuadrosS: 30 });
        expect(result).toContain("control-fuente paso=via via=webrtc enlace=directo cuadros-s=30");
    });
});

describe("rotuloVia", () => {
    it("should generate the correct label", () => {
        const result = rotuloVia("webrtc", "directo", 30);
        expect(result).toBe("Pantalla por WebRTC · directo · 30 cuadros/s");
    });
});

describe("causaParaMalla", () => {
    it("should return the correct cause", () => {
        const result = causaParaMalla({ hayWebRtc: false });
        expect(result).toBe("sin-webrtc");
    });

    it("should return null for no cause", () => {
        const result = causaParaMalla({ hayWebRtc: true, fallo: null, estado: "connected", msConectando: 0 });
        expect(result).toBeNull();
    });
});
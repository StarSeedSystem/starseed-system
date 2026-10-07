import { describe, expect, it } from "vitest";

import { crearTokenMotor, hashToken, formatoTokenValido, verificarToken, capacidadesMotorValidas } from "@/lib/mando/motor-token";

/** El token SOLO se enseña una vez; en la base de datos solo vive su hash. */

/** El token no es el hash ni lo contiene */

/** Verificar verdadero y falso */

/** Formato malo y `undefined` → false sin excepción */

/** 100 tokens distintos */

/** Capacidades inválidas detectadas */

/** Pruebas puras, sin disco, sin red, sin procesos lanzados */

/** El token es exclusivo: nunca se reutiliza entre motores */

describe("crearTokenMotor", () => {
    it("devuelve un token, un hash y una huella", () => {
        const { token, hash, huella } = crearTokenMotor();
        expect(token).toMatch(/^ssm_[A-Za-z0-9_-]{43}$/);
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
        expect(huella).toMatch(/^[0-9a-f]{8}$/);
        expect(hash.slice(0, 8)).toBe(huella);
    });

    it("el hash SHA-256 coincide con createHash directamente", () => {
        const { token, hash } = crearTokenMotor();
        const esperado = hashToken(token);
        expect(hash).toBe(esperado);
    });

    it("el hash nunca se muestra en el token o lo contiene", () => {
        const { token, hash } = crearTokenMotor();
        expect(token).not.toContain(hash);
        expect(token).not.toMatch(hash);
    });
});

describe("hashToken", () => {
    it("hash es determinista: mismo token da mismo hash", () => {
        expect(hashToken("ssm_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).toBe(
            hashToken("ssm_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"),
        );
    });

    it("distinto token da distinto hash", () => {
        expect(hashToken("ssm_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).not.toBe(
            hashToken("ssm_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"),
        );
    });
});

describe("formatoTokenValido", () => {
    it("devuelve true para token válido", () => {
        expect(formatoTokenValido("ssm_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).toBe(true);
    });

    it("devuelve false para token inválido (prefijo incorrecto)", () => {
        expect(formatoTokenValido("xss_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).toBe(false);
    });

    it("devuelve false para token inválido (longitud incorrecta)", () => {
        expect(formatoTokenValido("ssm_ABC")).toBe(false);
    });

    it("devuelve false para token inválido (caracteres incorrectos)", () => {
        expect(formatoTokenValido("ssm_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")).toBe(false);
    });

    it("devuelve false para token inválido (undefined)", () => {
        expect(formatoTokenValido(undefined)).toBe(false);
    });

    it("devuelve false para token inválido (número)", () => {
        expect(formatoTokenValido(123)).toBe(false);
    });
});

describe("verificarToken", () => {
    it("true para token válido + hash coincidente", () => {
        const { token, hash } = crearTokenMotor();
        expect(verificarToken(token, hash)).toBe(true);
    });

    it("false para token válido + hash distinto", () => {
        const { token } = crearTokenMotor();
        expect(verificarToken(token, "0".repeat(64))).toBe(false);
    });

    it("false para formato inválido (prefijo incorrecto)", () => {
        expect(verificarToken("xss_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "0".repeat(64))).toBe(false);
    });

    it("false para formato inválido (longitud incorrecta)", () => {
        expect(verificarToken("ssm_ABC", "0".repeat(64))).toBe(false);
    });

    it("false para formato inválido (caracteres incorrectos)", () => {
        expect(verificarToken("ssm_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", "0".repeat(64))).toBe(false);
    });

    it("false para hash inválido (longitud incorrecta)", () => {
        expect(verificarToken("ssm_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "0".repeat(63))).toBe(false);
    });

    it("false para hash inválido (hex incorrecto)", () => {
        expect(verificarToken("ssm_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "gg".repeat(32))).toBe(false);
    });

    it("false para hash inválido (undefined)", () => {
        expect(verificarToken("ssm_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", undefined)).toBe(false);
    });

    it("false para hash inválido (número)", () => {
        expect(verificarToken("ssm_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", 123)).toBe(false);
    });

    it("false para token inválido (undefined)", () => {
        expect(verificarToken(undefined, "0".repeat(64))).toBe(false);
    });

    it("false para token inválido (número)", () => {
        expect(verificarToken(123, "0".repeat(64))).toBe(false);
    });
});

describe("capacidadesMotorValidas", () => {
    it("true para capacidades válidas", () => {
        expect(capacidadesMotorValidas(["reportar", "recoger-tareas"])).toEqual({ ok: true, invalidas: [] });
    });

    it("false para capacidad inválida", () => {
        expect(capacidadesMotorValidas(["reportar", "capacidad-extra"])).toEqual({ ok: false, invalidas: ["capacidad-extra"] });
    });

    it("false para formato inválido (string)", () => {
        expect(capacidadesMotorValidas("reportar")).toEqual({ ok: false, invalidas: ["formato inválido"] });
    });

    it("false para formato inválido (número)", () => {
        expect(capacidadesMotorValidas(123)).toEqual({ ok: false, invalidas: ["formato inválido"] });
    });

    it("false para formato inválido (undefined)", () => {
        expect(capacidadesMotorValidas(undefined)).toEqual({ ok: false, invalidas: ["formato inválido"] });
    });
});

describe("100 tokens distintos", () => {
    it("cada creación genera tokens distintos", () => {
        const tokens: string[] = [];
        for (let i = 0; i < 100; i++) {
            tokens.push(crearTokenMotor().token);
        }
        const conjunto = new Set(tokens);
        expect(conjunto.size).toBe(100);
    });
});

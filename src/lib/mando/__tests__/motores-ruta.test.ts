import { describe, it, expect } from "vitest";
import {
    armarRespuestaMotor,
    validarCuerpoMotor,
} from "../motores";
import { formatoTokenValido } from "../motor-token";

describe("validarCuerpoMotor", () => {
    it("acepta un cuerpo completo y válido", () => {
        const r = validarCuerpoMotor({
            nombre: "Motor de casa",
            tipo: "local",
            capacidades: ["reportar", "recoger-tareas"],
        });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.valor).toEqual({
                nombre: "Motor de casa",
                tipo: "local",
                capacidades: ["reportar", "recoger-tareas"],
            });
        }
    });

    it("acepta capacidades omitidas como lista vacía", () => {
        const r = validarCuerpoMotor({ nombre: "Nube", tipo: "nube-propia" });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.valor.capacidades).toEqual([]);
    });

    it("acepta los tres tipos del contrato", () => {
        for (const tipo of ["local", "nube-propia", "servidor-propio"]) {
            expect(validarCuerpoMotor({ nombre: "x", tipo }).ok).toBe(true);
        }
    });

    it("rechaza un tipo desconocido", () => {
        const r = validarCuerpoMotor({ nombre: "x", tipo: "satelite" });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toContain("Tipo de motor");
    });

    it("rechaza capacidades fuera de la lista blanca", () => {
        const r = validarCuerpoMotor({
            nombre: "x",
            tipo: "local",
            capacidades: ["reportar", "borrar-todo"],
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toContain("borrar-todo");
    });

    it("rechaza cuerpos que no son objeto, nulos o sin nombre", () => {
        for (const malo of [null, 42, "texto", [], {}, { nombre: "   ", tipo: "local" }, { tipo: "local" }]) {
            expect(validarCuerpoMotor(malo).ok).toBe(false);
        }
    });

    it("rechaza nombres de más de 60 caracteres", () => {
        expect(validarCuerpoMotor({ nombre: "a".repeat(61), tipo: "local" }).ok).toBe(false);
    });

    it("recorta espacios del nombre", () => {
        const r = validarCuerpoMotor({ nombre: "  Mi motor  ", tipo: "servidor-propio" });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.valor.nombre).toBe("Mi motor");
    });
});

describe("armarRespuestaMotor", () => {
    const caso = { motorId: "3f6f9c1e-0000-4000-8000-abcdefabcdef", huella: "a1b2c3d4", token: "ssm_" + "A".repeat(43) };

    it("enseña el token una sola vez en la respuesta del POST", () => {
        const r = armarRespuestaMotor(caso);
        expect(r.token).toBe(caso.token);
        expect(formatoTokenValido(r.token)).toBe(true);
        expect(r.motor_id).toBe(caso.motorId);
        expect(r.huella).toBe(caso.huella);
    });

    it("las instrucciones nombran STARSEED_MOTOR_TOKEN sin repetir el token", () => {
        const r = armarRespuestaMotor(caso);
        expect(r.instrucciones).toContain("STARSEED_MOTOR_TOKEN");
        expect(r.instrucciones).toContain("~/.starseed/env");
        expect(r.instrucciones).not.toContain(caso.token);
    });

    it("la huella sí aparece en las instrucciones (no es secreta)", () => {
        const r = armarRespuestaMotor(caso);
        expect(r.instrucciones).toContain(caso.huella);
    });
});

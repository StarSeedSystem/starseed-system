// src/lib/aurora/voz-starseed/__tests__/motor-eleccion.test.ts
/**
 * TESTS DE ELECCIÓN POR LATENCIA (VST1018F-d2 · parte 2 de 3)
 * ─────────────────────────────────────────────────────────────────────────────
 * Prueba pura de `elegirMotorPorLatencia` con medidas falsas.
 */

import { describe, it, expect, vi } from "vitest";
import { elegirMotorPorLatencia } from "../motor";
import type { MedidaVoz, MotorLatencia } from "../motor";
import type { Timbre } from "@/lib/aurora/timbres-catalogo";

const NEURONA_ID = "neurona-test-1018";
const AHORA = 1_000_000_000;

/** Un timbre cualquiera: en la elección por latencia no se usa (misma voz en todos). */
const TIMBRE_PRUEBA: Timbre = {
    id: "test",
    nombre: "Test",
    genero: "neutra",
    desc: "",
    local: { voz: "ef_dora", speed: 1.0 },
    sistema: { bases: ["Paulina"], pitch: 1, rate: 1 },
    expr: { arco: 0.1, vivacidad: 0.1, calidez: 0.1 },
};

function medida(motor: string, valor: number, timestamp: number = AHORA): MedidaVoz {
    return { neurona: NEURONA_ID, motor, tipo: "primer-sonido", valor, timestamp };
}

function crearDeps(medidas: MedidaVoz[]) {
    return {
        leerMedidasFunc: vi.fn().mockReturnValue(medidas),
    };
}

describe("elegirMotorPorLatencia", () => {
    it("devuelve null si no hay medidas", () => {
        const deps = crearDeps([]);
        expect(elegirMotorPorLatencia(TIMBRE_PRUEBA, {}, deps)).toBeNull();
    });

    it("devuelve null si no hay primer-sonido", () => {
        const medidas: MedidaVoz[] = [
            { neurona: NEURONA_ID, motor: "kokoro", tipo: "tiempo-real-oido", valor: 500, timestamp: AHORA - 1000 },
            { neurona: NEURONA_ID, motor: "kokoro", tipo: "correccion", valor: 200, timestamp: AHORA - 500 },
        ];
        const deps = crearDeps(medidas);
        const resultado = elegirMotorPorLatencia(TIMBRE_PRUEBA, {}, deps);
        expect(resultado).toBeNull();
    });

    it("elige el motor con menor latencia media", () => {
        const medidas = [
            medida("kokoro", 800, AHORA - 2000),
            medida("kokoro", 900, AHORA - 1000),
            medida("omnivoice", 400, AHORA - 3000),
            medida("omnivoice", 500, AHORA - 2000),
        ];
        const deps = crearDeps(medidas);
        const resultado = elegirMotorPorLatencia(TIMBRE_PRUEBA, {}, deps);
        expect(resultado).not.toBeNull();
        expect(resultado!.motor).toBe("omnivoice");
        expect(resultado!.latenciaMs).toBe(450); // (400+500)/2
    });

    it("solo usa las últimas 20 medidas", () => {
        const medidas = Array.from({ length: 30 }, (_, i) => 
            i < 20
                ? medida("omnivoice", 100 + i * 10, AHORA - (30 - i) * 1000)
                : medida("kokoro", 1000, AHORA - (30 - i) * 1000)
        );
        const deps = crearDeps(medidas);
        const resultado = elegirMotorPorLatencia(TIMBRE_PRUEBA, {}, deps);
        expect(resultado).not.toBeNull();
        expect(resultado!.latenciaMs).toBeLessThan(2000);
    });

    it("ignora valores no numéricos", () => {
        const medidas = [
            medida("kokoro", NaN, AHORA - 1000),
            medida("kokoro", -100, AHORA - 900),
            medida("kokoro", 500, AHORA - 800),
        ];
        const deps = crearDeps(medidas);
        const resultado = elegirMotorPorLatencia(TIMBRE_PRUEBA, {}, deps);
        expect(resultado).not.toBeNull();
        expect(resultado!.latenciaMs).toBe(500);
    });
});

describe("nivelParaMotor", () => {
    it("devuelve 'ligera' para kokoro", async () => {
        const { nivelParaMotor } = await import("../motor");
        expect(nivelParaMotor("kokoro")).toBe("ligera");
    });

    it("devuelve 'minima' para sistema", async () => {
        const { nivelParaMotor } = await import("../motor");
        expect(nivelParaMotor("sistema")).toBe("minima");
    });

    it("devuelve 'estudio' para motores locales", async () => {
        const { nivelParaMotor } = await import("../motor");
        const locales = ["voicestudio", "omnivoice", "vibevoice", "voice158", "kitten", "moss-tts-nano", "supertonic"];
        for (const m of locales) {
            expect(nivelParaMotor(m)).toBe("estudio");
        }
    });

    it("devuelve 'nube' para motores de red", async () => {
        const { nivelParaMotor } = await import("../motor");
        const nubes = ["openvoice2", "voxcpm", "qwen3-tts", "dots-tts", "voicebox-test"];
        for (const m of nubes) {
            expect(nivelParaMotor(m)).toBe("nube");
        }
    });

    it("devuelve 'nube' por defecto para motores desconocidos", async () => {
        const { nivelParaMotor } = await import("../motor");
        expect(nivelParaMotor("motor-desconocido")).toBe("nube");
    });
});

describe("elegirMotorPorLatencia · permiso por contexto (VST1018F)", () => {
    it("el más rápido sin permiso pierde: gana el siguiente permitido", () => {
        const medidas = [
            medida("omnivoice", 400, AHORA - 3000),
            medida("kokoro", 800, AHORA - 2000),
        ];
        // En un contexto de grupo los motores personales (omnivoice) no entran.
        const deps = { ...crearDeps(medidas), permitidos: new Set<string>(["kokoro"]) };
        const resultado = elegirMotorPorLatencia(TIMBRE_PRUEBA, {}, deps);
        expect(resultado?.motor).toBe("kokoro");
        expect(resultado?.latenciaMs).toBe(800);
    });

    it("sin ningún motor medido con permiso devuelve null", () => {
        const medidas = [
            medida("omnivoice", 400, AHORA - 3000),
            medida("supertonic", 600, AHORA - 2000),
        ];
        const deps = { ...crearDeps(medidas), permitidos: new Set<string>(["kokoro"]) };
        expect(elegirMotorPorLatencia(TIMBRE_PRUEBA, {}, deps)).toBeNull();
    });

    it("sin conjunto de permitidos participan todos los medidos", () => {
        const medidas = [
            medida("omnivoice", 400, AHORA - 2000),
            medida("kokoro", 900, AHORA - 1000),
        ];
        const deps = crearDeps(medidas);
        expect(elegirMotorPorLatencia(TIMBRE_PRUEBA, {}, deps)?.motor).toBe("omnivoice");
    });
});

describe("nivelParaMotorEnContexto (VST1018F)", () => {
    it("«estudio» nunca en conversación: queda a «alta», mismo timbre", async () => {
        const { nivelParaMotorEnContexto } = await import("../motor");
        expect(nivelParaMotorEnContexto("omnivoice", "conversacion")).toBe("alta");
        expect(nivelParaMotorEnContexto("voicestudio", "aviso")).toBe("alta");
        expect(nivelParaMotorEnContexto("supertonic", "rito")).toBe("alta");
    });

    it("«estudio» sí en lectura (regla §4 del contrato)", async () => {
        const { nivelParaMotorEnContexto } = await import("../motor");
        expect(nivelParaMotorEnContexto("omnivoice", "lectura")).toBe("estudio");
    });

    it("los niveles que no llegan a estudio no se tocan", async () => {
        const { nivelParaMotorEnContexto } = await import("../motor");
        expect(nivelParaMotorEnContexto("kokoro", "lectura")).toBe("ligera");
        expect(nivelParaMotorEnContexto("kokoro", "conversacion")).toBe("ligera");
        expect(nivelParaMotorEnContexto("sistema", "lectura")).toBe("minima");
        expect(nivelParaMotorEnContexto("motor-desconocido", "conversacion")).toBe("nube");
    });
});
// src/lib/aurora/voz-starseed/__tests__/motor-instantaneo.test.ts
/**
 * Tests de VST1018F (Ola 1018V · parte 2, solo motor.ts): primera frase
 * instantánea de una conversación. Funciones PURAS, sin red, sin disco,
 * sin micrófono ni altavoz: las medidas de `medidas-voz` llegan FALSAS aquí.
 */

import { describe, expect, it } from "vitest";
import {
    elegirPrimeraFrase,
    nivelDeMotorUnico,
    usoDelContexto,
    type MotorMomento,
} from "@/lib/aurora/voz-starseed/motor";
import type { MedidaVoz } from "@/lib/aurora/medidas-voz";

/** Medida falsa de «primer-sonido»; candidato libre con la voz de la persona; opciones: personal.
 * conversación, capas vacías y sin medidas salvo lo que se pase. */
const medida = (motor: string, valor: number, extra: Partial<MedidaVoz> = {}): MedidaVoz => ({
    neurona: "n-prueba", motor, tipo: "primer-sonido", valor, timestamp: 1, ...extra,
});

const motor = (id: string, parcial: Partial<MotorMomento> = {}): MotorMomento => ({
    motor: id, claseLicencia: "libre", nivel: nivelDeMotorUnico(id), conVozDeLaPersona: true, ...parcial,
});

const def = (p: Partial<Parameters<typeof elegirPrimeraFrase>[1]> = {}):
    Parameters<typeof elegirPrimeraFrase>[1] =>
    ({ uso: "conversacion", contexto: "personal", capas: {}, medidas: [], ...p });

describe("usoDelContexto y nivelDeMotorUnico: el uso y el catálogo", () => {
    it("lectura larga, doblaje y audiolibros conservan su uso", () => {
        expect(usoDelContexto("lectura")).toBe("lectura");
        expect(usoDelContexto("doblaje")).toBe("doblaje");
        expect(usoDelContexto("audiolibro")).toBe("audiolibro");
    });

    it("el resto cae en conversación o aviso: nunca llega a «estudio»", () => {
        expect(usoDelContexto("conversacion")).toBe("conversacion");
        expect(usoDelContexto("rito")).toBe("conversacion");
        expect(usoDelContexto("aviso")).toBe("aviso");
    });

    it("VoiceMorphic y VoiceStudio son «estudio»; Kokoro/Kitten/MOSS «ligera»; sistema «minima»; resto «nube»", () => {
        expect(nivelDeMotorUnico("voicemorphic")).toBe("estudio");
        expect(nivelDeMotorUnico("voicestudio")).toBe("estudio");
        expect(nivelDeMotorUnico("kokoro")).toBe("ligera");
        expect(nivelDeMotorUnico("moss-tts-nano")).toBe("ligera");
        expect(nivelDeMotorUnico("sistema")).toBe("minima");
        expect(nivelDeMotorUnico("chatterbox")).toBe("nube");
    });
});

describe("elegirPrimeraFrase: permitido + menor medida + voz de la persona", () => {
    it("elige el de menor medida MEDIDA, aunque no sea el primero de la lista", () => {
        const r = elegirPrimeraFrase(
            [motor("kokoro"), motor("moss-tts-nano")],
            def({ medidas: [medida("kokoro", 400), medida("moss-tts-nano", 180)] }),
        );
        expect(r?.motor).toBe("moss-tts-nano");
        expect(r?.medidaMs).toBe(180);
        expect(r?.nivel).toBe("ligera");
    });

    it("sin medidas manda el orden de llegada (empate: el primero); lo medido gana al sin medir", () => {
        expect(elegirPrimeraFrase([motor("kokoro"), motor("moss-tts-nano")], def())?.motor).toBe("kokoro");
        const lento = elegirPrimeraFrase(
            [motor("kokoro"), motor("moss-tts-nano")],
            def({ medidas: [medida("moss-tts-nano", 9000)] }),
        );
        expect(lento?.motor).toBe("moss-tts-nano");
        expect(lento?.medidaMs).toBe(9000);
    });

    it("«estudio» nunca es instantáneo: fuera en conversación, dentro en audiolibro", () => {
        const estudio = motor("voicestudio", { claseLicencia: "personal" });
        const enConversacion = elegirPrimeraFrase(
            [estudio, motor("kokoro")],
            def({ medidas: [medida("voicestudio", 1), medida("kokoro", 300)] }),
        );
        expect(enConversacion?.motor).toBe("kokoro");
        const enAudiolibro = elegirPrimeraFrase(
            [estudio, motor("kokoro")],
            def({ uso: "audiolibro", medidas: [medida("voicestudio", 1), medida("kokoro", 300)], capas: { persona: "personal" } }),
        );
        expect(enAudiolibro?.motor).toBe("voicestudio");
    });

    it("pesos personales no suenan fuera del contexto personal", () => {
        const estudio = motor("voicestudio", { claseLicencia: "personal" });
        expect(elegirPrimeraFrase(
            [estudio],
            def({ uso: "audiolibro", contexto: "grupo", capas: { persona: "personal" } }),
        )).toBeNull();
    });

    it("licencia condicionada sin condición cumplida no entra; cumplida sí", () => {
        const cond = (cumple: boolean): MotorMomento =>
            motor("supertonic-x", { claseLicencia: "condicionada", condicionCumplida: cumple });
        expect(elegirPrimeraFrase(
            [cond(false)],
            def({ medidas: [medida("supertonic-x", 50)], capas: { grupo: "condicionada" } }),
        )).toBeNull();
        expect(elegirPrimeraFrase(
            [cond(true)],
            def({ medidas: [medida("supertonic-x", 50)], capas: { grupo: "condicionada" } }),
        )?.motor).toBe("supertonic-x");
    });

    it("sin ningún motor con la voz de la persona devuelve null", () => {
        const r = elegirPrimeraFrase(
            [motor("kokoro", { conVozDeLaPersona: false }), motor("sistema", { conVozDeLaPersona: false })],
            def({ medidas: [medida("kokoro", 300)] }),
        );
        expect(r).toBeNull();
    });
});

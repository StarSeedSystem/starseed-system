// src/lib/aurora/voz-starseed/__tests__/motor-primera-frase.test.ts
/**
 * Prueba PURA de la elección del motor de la primera frase (VST1018F · parte 2).
 * Medidas falsas, sin red, sin disco y sin audio. Contrato: voz-voicestudio.md §4.
 */

import { describe, expect, it } from "vitest";
import { elegirMotorPrimeraFrase, nivelParaMotor, type CandidatoMotorVoz } from "../motor";
import type { MedidaVoz } from "../../medidas-voz";

const NEURONA = "neurona-prueba";
const GRUPO = { uso: "conversacion" as const, contexto: "grupo" as const };
function medida(motor: string, valor: number, timestamp = 1_000): MedidaVoz {
    return { neurona: NEURONA, motor, tipo: "primer-sonido", valor, timestamp };
}

function candidato(id: string, extra: Partial<CandidatoMotorVoz> = {}): CandidatoMotorVoz {
    return { id, claseLicencia: "libre", tieneVoz: true, nivel: nivelParaMotor(id), ...extra };
}

describe("latencia medida", () => {
    it("sin medidas devuelve null", () => {
        expect(elegirMotorPrimeraFrase({ ...GRUPO, candidatos: [candidato("kokoro")], medidas: [] })).toBeNull();
    });
    it("elige la menor MEDIANA entre los que tienen la voz", () => {
        const r = elegirMotorPrimeraFrase({
            ...GRUPO,
            candidatos: [candidato("kokoro"), candidato("chatterbox")],
            medidas: [
                medida("kokoro", 900), medida("kokoro", 900), medida("kokoro", 900),
                medida("chatterbox", 400), medida("chatterbox", 420), medida("chatterbox", 440),
            ],
        });
        expect(r).toEqual({ motor: "chatterbox", nivel: "alta", latenciaMs: 420 });
    });
    it("descarta el rápido que NO tiene la voz", () => {
        const r = elegirMotorPrimeraFrase({
            ...GRUPO,
            candidatos: [candidato("openvoice2", { tieneVoz: false }), candidato("kokoro")],
            medidas: [medida("openvoice2", 50), medida("kokoro", 700)],
        });
        expect(r?.motor).toBe("kokoro");
    });
    it("la mediana aguanta un pico y solo mira la ventana reciente", () => {
        const pico = elegirMotorPrimeraFrase({
            ...GRUPO, candidatos: [candidato("kokoro")],
            medidas: [medida("kokoro", 100), medida("kokoro", 100), medida("kokoro", 10_000)],
        });
        expect(pico?.latenciaMs).toBe(100);
        const ventana = elegirMotorPrimeraFrase({
            ...GRUPO, candidatos: [candidato("kokoro")],
            medidas: [100, 100, 100, 900, 900, 900].map((v, i) => medida("kokoro", v, i)),
            ventana: 3,
        });
        expect(ventana?.latenciaMs).toBe(900);
    });
    it("entiende el alias del enrutador (kitten mide a kittentts)", () => {
        expect(elegirMotorPrimeraFrase({
            ...GRUPO, candidatos: [candidato("kittentts")], medidas: [medida("kitten", 250)],
        })).toMatchObject({ motor: "kittentts", nivel: "ligera", latenciaMs: 250 });
    });
});

describe("licencia del contexto", () => {
    it("en grupo no suena lo personal, aunque sea lo más rápido", () => {
        const r = elegirMotorPrimeraFrase({
            ...GRUPO, uso: "audiolibro",
            candidatos: [candidato("voicemorphic", { claseLicencia: "personal" }), candidato("kokoro")],
            medidas: [medida("voicemorphic", 80), medida("kokoro", 800)],
        });
        expect(r?.motor).toBe("kokoro");
    });
    it("en lo personal con la capa persona, lo personal sí compite", () => {
        const r = elegirMotorPrimeraFrase({
            uso: "audiolibro", contexto: "personal", capas: { persona: "personal" },
            candidatos: [candidato("voicemorphic", { claseLicencia: "personal" }), candidato("kokoro")],
            medidas: [medida("voicemorphic", 300), medida("kokoro", 800)],
        });
        expect(r).toMatchObject({ motor: "voicemorphic", nivel: "estudio" });
    });
    it("la condicionada exige condición cumplida y capa que la autorice", () => {
        const sinCondicion = elegirMotorPrimeraFrase({
            ...GRUPO,
            candidatos: [candidato("supertonic", { claseLicencia: "condicionada" }), candidato("kokoro")],
            medidas: [medida("supertonic", 100), medida("kokoro", 800)],
        });
        expect(sinCondicion?.motor).toBe("kokoro");
        const cumplida = elegirMotorPrimeraFrase({
            ...GRUPO, capas: { grupo: "condicionada" },
            candidatos: [
                candidato("supertonic", { claseLicencia: "condicionada", condicionCumplida: true }),
                candidato("kokoro"),
            ],
            medidas: [medida("supertonic", 100), medida("kokoro", 800)],
        });
        expect(cumplida?.motor).toBe("supertonic");
    });
});

describe("«estudio» solo para lo largo", () => {
    const candidatos = [candidato("voicestudio"), candidato("kokoro")];
    const medidas = [medida("voicestudio", 90), medida("kokoro", 500)];
    it("en conversación y avisos no compite", () => {
        expect(elegirMotorPrimeraFrase({ ...GRUPO, candidatos, medidas })?.motor).toBe("kokoro");
        expect(
            elegirMotorPrimeraFrase({ uso: "aviso", contexto: "grupo", candidatos, medidas })?.motor,
        ).toBe("kokoro");
    });
    it("en lectura, doblaje y audiolibros sí puede ganar", () => {
        for (const uso of ["lectura", "doblaje", "audiolibro"] as const) {
            expect(
                elegirMotorPrimeraFrase({ uso, contexto: "grupo", candidatos, medidas })?.motor,
            ).toBe("voicestudio");
        }
    });
    it("una sola elección para todo el mensaje", () => {
        const r = elegirMotorPrimeraFrase({ ...GRUPO, candidatos, medidas });
        expect(Object.keys(r ?? {})).toEqual(["motor", "nivel", "latenciaMs"]);
    });
});

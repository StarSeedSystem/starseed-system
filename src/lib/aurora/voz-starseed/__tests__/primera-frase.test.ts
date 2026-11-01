// Elección pura de la primera frase (VST1018F): motor PERMITIDO de menor
// latencia MEDIDA con la voz de la persona, «estudio» solo para lectura larga,
// doblaje y audiolibros, y un mensaje que nunca se parte entre dos motores.
// Sin red, disco ni reloj de pared: medidas y reloj falsos.

import { describe, it, expect } from "vitest";
import type { MedidaVoz } from "@/lib/aurora/medidas-voz";
import {
    elegirMotorPrimeraFrase,
    latenciasMedidas,
    motorDeMensaje,
    VIGENCIA_LATENCIA_MS,
    type CandidatoPrimeraFrase,
} from "../motor";

const AHORA = 1_700_000_000_000;

/** Medida falsa de «primer-sonido» (offsetMs hacia atrás desde el reloj falso). */
function m(motor: string, valor: number, offsetMs = 0, neurona = "n1"): MedidaVoz {
    return { neurona, motor, tipo: "primer-sonido", valor, timestamp: AHORA - offsetMs };
}

const CANDIDATOS: CandidatoPrimeraFrase[] = [
    { id: "omnivoice", claseLicencia: "personal", conVoz: true },
    { id: "voicestudio", claseLicencia: "personal", conVoz: true, esEstudio: true },
    { id: "supertonic", claseLicencia: "condicionada", condicionCumplida: true, conVoz: true },
    { id: "kokoro", claseLicencia: "libre", conVoz: true },
    { id: "indextts", claseLicencia: "condicionada", conVoz: true },
    { id: "dots", claseLicencia: "libre", conVoz: false },
];

const MEDIDAS: MedidaVoz[] = [
    m("omnivoice", 900),
    m("omnivoice", 1000),
    m("supertonic", 300),
    m("supertonic", 400),
    m("kokoro", 200),
];

describe("latenciasMedidas", () => {
    it("mediana por motor y solo de «primer-sonido»", () => {
        const lat = latenciasMedidas([...MEDIDAS, m("kokoro", 60)], { ahora: AHORA });
        expect(lat).toEqual({ omnivoice: 950, supertonic: 350, kokoro: 130 });
    });

    it("descarta lo viejo y lo futuro", () => {
        const lista = [
            m("kokoro", 10, VIGENCIA_LATENCIA_MS + 1),
            m("kokoro", 20, -10_000),
        ];
        expect(latenciasMedidas(lista, { ahora: AHORA })).toEqual({});
    });

    it("con neurona solo cuentan sus medidas", () => {
        const lat = latenciasMedidas([m("kokoro", 99, 0, "otra"), m("kokoro", 40)], {
            ahora: AHORA,
            neurona: "n1",
        });
        expect(lat).toEqual({ kokoro: 40 });
    });
});

describe("elegirMotorPrimeraFrase", () => {
    it("en lo personal gana el medido más rápido con voz y sin estudio", () => {
        const r = elegirMotorPrimeraFrase({
            candidatos: CANDIDATOS,
            contexto: "personal",
            capas: { persona: "personal" },
            medidas: MEDIDAS,
            ahora: AHORA,
        });
        expect(r).toEqual({ id: "kokoro", latenciaMs: 200, medido: true });
    });

    it("en grupo no compite el personal ni la condicionada sin capa", () => {
        const r = elegirMotorPrimeraFrase({
            candidatos: CANDIDATOS,
            contexto: "grupo",
            capas: {},
            medidas: [...MEDIDAS, m("omnivoice", 5), m("supertonic", 6)],
            ahora: AHORA,
        });
        expect(r).toEqual({ id: "kokoro", latenciaMs: 200, medido: true });
    });

    it("el motor de estudio no compite en conversación ni con la menor latencia", () => {
        const r = elegirMotorPrimeraFrase({
            candidatos: CANDIDATOS,
            contexto: "personal",
            capas: { persona: "personal" },
            medidas: [...MEDIDAS, m("voicestudio", 20)],
            ahora: AHORA,
        });
        expect(r).toEqual({ id: "kokoro", latenciaMs: 200, medido: true });
    });

    it("en audiolibros el estudio sí compite y gana por latencia medida", () => {
        const r = elegirMotorPrimeraFrase({
            candidatos: CANDIDATOS,
            contexto: "personal",
            capas: { persona: "personal" },
            medidas: [...MEDIDAS, m("voicestudio", 20)],
            uso: "audiolibro",
            ahora: AHORA,
        });
        expect(r).toEqual({ id: "voicestudio", latenciaMs: 20, medido: true });
    });

    it("sin medidas manda el orden recibido, pero lo medido siempre va delante", () => {
        const candidatos: CandidatoPrimeraFrase[] = [
            { id: "dots", claseLicencia: "libre", conVoz: true },
            { id: "kokoro", claseLicencia: "libre", conVoz: true },
        ];
        expect(elegirMotorPrimeraFrase({
            candidatos, contexto: "personal", capas: {}, medidas: [], ahora: AHORA,
        })).toEqual({ id: "dots", latenciaMs: 0, medido: false });
        expect(elegirMotorPrimeraFrase({
            candidatos, contexto: "personal", capas: {}, medidas: [m("kokoro", 50)], ahora: AHORA,
        })).toEqual({ id: "kokoro", latenciaMs: 50, medido: true });
    });

    it("las medidas de otra neurona no cuentan", () => {
        const r = elegirMotorPrimeraFrase({
            candidatos: [{ id: "kokoro", claseLicencia: "libre", conVoz: true }],
            contexto: "personal",
            capas: {},
            medidas: [m("kokoro", 10, 0, "otra")],
            neurona: "n1",
            ahora: AHORA,
        });
        expect(r).toEqual({ id: "kokoro", latenciaMs: 0, medido: false });
    });

    it("sin nadie que tenga la voz de la persona devuelve null", () => {
        expect(elegirMotorPrimeraFrase({
            candidatos: [{ id: "dots", claseLicencia: "libre", conVoz: false }],
            contexto: "personal",
            capas: {},
            medidas: MEDIDAS,
            ahora: AHORA,
        })).toBeNull();
    });
});

describe("motorDeMensaje", () => {
    it("mantiene el motor en curso: el mensaje no se parte entre dos", () => {
        expect(motorDeMensaje("kokoro", "supertonic")).toBe("supertonic");
    });

    it("sin motor en curso toma el elegido y sin ninguno devuelve null", () => {
        expect(motorDeMensaje("kokoro", null)).toBe("kokoro");
        expect(motorDeMensaje(null, null)).toBeNull();
    });
});

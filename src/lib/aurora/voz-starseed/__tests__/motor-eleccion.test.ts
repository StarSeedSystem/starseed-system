// src/lib/aurora/voz-starseed/__tests__/motor-eleccion.test.ts
// Elección pura de la primera frase (VST1018F): el motor permitido de menor
// latencia MEDIDA que tenga la voz de la persona, «estudio» solo para
// lectura/doblaje/audiolibros y un mensaje que nunca se parte entre dos
// motores. Sin red, sin disco, sin reloj de pared: medidas falsas.

import { describe, it, expect } from "vitest";
import type { MedidaVoz } from "@/lib/aurora/medidas-voz";
import {
    elegirMotorPrimeraFrase,
    latenciasMedidas,
    motorDeMensaje,
    type CandidatoPrimeraFrase,
} from "../motor";

/** Reloj falso: en el rango de vigencia, nunca depende de la hora real. */
const AHORA = 1_700_000_000_000;

/** Medida falsa de «primer-sonido» (offsetMs hacia atrás desde el reloj falso). */
function m(motor: string, valor: number, offsetMs = 0, neurona = "n1"): MedidaVoz {
    return {
        neurona,
        motor,
        tipo: "primer-sonido",
        valor,
        timestamp: AHORA - offsetMs,
    };
}

/** Motor de prueba corazón: dos motores libres con voz, uno de estudio y otro sin licencia clara. */
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
    it("devuelve la mediana por motor y solo del tipo «primer-sonido»", () => {
        const lat = latenciasMedidas([...MEDIDAS, m("kokoro", 60)], { ahora: AHORA });
        expect(lat).toEqual({ omnivoice: 950, supertonic: 350, kokoro: 130 });
    });

    it("descarta lo viejo (fuera de vigencia) y lo futuro", () => {
        const lista = [
            m("kokoro", 10, 8 * 24 * 60 * 60 * 1000),
            m("kokoro", 20, 1_700_000_010_000),
        ];
        expect(latenciasMedidas(lista, { ahora: AHORA })).toEqual({});
    });

    it("con filtro de neurona solo cuentan sus medidas", () => {
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

    it("en grupo el personal no compite aunque sea rápido, y el sin condición no entra", () => {
        const r = elegirMotorPrimeraFrase({
            candidatos: CANDIDATOS,
            contexto: "grupo",
            capas: {},
            medidas: [...MEDIDAS, m("omnivoice", 5)],
            ahora: AHORA,
        });
        expect(r).toEqual({ id: "kokoro", latenciaMs: 200, medido: true });
    });

    it("el motor de estudio no compite en conversación ni con la medida más baja", () => {
        const r = elegirMotorPrimeraFrase({
            candidatos: CANDIDATOS,
            contexto: "personal",
            capas: { persona: "personal" },
            medidas: [...MEDIDAS, m("voicestudio", 20)],
            ahora: AHORA,
        });
        expect(r?.id).not.toBe("voicestudio");
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

    it("sin medidas no se descarta a nadie: primero lo medido, luego el orden del catálogo", () => {
        const r = elegirMotorPrimeraFrase({
            candidatos: [{ id: "kokoro", claseLicencia: "libre", conVoz: true },
                { id: "dots", claseLicencia: "libre", conVoz: true }],
            contexto: "personal",
            capas: {},
            medidas: [],
            ahora: AHORA,
        });
        expect(r).toEqual({ id: "kokoro", latenciaMs: 0, medido: false });
    });

    it("las medidas de otra neurona no cuentan: queda no medido", () => {
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

    it("sin candidato con voz de la persona devuelve null", () => {
        const r = elegirMotorPrimeraFrase({
            candidatos: [{ id: "dots", claseLicencia: "libre", conVoz: false }],
            contexto: "personal",
            capas: {},
            medidas: MEDIDAS,
            ahora: AHORA,
        });
        expect(r).toBeNull();
    });
});

describe("motorDeMensaje", () => {
    it("con motor en curso lo mantiene: el mensaje nunca se parte entre dos", () => {
        expect(motorDeMensaje("kokoro", "supertonic")).toBe("supertonic");
    });

    it("sin motor en curso toma el elegido, y sin ninguno null", () => {
        expect(motorDeMensaje("kokoro", null)).toBe("kokoro");
        expect(motorDeMensaje(null, null)).toBeNull();
    });
});

/**
 * Pruebas del RESOLUTOR ÚNICO de identidad de voz (VZF1015M).
 * Pura: sin red, sin micrófono, sin procesos, sin disco — todo se pasa por parámetro.
 */

import { describe, it, expect } from "vitest";
import {
    identidadVoz,
    pautaPersonalidad,
    MOTOR_VOZ_DEFECTO,
    TIMBRE_DEFECTO,
    VOZ_RT_DEFECTO,
} from "@/lib/aurora/identidad-voz";
import { vozDePersona } from "@/lib/aurora/voz-rt";

describe("identidadVoz · defecto", () => {
    it("sin ninguna capa ni personalidad conocida: la voz F1 de Alex se conserva", () => {
        expect(identidadVoz({ personalidad: "una-desconocida" })).toEqual({
            motor: MOTOR_VOZ_DEFECTO,
            timbre: TIMBRE_DEFECTO,
            vozRT: VOZ_RT_DEFECTO,
            origen: "defecto",
        });
    });
    it("sin entrada alguna responde igual (no lanza: Aurora SIEMPRE habla)", () => {
        const id = identidadVoz({});
        expect(id.vozRT).toBe(VOZ_RT_DEFECTO);
        expect(id.origen).toBe("defecto");
    });
    it("los defectos del que llama completan la identidad vacía", () => {
        expect(identidadVoz({ porDefecto: { vozRT: "F2" } })).toEqual({
            motor: MOTOR_VOZ_DEFECTO,
            timbre: TIMBRE_DEFECTO,
            vozRT: "F2",
            origen: "defecto",
        });
    });
    it("una pauta de capa vacía (espacios) no gana: se sigue con la capa siguiente", () => {
        const id = identidadVoz({ agente: { motor: "   " }, neurona: { vozRT: "M1" } });
        expect(id).toEqual({ motor: MOTOR_VOZ_DEFECTO, timbre: TIMBRE_DEFECTO, vozRT: "M1", origen: "neurona" });
    });
});

describe("identidadVoz · precedencia agente › personalidad › cerebro › neurona › cuenta", () => {
    const pauta = (vozRT: string) => ({ motor: "prueba", timbre: `t-${vozRT}`, vozRT });
    it("la capa agente manda sobre todas las demás", () => {
        const id = identidadVoz({
            agente: pauta("F2"),
            cerebro: pauta("F3"),
            cuenta: pauta("M5"),
        });
        expect(id.origen).toBe("agente");
        expect(id.vozRT).toBe("F2");
    });
    it("los pines vacíos se saltan: gana primero la capa que habla de verdad", () => {
        const id = identidadVoz({ personalidad: null, cerebro: pauta("F4"), cuenta: pauta("M2") });
        expect(id.origen).toBe("cerebro");
        expect(id.vozRT).toBe("F4");
    });
    it("neurona gana a cuenta y cuenta a defecto", () => {
        expect(identidadVoz({ neurona: pauta("M0"), cuenta: pauta("M5") }).origen).toBe("neurona");
        expect(identidadVoz({ cuenta: pauta("M5") }).origen).toBe("cuenta");
    });
    it("la ganadora se completa con el defecto si le falta algo", () => {
        const id = identidadVoz({ cuenta: { vozRT: "M3" } });
        expect(id.origen).toBe("cuenta");
        expect(id).toMatchObject({ vozRT: "M3", motor: MOTOR_VOZ_DEFECTO, timbre: TIMBRE_DEFECTO });
    });
    it("personalidad como pauta completa gana en su nivel", () => {
        const id = identidadVoz({ personalidad: pauta("F5"), cerebro: pauta("F3") });
        expect(id.origen).toBe("personalidad");
        expect(id.vozRT).toBe("F5");
    });
});

describe("pautaPersonalidad · los mapas vivos, por la puerta única", () => {
    const MAPA = { aurora: "F1", hermione: "F3", astraura: "F1" };
    it("Aurora conserva su voz F1 y su semilla OpenVoice2", () => {
        expect(pautaPersonalidad("aurora", MAPA)).toEqual({ motor: "openvoice2", timbre: "aurora", vozRT: "F1" });
    });
    it("Hermione: la MISMA regla de seedKindFor da su semilla y el mapa su voz F3", () => {
        expect(pautaPersonalidad("hermione", MAPA)).toMatchObject({ motor: "openvoice2", timbre: "hermione", vozRT: "F3" });
    });
    it("las variantes con espacios o apellidos caen igual (normalización y semillas)", () => {
        expect(pautaPersonalidad("Hermione Granger", MAPA)?.timbre).toBe("hermione");
        // Astraura: timbre built-in de xAI y la voz de conversación sigue siendo la F1 del mapa.
        expect(pautaPersonalidad("astraura", MAPA)).toEqual({ motor: "xai", timbre: "eve", vozRT: "F1" });
    });
    it("una personalidad solo-xAI toma su voz built-in como timbre y su motor", () => {
        expect(pautaPersonalidad("council")).toEqual({ motor: "xai", timbre: "rex" });
    });
    it("sin id ni mapas: nula, para que la cadena siga con las demás capas", () => {
        expect(pautaPersonalidad(undefined, MAPA)).toBeNull();
        expect(pautaPersonalidad("desconocida")).toBeNull();
    });
});

describe("vozDePersona · un mismo resolutor", () => {
    it("sin personalidad: F1 de Alex, como siempre", () => {
        expect(vozDePersona()).toBe("F1");
    });
    it("por el mapa pasado como capa personalidad: F1 Aurora y F3 Hermione", () => {
        expect(vozDePersona("aurora")).toBe("F1");
        expect(vozDePersona("astraura")).toBe("F1");
        expect(vozDePersona("hermione")).toBe("F3");
    });
    it("una personalidad que solo el resolutor conoce también contesta sin romper", () => {
        expect(vozDePersona("council")).toBe(VOZ_RT_DEFECTO);
    });
});

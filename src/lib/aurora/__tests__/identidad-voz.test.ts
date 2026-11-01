/**
 * PRUEBAS DEL RESOLUTOR ÚNICO DE IDENTIDAD DE VOZ (Ola 1015V · tarea M, parte 1).
 * Puro: sin red, sin micrófono, sin procesos. El store va inyectado a mano.
 */
import { describe, it, expect } from "vitest";
import {
    identidadVozDe,
    vozRTDePersona,
    VOZ_RT_POR_PERSONA,
    MOTOR_VOZ_RT_DEFECTO,
    sanitizeEleccionIdentidadVoz,
    type IdentidadVozStore,
} from "@/lib/aurora/identidad-voz";
import { vozDePersona } from "@/lib/aurora/voz-rt";

describe("identidadVoz — precedencia agente › personalidad › cerebro › neurona › cuenta", () => {
    it("el agente manda sobre todas las demás capas", () => {
        const store: IdentidadVozStore = {
            porAgente: { a1: { timbre: "masc-orion" } },
            porPersonalidad: { aurora: { motor: "omnivoice" } },
            porCerebro: { c1: { vozRT: "M3" } },
            porNeurona: { n1: { timbre: "neu-nova" } },
            porCuenta: { acc1: { motor: "kitten" } },
        };
        const r = identidadVozDe(store, { personalidad: "aurora", agente: "a1", cerebro: "c1", neurona: "n1", cuenta: "acc1" });
        expect(r.origen).toBe("agente");
        expect(r.timbre).toBe("masc-orion");
    });

    it("cada campo cae a la capa más específica que lo tenga", () => {
        const store: IdentidadVozStore = {
            porPersonalidad: { aurora: { motor: "omnivoice" } },
            porCuenta: { acc1: { vozRT: "F5" } },
        };
        const r = identidadVozDe(store, { personalidad: "aurora", cuenta: "acc1" });
        expect(r.motor).toBe("omnivoice");
        expect(r.vozRT).toBe("F5");
        expect(r.origen).toBe("personalidad");
    });

    it("una capa con elección envía donde no dice nada a la capa inferior", () => {
        const store: IdentidadVozStore = {
            porCerebro: { c1: { vozRT: "M3" } },
            porNeurona: { n1: { timbre: "neu-eco" } },
        };
        const r = identidadVozDe(store, { personalidad: "hermes", cerebro: "c1", neurona: "n1" });
        expect(r.vozRT).toBe("M3");
        expect(r.timbre).toBe("neu-eco");
        expect(r.origen).toBe("cerebro");
    });
});

describe("identidadVoz — defecto («la voz F1 de Alex se conserva»)", () => {
    it("sin ninguna capa fijada: vozRT F1, motor de voz RT y timbre base autónomo", () => {
        const r = identidadVozDe({}, { personalidad: "desconocida" });
        expect(r.vozRT).toBe("F1");
        expect(r.motor).toBe(MOTOR_VOZ_RT_DEFECTO);
        expect(r.timbre).toBe("neu-zenit");
        expect(r.origen).toBe("defecto");
    });

    it("personalidad conocida trae su voz rápida del mapa de voz-rt", () => {
        expect(vozRTDePersona("Hermes")).toBe("M2");
        expect(vozRTDePersona("Aurora")).toBe("F1");
        expect(vozRTDePersona()).toBe("F1");
    });

    it("sin deriva con VOZ_POR_PERSONA de voz-rt.ts (que no se toca aquí)", () => {
        for (const [pid, voz] of Object.entries(VOZ_RT_POR_PERSONA)) {
            const desdeVozRT = vozDePersona(pid);
            if (/^[FM][1-5]$/.test(desdeVozRT)) {
                expect(voz).toBe(desdeVozRT);
            }
        }
        expect(vozDePersona("nadie-conoce-esta-persona")).toBe(vozRTDePersona("nadie-conoce-esta-persona"));
    });
});

describe("identidadVoz — guardas", () => {
    it("ids con espacios y mayúsculas se normalizan igual que en voz-rt", () => {
        expect(vozRTDePersona("  Astraura  ")).toBe("F1");
        expect(vozRTDePersona("ASTRAURA PRIME")).toBe("F1");
    });

    it("las elecciones inválidas se descartan en lugar de colarse", () => {
        expect(sanitizeEleccionIdentidadVoz({ timbre: "", motor: 42, vozRT: "F1" })).toEqual({ vozRT: "F1" });
        expect(sanitizeEleccionIdentidadVoz(null)).toBeNull();
        expect(sanitizeEleccionIdentidadVoz({ timbre: "a".repeat(200) })).toBeNull();
    });
});

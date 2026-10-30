/**
 * Pruebas del resolutor único de identidad de voz (Ola 1015V · M).
 * Todo puro: fuentes inyectadas, sin red, sin micrófono, sin procesos.
 */
import { describe, expect, it } from "vitest";
import {
    MOTOR_DEFECTO,
    identidadVozPorDefecto,
    identidadVoz,
    resolverIdentidadVoz,
    sanitizarFuentes,
} from "@/lib/aurora/identidad-voz";
import { vozDePersona } from "@/lib/aurora/voz-rt";

const DEFECTO = identidadVozPorDefecto("una-desconocida");

describe("identidadVozPorDefecto · los seis mapas", () => {
    it("la voz F1 de Astraura (Alex) se conserva por defecto", () => {
        const d = identidadVozPorDefecto("astraura");
        expect(d.vozRT).toBe("F1");
        expect(d.timbre).toBe("fem-aurora");
        expect(d.origen).toBe("defecto");
        expect(d.motor).toBe(MOTOR_DEFECTO);
        // La semilla de OpenVoice2 y la voz de xAI salen de sus mapas TAL CUAL:
        // seedKindFor solo cubre «aurora»/«hermione», así que «astraura» → null.
        expect(d.semilla).toBeUndefined();
        expect(d.xai).toBe("eve");
        expect(d.instruct).toBe("female, young adult, moderate pitch");
    });

    it("la semilla de identidad sigue a seedKindFor (aurora → «aurora»)", () => {
        expect(identidadVozPorDefecto("aurora").semilla).toBe("aurora");
    });

    it("los masculinos de la mapa van a timbre masculino y voz mensual", () => {
        const d = identidadVozPorDefecto("Hermes");
        expect(d.vozRT).toBe("M2");
        expect(d.timbre).toBe("masc-orion");
        expect(d.semilla).toBeUndefined();
        expect(d.xai).toBeUndefined();
    });

    it("Hermione comparte la semilla y xAI pero conserva su voz F3", () => {
        const d = identidadVozPorDefecto("hermione");
        expect(d.vozRT).toBe("F3");
        expect(d.semilla).toBe("hermione");
        expect(d.xai).toBe("ara");
    });

    it("desconocida → F1 y timbre femenino: nunca muda Aurora", () => {
        const d = identidadVozPorDefecto("");
        expect(d.vozRT).toBe("F1");
        expect(d.timbre).toBe("fem-aurora");
    });
});

describe("resolverIdentidadVoz · precedencia agente › personalidad › cerebro › neurona › cuenta", () => {
    const CTX = { agente: "ag-1", personalidad: "aurora", cerebro: "cerebro-1", neurona: "neo-1" };

    it("gana el ámbito completo más específico", () => {
        const fuentes = sanitizarFuentes({
            porAgente: { "ag-1": { vozRT: "F4", timbre: "fem-iris", motor: "kokoro" } },
            porPersonalidad: { aurora: { vozRT: "F2" } },
            cuenta: { "*": { vozRT: "F1" } },
        });
        const r = resolverIdentidadVoz(DEFECTO, fuentes, CTX);
        expect(r.vozRT).toBe("F4");
        expect(r.timbre).toBe("fem-iris");
        expect(r.motor).toBe("kokoro");
        expect(r.origen).toBe("agente");
    });

    it("campo a campo: cada campo gana su capa más específica y el resto hereda", () => {
        const fuentes = sanitizarFuentes({
            porAgente: { "ag-1": { motor: "voxcpm" } },
            porPersonalidad: { aurora: { vozRT: "F2", timbre: "fem-luna" } },
            porCerebro: { "cerebro-1": { timbre: "fem-vega" } },
            cuenta: { "*": { vozRT: "F5" } },
        });
        const r = resolverIdentidadVoz(DEFECTO, fuentes, CTX);
        expect(r.motor).toBe("voxcpm");
        expect(r.vozRT).toBe("F2");
        expect(r.timbre).toBe("fem-luna");
        expect(r.origen).toBe("agente");
    });

    it("sin agente, la personalidad decide y nombra; el motor queda en el defecto", () => {
        const fuentes = sanitizarFuentes({ porPersonalidad: { aurora: { vozRT: "F3" } } });
        const r = resolverIdentidadVoz(DEFECTO, fuentes, { personalidad: "aurora", neurona: "neo-1" });
        expect(r.vozRT).toBe("F3");
        expect(r.motor).toBe(DEFECTO.motor);
        expect(r.origen).toBe("personalidad");
    });

    it("solo cerebro: gana el timbre; solo neurona: gana el motor", () => {
        const cerebro = resolverIdentidadVoz(DEFECTO, sanitizarFuentes({ porCerebro: { "cerebro-1": { timbre: "neu-zenit" } } }), CTX);
        expect(cerebro.timbre).toBe("neu-zenit");
        expect(cerebro.origen).toBe("cerebro");
        const neurona = resolverIdentidadVoz(DEFECTO, sanitizarFuentes({ porNeurona: { "neo-1": { motor: "voice158" } } }), CTX);
        expect(neurona.motor).toBe("voice158");
        expect(neurona.origen).toBe("neurona");
    });

    it("solo la cuenta: aplica a quien no tiene decisión propia arriba", () => {
        const r = resolverIdentidadVoz(DEFECTO, sanitizarFuentes({ cuenta: { "*": { vozRT: "F1", motor: "bark" } } }), { personalidad: "otra" });
        expect(r.vozRT).toBe("F1");
        expect(r.motor).toBe("bark");
        expect(r.origen).toBe("cuenta");
    });

    it("sin fuentes o sin id del ámbito: hereda el defecto sin fingir origen", () => {
        const r1 = resolverIdentidadVoz(DEFECTO, {}, CTX);
        expect(r1.origen).toBe("defecto");
        expect(r1.vozRT).toBe("F1");
        const r2 = resolverIdentidadVoz(DEFECTO, sanitizarFuentes({ porAgente: { "ag-1": { motor: "kokoro" } } }), {});
        expect(r2.motor).toBe(MOTOR_DEFECTO);
        expect(r2.origen).toBe("defecto");
    });
});

describe("sanitizarFuentes y la fachada identidadVoz", () => {
    it("rechaza basura: vozRT fuera de F1-F5/M1-M5, tipos raros y objetos vacíos", () => {
        const f = sanitizarFuentes({
            porAgente: { "ag-1": { vozRT: "F9", motor: "Mil Máscaras" } },
            porPersonalidad: "no-soy-un-mapa",
            porCerebro: { "c-1": { motor: "" } },
            cuenta: { "*": {} },
        });
        expect(f.porAgente).toBeUndefined();
        expect(f.porPersonalidad).toBeUndefined();
        expect(f.porCerebro).toBeUndefined();
        expect(f.cuenta).toBeUndefined();
    });

    it("identidadVoz con fuentes explícitas respeta la precedencia y re-deriva el instruct del timbre", () => {
        const r = identidadVoz({ personalidad: "astraura", neurona: "neo-1" }, {
            porNeurona: { "neo-1": { timbre: "fem-vega" } },
            cuenta: { "*": { motor: "kokoro" } },
        });
        expect(r.timbre).toBe("fem-vega");
        expect(r.instruct).toBe("female, middle-aged, low pitch");
        expect(r.motor).toBe("kokoro");
        expect(r.vozRT).toBe("F1");
        expect(r.semilla).toBeUndefined();
        expect(r.origen).toBe("neurona");
    });
});

describe("vozDePersona pasa por el resolutor único", () => {
    it("cada personalidad suena igual y el defecto sigue siendo F1", () => {
        expect(vozDePersona("kallisti")).toBe("F5");
        expect(vozDePersona("Hermes")).toBe("M2");
        expect(vozDePersona("nadie")).toBe("F1");
    });
});

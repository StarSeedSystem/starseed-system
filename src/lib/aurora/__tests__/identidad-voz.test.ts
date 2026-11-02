import { describe, it, expect } from "vitest";
import {
    identidadVoz,
    normalizaPersona,
    TIMBRE_POR_PERSONA,
    type ConsultaIdentidad,
} from "@/lib/aurora/identidad-voz";
import { TIMBRES } from "@/lib/aurora/timbres-catalogo";

describe("identidadVoz · precedencia", () => {
    const capa = (id: string) => ({ id, vozRT: "F5" });

    it("el agente manda: su voz gana a la personalidad y a las demás", () => {
        const r = identidadVoz({
            agente: capa("aurora"),
            personalidad: capa("atenea"),
            cerebro: capa("mnemosyne"),
            neurona: capa("kallisti"),
            cuenta: capa("hephaestus"),
        });
        expect(r.vozRT).toBe("F5");
        expect(r.origen).toBe("agente");
        expect(TIMBRES.find((t) => t.id === TIMBRE_POR_PERSONA.aurora)?.id).toBe(r.timbre.id);
    });

    it("sin agente manda la personalidad", () => {
        const r = identidadVoz({ personalidad: capa("mnemosyne"), cuenta: capa("logos") });
        expect(r.vozRT).toBe("F5");
        expect(r.origen).toBe("personalidad");
    });

    it("cerebro, neurona y cuenta en su orden justo", () => {
        const base: ConsultaIdentidad = { personalidad: { id: "desconocida" } };
        expect(identidadVoz({ ...base, cerebro: capa("oneiros"), cuenta: capa("logos") })).toMatchObject({
            vozRT: "F5",
            origen: "cerebro",
        });
        expect(identidadVoz({ ...base, neurona: capa("logos"), cuenta: capa("hephaestus") })).toMatchObject({
            vozRT: "F5",
            origen: "neurona",
        });
        expect(identidadVoz({ ...base, cuenta: capa("hephaestus") }).origen).toBe("cuenta");
    });
});

describe("identidadVoz · defecto (la voz F1 de Alex se conserva)", () => {
    it("una personalidad sin voz en los mapas cae a F1, timbre fem-aurora y origen defecto", () => {
        const r = identidadVoz({ personalidad: { id: "desconocida" } });
        expect(r.vozRT).toBe("F1");
        expect(r.origen).toBe("defecto");
        expect(r.timbre.id).toBe("fem-aurora");
    });

    it("ni sin consulta ni sin personalidad se pierde la F1", () => {
        expect(identidadVoz(null).vozRT).toBe("F1");
        expect(identidadVoz({ personalidad: null }).vozRT).toBe("F1");
    });

    it("un pin malformado no borra lo que ya sabía el mapa (F3 de Hermione)", () => {
        expect(identidadVoz({ personalidad: { id: "hermione", vozRT: "X99" } }).vozRT).toBe("F3");
    });
});

describe("identidadVoz · lee los mapas existentes", () => {
    it("aurora: F1, semilla openvoice2 y timbre fem-aurora, por la personalidad", () => {
        const r = identidadVoz({ personalidad: { id: "Aurora" } });
        expect(r.vozRT).toBe("F1");
        expect(r.motor).toBe("openvoice2");
        expect(r.timbre.id).toBe("fem-aurora");
        expect(r.origen).toBe("personalidad");
    });

    it("hermes: M2 y timbre masc-hermes, por la personalidad", () => {
        const r = identidadVoz({ personalidad: { id: "hermes" } });
        expect(r.vozRT).toBe("M2");
        expect(r.timbre.id).toBe("masc-hermes");
        expect(r.origen).toBe("personalidad");
    });

    it("el pin cuenta del motor gana cuando ninguna capa anterior tiene voz", () => {
        const r = identidadVoz({
            personalidad: { id: "desconocida" },
            cuenta: { id: "hermes", motor: "omnivoice" },
        });
        expect(r.vozRT).toBe("M2");
        expect(r.motor).toBe("omnivoice");
        expect(r.timbre.id).toBe("masc-hermes");
        expect(r.origen).toBe("cuenta");
    });

    it("las personas xAI sin voz RT dedicada caen a xai desde `XAI_PERSONA_LIST`", () => {
        const r = identidadVoz({ personalidad: { id: "council" } });
        expect(r.motor).toBe("xai");
        expect(normalizaPersona("Council central mixteca")).toBe("council_central_mixteca");
    });
});

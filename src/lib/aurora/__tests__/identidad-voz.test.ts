import { describe, it, expect } from "vitest";
import {
    DEFECTO_VOZ_RT,
    ETIQUETA_ORIGEN_VOZ,
    identidadVoz,
    limpiarCapaVoz,
    type CapaVoz,
    type ContextoIdentidadVoz,
} from "@/lib/aurora/identidad-voz";
import { vozDePersona } from "@/lib/aurora/voz-rt";

describe("identidadVoz · precedencia", () => {
    it("sin capas → defecto, con la voz F1 de Alex conservada", () => {
        const id = identidadVoz({});
        expect(id.vozRT).toBe("F1");
        expect(id.origen).toBe("defecto");
        expect(id.timbre).toBeNull();
        expect(id.motor).toBeNull();
        expect(id.xai).toBeNull();
    });

    it("agente gana sobre personalidad, y esta sobre cerebro", () => {
        const id = identidadVoz({
            agente: { vozRT: "M2" },
            personalidad: { vozRT: "F2" },
            cerebro: { vozRT: "F3" },
        });
        expect(id.vozRT).toBe("M2");
        expect(id.origen).toBe("agente");
    });

    it("el orden completo es agente › personalidad › cerebro › neurona › cuenta", () => {
        const sinAgente: ContextoIdentidadVoz = {
            personalidad: { vozRT: "F2" },
            cerebro: { vozRT: "F3" },
            neurona: { vozRT: "F4" },
            cuenta: { vozRT: "F5" },
        };
        expect(identidadVoz({ ...sinAgente, agente: { vozRT: "M1" } }).vozRT).toBe("M1");
        expect(identidadVoz(sinAgente).vozRT).toBe("F2");
        expect(identidadVoz({ ...sinAgente, personalidad: null }).vozRT).toBe("F3");
        expect(identidadVoz({ ...sinAgente, personalidad: null, cerebro: null }).vozRT).toBe("F4");
        expect(identidadVoz({ ...sinAgente, personalidad: null, cerebro: null, neurona: null }).vozRT).toBe("F5");
    });

    it("una capa que fija solo un campo no borra lo fijado por las demás", () => {
        const id = identidadVoz({
            agente: { motor: "xai" },
            cuenta: { vozRT: "F3", seed: "aurora" },
        });
        expect(id.motor).toBe("xai");
        expect(id.vozRT).toBe("F3");
        expect(id.seed).toBe("aurora");
        expect(id.origen).toBe("agente");
    });

    it("una capa vacía no decide nada y no tapa a la siguiente", () => {
        const id = identidadVoz({ agente: {}, personalidad: { vozRT: "F2", timbre: "fem-luna" } });
        expect(id.vozRT).toBe("F2");
        expect(id.timbre).toBe("fem-luna");
        expect(id.origen).toBe("personalidad");
    });
});

describe("identidadVoz · campos del paquete", () => {
    it("reparte timbre, INSTRUCT, semilla y voz de xAI", () => {
        const id = identidadVoz({
            personalidad: { timbre: "fem-aurora", instruct: "female, young adult, moderate pitch" },
            neurona: { seed: "hermione" },
            cuenta: { xai: { voz: "eve", instrucciones: "Habla en español cálido." } },
        });
        expect(id.timbre).toBe("fem-aurora");
        expect(id.instruct).toBe("female, young adult, moderate pitch");
        expect(id.seed).toBe("hermione");
        expect(id.xai).toEqual({ voz: "eve", instrucciones: "Habla en español cálido." });
        expect(id.origen).toBe("personalidad");
    });

    it("la identidad con origen tiene su etiqueta en español", () => {
        expect(ETIQUETA_ORIGEN_VOZ[identidadVoz({ cuenta: { vozRT: "F2" } }).origen]).toBe("Ajuste de la cuenta");
        expect(ETIQUETA_ORIGEN_VOZ[identidadVoz({}).origen]).toBe("Defecto del OS (F1)");
    });
});

describe("limpiarCapaVoz · nunca lanza ni acepta inválidos", () => {
    it("descarta lo inválido y conserva lo válido", () => {
        const capa: CapaVoz | null = limpiarCapaVoz({
            timbre: "  fem-aurora ",
            motor: "x",
            vozRT: "X9",
            xai: { voz: "eve" },
        });
        expect(capa).toEqual({ timbre: "fem-aurora", motor: "x", xai: { voz: "eve" } });
    });

    it("formas rotas devuelven null o identidad de defecto, sin excepción", () => {
        expect(limpiarCapaVoz(null)).toBeNull();
        expect(limpiarCapaVoz(42)).toBeNull();
        expect(limpiarCapaVoz(["x"])).toBeNull();
        expect(limpiarCapaVoz("capa")).toBeNull();
        const id = identidadVoz({ agente: undefined, personalidad: 7 as unknown as CapaVoz, cerebro: {} });
        expect(id.vozRT).toBe(DEFECTO_VOZ_RT);
        expect(id.origen).toBe("defecto");
    });
});

describe("voz F1 de Alex se conserva por defecto", () => {
    it("vozDePersona sigue devolviendo F1 para Astraura/Aurora y personas desconocidas", () => {
        expect(vozDePersona("astraura")).toBe("F1");
        expect(vozDePersona("Aurora")).toBe("F1");
        expect(vozDePersona("Hermes")).toBe("M2");
        expect(vozDePersona("desconocida")).toBe("F1");
    });
});

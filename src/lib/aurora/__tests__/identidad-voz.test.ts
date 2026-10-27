import { describe, it, expect } from "vitest";
import { identidadVoz } from "@/lib/aurora/identidad-voz";
import { vozDePersona } from "@/lib/aurora/voz-rt";

describe("identidadVoz · defectos honestos", () => {
    it("sin capas: la voz F1 de Alex, motor omnivoice y timbre femenino", () => {
        expect(identidadVoz()).toEqual({ timbre: "fem-aurora", motor: "omnivoice", vozRT: "F1", origen: "defecto" });
        expect(identidadVoz({})).toEqual({ timbre: "fem-aurora", motor: "omnivoice", vozRT: "F1", origen: "defecto" });
        expect(identidadVoz({ agente: {}, cerebro: null, neurona: undefined, cuenta: {} })).toEqual({
            timbre: "fem-aurora", motor: "omnivoice", vozRT: "F1", origen: "defecto",
        });
    });

    it("los valores inválidos se ignoran como si no existieran", () => {
        expect(identidadVoz({ cuenta: { vozRT: "F9", motor: "", timbre: "" } })).toEqual({
            timbre: "fem-aurora", motor: "omnivoice", vozRT: "F1", origen: "defecto",
        });
        // Un timbre que no está en el catálogo ni es propio, no entra: cae al defecto.
        expect(identidadVoz({ cuenta: { timbre: "voy-x-ahora", vozRT: "F2" } }).timbre).toBe("fem-aurora");
    });

    it("normaliza: motor en minúsculas, vozRT en mayúsculas", () => {
        const res = identidadVoz({ cuenta: { motor: "  OpenVoice2  ", vozRT: "f2" } });
        expect(res.motor).toBe("openvoice2");
        expect(res.vozRT).toBe("F2");
        expect(res.origen).toBe("cuenta");
    });

    it("acepta timbres propios del formato del OS (propio-… y clon-…)", () => {
        expect(identidadVoz({ cuenta: { timbre: "propio-7kx" } }).timbre).toBe("propio-7kx");
        expect(identidadVoz({ cuenta: { timbre: "clon-fem-aurora-1" } }).timbre).toBe("clon-fem-aurora-1");
    });
});

describe("identidadVoz · precedencia agente › personalidad › cerebro › neurona › cuenta", () => {
    it("el agente manda sobre todas las capas", () => {
        const res = identidadVoz({
            agente: { vozRT: "M1" },
            personalidad: { vozRT: "F4" },
            cerebro: { vozRT: "F3", motor: "kokoro" },
            neurona: { vozRT: "F2" },
            cuenta: { vozRT: "F5" },
        });
        expect(res.vozRT).toBe("M1");
        expect(res.origen).toBe("agente");
    });

    it("sin agente, la personalidad gana a cerebro, neurona y cuenta", () => {
        const res = identidadVoz({
            personalidad: { vozRT: "F4" },
            cerebro: { vozRT: "F3" },
            neurona: { vozRT: "F2" },
            cuenta: { vozRT: "F5" },
        });
        expect(res.vozRT).toBe("F4");
        expect(res.origen).toBe("personalidad");
    });

    it("el cerebro tapa a la neurona, y la neurona a la cuenta", () => {
        expect(identidadVoz({ cerebro: { vozRT: "F3" }, neurona: { vozRT: "F2" }, cuenta: { vozRT: "F5" } })).toMatchObject({
            vozRT: "F3", origen: "cerebro",
        });
        expect(identidadVoz({ neurona: { vozRT: "M2" }, cuenta: { vozRT: "F5" } })).toMatchObject({
            vozRT: "M2", origen: "neurona",
        });
        expect(identidadVoz({ cuenta: { vozRT: "F5" } })).toMatchObject({ vozRT: "F5", origen: "cuenta" });
    });

    it("la precedencia es POR FACETA: un agente que solo fija el motor no borra la voz ajena", () => {
        const res = identidadVoz({ agente: { motor: "xai" }, neurona: { vozRT: "F3" } });
        expect(res.motor).toBe("xai");
        expect(res.vozRT).toBe("F3"); // la personalidad/neurona sigue decidiendo su voz
        expect(res.origen).toBe("agente"); // la capa más alta que decidió algo
    });

    it("la cuenta llena los huecos que nadie tocó", () => {
        const res = identidadVoz({ personalidad: { motor: "kokoro" }, cuenta: { vozRT: "F2", motor: "openvoice2" } });
        expect(res.vozRT).toBe("F2"); // viene de la cuenta
        expect(res.motor).toBe("kokoro"); // la personalidad no cede su faceta
        expect(res.origen).toBe("personalidad");
    });
});

describe("identidadVoz · defectos ligados entre sí", () => {
    it("el timbre por defecto sigue el género de la voz resuelta", () => {
        expect(identidadVoz({ cuenta: { vozRT: "M2" } })).toMatchObject({ timbre: "masc-orion", origen: "cuenta" });
        expect(identidadVoz({ cuenta: { vozRT: "F3" } }).timbre).toBe("fem-aurora");
    });

    it("la personalidad de Hermes tiene su timbre del catálogo", () => {
        expect(identidadVoz({ personalidad: "hermes" }).timbre).toBe("masc-hermes");
        expect(identidadVoz({ personalidad: { id: "Aurora Prime" } }).timbre).toBe("fem-aurora");
    });
});

describe("vozDePersona pasa por el resolutor", () => {
    it("la voz F1 de Alex se conserva por defecto", () => {
        expect(vozDePersona()).toBe("F1");
        expect(vozDePersona("astraura")).toBe("F1");
        expect(vozDePersona("desconocida")).toBe("F1");
    });

    it("cada personalidad suena siempre igual a través del resolutor", () => {
        expect(vozDePersona("Hermes")).toBe("M2");
        expect(vozDePersona("Atenea")).toBe("F2");
        expect(vozDePersona("hephaestus")).toBe("M1");
    });
});

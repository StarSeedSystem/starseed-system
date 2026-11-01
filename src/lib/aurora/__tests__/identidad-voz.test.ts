import { describe, expect, it } from "vitest";
import { identidadVoz, MOTOR_POR_DEFECTO } from "@/lib/aurora/identidad-voz";

describe("identidadVoz · valores por defecto", () => {
    it("conserva la voz F1 de Alex y el timbre Aurora sin configuración", () => {
        expect(identidadVoz({ personalidad: "aurora" })).toEqual({
            timbre: "fem-aurora",
            motor: MOTOR_POR_DEFECTO,
            vozRT: "F1",
            origen: "personalidad",
        });
    });

    it("sin ninguna capa reconocible devuelve la identidad de fábrica, sin lanzar", () => {
        expect(identidadVoz({})).toEqual({
            timbre: "fem-aurora",
            motor: MOTOR_POR_DEFECTO,
            vozRT: "F1",
            origen: "defecto",
        });
        expect(identidadVoz()).toEqual(identidadVoz({}));
    });

    it("una capa desconocida no tapa a la siguiente que sí existe", () => {
        const r = identidadVoz({ agente: "agente-inexistente", personalidad: "astraura" });
        expect(r.vozRT).toBe("F1");
        expect(r.origen).toBe("personalidad");
    });
});

describe("identidadVoz · mapas existentes", () => {
    it("lee la voz rápida de cada personalidad", () => {
        expect(identidadVoz({ personalidad: "atenea" }).vozRT).toBe("F2");
        expect(identidadVoz({ personalidad: "Hermione" }).vozRT).toBe("F3");
        expect(identidadVoz({ personalidad: "hermes" }).vozRT).toBe("M2");
        expect(identidadVoz({ personalidad: "oneiros" }).vozRT).toBe("M4");
    });

    it("encuentra el timbre del catálogo por nombre o por sufijo", () => {
        expect(identidadVoz({ agente: "Orión" }).timbre).toBe("masc-orion");
        expect(identidadVoz({ agente: "hermes" }).timbre).toBe("masc-hermes");
        expect(identidadVoz({ agente: "luna" }).timbre).toBe("fem-luna");
    });

    it("usa el género de los mapas cuando la personalidad no tiene timbre propio", () => {
        const council = identidadVoz({ personalidad: "council" });
        expect(council.timbre).toBe("masc-orion");
        expect(council.vozRT).toBe("M1");
        expect(council.origen).toBe("personalidad");
    });

    it("un id de motor fija la vía sin pisar el timbre de la personalidad", () => {
        const r = identidadVoz({ agente: "xai", personalidad: "aurora" });
        expect(r.motor).toBe("xai");
        expect(r.timbre).toBe("fem-aurora");
        expect(r.vozRT).toBe("F1");
        expect(r.origen).toBe("agente");
    });
});

describe("identidadVoz · precedencia agente › personalidad › cerebro › neurona › cuenta", () => {
    it("el agente manda sobre todas las capas inferiores", () => {
        const r = identidadVoz({
            agente: { timbre: "masc-atlas", motor: "voxcpm", vozRT: "M1" },
            personalidad: "aurora",
            cerebro: "hermes",
            neurona: "oneiros",
            cuenta: "atenea",
        });
        expect(r).toEqual({ timbre: "masc-atlas", motor: "voxcpm", vozRT: "M1", origen: "agente" });
    });

    it("sin agente, la personalidad manda sobre cerebro, neurona y cuenta", () => {
        const r = identidadVoz({
            personalidad: "atenea",
            cerebro: "hermes",
            neurona: "oneiros",
            cuenta: "kallisti",
        });
        expect(r.vozRT).toBe("F2");
        expect(r.origen).toBe("personalidad");
    });

    it("sin agente ni personalidad, decide el cerebro", () => {
        const r = identidadVoz({ cerebro: "hermes", neurona: "oneiros", cuenta: "kallisti" });
        expect(r.vozRT).toBe("M2");
        expect(r.timbre).toBe("masc-hermes");
        expect(r.origen).toBe("cerebro");
    });

    it("sin las capas altas, decide la neurona y, si falta, la cuenta", () => {
        expect(identidadVoz({ neurona: "oneiros", cuenta: "kallisti" }).origen).toBe("neurona");
        expect(identidadVoz({ neurona: "oneiros", cuenta: "kallisti" }).vozRT).toBe("M4");
        const soloCuenta = identidadVoz({ cuenta: "kallisti" });
        expect(soloCuenta.origen).toBe("cuenta");
        expect(soloCuenta.vozRT).toBe("F5");
    });

    it("cada campo se hereda de la capa inferior si la superior no lo fija", () => {
        const r = identidadVoz({
            agente: { motor: "omnivoice" },
            personalidad: "hermes",
        });
        expect(r).toEqual({ timbre: "masc-hermes", motor: "omnivoice", vozRT: "M2", origen: "agente" });
    });
});

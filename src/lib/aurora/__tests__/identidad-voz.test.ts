import { describe, expect, it } from "vitest";
import {
    identidadVoz,
    MOTOR_IDENTIDAD_POR_DEFECTO,
    VOZ_RT_POR_DEFECTO,
} from "@/lib/aurora/identidad-voz";

/**
 * VZF1015M · la identidad de voz se resuelve una sola vez y con la precedencia
 * agente › personalidad › cerebro › neurona › cuenta. Todo se pasa a mano: sin
 * red, sin micrófono, sin procesos y sin tocar localStorage.
 */
describe("identidadVoz · la voz F1 de Alex se conserva por defecto", () => {
    it("sin ninguna capa devuelve F1, el motor del pin real y el timbre de Aurora", () => {
        const id = identidadVoz();
        expect(id.vozRT).toBe("F1");
        expect(id.vozRT).toBe(VOZ_RT_POR_DEFECTO);
        expect(id.motor).toBe(MOTOR_IDENTIDAD_POR_DEFECTO);
        expect(id.timbre.id).toBe("fem-aurora");
        expect(id.origen).toBe("defecto");
    });

    it("Astraura y una desconocida mantienen F1; Hermes conserva su M2", () => {
        expect(identidadVoz({ personalidad: "astraura" }).vozRT).toBe("F1");
        expect(identidadVoz({ personalidad: "desconocida" }).vozRT).toBe("F1");
        expect(identidadVoz({ personalidad: "Hermes" }).vozRT).toBe("M2");
    });

    it("un id suelto se lee igual que un objeto con id", () => {
        expect(identidadVoz({ personalidad: "hermes" }).vozRT).toBe("M2");
        expect(identidadVoz({ personalidad: { id: "hermes" } }).vozRT).toBe("M2");
    });
});

describe("identidadVoz · precedencia de capas", () => {
    const todas = {
        agente: { timbre: "masc-atlas", motor: "bark", vozRT: "M3" },
        personalidad: { timbre: "fem-luna", motor: "voice158", vozRT: "F2" },
        cerebro: { timbre: "masc-kepler", motor: "voxcpm", vozRT: "M4" },
        neurona: { timbre: "fem-vega", motor: "omnivoice", vozRT: "F4" },
        cuenta: { timbre: "neu-eco", motor: "kokoro", vozRT: "F5" },
    } as const;

    it("gana agente sobre todas las demás", () => {
        const id = identidadVoz(todas);
        expect(id.motor).toBe("bark");
        expect(id.vozRT).toBe("M3");
        expect(id.timbre.id).toBe("masc-atlas");
        expect(id.origen).toBe("agente");
    });

    it("sin agente gana personalidad, y así en cadena hasta la cuenta", () => {
        const sinAgente = { personalidad: todas.personalidad, cerebro: todas.cerebro, neurona: todas.neurona, cuenta: todas.cuenta };
        expect(identidadVoz(sinAgente).origen).toBe("personalidad");
        expect(identidadVoz(sinAgente).vozRT).toBe("F2");

        const sinPersonalidad = { cerebro: todas.cerebro, neurona: todas.neurona, cuenta: todas.cuenta };
        expect(identidadVoz(sinPersonalidad).origen).toBe("cerebro");
        expect(identidadVoz(sinPersonalidad).motor).toBe("voxcpm");

        const sinCerebro = { neurona: todas.neurona, cuenta: todas.cuenta };
        expect(identidadVoz(sinCerebro).origen).toBe("neurona");
        expect(identidadVoz(sinCerebro).timbre.id).toBe("fem-vega");

        const soloCuenta = { cuenta: todas.cuenta };
        expect(identidadVoz(soloCuenta).origen).toBe("cuenta");
        expect(identidadVoz(soloCuenta).motor).toBe("kokoro");
    });

    it("cada campo hereda por separado: una capa solo aporta lo que sabe", () => {
        const id = identidadVoz({
            agente: { motor: "vibevoice" },
            personalidad: { vozRT: "F3" },
            neurona: { timbre: "neu-solis" },
        });
        expect(id.motor).toBe("vibevoice");
        expect(id.vozRT).toBe("F3");
        expect(id.timbre.id).toBe("neu-solis");
        expect(id.origen).toBe("agente");
    });
});

describe("identidadVoz · valores desconocidos se descartan sin romper", () => {
    it("un motor o timbre inventado no fija nada y hereda del siguiente ámbito", () => {
        const id = identidadVoz({
            agente: { motor: "motor-inventado", timbre: "timbre-inventado", vozRT: "Z9" },
            neurona: { motor: "omnivoice", timbre: "masc-hermes", vozRT: "M2" },
        });
        expect(id.motor).toBe("omnivoice");
        expect(id.timbre.id).toBe("masc-hermes");
        expect(id.vozRT).toBe("M2");
        expect(id.origen).toBe("neurona");
    });

    it("tolera null, objetos vacíos y textos con espacios o mayúsculas", () => {
        expect(identidadVoz({ personalidad: null, neurona: {} }).vozRT).toBe("F1");
        expect(identidadVoz({ neurona: { motor: " OmniVoice " } }).motor).toBe("omnivoice");
        expect(identidadVoz({ neurona: { vozRT: " m4 " } }).vozRT).toBe("M4");
    });
});

describe("identidadVoz · el timbre sale de los mapas existentes", () => {
    it("el género explícito elige su timbre predeterminado", () => {
        expect(identidadVoz({ personalidad: { genero: "masculina" } }).timbre.id).toBe("masc-orion");
        expect(identidadVoz({ personalidad: { genero: "neutra" } }).timbre.id).toBe("neu-zenit");
    });

    it("sin género, la voz rápida F/M decide el timbre por defecto", () => {
        expect(identidadVoz({ personalidad: { vozRT: "F2" } }).timbre.id).toBe("fem-aurora");
        expect(identidadVoz({ personalidad: { vozRT: "M1" } }).timbre.id).toBe("masc-orion");
    });
});

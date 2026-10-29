import { describe, it, expect } from "vitest";

import {
    IDENTIDAD_VOZ_DEFECTO,
    MOTOR_DEFECTO,
    TIMBRE_DEFECTO,
    VOZ_RT_DEFECTO,
    esVozRtValida,
    identidadVoz,
} from "@/lib/aurora/identidad-voz";
import { vozDePersona } from "@/lib/aurora/voz-rt";

describe("Identidad de voz (VZF1015M)", () => {
    it("sin capas devuelve la identidad por defecto (F1 de Alex conservada)", () => {
        const ident = identidadVoz({});
        expect(ident).toEqual({
            timbre: TIMBRE_DEFECTO,
            motor: MOTOR_DEFECTO,
            vozRT: "F1",
            origen: "defecto",
        });
        expect(VOZ_RT_DEFECTO).toBe("F1");
        expect(IDENTIDAD_VOZ_DEFECTO.vozRT).toBe("F1");
    });

    it("la capa más específica gana: agente sobre personalidad, cerebro y cuenta", () => {
        const ident = identidadVoz({
            cuenta: { vozRT: "M1", timbre: "fem-luna" },
            cerebro: { motor: "kokoro" },
            personalidad: { vozRT: "F3", timbre: "masc-orion" },
            agente: { vozRT: "F5" },
        });
        expect(ident.vozRT).toBe("F5");
        expect(ident.timbre).toBe("masc-orion");
        expect(ident.motor).toBe("kokoro");
        expect(ident.origen).toBe("agente");
    });

    it("entre dos capas que fijan el mismo campo gana la más específica", () => {
        const ident = identidadVoz({
            cuenta: { vozRT: "M4" },
            neurona: { vozRT: "F2" },
            personalidad: { vozRT: "F4" },
        });
        expect(ident.vozRT).toBe("F4");
        expect(ident.origen).toBe("personalidad");
    });

    it("cada campo cae a la capa más profunda que lo haya fijado", () => {
        const ident = identidadVoz({
            cerebro: { motor: "voice158" },
            neurona: { timbre: "neu-zenit" },
            cuenta: { vozRT: "M3" },
        });
        expect(ident.motor).toBe("voice158");
        expect(ident.timbre).toBe("neu-zenit");
        expect(ident.vozRT).toBe("M3");
        expect(ident.origen).toBe("cuenta");
    });

    it("libera el «origen» al campo más específico que fijó ALGO", () => {
        // La neurona fija un timbre, pero la cuenta fija el motor: el origen
        // cuenta el campo más específico que fijó cualquier cosa.
        const ident = identidadVoz({
            cuenta: { motor: "openvoice2" },
            neurona: { timbre: "fem-iris" },
        });
        expect(ident.timbre).toBe("fem-iris");
        expect(ident.motor).toBe("openvoice2");
        expect(ident.origen).toBe("neurona");
    });

    it("una capa inválida no decide (voz F9, valores sucios, vacía)", () => {
        const ident = identidadVoz({
            personalidad: { vozRT: "F9", timbre: "   ", motor: "" },
            cuenta: { vozRT: "M2" },
        });
        expect(ident.vozRT).toBe("M2");
        expect(ident.timbre).toBe(TIMBRE_DEFECTO);
        expect(ident.origen).toBe("cuenta");
    });

    it("esVozRtValida acepta el repertorio F1…M5 y nada más", () => {
        for (const voz of ["F1", "F5", "M1", "M5"]) expect(esVozRtValida(voz)).toBe(true);
        for (const voz of ["F0", "f1", "M6", "F9", "", "F1 ", 5, null, undefined, "FRA"]) {
            expect(esVozRtValida(voz)).toBe(false);
        }
    });

    it("vozDePersona conserva el mapa clásico: la F1 de Alex por defecto", () => {
        expect(vozDePersona()).toBe("F1");
        expect(vozDePersona("aurora")).toBe("F1");
        expect(vozDePersona("Astraura")).toBe("F1");
        expect(vozDePersona("hermes")).toBe("M2");
        expect(vozDePersona("atenea")).toBe("F2");
        expect(vozDePersona("Hephaestus")).toBe("M1");
        expect(vozDePersona("Kallisti")).toBe("F5");
        expect(vozDePersona("desconocida")).toBe("F1");
    });
});


/**
 * Pruebas de `voz-identidad.ts` (Ola 1015V): precedencia del resolutor único y
 * conservación de la voz F1 de Alex. Solo funciones puras: sin red, sin disco,
 * sin procesos y sin `vi.mock` de módulos de Node.
 */
import { describe, expect, it } from "vitest";
import {
    DEFECTO_IDENTIDAD,
    clavePersona,
    vozIdentidad,
    xaiPorDefecto,
    type NivelIdentidadVoz,
} from "@/lib/aurora/voz-identidad";

const CAPA = (v: Partial<NivelIdentidadVoz>): NivelIdentidadVoz => v;

/** Recorte del VOZ_POR_PERSONA real, con la voz F1 de Alex en la cabeza. */
const VOZ_POR_PERSONA = { aurora: "F1", astraura: "F1", atenea: "F2", hermes: "M2", aurora_prime: "F1" };

describe("vozIdentidad · precedencia agente > personalidad > cerebro > neurona > cuenta", () => {
    it("sin nada fijado cae al suelo: la voz F1 se conserva (defecto)", () => {
        expect(vozIdentidad({}, {})).toEqual(DEFECTO_IDENTIDAD);
        expect(vozIdentidad({ personalidadId: "alguien" }, {}).vozRT).toBe("F1");
    });

    it("el agente manda sobre lo fijado por cuenta y sobre los mapas", () => {
        const r = vozIdentidad(
            { personalidadId: "aurora", agente: CAPA({ vozRT: "M2" }), cuenta: CAPA({ vozRT: "M4" }) },
            { vozPorPersona: VOZ_POR_PERSONA },
        );
        expect(r.vozRT).toBe("M2");
        expect(r.origen).toBe("agente");
    });

    it("la personalidad explícita vence a cerebro, neurona y cuenta", () => {
        const r = vozIdentidad(
            {
                personalidadId: "aurora",
                personalidad: CAPA({ vozRT: "F3" }),
                cerebro: CAPA({ vozRT: "M1" }),
                neurona: CAPA({ vozRT: "M3" }),
                cuenta: CAPA({ vozRT: "M4" }),
            },
            { vozPorPersona: VOZ_POR_PERSONA },
        );
        expect(r.vozRT).toBe("F3");
        expect(r.origen).toBe("personalidad");
    });

    it("cerebro manda sobre neurona, y neurona sobre cuenta", () => {
        expect(
            vozIdentidad({ cerebro: CAPA({ vozRT: "M1" }), neurona: CAPA({ vozRT: "M3" }) }, {}).vozRT,
        ).toBe("M1");
        expect(
            vozIdentidad({ neurona: CAPA({ vozRT: "M3" }), cuenta: CAPA({ vozRT: "M4" }) }, {}).vozRT,
        ).toBe("M3");
    });

    it("la cuenta rellena el hueco cuando nadie más fijó ese campo", () => {
        const r = vozIdentidad({ cuenta: CAPA({ vozRT: "F2" }) }, {});
        expect(r.vozRT).toBe("F2");
        expect(r.origen).toBe("cuenta");
    });

    it("los campos se resuelven por separado: timbre del agente, vozRT de la cuenta", () => {
        const r = vozIdentidad(
            { agente: CAPA({ timbre: "masc-orion" }), cuenta: CAPA({ vozRT: "F2" }) },
            {},
        );
        expect(r.timbre).toBe("masc-orion");
        expect(r.vozRT).toBe("F2");
        expect(r.origen).toBe("agente"); // el ámbito más específico que fijó algo
    });
});

describe("vozIdentidad · los mapas existentes mandan en la capa de personalidad", () => {
    it("y el mapa del voz-rt conserva la F1 de Alex por defecto", () => {
        const r = vozIdentidad({ personalidadId: "Aurora Prime" }, { vozPorPersona: VOZ_POR_PERSONA });
        expect(r.vozRT).toBe("F1");
        expect(r.timbre).toBe("fem-aurora");
        expect(r.motor).toBe("auto");
        expect(r.origen).toBe("personalidad");
    });

    it("clavePersona normaliza igual que ya lo hacía vozDePersona", () => {
        expect(clavePersona("Aurora Prime")).toBe("aurora_prime");
        expect(clavePersona("  Mia  ")).toBe("mia");
        expect(vozIdentidad({ personalidadId: "hermes" }, { vozPorPersona: VOZ_POR_PERSONA }).vozRT).toBe("M2");
    });

    it("los valores inválidos de vozRT se ignoran y la cadena sigue bajando", () => {
        expect(vozIdentidad({ agente: CAPA({ vozRT: "XX" }), cuenta: CAPA({ vozRT: "M3" }) }, {}).vozRT).toBe("M3");
        expect(vozIdentidad({ agente: CAPA({ vozRT: "F9" }) }, { vozPorPersona: VOZ_POR_PERSONA }).vozRT).toBe("F1");
        expect(vozIdentidad({ agente: CAPA({ vozRT: "  " }) }, {}).vozRT).toBe("F1");
    });

    it("el mapa xAI existente da su voz por defecto y el agente puede cambiarla", () => {
        expect(vozIdentidad({ personalidadId: "hermione" }, { xaiPorPersona: xaiPorDefecto() }).xai).toBe("ara");
        expect(vozIdentidad({ personalidadId: "astraura" }, { xaiPorPersona: xaiPorDefecto() }).xai).toBe("eve");
        const r = vozIdentidad(
            { personalidadId: "hermione", agente: CAPA({ xai: "leo" }) },
            { xaiPorPersona: xaiPorDefecto() },
        );
        expect(r.xai).toBe("leo");
        expect(r.origen).toBe("agente");
    });

    it("la semilla de OpenVoice2 llega por función o por tabla, solo en la personalidad", () => {
        const mapas = { semillaPorPersona: (id?: string) => (id === "aurora" ? "aurora" : null) };
        expect(vozIdentidad({ personalidadId: "aurora" }, mapas).semilla).toBe("aurora");
        expect(vozIdentidad({ personalidadId: "otra" }, mapas).semilla).toBeUndefined();
        // La personalidad tiene el mapa (más específico que el cerebro): manda él.
        const r = vozIdentidad(
            { personalidadId: "aurora", cerebro: CAPA({ semilla: "custom" }) },
            { semillaPorPersona: { aurora: "aurora" } },
        );
        expect(r.semilla).toBe("aurora");
        expect(r.origen).toBe("personalidad");
        // Sin mapa: la semilla fija por cerebro entra y nombra su ámbito.
        const s = vozIdentidad({ cerebro: CAPA({ semilla: "custom" }) }, {});
        expect(s.semilla).toBe("custom");
        expect(s.origen).toBe("cerebro");
    });
});

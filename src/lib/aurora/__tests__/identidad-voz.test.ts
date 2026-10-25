/**
 * Pruebas de `identidad-voz.ts` (Ola 1015V): precedencia de la identidad de voz,
 * lectura de los mapas existentes sin coordinar nada a mano y conservación de la
 * voz F1 de Alex. Sin red, sin micrófono y sin procesos: los mapas vivos llegan
 * inyectados y las funciones puras se resuelven en memoria.
 */
import { describe, it, expect } from "vitest";
import { identidadVoz } from "@/lib/aurora/identidad-voz";
import { seedKindFor } from "@/lib/aurora/tts-oss/openvoice2";
import { TIMBRE_PREDETERMINADO, TIMBRES } from "@/lib/aurora/timbres-catalogo";

/** Recorte del VOZ_POR_PERSONA real de voz-rt.ts, con la voz F1 de Alex en la cabeza. */
const VOZ_POR_PERSONA = { aurora: "F1", astraura: "F1", atenea: "F2", hermes: "M2" };

describe("identidadVoz · la voz F1 de Alex se conserva por defecto", () => {
    it("sin nada fijado: vozRT F1, timbre del mapa de géneros y motor auto", () => {
        const r = identidadVoz();
        expect(r.vozRT).toBe("F1");
        expect(r.timbre).toBe(TIMBRE_PREDETERMINADO.femenina);
        expect(r.motor).toBe("auto");
        expect(r.origen).toBe("cuenta"); // los mapas de suelo (voz-inicial × timbres) fijaron el timbre
    });

    it("Aurora Prime sale del mapa VOZ_POR_PERSONA del voz-rt con su F1", () => {
        const r = identidadVoz({ personalidad: "Aurora Prime", vozPorPersona: VOZ_POR_PERSONA });
        expect(r.vozRT).toBe("F1");
        expect(r.origen).toBe("personalidad");
    });

    it("una persona sin entrada en el mapa y un valor inválido no la cambian", () => {
        expect(identidadVoz({ personalidad: "mia" }).vozRT).toBe("F1");
        expect(identidadVoz({ agente: { vozRT: "F9" } }).vozRT).toBe("F1");
        expect(identidadVoz({ cuenta: { vozRT: " " } }).vozRT).toBe("F1");
    });
});

describe("identidadVoz · precedencia agente › personalidad › cerebro › neurona › cuenta", () => {
    it("el agente manda sobre el mapa, y el mapa manda sobre el cerebro", () => {
        expect(
            identidadVoz({ personalidad: "hermes", vozPorPersona: VOZ_POR_PERSONA, cerebro: { vozRT: "M1" } }).vozRT,
        ).toBe("M2");
        const r = identidadVoz({ personalidad: "hermes", vozPorPersona: VOZ_POR_PERSONA, agente: { vozRT: "F5" } });
        expect(r.vozRT).toBe("F5");
        expect(r.origen).toBe("agente");
    });

    it("cerebro manda sobre neurona, la neurona sobre la cuenta y la cuenta rellena el hueco", () => {
        expect(identidadVoz({ cerebro: { vozRT: "M1" }, neurona: { vozRT: "M3" } }).vozRT).toBe("M1");
        expect(identidadVoz({ neurona: { vozRT: "M3" }, cuenta: { vozRT: "M4" } }).vozRT).toBe("M3");
    });

    it("los campos se resuelven por separado: timbre del agente, vozRT del mapa, sino la cuenta", () => {
        const r = identidadVoz({
            personalidad: "aurora",
            vozPorPersona: VOZ_POR_PERSONA,
            agente: { timbre: "masc-orion" },
            cuenta: { vozRT: "F2" },
        });
        expect(r.vozRT).toBe("F1"); // el mapa vence a la cuenta en vozRT
        expect(r.timbre).toBe("masc-orion");
        expect(r.origen).toBe("agente");
    });

    it("voz-inicial y timbres son el suelo: la cuenta añade y los ámbitos vencen", () => {
        expect(identidadVoz({ modoVoz: "masculina" }).timbre).toBe("masc-orion");
        expect(identidadVoz({ modoVoz: "autonoma" }).timbre).toBe("neu-zenit"); // el autónomo parte de neutra
        expect(identidadVoz({ modoVoz: "neutra", neurona: { timbre: "neu-solis" } }).timbre).toBe("neu-solis");
    });
});

describe("identidadVoz · los mapas existentes, leídos donde viven", () => {
    it("la semilla de OpenVoice2 (seedKindFor) y la voz xAI por persona, sin copiarlos", () => {
        expect(identidadVoz({ personalidad: "Hermione" }).semilla).toBe(seedKindFor("Hermione"));
        expect(identidadVoz({ personalidad: "aurora" }).semilla).toBe("aurora");
        expect(identidadVoz({ personalidad: "hermione" }).xai).toBe("ara");
        expect(identidadVoz({ personalidad: "astraura" }).xai).toBe("eve");
        const r = identidadVoz({ personalidad: "hermione", agente: { xai: "leo" } });
        expect(r.xai).toBe("leo");
        expect(r.origen).toBe("agente");
    });

    it("el INSTRUCT del demonio sale del catálogo de timbres, nadie lo fija a mano", () => {
        const femenina = identidadVoz({ modoVoz: "femenina" });
        const t = TIMBRES.find((x) => x.id === "fem-aurora");
        expect(femenina.instruct).toBe(t?.local.instruct);
        // Un timbre del catálogo sin instruct deja el campo en silencio, no inventa.
        expect(identidadVoz({ modoVoz: "neutra", neurona: { timbre: "no-existe" } }).instruct).toBeUndefined();
    });
});

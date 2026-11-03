import { describe, expect, it } from "vitest";
import { accionesDeCapacidad, detalleDeMedidor, SERVICIOS_POTENCIABLES } from "../medidores";

const AHORA_MS = 1_793_690_000_000;
const AHORA = AHORA_MS / 1000;

describe("«Potenciar» en Buscar más capacidad (1103 · U)", () => {
    it("sin preguntas solo ofrece buscar", () => {
        expect(accionesDeCapacidad({}, AHORA_MS).map((a) => a.clase)).toEqual(["buscar-capacidad"]);
    });

    it("una pregunta vigente da sus dos botones, con el medio como objetivo", () => {
        const acc = accionesDeCapacidad(
            { potenciar: { preguntas: { cloudroom: { t: AHORA - 60, detalle: "sin cupo hoy" } } } },
            AHORA_MS,
        );
        expect(acc.map((a) => a.clase)).toEqual(["buscar-capacidad", "potenciar-capacidad", "mantener-ritmo"]);
        expect(acc[1].objetivo).toBe("cloudroom");
        expect(acc[1].texto).toContain("Potenciar Cloudroom");
        expect(acc[2].texto).toContain("Mantener el ritmo de Cloudroom");
    });

    it("una pregunta vieja o callada no se ofrece", () => {
        const vieja = { preguntas: { cloudroom: { t: AHORA - 7 * 3600 } } };
        expect(accionesDeCapacidad({ potenciar: vieja }, AHORA_MS)).toHaveLength(1);
        const callada = { preguntas: { cloudroom: { t: AHORA - 60 } }, mantener: { cloudroom: { hasta: AHORA + 3600 } } };
        expect(accionesDeCapacidad({ potenciar: callada }, AHORA_MS)).toHaveLength(1);
    });

    it("un medio potenciado ofrece volver a su ritmo", () => {
        const acc = accionesDeCapacidad({ potenciar: { activos: { "claude-nube": { hasta: AHORA + 3600 } } } }, AHORA_MS);
        expect(acc.map((a) => a.clase)).toEqual(["buscar-capacidad", "mantener-ritmo"]);
        expect(acc[1].texto).toContain("Volver al ritmo de Claude en la nube");
        expect(SERVICIOS_POTENCIABLES).toContain("nube-gh");
    });

    it("el medidor de Agentes lleva los botones de la pregunta", () => {
        const d = detalleDeMedidor("agentes", { potenciar: { preguntas: { "nube-gh": { t: AHORA - 10 } } } }, AHORA_MS);
        expect(d.acciones.map((a) => a.clase)).toContain("potenciar-capacidad");
    });
});

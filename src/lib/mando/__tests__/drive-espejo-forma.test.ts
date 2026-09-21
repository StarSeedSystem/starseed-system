import { describe, expect, it } from "vitest";

import { interpretarEstadoEspejo } from "@/lib/mando/drive-espejo-forma";

describe("interpretarEstadoEspejo", () => {
    const ahora = Date.UTC(2026, 8, 20, 18, 0, 0);
    const hace = (milisegundos: number): string => new Date(ahora - milisegundos).toISOString();

    it("marca como reciente un espejo de hace 12 minutos", () => {
        expect(interpretarEstadoEspejo(hace(12 * 60_000), ahora)).toEqual({
            nivel: "ok",
            etiqueta: "Espejo al día",
            cuando: "hace 12 min",
        });
    });

    it("expresa en horas un espejo de hace 5 horas", () => {
        expect(interpretarEstadoEspejo(hace(5 * 3_600_000), ahora)).toEqual({
            nivel: "ok",
            etiqueta: "Espejo al día",
            cuando: "hace 5 h",
        });
    });

    it("expresa como ayer un espejo de hace 26 horas", () => {
        expect(interpretarEstadoEspejo(hace(26 * 3_600_000), ahora)).toEqual({
            nivel: "ok",
            etiqueta: "Espejo al día",
            cuando: "ayer",
        });
    });

    it("rechaza una fecha ilegible", () => {
        expect(interpretarEstadoEspejo("no-es-una-fecha", ahora)).toEqual({
            nivel: "invalida",
            etiqueta: "Fecha inválida",
            cuando: "sin fecha legible",
        });
    });

    it("rechaza una fecha futura por reloj desincronizado", () => {
        expect(interpretarEstadoEspejo(new Date(ahora + 60_000).toISOString(), ahora)).toEqual({
            nivel: "invalida",
            etiqueta: "Fecha inválida",
            cuando: "reloj desincronizado",
        });
    });
});

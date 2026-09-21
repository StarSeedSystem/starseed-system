import { describe, expect, it } from "vitest";

import { construirRespuestaJev } from "../jev-medidor";

describe("medidor de Jev", () => {
    it("arma los repartos, costes y percentiles de hoy y del mes", () => {
        const uso = {
            dias: {
                "2026-09-20": {
                    llamadas: 2,
                    coste_usd: 0.00002,
                    por_medio: {
                        local: { llamadas: 1, ms: [140] },
                        openrouter: { llamadas: 1, ms: [900] },
                    },
                },
                "2026-09-21": {
                    llamadas: 5,
                    coste_usd: 0.0001,
                    por_medio: {
                        local: { llamadas: 3, ms: [300, 100, 180] },
                        openrouter: { llamadas: 2, ms: [700, 500] },
                    },
                },
            },
        };

        const respuesta = construirRespuestaJev(uso, "2026-09-21", { dia: 0.05, mes: 1 }, true);

        expect(respuesta.hoy).toEqual({
            llamadas: 5,
            local: 3,
            openrouter: 2,
            coste_usd: 0.0001,
            p50_local_ms: 180,
            p50_openrouter_ms: 600,
        });
        expect(respuesta.mes).toEqual({
            llamadas: 7,
            local: 4,
            openrouter: 3,
            coste_usd: 0.00012,
            p50_local_ms: 160,
            p50_openrouter_ms: 700,
        });
        expect(respuesta.local_vivo).toBe(true);
    });

    it("devuelve todos los contadores a cero cuando el archivo no existe", () => {
        const respuesta = construirRespuestaJev(null, "2026-09-21", { dia: 0.05, mes: 1 }, false);

        expect(respuesta.hoy).toEqual(respuesta.mes);
        expect(respuesta.hoy.llamadas).toBe(0);
        expect(respuesta.hoy.local).toBe(0);
        expect(respuesta.hoy.openrouter).toBe(0);
        expect(respuesta.hoy.coste_usd).toBe(0);
        expect(respuesta.hoy.p50_local_ms).toBe(0);
        expect(respuesta.hoy.p50_openrouter_ms).toBe(0);
    });
});

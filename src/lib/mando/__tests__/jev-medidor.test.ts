import { describe, expect, it } from "vitest";

import { construirRespuestaJev, resumenPastillaJev } from "../jev-medidor";

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

        expect(respuesta.hoy).toMatchObject({
            llamadas: 5,
            local: 3,
            openrouter: 2,
            sin_desglose: 0,
            coste_usd: 0.0001,
            p50_local_ms: 180,
            p50_openrouter_ms: 600,
        });
        expect(respuesta.mes).toMatchObject({
            llamadas: 7,
            local: 4,
            openrouter: 3,
            sin_desglose: 0,
            coste_usd: 0.00012,
            p50_local_ms: 160,
            p50_openrouter_ms: 700,
        });
        expect(respuesta.local_vivo).toBe(true);
    });

    it("lo anotado antes del desglose sale aparte y cuadra la suma (datos reales del 21-09)", () => {
        const uso = {
            llamadas: 1502,
            cache: 9,
            local_pausa_hasta: 2_000_000_000,
            dias: {
                "2026-09-21": {
                    llamadas: 686,
                    coste_usd: 0.0106,
                    por_medio: { openrouter: { llamadas: 5, ms: [2400] } },
                },
                "2026-09-25": {
                    llamadas: 4,
                    cache: 2,
                    local_sin_respuesta: 3,
                    coste_usd: 0.00006,
                    por_medio: {
                        "laya-local": { llamadas: 1, ms: [300] },
                        openrouter: { llamadas: 3, ms: [2500, 2600, 2400] },
                    },
                    por_quien: { veredictos: 3, "telegram-puente": 1 },
                    por_tipo: { noul: 1, choice: 3 },
                },
            },
        };
        const r = construirRespuestaJev(uso, "2026-09-25", { dia: 0.2, mes: 2 }, true, false, 1_790_000_000_000);
        expect(r.hoy).toMatchObject({ llamadas: 4, laya: 1, openrouter: 3, cache: 2, local_sin_respuesta: 3 });
        expect(r.hoy.por_quien).toEqual({ veredictos: 3, "telegram-puente": 1 });
        expect(r.hoy.por_tipo).toEqual({ noul: 1, choice: 3 });
        expect(r.mes.llamadas).toBe(690);
        expect(r.mes.sin_desglose).toBe(690 - 1 - 3 - 5);
        expect(r.mes.local + r.mes.laya + r.mes.openrouter + r.mes.sin_desglose).toBe(r.mes.llamadas);
        expect(r.local_pausado_hasta).not.toBeNull();
        expect(r.total).toMatchObject({ llamadas: 1502, cache: 9 });
        expect(resumenPastillaJev(r)).toBe("hoy · 3 gratis (local 0 · Laya 1 · caché 2) · 3 OpenRouter");
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

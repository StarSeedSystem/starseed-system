// @vitest-environment jsdom
/**
 * El freno por la puerta de datos del A1 (PDA1012 · fase 2). La vigía empuja el freno a la puerta
 * en cada vuelta; el navegador lo lee de allí y solo pregunta a Supabase (`os_freno`) si la puerta
 * no está o no responde. Fallan si se desconecta la puerta.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

const g = vi.hoisted(() => ({ via: "puerta" as "puerta" | "supabase" | "rechazo", llamadasPuerta: 0, lecturasSupabase: 0, freno: { activo: true, motivo: "tope del día", hasta: "2099-01-01T00:00:00Z" } as unknown }));

vi.mock("@/lib/datos/puerta-a1", () => ({
    puertaA1: () => ({
        freno: async (respaldo?: () => Promise<unknown>) => {
            g.llamadasPuerta++;
            if (g.via === "puerta") return { via: "puerta", datos: { freno: g.freno, fuente: "vigia" } };
            if (g.via === "rechazo") return { via: "rechazo", datos: null, estado: 403 };
            return { via: "supabase", datos: respaldo ? await respaldo() : null };
        },
    }),
}));
vi.mock("@/utils/supabase/client", () => ({
    createClient: () => ({
        from: () => ({
            select: () => ({
                eq: () => ({
                    maybeSingle: async () => {
                        g.lecturasSupabase++;
                        return { data: { activo: false, motivo: null, hasta: null }, error: null };
                    },
                }),
            }),
        }),
    }),
}));

beforeEach(() => {
    g.via = "puerta";
    g.llamadasPuerta = 0;
    g.lecturasSupabase = 0;
    g.freno = { activo: true, motivo: "tope del día", hasta: "2099-01-01T00:00:00Z" };
});

describe("leerFilaFreno (freno por la puerta)", () => {
    test("con la puerta sana, el freno sale de la puerta y Supabase no se toca", async () => {
        const { leerFilaFreno } = await import("@/lib/consumo/freno");
        const fila = await leerFilaFreno();
        expect(g.llamadasPuerta).toBe(1);
        expect(g.lecturasSupabase).toBe(0);
        expect(fila?.activo).toBe(true);
        expect(fila?.motivo).toBe("tope del día");
    });

    test("la puerta sin freno empujado dice «inactivo» (no null)", async () => {
        g.freno = null;
        const { leerFilaFreno } = await import("@/lib/consumo/freno");
        expect(await leerFilaFreno()).toEqual({ activo: false });
    });

    test("sin puerta, se lee os_freno en Supabase como antes", async () => {
        g.via = "supabase";
        const { leerFilaFreno } = await import("@/lib/consumo/freno");
        const fila = await leerFilaFreno();
        expect(g.lecturasSupabase).toBe(1);
        expect(fila?.activo).toBe(false);
    });

    test("un «no» de la puerta conserva lo último (null), sin saltar a Supabase", async () => {
        g.via = "rechazo";
        const { leerFilaFreno } = await import("@/lib/consumo/freno");
        expect(await leerFilaFreno()).toBeNull();
        expect(g.lecturasSupabase).toBe(0);
    });
});

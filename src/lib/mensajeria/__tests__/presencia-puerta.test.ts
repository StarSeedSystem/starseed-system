// @vitest-environment jsdom
/**
 * Presencia «en línea / última vez» por la puerta de datos del A1 (PDA1012 · fase 2). La puerta
 * aplica la misma regla de `os_presencia` (visible, o tú) y la replica a Supabase cada 30 min.
 * Fallan si se desconecta la puerta.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

const g = vi.hoisted(() => ({ via: "puerta" as "puerta" | "supabase", consultas: [] as string[][], lecturasSupabase: 0 }));

vi.mock("@/lib/datos/puerta-a1", () => ({
    puertaA1: () => ({
        presencia: async (cuentas: string[], respaldo?: () => Promise<unknown>) => {
            g.consultas.push(cuentas);
            if (g.via === "puerta") {
                return { via: "puerta", datos: { presencia: [{ cuenta: cuentas[0], visto: new Date().toISOString(), en_linea: true }] } };
            }
            return { via: "supabase", datos: respaldo ? await respaldo() : null };
        },
        marcarPresencia: async () => ({ via: "puerta", datos: {} }),
    }),
}));
vi.mock("@/lib/mensajeria/ajustes-store", () => ({ useAjustesMensajeria: () => ({ ajustes: { privacidad: { mostrarEnLinea: "todos" } }, listo: true }) }));
vi.mock("@/lib/sync/entity-state", () => ({ currentUserRef: async () => ({ id: "u1" }) }));
vi.mock("@/utils/supabase/client", () => ({
    createClient: () => ({
        from: () => ({
            select: () => ({
                in: async () => {
                    g.lecturasSupabase++;
                    return { data: [{ user_id: "u2", visto: "2026-10-11T00:00:00Z", visible: false }], error: null };
                },
            }),
        }),
    }),
}));

beforeEach(() => {
    g.via = "puerta";
    g.consultas = [];
    g.lecturasSupabase = 0;
});

describe("leerPresencias", () => {
    test("pregunta a la puerta y no a os_presencia", async () => {
        const { leerPresencias } = await import("@/lib/mensajeria/presencia");
        const filas = await leerPresencias(["u2"]);
        expect(g.consultas).toEqual([["u2"]]);
        expect(g.lecturasSupabase).toBe(0);
        expect(filas).toHaveLength(1);
        expect(filas?.[0]).toMatchObject({ user_id: "u2", visible: true });
    });

    test("sin puerta, os_presencia como siempre (y lo invisible no se enseña)", async () => {
        g.via = "supabase";
        const { leerPresencias, estadoDePresencia } = await import("@/lib/mensajeria/presencia");
        const filas = await leerPresencias(["u2"]);
        expect(g.lecturasSupabase).toBe(1);
        expect(estadoDePresencia(filas ?? [], Date.now())).toEqual({});
    });
});

describe("estadoDePresencia (pura)", () => {
    test("en línea si el último «sigo aquí» tiene menos de 150 s", async () => {
        const { estadoDePresencia } = await import("@/lib/mensajeria/presencia");
        const ahora = Date.parse("2026-10-11T01:00:00Z");
        const e = estadoDePresencia(
            [
                { user_id: "a", visto: "2026-10-11T00:59:00Z", visible: true },
                { user_id: "b", visto: "2026-10-11T00:50:00Z", visible: true },
                { user_id: "c", visto: "no-fecha", visible: true },
            ],
            ahora,
        );
        expect(e.a.enLinea).toBe(true);
        expect(e.b.enLinea).toBe(false);
        expect(e.c).toBeUndefined();
    });
});

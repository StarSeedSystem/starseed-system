import { describe, expect, it, vi } from "vitest";

vi.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/consumo/usuario", () => ({ uidActual: async () => null }));
vi.mock("@/lib/consumo/guardian", () => ({ leerAvisoConsumo: () => ({ corte: false, corteHasta: null, frenoLocalHasta: null, diaAgotado: false }), mensajePausa: () => "pausa" }));
vi.mock("@/lib/consumo/freno", () => ({ frenoActivo: () => false }));
vi.mock("@/lib/sync/entity-state", () => ({ getEntityStateChecked: async () => ({ row: null, error: null }) }));

import { nombreTema, ordenarProyectos, progresoProyecto, resumirRutas, cargarEstudio, cargarRutas } from "../estudio";

const tarea = (id: string, topic: string | null, done: boolean, extra: Record<string, unknown> = {}) =>
    ({ id, owner: "u", title: `T ${id}`, notes: "", done, due_at: null, topic, group_id: null, guide_id: null, source: "user", created_at: `2026-09-0${id.length}T00:00:00Z`, ...extra }) as any;
const proyecto = (id: string, status: string, topic: string | null, updated = "2026-09-01T00:00:00Z") =>
    ({ id, owner: "u", title: `P ${id}`, description: "", status, topic, links: [], created_at: updated, updated_at: updated }) as any;

describe("progreso de proyectos", () => {
    it("cuenta las tareas del mismo tema (sin acentos ni mayúsculas) y elige la siguiente por fecha", () => {
        const ts = [
            tarea("a", "Energía", true),
            tarea("b", "energia", false, { due_at: "2026-10-05T00:00:00Z" }),
            tarea("c", "ENERGÍA", false, { due_at: "2026-10-01T00:00:00Z" }),
            tarea("d", "agua", false),
        ];
        const pr = progresoProyecto(proyecto("1", "activo", "energía"), ts);
        expect(pr.total).toBe(3);
        expect(pr.hechas).toBe(1);
        expect(pr.pct).toBeCloseTo(1 / 3);
        expect(pr.siguiente?.id).toBe("c");
    });

    it("no inventa un 0 % cuando no hay tareas vinculadas", () => {
        expect(progresoProyecto(proyecto("1", "activo", null), [tarea("a", null, false)]).pct).toBeNull();
        expect(progresoProyecto(proyecto("1", "hecho", null), []).pct).toBe(1);
    });

    it("ordena activos primero y dentro, lo más reciente", () => {
        const orden = ordenarProyectos([
            proyecto("h", "hecho", null, "2026-09-10T00:00:00Z"),
            proyecto("a1", "activo", null, "2026-09-01T00:00:00Z"),
            proyecto("i", "idea", null),
            proyecto("a2", "activo", null, "2026-09-05T00:00:00Z"),
        ]);
        expect(orden.map((p) => p.id)).toEqual(["a2", "a1", "i", "h"]);
    });
});

describe("rutas de aprendizaje", () => {
    const paso = (id: string, done: boolean) => ({ id, title: `Paso ${id}`, done, createdAt: "" });
    it("empezadas primero, completas al final y sin rutas vacías", () => {
        const r = resumirRutas({
            "top-fisica": [paso("1", true), paso("2", true)],
            "top-ia": [paso("1", true), paso("2", false)],
            "top-quimica": [paso("1", false)],
            "vacia": [],
        });
        expect(r.map((x) => x.tema)).toEqual(["top-ia", "top-quimica", "top-fisica"]);
        expect(r[0].siguiente?.id).toBe("2");
        expect(r[2].pct).toBe(1);
    });

    it("nombra los temas del catálogo y limpia los propios", () => {
        const cat = new Map([["top-fisica", { name: "Física" }]]);
        expect(nombreTema("top-fisica", cat)).toBe("Física");
        expect(nombreTema("ext-cultivo_de_setas", cat)).toBe("Cultivo de setas");
    });
});

describe("sin sesión", () => {
    it("lo dice en vez de devolver una lista vacía como si no tuvieras nada", async () => {
        expect(await cargarEstudio()).toEqual({ sesion: false, proyectos: [], tareas: [] });
        expect(await cargarRutas()).toEqual({ sesion: false, rutas: {} });
    });
});

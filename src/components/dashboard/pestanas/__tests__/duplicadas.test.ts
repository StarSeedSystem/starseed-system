// Pestañas temáticas duplicadas (fallo de producción del 2026-09-29): 18 siembras gen12 locales
// intactas + las 18 gen11 de la cuenta con otros ids → 18 pestañas, se quedan los ids de la cuenta
// con sus widgets intactos; si las dos tienen cambios, se conservan ambas; e idempotencia.
import { describe, expect, it } from "vitest";
import type { DashboardWidget } from "../../dashboard-types";
import { DEFAULT_DASHBOARD_TEMPLATES } from "../../dashboard-defaults";
import { LEGADO_GEN11 } from "../legado-gen11";
import { generarPredeterminados, migrarPredeterminados, type TableroMarcado } from "../migracion";
import { deduplicarPredeterminadas, SUFIJO_DISPOSITIVO } from "../duplicadas";

const PL = DEFAULT_DASHBOARD_TEMPLATES;

/** Las 18 siembras gen12 de ESTE navegador (ids l-…, 2026-09-29, marcadas). */
function locales() {
    let n = 0;
    const r = generarPredeterminados(PL, { uuid: () => `l-${String(++n).padStart(4, "0")}`, ahora: "2026-09-29T11:52:00.000Z" });
    return { dashboards: r.dashboards as TableroMarcado[], widgets: r.widgets };
}

/** Las 18 temáticas gen11 de la cuenta (ids r-…, 2026-08-30, sin marca), llegadas por la sincronización. */
function remotas() {
    const dashboards: TableroMarcado[] = [];
    const widgets: Record<string, DashboardWidget[]> = {};
    for (const t of PL) {
        const id = `r-${t.categoryId}`;
        const l = LEGADO_GEN11[t.categoryId];
        dashboards.push({ id, profile_id: "local", name: l.nombre, is_default: t.categoryId === "social", category: t.categoryId, created_at: "2026-08-30T23:31:00.000Z", updated_at: "2026-08-30T23:31:00.000Z" });
        widgets[id] = l.variantes[0].map((p, i) => ({
            id: `${id}-w${i}`, dashboard_id: id, widget_type: p.t as DashboardWidget["widget_type"],
            layout: { x: p.x, y: p.y, w: p.w, h: p.h, i: `${id}-i${i}` }, settings: p.s ? { ...p.s } : {}, created_at: "2026-08-30",
        }));
    }
    return { dashboards, widgets };
}

/** El estado del navegador de producción: las dos tandas, primero la local. */
function treintaYSeis() {
    const l = locales(), r = remotas();
    return { dashboards: [...l.dashboards, ...r.dashboards], widgets: { ...l.widgets, ...r.widgets }, l, r };
}

const categorias = (ds: TableroMarcado[]) => ds.map((d) => d.plantilla?.cat ?? d.category);

describe("deduplicarPredeterminadas", () => {
    it("reproduce el caso de producción: 36 → 18, se quedan los ids de la cuenta con sus widgets intactos", () => {
        const e = treintaYSeis();
        expect(e.dashboards).toHaveLength(36);
        const r = deduplicarPredeterminadas({ dashboards: e.dashboards, widgets: e.widgets, plantillas: PL });
        expect(r.cambio).toBe(true);
        expect(r.dashboards).toHaveLength(18);
        expect(r.dashboards.map((d) => d.id).sort()).toEqual(e.r.dashboards.map((d) => d.id).sort());
        for (const d of e.r.dashboards) expect(r.widgets[d.id]).toEqual(e.r.widgets[d.id]);
        for (const d of e.l.dashboards) expect(r.widgets[d.id]).toBeUndefined();
        expect(new Set(categorias(r.dashboards)).size).toBe(18);
        expect(r.dashboards.filter((d) => d.is_default).map((d) => d.id)).toEqual(["r-social"]);
        expect(r.informe.quitadas).toHaveLength(18);
        expect(r.informe.renombradas).toEqual([]);
    });

    it("la cuenta manda aunque su pestaña sea más nueva (ids compartidos) y la migración gen12 renueva las que quedan", () => {
        const e = treintaYSeis();
        // Ahora la siembra local es la antigua: sin la pista de la cuenta ganaría ella.
        const dashboards = e.dashboards.map((d) => (d.id.startsWith("l-") ? { ...d, created_at: "2026-01-01T00:00:00.000Z" } : d));
        const r = deduplicarPredeterminadas({ dashboards, widgets: e.widgets, plantillas: PL, compartidas: new Set(e.r.dashboards.map((d) => d.id)) });
        expect(r.dashboards.every((d) => d.id.startsWith("r-"))).toBe(true);
        let n = 0;
        const m = migrarPredeterminados({ dashboards: r.dashboards, widgets: r.widgets, retirados: [], plantillas: PL }, { uuid: () => `m-${++n}`, ahora: "2026-09-30" });
        expect(m.dashboards).toHaveLength(18);
        expect(m.informe.renovadas).toHaveLength(18);
        expect(m.dashboards.every((d) => d.id.startsWith("r-") && d.plantilla?.v.startsWith("gen12"))).toBe(true);
    });

    it("si las dos tienen cambios de la persona, se conservan ambas y la local se distingue", () => {
        const e = treintaYSeis();
        const lClima = e.l.dashboards.find((d) => d.plantilla?.cat === "clima")!;
        const rClima = e.r.dashboards.find((d) => d.category === "clima")!;
        const widgets = {
            ...e.widgets,
            [lClima.id]: e.widgets[lClima.id].map((w, i) => (i === 0 ? { ...w, layout: { ...w.layout, h: w.layout.h + 1 } } : w)),
            [rClima.id]: e.widgets[rClima.id].slice(1),
        };
        const r = deduplicarPredeterminadas({ dashboards: e.dashboards, widgets, plantillas: PL });
        expect(r.dashboards).toHaveLength(19);
        const local = r.dashboards.find((d) => d.id === lClima.id)!;
        expect(local.name).toBe(`Clima${SUFIJO_DISPOSITIVO}`);
        expect(local.origen).toBe("persona");
        expect(local.plantilla).toBeUndefined();
        expect(r.widgets[lClima.id]).toEqual(widgets[lClima.id]);
        expect(r.dashboards.find((d) => d.id === rClima.id)!.name).toBe("Clima");
        expect(r.widgets[rClima.id]).toEqual(widgets[rClima.id]);
        expect(r.informe.renombradas).toEqual([`Clima${SUFIJO_DISPOSITIVO}`]);
        // Una local con color propio también es trabajo de la persona: se conserva.
        const conColor = e.dashboards.map((d) => (d.id === lClima.id ? { ...d, acento: "#10B981" } : d));
        expect(deduplicarPredeterminadas({ dashboards: conColor, widgets: e.widgets, plantillas: PL }).dashboards.some((d) => d.id === lClima.id)).toBe(true);
    });

    it("no toca las pestañas de la persona (creadas, duplicadas o con nombre propio)", () => {
        const r0 = remotas();
        const clima = r0.dashboards.find((d) => d.category === "clima")!;
        const suya: TableroMarcado = { ...clima, id: "p-1", created_at: "2026-09-01T00:00:00.000Z", origen: "persona" };
        const propia: TableroMarcado = { ...clima, id: "p-2", name: "Mi tiempo", created_at: "2026-09-02T00:00:00.000Z" };
        const r = deduplicarPredeterminadas({
            dashboards: [...r0.dashboards, suya, propia],
            widgets: { ...r0.widgets, "p-1": r0.widgets[clima.id], "p-2": r0.widgets[clima.id] },
            plantillas: PL,
        });
        expect(r.cambio).toBe(false);
        expect(r.dashboards).toHaveLength(20);
    });

    it("es idempotente (y lo sigue siendo tras migrar)", () => {
        const e = treintaYSeis();
        const r1 = deduplicarPredeterminadas({ dashboards: e.dashboards, widgets: e.widgets, plantillas: PL });
        const r2 = deduplicarPredeterminadas({ dashboards: r1.dashboards, widgets: r1.widgets, plantillas: PL });
        expect(r2.cambio).toBe(false);
        expect(r2.dashboards).toEqual(r1.dashboards);
        expect(r2.widgets).toEqual(r1.widgets);
        let n = 0;
        const m = migrarPredeterminados({ dashboards: r1.dashboards, widgets: r1.widgets, retirados: [], plantillas: PL }, { uuid: () => `m-${++n}`, ahora: "2026-09-30" });
        const r3 = deduplicarPredeterminadas({ dashboards: m.dashboards, widgets: m.widgets, plantillas: PL });
        expect(r3.cambio).toBe(false);
    });
});

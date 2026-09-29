// Migración de las pestañas predeterminadas (gen11 → gen12): las intactas se renuevan, las que
// la persona tocó se conservan (con el diseño nuevo ofrecido), las que faltan se añaden y nada
// de la persona se borra nunca.
import { describe, expect, it } from "vitest";
import type { Dashboard, DashboardWidget } from "../../dashboard-types";
import { DEFAULT_DASHBOARD_TEMPLATES } from "../../dashboard-defaults";
import { LEGADO_GEN11 } from "../legado-gen11";
import {
    VERSION_PREDETERMINADOS, aplicarDiseno, coincideConLegado, descartarNovedad, estadoPestana, generarPredeterminados,
    huellaWidgets, localizarPredeterminada, migrarPredeterminados, novedadDisponible, type TableroMarcado,
} from "../migracion";

function deps() {
    let n = 0;
    return { uuid: () => `id-${++n}`, ahora: "2026-09-29T12:00:00.000Z" };
}

/** Siembra una pestaña «como la dejaba gen11» (variante 0 de su huella). */
function pestanaGen11(cat: string, id = `d-${cat}`, variante = 0): { d: TableroMarcado; ws: DashboardWidget[] } {
    const l = LEGADO_GEN11[cat];
    const ws = l.variantes[variante].map((p, i) => ({
        id: `${id}-w${i}`,
        dashboard_id: id,
        widget_type: p.t as DashboardWidget["widget_type"],
        layout: { x: p.x, y: p.y, w: p.w, h: p.h, i: `${id}-i${i}` },
        settings: p.s ? { ...p.s } : {},
        created_at: "2026-07-11",
    }));
    const d: Dashboard = { id, profile_id: "local", name: l.nombre, is_default: cat === "social", category: cat, created_at: "2026-07-11", updated_at: "2026-07-11" };
    return { d, ws };
}

function cuentaGen11(cats: string[]) {
    const dashboards: TableroMarcado[] = [];
    const widgets: Record<string, DashboardWidget[]> = {};
    for (const c of cats) {
        const p = pestanaGen11(c);
        dashboards.push(p.d);
        widgets[p.d.id] = p.ws;
    }
    return { dashboards, widgets };
}

const TODAS = DEFAULT_DASHBOARD_TEMPLATES.map((t) => t.categoryId);

describe("huellas", () => {
    it("no dependen del orden y sí de la posición y los ajustes", () => {
        const { ws } = pestanaGen11("politica");
        expect(huellaWidgets([...ws].reverse())).toBe(huellaWidgets(ws));
        const movido = ws.map((w, i) => (i === 0 ? { ...w, layout: { ...w.layout, x: w.layout.x + 1 } } : w));
        expect(huellaWidgets(movido)).not.toBe(huellaWidgets(ws));
        const ajustado = ws.map((w, i) => (i === 0 ? { ...w, settings: { styleVariant: "solido" } } : w));
        expect(huellaWidgets(ajustado)).not.toBe(huellaWidgets(ws));
    });
    it("reconoce gen11 intacta, sin las piezas opcionales, y rechaza lo tocado", () => {
        const { ws } = pestanaGen11("clima");
        expect(coincideConLegado(ws, LEGADO_GEN11.clima.variantes)).toBe(true);
        // Cuenta vieja: sin el dock ni los extras (se añadieron después a la plantilla).
        const vieja = ws.filter((w) => !["APP_LAUNCHER", "SPACE_WEATHER", "OFFICIAL_DATA"].includes(w.widget_type));
        expect(coincideConLegado(vieja, LEGADO_GEN11.clima.variantes)).toBe(true);
        // Quitar una pieza fija o añadir otra = la persona la tocó.
        expect(coincideConLegado(ws.filter((w) => w.widget_type !== "WEATHER_UV"), LEGADO_GEN11.clima.variantes)).toBe(false);
        expect(coincideConLegado([...ws, { ...ws[0], id: "x", widget_type: "MAP_LOCATION" }], LEGADO_GEN11.clima.variantes)).toBe(false);
        // Bloquear un widget también es tocarla.
        expect(coincideConLegado(ws.map((w, i) => (i === 1 ? { ...w, settings: { bloqueado: true } } : w)), LEGADO_GEN11.clima.variantes)).toBe(false);
        // El Inicio de antes de la Adenda 99 (sin radar de internet) también es de fábrica.
        expect(coincideConLegado(pestanaGen11("social", "s", 1).ws, LEGADO_GEN11.social.variantes)).toBe(true);
    });
});

describe("migrarPredeterminados", () => {
    it("renueva las intactas conservando id, nombre, dispositivos e ids de widgets del mismo tipo", () => {
        const cuenta = cuentaGen11(TODAS);
        const clima = cuenta.dashboards.find((d) => d.category === "clima")!;
        clima.deviceTags = ["tv"];
        const idTemperatura = cuenta.widgets[clima.id].find((w) => w.widget_type === "WEATHER_TEMPERATURE")!.id;
        const r = migrarPredeterminados({ ...cuenta, retirados: [], plantillas: DEFAULT_DASHBOARD_TEMPLATES }, deps());
        expect(r.cambio).toBe(true);
        expect(r.informe.renovadas.length).toBe(TODAS.length);
        expect(r.informe.conservadas).toEqual([]);
        expect(r.dashboards.map((d) => d.id)).toEqual(cuenta.dashboards.map((d) => d.id));
        const nueva = r.dashboards.find((d) => d.id === clima.id)!;
        expect(nueva.name).toBe("Clima");
        expect(nueva.deviceTags).toEqual(["tv"]);
        expect(nueva.plantilla?.v).toBe(VERSION_PREDETERMINADOS);
        const tipos = r.widgets[clima.id].map((w) => w.widget_type);
        expect(tipos).toEqual(DEFAULT_DASHBOARD_TEMPLATES.find((t) => t.categoryId === "clima")!.widgets.map((w) => w.type));
        expect(r.widgets[clima.id].find((w) => w.widget_type === "WEATHER_TEMPERATURE")!.id).toBe(idTemperatura);
        expect(estadoPestana(nueva, r.widgets[clima.id])).toBe("al-dia");
    });

    it("conserva TODO lo de la persona en las pestañas tocadas y le ofrece el diseño nuevo", () => {
        const cuenta = cuentaGen11(["social", "politica", "clima"]);
        const politica = cuenta.dashboards.find((d) => d.category === "politica")!;
        // La persona movió un widget y añadió otro.
        const suyos = cuenta.widgets[politica.id].map((w, i) => (i === 0 ? { ...w, layout: { ...w.layout, y: 3 } } : w));
        suyos.push({ id: "mio", dashboard_id: politica.id, widget_type: "QUICK_NOTES", layout: { x: 0, y: 30, w: 4, h: 4, i: "mio" }, settings: { color: "ambar" }, created_at: "" });
        cuenta.widgets[politica.id] = suyos;
        const r = migrarPredeterminados({ ...cuenta, retirados: [], plantillas: DEFAULT_DASHBOARD_TEMPLATES }, deps());
        expect(r.informe.conservadas).toEqual(["Política"]);
        expect(r.widgets[politica.id]).toEqual(suyos);
        const marcada = r.dashboards.find((d) => d.id === politica.id)!;
        expect(marcada.plantilla).toMatchObject({ cat: "politica", v: "gen11", huella: "" });
        expect(novedadDisponible(marcada, DEFAULT_DASHBOARD_TEMPLATES)).toBe(true);
    });

    it("añade las temáticas que faltan, pero no las que la persona borró, y no duplica", () => {
        const cuenta = cuentaGen11(["social", "clima"]);
        const r = migrarPredeterminados({ ...cuenta, retirados: ["politica"], plantillas: DEFAULT_DASHBOARD_TEMPLATES }, deps());
        const cats = r.dashboards.map((d) => d.category);
        expect(cats).not.toContain("politica");
        expect(cats).toContain("educacion");
        expect(new Set(cats).size).toBe(cats.length);
        expect(r.informe.anadidas).toContain("Educación");
        // Las nuevas van al final y no roban la principal.
        expect(r.dashboards.slice(0, 2).map((d) => d.id)).toEqual(cuenta.dashboards.map((d) => d.id));
        expect(r.dashboards.filter((d) => d.is_default).length).toBe(1);
    });

    it("nunca borra pestañas ni widgets propios, y una pestaña renombrada sigue siendo la temática", () => {
        const cuenta = cuentaGen11(["social", "ubicacion"]);
        const propia: TableroMarcado = { id: "propia", profile_id: "local", name: "Mi estudio", is_default: false, created_at: "", updated_at: "" };
        cuenta.dashboards.push(propia);
        cuenta.widgets.propia = [{ id: "p1", dashboard_id: "propia", widget_type: "CALCULATOR", layout: { x: 0, y: 0, w: 3, h: 5 }, settings: {}, created_at: "" }];
        const ubicacion = cuenta.dashboards.find((d) => d.category === "ubicacion")!;
        ubicacion.name = "Mi barrio";
        const r = migrarPredeterminados({ ...cuenta, retirados: [], plantillas: DEFAULT_DASHBOARD_TEMPLATES }, deps());
        for (const d of cuenta.dashboards) expect(r.dashboards.some((x) => x.id === d.id)).toBe(true);
        expect(r.widgets.propia).toEqual(cuenta.widgets.propia);
        expect(r.dashboards.filter((d) => d.category === "ubicacion")).toHaveLength(1);
        expect(r.dashboards.find((d) => d.id === ubicacion.id)!.name).toBe("Mi barrio");
    });

    it("es idempotente: la segunda pasada no cambia nada", () => {
        const cuenta = cuentaGen11(["social", "politica", "sistema"]);
        cuenta.widgets[cuenta.dashboards[1].id] = cuenta.widgets[cuenta.dashboards[1].id].slice(1); // tocada
        const d = deps();
        const r1 = migrarPredeterminados({ ...cuenta, retirados: [], plantillas: DEFAULT_DASHBOARD_TEMPLATES }, d);
        const r2 = migrarPredeterminados({ dashboards: r1.dashboards, widgets: r1.widgets, retirados: [], plantillas: DEFAULT_DASHBOARD_TEMPLATES }, d);
        expect(r2.cambio).toBe(false);
        expect(r2.dashboards).toEqual(r1.dashboards);
        expect(r2.widgets).toEqual(r1.widgets);
    });

    it("gen12 detecta la edición por la huella guardada (la futura migración ya no depende del legado)", () => {
        const { dashboards, widgets } = generarPredeterminados(DEFAULT_DASHBOARD_TEMPLATES, deps());
        const inicio = dashboards[0];
        expect(inicio.is_default).toBe(true);
        expect(estadoPestana(inicio, widgets[inicio.id])).toBe("al-dia");
        // Simula la siguiente generación: la marca es de la anterior.
        const anterior: TableroMarcado = { ...inicio, plantilla: { ...inicio.plantilla!, v: "gen12-anterior" } };
        expect(estadoPestana(anterior, widgets[inicio.id])).toBe("intacta");
        const tocados = widgets[inicio.id].map((w, i) => (i === 0 ? { ...w, layout: { ...w.layout, h: w.layout.h + 1 } } : w));
        expect(estadoPestana(anterior, tocados)).toBe("editada");
    });

    it("aplicar y descartar la novedad", () => {
        const cuenta = cuentaGen11(["clima"]);
        const clima = cuenta.dashboards[0];
        const tocados = cuenta.widgets[clima.id].slice(2);
        const r = migrarPredeterminados({ dashboards: cuenta.dashboards, widgets: { [clima.id]: tocados }, retirados: [], plantillas: DEFAULT_DASHBOARD_TEMPLATES }, deps());
        const marcada = r.dashboards[0];
        expect(novedadDisponible(marcada, DEFAULT_DASHBOARD_TEMPLATES)).toBe(true);
        expect(novedadDisponible(descartarNovedad(marcada), DEFAULT_DASHBOARD_TEMPLATES)).toBe(false);
        const t = DEFAULT_DASHBOARD_TEMPLATES.find((x) => x.categoryId === "clima")!;
        const aplicada = aplicarDiseno(marcada, t, tocados, deps());
        expect(aplicada.dashboard.plantilla?.v).toBe(VERSION_PREDETERMINADOS);
        expect(novedadDisponible(aplicada.dashboard, DEFAULT_DASHBOARD_TEMPLATES)).toBe(false);
        expect(aplicada.widgets.length).toBe(t.widgets.length);
    });

    it("localiza la temática: primero la marcada, luego la gen11 con su nombre", () => {
        const a: TableroMarcado = { id: "a", profile_id: "l", name: "Clima 2", is_default: false, category: "clima", created_at: "", updated_at: "" };
        const b: TableroMarcado = { ...a, id: "b", name: "Clima" };
        const t = { categoryId: "clima" as const, name: "Clima" };
        expect(localizarPredeterminada([a, b], t)?.id).toBe("b");
        const c: TableroMarcado = { ...a, id: "c", name: "Otro", plantilla: { cat: "clima", v: "x", huella: "" } };
        expect(localizarPredeterminada([a, b, c], t)?.id).toBe("c");
    });
});

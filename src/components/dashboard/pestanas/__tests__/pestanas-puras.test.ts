// Lógica pura de las pestañas: plantillas gen12 bien formadas, temas, fondo ambiental,
// navegación (qué cabe en la barra, atajos, deslizar), variantes y exportar/importar.
import { describe, expect, it } from "vitest";
import { ALL_DASHBOARD_TEMPLATES, DEFAULT_DASHBOARD_TEMPLATES } from "../../dashboard-defaults";
import { WIDGET_MANIFEST, getSizeConstraints } from "../../widget-manifest";
import type { DashboardWidget } from "../../dashboard-types";
import { aspectoDe, conAlfa, temaDeCategoria } from "../temas";
import { capasAmbiente } from "../ambiente";
import { accionDeAtajo, anchoEstimado, decidirDeslizamiento, repartirPestanas, vecino } from "../navegacion";
import { rolDePieza, variantePlantilla } from "../variantes";
import { exportarPestana, importarPestana, nombreArchivo, FORMATO_PESTANA } from "../exportar";
import type { TableroMarcado } from "../migracion";

const choca = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("plantillas gen12", () => {
    it("son 18 predeterminadas, con Inicio como principal", () => {
        expect(DEFAULT_DASHBOARD_TEMPLATES).toHaveLength(18);
        expect(DEFAULT_DASHBOARD_TEMPLATES.filter((t) => t.isDefault).map((t) => t.name)).toEqual(["Inicio"]);
    });
    it.each(ALL_DASHBOARD_TEMPLATES.map((t) => [t.name, t] as const))("«%s»: widgets del manifiesto, sin solapes, dentro de la rejilla y con un héroe arriba", (_n, t) => {
        for (const w of t.widgets) {
            expect(w.type in WIDGET_MANIFEST).toBe(true);
            const c = getSizeConstraints(w.type);
            expect(w.w).toBeGreaterThanOrEqual(c.minW);
            expect(w.h).toBeGreaterThanOrEqual(c.minH);
            expect(w.x + w.w).toBeLessThanOrEqual(12);
        }
        for (let i = 0; i < t.widgets.length; i++) for (let j = i + 1; j < t.widgets.length; j++) expect(choca(t.widgets[i], t.widgets[j])).toBe(false);
        const heroes = t.widgets.filter((w) => w.rol === "heroe");
        expect(heroes).toHaveLength(1);
        expect(heroes[0]).toMatchObject({ x: 0, y: 0 });
        expect(t.widgets.at(-1)!.type).toBe("APP_LAUNCHER");
        expect(t.lema && t.lema.length > 3).toBe(true);
        // Filas llenas: ningún hueco por encima del dock.
        const fondo = Math.max(...t.widgets.filter((w) => w.type !== "APP_LAUNCHER").map((w) => w.y + w.h));
        const area = t.widgets.filter((w) => w.type !== "APP_LAUNCHER").reduce((s, w) => s + w.w * w.h, 0);
        expect(area).toBe(fondo * 12);
    });
});

describe("temas", () => {
    it("cada predeterminada tiene tema propio con lema, icono y acento", () => {
        for (const t of DEFAULT_DASHBOARD_TEMPLATES) {
            const tema = temaDeCategoria(t.categoryId);
            expect(tema.categoria).toBe(t.categoryId);
            expect(tema.nombre).toBe(t.name);
            expect(tema.acento).toMatch(/^#[0-9a-f]{6}$/i);
            expect(aspectoDe({ category: t.categoryId }).icono).toBeTruthy();
        }
    });
    it("lo elegido por la persona manda y lo ajeno no se pinta", () => {
        const a = aspectoDe({ category: "clima", icono: "musica", acento: "#DC143C" });
        expect(a.claveIcono).toBe("musica");
        expect(a.acento).toBe("#DC143C");
        expect(a.propio).toBe(true);
        const b = aspectoDe({ category: "clima", icono: "<script>", acento: "red;x" });
        expect(b.claveIcono).toBe("clima");
        expect(b.acento).toBe(temaDeCategoria("clima").acento);
        expect(temaDeCategoria("inventada").nombre).toBe("Pestaña");
        expect(conAlfa("#10b981", 0.5)).toBe("#10b98180");
    });
    it("el fondo ambiental es solo luz y dibujo estático, y se apaga con intensidad 0", () => {
        const c = capasAmbiente("constelacion", "#818cf8", "#23d5ab");
        expect(String(c.luz.backgroundImage)).toContain("radial-gradient");
        expect(String(c.motivo?.backgroundImage)).toContain("data:image/svg+xml");
        expect(capasAmbiente("aurora", "#7c5cff", "#23d5ab").motivo).toBeNull();
        expect(capasAmbiente("circuito", "#7c5cff", "#23d5ab", 0).motivo).toBeNull();
        // Un color inválido nunca llega al SVG.
        expect(String(capasAmbiente("red", "javascript:alert(1)", "#000000").motivo?.backgroundImage)).not.toContain("javascript");
    });
});

describe("navegación entre pestañas", () => {
    it("si todo cabe, no hay menú «Más»; si no, la activa siempre se ve", () => {
        const anchos = [100, 100, 100, 100, 100];
        expect(repartirPestanas(anchos, 600, 0).ocultas).toEqual([]);
        const r = repartirPestanas(anchos, 350, 4, 80);
        expect(r.visibles).toContain(4);
        expect(r.ocultas.length).toBeGreaterThan(0);
        expect([...r.visibles, ...r.ocultas].sort()).toEqual([0, 1, 2, 3, 4]);
        expect(r.visibles.reduce((s, i) => s + anchos[i], 0)).toBeLessThanOrEqual(350 - 80);
        // Sin medir (0) = todas visibles.
        expect(repartirPestanas(anchos, 0, 2).visibles).toHaveLength(5);
        expect(anchoEstimado("Personalización")).toBeGreaterThan(anchoEstimado("IA"));
    });
    it("atajos Alt+número, Alt+[ ] y con Mayús mover", () => {
        const k = (code: string, shiftKey = false) => ({ code, altKey: true, ctrlKey: false, metaKey: false, shiftKey });
        expect(accionDeAtajo(k("Digit1"), 18, 5)).toEqual({ tipo: "ir", indice: 0 });
        expect(accionDeAtajo(k("Digit9"), 18, 5)).toEqual({ tipo: "ir", indice: 17 });
        expect(accionDeAtajo(k("Digit8"), 3, 0)).toEqual({ tipo: "ir", indice: 2 });
        expect(accionDeAtajo(k("BracketRight"), 18, 17)).toEqual({ tipo: "ir", indice: 0 });
        expect(accionDeAtajo(k("BracketLeft"), 18, 0)).toEqual({ tipo: "ir", indice: 17 });
        expect(accionDeAtajo(k("BracketLeft", true), 18, 3)).toEqual({ tipo: "mover", direccion: -1 });
        expect(accionDeAtajo({ ...k("Digit1"), altKey: false }, 18, 0)).toBeNull();
        expect(accionDeAtajo({ ...k("Digit1"), ctrlKey: true }, 18, 0)).toBeNull();
    });
    it("deslizar: solo un gesto horizontal, largo y rápido cambia de pestaña", () => {
        expect(decidirDeslizamiento({ dx: -120, dy: 10, ms: 250 })).toBe(1);
        expect(decidirDeslizamiento({ dx: 120, dy: 10, ms: 250 })).toBe(-1);
        expect(decidirDeslizamiento({ dx: -40, dy: 0, ms: 200 })).toBe(0); // corto
        expect(decidirDeslizamiento({ dx: -120, dy: 90, ms: 200 })).toBe(0); // diagonal: es scroll
        expect(decidirDeslizamiento({ dx: -200, dy: 0, ms: 1500 })).toBe(0); // lento: arrastre
        expect(vecino(0, -1, 5)).toBe(4);
        expect(vecino(4, 1, 5)).toBe(0);
    });
});

describe("variantes de plantilla", () => {
    const clima = DEFAULT_DASHBOARD_TEMPLATES.find((t) => t.categoryId === "clima")!;
    it("esencial: héroe + tres piezas + dock, sin solapes", () => {
        const e = variantePlantilla(clima, "esencial");
        expect(e.widgets.filter((w) => w.type !== "APP_LAUNCHER")).toHaveLength(4);
        expect(e.widgets[0].type).toBe("WEATHER_BASIC");
        for (let i = 0; i < e.widgets.length; i++) for (let j = i + 1; j < e.widgets.length; j++) expect(choca(e.widgets[i], e.widgets[j])).toBe(false);
    });
    it("enfoque: héroe a lo ancho y datos debajo", () => {
        const f = variantePlantilla(clima, "enfoque");
        expect(f.widgets[0]).toMatchObject({ type: "WEATHER_BASIC", x: 0, y: 0, w: 12 });
        const datos = f.widgets.filter((w) => w.rol === "dato");
        expect(datos.length).toBeGreaterThan(0);
        expect(datos.every((d) => d.y === f.widgets[0].h)).toBe(true);
        expect(rolDePieza({ w: 3, h: 3 })).toBe("dato");
        expect(variantePlantilla(clima, "completo")).toBe(clima);
    });
});

describe("exportar e importar una pestaña", () => {
    const d: TableroMarcado = { id: "x", profile_id: "local", name: "Mi Clima ñ", is_default: false, category: "clima", created_at: "", updated_at: "", icono: "clima", acento: "#10B981", deviceTags: ["tv"] };
    const ws: DashboardWidget[] = [
        { id: "a", dashboard_id: "x", widget_type: "WEATHER_BASIC", layout: { x: 0, y: 0, w: 6, h: 6 }, settings: { ciudad: "Madrid" }, size: "L", created_at: "" },
        { id: "b", dashboard_id: "x", widget_type: "AI_GENERATED", layout: { x: 6, y: 0, w: 4, h: 4 }, settings: { customHtml: "<script>x</script>" }, created_at: "" },
    ];
    let n = 0;
    const deps = { uuid: () => `n${++n}`, ahora: "2026-09-29" };
    it("ida y vuelta conserva lo importante y deja fuera el HTML forjado", () => {
        const json = JSON.stringify(exportarPestana(d, ws, "2026-09-29"));
        expect(json).not.toContain("customHtml");
        const r = importarPestana(json, deps);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.dashboard).toMatchObject({ name: "Mi Clima ñ", category: "clima", icono: "clima", acento: "#10B981", deviceTags: ["tv"], is_default: false });
        expect(r.widgets).toHaveLength(1);
        expect(r.widgets[0]).toMatchObject({ widget_type: "WEATHER_BASIC", size: "L", settings: { ciudad: "Madrid" }, dashboard_id: r.dashboard.id });
        expect(nombreArchivo(d.name)).toBe("pestana-mi-clima-n.json");
    });
    it("valida todo lo que llega de fuera", () => {
        expect(importarPestana("no es json", deps)).toMatchObject({ ok: false });
        expect(importarPestana({ formato: "otro" }, deps)).toMatchObject({ ok: false });
        const r = importarPestana({
            formato: FORMATO_PESTANA,
            pestana: { nombre: "x".repeat(200), icono: "<b>", acento: "url(x)", categoria: "../../etc", dispositivos: ["tv", "tostadora"] },
            widgets: [
                { tipo: "NO_EXISTE", x: 0, y: 0, w: 4, h: 4, ajustes: {} },
                { tipo: "AI_GENERATED", x: 0, y: 0, w: 4, h: 4, ajustes: { customHtml: "<img onerror=1>" } },
                { tipo: "CLOCK_DATE", x: 99, y: -5, w: 99, h: 999, ajustes: "texto" },
            ],
        }, deps);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.omitidos).toBe(2);
        expect(r.dashboard.name.length).toBe(60);
        expect(r.dashboard.icono).toBeUndefined();
        expect(r.dashboard.acento).toBeUndefined();
        expect(r.dashboard.category).toBeUndefined();
        expect(r.dashboard.deviceTags).toEqual(["tv"]);
        expect(r.widgets[0].layout).toMatchObject({ x: 0, y: 0, w: 12, h: 40 });
        expect(r.widgets[0].settings).toEqual({});
    });
});

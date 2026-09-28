/**
 * Dashboard compartido: fusión por widget/registro, traducción desde y hacia `DashboardWidget`,
 * saneamiento de lo que llega de otras personas y deshacer colaborativo.
 */
import { describe, expect, test } from "vitest";
import {
    LIMITES_DASHBOARD,
    anadirWidget,
    aplicarWidgets,
    aWidgets,
    dashboardVacio,
    dashboardsIguales,
    docDashboard,
    esDocDashboard,
    fusionarDashboards,
    invertirPasoDashboard,
    listarDashboardsLocales,
    maxTiempoDashboard,
    normalizarDashboard,
    podarDashboard,
    puedeAnadirWidget,
    sanearAjustes,
    sanearCaja,
    tipoCompartible,
    widgetsSembrables,
    dashboardDesdeLocal,
    INFO_VIVO_DASHBOARD,
    rutaDashboard,
    type DocDashboard,
} from "@/lib/vivo/dashboard";
import type { Ctx } from "@/lib/vivo/tabla/modelo";

let reloj = 10_000;
const ANA = (): Ctx => ({ t: reloj++, a: "ana000000000" });
const BEA = (): Ctx => ({ t: reloj++, a: "bea000000000" });

function con(...tipos: string[]) {
    let d = dashboardVacio();
    const ids: string[] = [];
    tipos.forEach((tipo, i) => {
        const r = anadirWidget(d, { tipo, pos: { x: (i % 3) * 4, y: Math.floor(i / 3) * 4, w: 4, h: 4 }, size: "M" }, ANA());
        d = r.doc;
        ids.push(r.id!);
    });
    return { d, ids };
}

const layoutDe = (d: DocDashboard, dash = "dash1") => aWidgets(d, dash).map((w) => ({ id: w.id, ...w.layout }));

describe("contrato", () => {
    test("la ficha del catálogo y la ruta", () => {
        expect(INFO_VIVO_DASHBOARD).toMatchObject({ etiqueta: "Dashboard compartido", icono: "LayoutDashboard" });
        expect(rutaDashboard("abc-123")).toBe("/dashboard-compartido/abc-123");
        expect(esDocDashboard(docDashboard(dashboardVacio()))).toBe(true);
        expect(esDocDashboard({ vivo: "tabla" })).toBe(false);
        expect(esDocDashboard(null)).toBe(false);
    });
});

describe("widgets: del modelo a DashboardWidget y de vuelta", () => {
    test("aWidgets entrega la misma lista mientras el doc no cambie y conserva la identidad de cada widget", () => {
        const { d, ids } = con("CLOCK_DATE", "QUICK_NOTES", "WEATHER_BASIC");
        const a = aWidgets(d, "dash1");
        expect(aWidgets(d, "dash1")).toBe(a);
        expect(a.map((w) => w.id)).toEqual(ids);
        expect(a[0]).toMatchObject({ widget_type: "CLOCK_DATE", dashboard_id: "dash1", size: "M", layout: { x: 0, y: 0, w: 4, h: 4, i: ids[0] } });
        // mover UN widget: los demás conservan su objeto (no se repintan)
        const movido = aplicarWidgets(d, a.map((w) => (w.id === ids[1] ? { ...w, layout: { ...w.layout, x: 8, y: 8 } } : w)), ANA());
        const b = aWidgets(movido, "dash1");
        expect(b).not.toBe(a);
        expect(b.find((w) => w.id === ids[0])).toBe(a.find((w) => w.id === ids[0]));
        expect(b.find((w) => w.id === ids[2])).toBe(a.find((w) => w.id === ids[2]));
        expect(b.find((w) => w.id === ids[1])!.layout).toMatchObject({ x: 8, y: 8 });
    });

    test("aplicarWidgets solo escribe lo que cambió; si nada cambia, devuelve el mismo doc", () => {
        const { d } = con("CLOCK_DATE", "QUICK_NOTES");
        const ws = aWidgets(d, "dash1");
        expect(aplicarWidgets(d, ws, ANA())).toBe(d);
        expect(aplicarWidgets(d, ws.map((w) => ({ ...w })), ANA())).toBe(d); // copias idénticas
        const cambiado = aplicarWidgets(d, [{ ...ws[0], settings: { styleVariant: "trinity" } }, ws[1]], ANA());
        expect(cambiado.widgets[ws[0].id].cfg.v).toEqual({ styleVariant: "trinity" });
        expect(cambiado.widgets[ws[1].id]).toBe(d.widgets[ws[1].id]); // el otro ni se toca
        expect(cambiado.widgets[ws[0].id].pos).toBe(d.widgets[ws[0].id].pos); // ni la posición del cambiado
    });

    test("el orden de las claves de los ajustes no cuenta como cambio", () => {
        const { d } = con("CLOCK_DATE");
        const w = aWidgets(d, "d")[0];
        const a = aplicarWidgets(d, [{ ...w, settings: { a: 1, b: { c: 2, d: 3 } } }], ANA());
        const wa = aWidgets(a, "d")[0];
        expect(aplicarWidgets(a, [{ ...wa, settings: { b: { d: 3, c: 2 }, a: 1 } }], ANA())).toBe(a);
    });

    test("quitar widgets deja lápida; una lista con widgets nuevos los añade", () => {
        const { d, ids } = con("CLOCK_DATE", "QUICK_NOTES", "WEATHER_BASIC");
        const ws = aWidgets(d, "d");
        const sin = aplicarWidgets(d, [ws[0], ws[2]], ANA());
        expect(aWidgets(sin, "d").map((w) => w.id)).toEqual([ids[0], ids[2]]);
        expect(sin.widgets[ids[1]].borrado?.v).toBe(true);
        const nuevo = { ...ws[0], id: "w-nuevo-01", layout: { x: 0, y: 12, w: 4, h: 4, i: "w-nuevo-01" } };
        const con4 = aplicarWidgets(sin, [...aWidgets(sin, "d"), nuevo], ANA());
        expect(aWidgets(con4, "d").map((w) => w.id)).toContain("w-nuevo-01");
    });

    test("una lápida ajena no resucita porque llegue un estado desfasado", () => {
        const { d, ids } = con("CLOCK_DATE", "QUICK_NOTES");
        const desfasado = aWidgets(d, "d"); // Ana todavía ve los dos
        const bea = aplicarWidgets(d, [desfasado[0]], BEA()); // Bea borra el segundo
        const ana = aplicarWidgets(bea, desfasado, ANA()); // Ana toca algo con su lista vieja
        expect(ana).toBe(bea);
        expect(ana.widgets[ids[1]].borrado?.v).toBe(true);
    });

    test("límite de widgets vivos", () => {
        let d = dashboardVacio();
        for (let i = 0; i < LIMITES_DASHBOARD.widgets + 5; i++) d = anadirWidget(d, { tipo: "CLOCK_DATE", pos: { x: 0, y: i, w: 1, h: 1 } }, ANA()).doc;
        expect(Object.keys(d.widgets)).toHaveLength(LIMITES_DASHBOARD.widgets);
        expect(puedeAnadirWidget(d)).toBe(false);
        expect(anadirWidget(d, { tipo: "CLOCK_DATE", pos: { x: 0, y: 0, w: 1, h: 1 } }, ANA()).id).toBeNull();
    });
});

describe("fusión: edición simultánea por widget", () => {
    test("dos personas mueven widgets distintos: se conservan las dos posiciones", () => {
        const { d, ids } = con("CLOCK_DATE", "QUICK_NOTES", "WEATHER_BASIC");
        const ws = aWidgets(d, "d");
        const ana = aplicarWidgets(d, ws.map((w) => (w.id === ids[0] ? { ...w, layout: { ...w.layout, x: 8, y: 20 } } : w)), ANA());
        const bea = aplicarWidgets(d, ws.map((w) => (w.id === ids[1] ? { ...w, layout: { ...w.layout, x: 0, y: 30 } } : w)), BEA());
        const m1 = fusionarDashboards(ana, bea);
        const m2 = fusionarDashboards(bea, ana);
        expect(dashboardsIguales(m1, m2)).toBe(true);
        const l = layoutDe(m1);
        expect(l.find((w) => w.id === ids[0])).toMatchObject({ x: 8, y: 20 });
        expect(l.find((w) => w.id === ids[1])).toMatchObject({ x: 0, y: 30 });
        expect(l.find((w) => w.id === ids[2])).toMatchObject({ x: 8, y: 0 });
    });

    test("una mueve un widget y la otra lo reconfigura: se conservan ambas cosas", () => {
        const { d, ids } = con("CLOCK_DATE");
        const w = aWidgets(d, "d")[0];
        const ana = aplicarWidgets(d, [{ ...w, layout: { ...w.layout, x: 4 } }], ANA());
        const bea = aplicarWidgets(d, [{ ...w, settings: { styleVariant: "neon" } }], BEA());
        const m = fusionarDashboards(ana, bea);
        expect(m.widgets[ids[0]].pos.v.x).toBe(4);
        expect(m.widgets[ids[0]].cfg.v).toEqual({ styleVariant: "neon" });
    });

    test("mismo widget a la vez: gana la última escritura, igual en ambos sentidos", () => {
        const { d, ids } = con("CLOCK_DATE");
        const w = aWidgets(d, "d")[0];
        const ana = aplicarWidgets(d, [{ ...w, layout: { ...w.layout, x: 1 } }], ANA());
        const bea = aplicarWidgets(d, [{ ...w, layout: { ...w.layout, x: 2 } }], BEA()); // Bea es posterior
        expect(fusionarDashboards(ana, bea).widgets[ids[0]].pos.v.x).toBe(2);
        expect(fusionarDashboards(bea, ana).widgets[ids[0]].pos.v.x).toBe(2);
    });

    test("empate exacto de reloj: desempata el autor, siempre igual", () => {
        const { d, ids } = con("CLOCK_DATE");
        const w = aWidgets(d, "d")[0];
        const t = 99_999;
        const ana = aplicarWidgets(d, [{ ...w, layout: { ...w.layout, x: 1 } }], { t, a: "ana000000000" });
        const bea = aplicarWidgets(d, [{ ...w, layout: { ...w.layout, x: 2 } }], { t, a: "bea000000000" });
        expect(fusionarDashboards(ana, bea).widgets[ids[0]].pos.v.x).toBe(2);
        expect(fusionarDashboards(bea, ana).widgets[ids[0]].pos.v.x).toBe(2);
    });

    test("borrar gana a mover a la vez; una lápida no se pierde", () => {
        const { d, ids } = con("CLOCK_DATE", "QUICK_NOTES");
        const ws = aWidgets(d, "d");
        const ana = aplicarWidgets(d, [ws[0]], ANA()); // borra el segundo
        const bea = aplicarWidgets(d, ws.map((w) => (w.id === ids[1] ? { ...w, layout: { ...w.layout, x: 9 } } : w)), BEA());
        const m = fusionarDashboards(ana, bea);
        expect(aWidgets(m, "d").map((w) => w.id)).toEqual([ids[0]]);
        expect(dashboardsIguales(m, fusionarDashboards(bea, ana))).toBe(true);
    });

    test("dos personas añaden widgets a la vez: los dos existen", () => {
        const { d } = con("CLOCK_DATE");
        const ana = anadirWidget(d, { tipo: "QUICK_NOTES", pos: { x: 4, y: 0, w: 4, h: 4 } }, ANA());
        const bea = anadirWidget(d, { tipo: "WEATHER_BASIC", pos: { x: 8, y: 0, w: 4, h: 4 } }, BEA());
        const m = fusionarDashboards(ana.doc, bea.doc);
        expect(aWidgets(m, "d").map((w) => w.widget_type).sort()).toEqual(["CLOCK_DATE", "QUICK_NOTES", "WEATHER_BASIC"]);
    });

    test("propiedades del CRDT: idempotente, conmutativa, asociativa y con estructura compartida", () => {
        const base = con("CLOCK_DATE", "QUICK_NOTES", "WEATHER_BASIC").d;
        const ws = aWidgets(base, "d");
        const a = aplicarWidgets(base, ws.map((w, i) => (i === 0 ? { ...w, layout: { ...w.layout, x: 1 } } : w)), ANA());
        const b = aplicarWidgets(base, ws.map((w, i) => (i === 1 ? { ...w, settings: { k: 1 } } : w)), BEA());
        const c = aplicarWidgets(base, [ws[0], ws[1]], ANA());
        expect(fusionarDashboards(a, a)).toBe(a);
        expect(fusionarDashboards(a, base)).toBe(a); // base no aporta nada
        expect(dashboardsIguales(fusionarDashboards(a, b), fusionarDashboards(b, a))).toBe(true);
        expect(dashboardsIguales(fusionarDashboards(fusionarDashboards(a, b), c), fusionarDashboards(a, fusionarDashboards(b, c)))).toBe(true);
        const ab = fusionarDashboards(a, b);
        expect(fusionarDashboards(ab, a)).toBe(ab);
        expect(fusionarDashboards(ab, b)).toBe(ab);
    });

    test("un id repetido con otro tipo se resuelve igual en las dos copias (sin cambiar el tipo por sorpresa)", () => {
        const a = anadirWidget(dashboardVacio(), { id: "w-repetido", tipo: "QUICK_NOTES", pos: { x: 0, y: 0, w: 2, h: 2 } }, ANA()).doc;
        const b = anadirWidget(dashboardVacio(), { id: "w-repetido", tipo: "CLOCK_DATE", pos: { x: 0, y: 0, w: 2, h: 2 } }, BEA()).doc;
        expect(fusionarDashboards(a, b).widgets["w-repetido"].tipo).toBe(fusionarDashboards(b, a).widgets["w-repetido"].tipo);
    });
});

describe("seguridad: lo que llega de otras personas", () => {
    test("los widgets forjados por IA no se comparten ni se aceptan", () => {
        expect(tipoCompartible("AI_GENERATED")).toBe(false);
        expect(tipoCompartible("clock")).toBe(false);
        expect(tipoCompartible("CLOCK_DATE")).toBe(true);
        expect(tipoCompartible("__proto__")).toBe(false);
        expect(anadirWidget(dashboardVacio(), { tipo: "AI_GENERATED", pos: { x: 0, y: 0, w: 4, h: 4 }, ajustes: { customHtml: "<script>1</script>" } }, ANA()).id).toBeNull();
        const s = widgetsSembrables([
            { widget_type: "AI_GENERATED", layout: { x: 0, y: 0, w: 4, h: 4 }, settings: { customHtml: "<script>alert(1)</script>" } },
            { widget_type: "CLOCK_DATE", layout: { x: 0, y: 0, w: 4, h: 4 }, settings: {} },
        ]);
        expect(s.map((w) => w.tipo)).toEqual(["CLOCK_DATE"]);
        // aplicar una lista con un AI_GENERATED tampoco lo mete
        const d = aplicarWidgets(dashboardVacio(), [{ id: "w-ai-000001", dashboard_id: "d", widget_type: "AI_GENERATED" as never, layout: { x: 0, y: 0, w: 4, h: 4 }, settings: {}, created_at: "" }], ANA());
        expect(Object.keys(d.widgets)).toHaveLength(0);
    });

    test("saneamiento de ajustes: sin html, sin javascript:, sin __proto__, acotados", () => {
        const s = sanearAjustes({
            customHtml: "<script>alert(1)</script>",
            srcdoc: "<b>x</b>",
            url: "javascript:alert(1)",
            u2: "  JaVa\tScRiPt:alert(1)",
            u3: "data:text/html;base64,PHNjcmlwdD4=",
            u4: "vbscript:msgbox",
            ok: "https://starseed.example",
            n: 3,
            nan: Number.NaN,
            lista: ["a", "javascript:x", 1, { z: 1 }],
            anidado: { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } },
            largo: "x".repeat(5000),
        });
        expect(s.customHtml).toBeUndefined();
        expect(s.srcdoc).toBeUndefined();
        expect(s.url).toBeUndefined();
        expect(s.u2).toBeUndefined();
        expect(s.u3).toBeUndefined();
        expect(s.u4).toBeUndefined();
        expect(s.ok).toBe("https://starseed.example");
        expect(s.n).toBe(3);
        expect("nan" in s).toBe(false);
        expect(s.lista).toEqual(["a", 1, { z: 1 }]);
        expect(JSON.stringify(s.anidado).includes('"g"')).toBe(false); // profundidad acotada
        expect((s.largo as string).length).toBe(2000);
        const envenenado = sanearAjustes(JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"p":1}},"a":1}'));
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
        expect(Object.keys(envenenado)).toEqual(["a"]);
        expect(sanearAjustes("texto")).toEqual({});
        expect(sanearAjustes([1, 2])).toEqual({});
        expect(sanearAjustes({ enorme: Array.from({ length: 50 }, () => "y".repeat(500)) })).toEqual({}); // pasa de 6000 caracteres
    });

    test("normalizar un documento hostil: descarta lo inválido, acota y no confía en tipos", () => {
        const ok = { v: { x: 1, y: 2, w: 3, h: 4 }, t: 5, a: "ana000000000" };
        const doc = normalizarDashboard({
            v: 1,
            widgets: {
                "w-valido-01": { id: "otro", tipo: "CLOCK_DATE", creado: 1, pos: ok, tam: { v: "L", t: 5, a: "ana000000000" }, cfg: { v: { styleVariant: "x", customHtml: "<i>" }, t: 5, a: "ana000000000" } },
                "w-ai-000001": { tipo: "AI_GENERATED", pos: ok, cfg: { v: {}, t: 1, a: "a" } },
                "w-sin-pos-01": { tipo: "CLOCK_DATE" },
                "w-tipo-malo-1": { tipo: "clock date", pos: ok },
                "id con espacios": { tipo: "CLOCK_DATE", pos: ok },
                "w-reg-malo-01": { tipo: "CLOCK_DATE", pos: { v: {}, t: "ayer", a: 3 } },
                "w-caja-loca-1": { tipo: "QUICK_NOTES", pos: { v: { x: 99, y: -5, w: 500, h: 0 }, t: 1, a: "b" }, tam: { v: "ENORME", t: 1, a: "b" }, borrado: { v: "sí", t: 1, a: "b" } },
                __proto__: { tipo: "CLOCK_DATE", pos: ok },
            },
        });
        expect(Object.keys(doc.widgets).sort()).toEqual(["w-caja-loca-1", "w-valido-01"]);
        expect(doc.widgets["w-valido-01"].id).toBe("w-valido-01");
        expect(doc.widgets["w-valido-01"].cfg.v).toEqual({ styleVariant: "x" });
        expect(doc.widgets["w-valido-01"].tam.v).toBe("L");
        const loca = doc.widgets["w-caja-loca-1"];
        expect(loca.pos.v).toEqual({ x: 0, y: 0, w: 12, h: 1 });
        expect(loca.tam.v).toBeNull();
        expect(loca.borrado).toBeUndefined();
        for (const basura of [null, undefined, 5, "x", [], { widgets: 5 }, { widgets: [] }]) expect(normalizarDashboard(basura)).toEqual(dashboardVacio());
    });

    test("no acepta más entradas de las permitidas y elige siempre las mismas", () => {
        const ok = { v: { x: 0, y: 0, w: 1, h: 1 }, t: 1, a: "a" };
        const muchos: Record<string, unknown> = {};
        for (let i = 0; i < 1000; i++) muchos[`w-${String(i).padStart(5, "0")}`] = { tipo: "CLOCK_DATE", pos: ok };
        const n = normalizarDashboard({ widgets: muchos });
        expect(Object.keys(n.widgets)).toHaveLength(LIMITES_DASHBOARD.entradas);
        expect(Object.keys(normalizarDashboard({ widgets: muchos }).widgets)).toEqual(Object.keys(n.widgets));
    });

    test("sanearCaja mantiene todo dentro de la rejilla de 12 columnas", () => {
        expect(sanearCaja({ x: 10, y: 3, w: 6, h: 2 })).toEqual({ x: 6, y: 3, w: 6, h: 2 });
        expect(sanearCaja(null)).toEqual({ x: 0, y: 0, w: 4, h: 4 });
        expect(sanearCaja({ x: "a", y: Number.POSITIVE_INFINITY, w: 2.6, h: 2.4 })).toEqual({ x: 0, y: 0, w: 3, h: 2 });
    });
});

describe("poda y reloj", () => {
    test("las lápidas de más de 60 días se podan; las recientes y los widgets vivos no", () => {
        const { d, ids } = con("CLOCK_DATE", "QUICK_NOTES", "WEATHER_BASIC");
        const ws = aWidgets(d, "d");
        const sin = aplicarWidgets(d, [ws[0]], { t: 1_000, a: "ana000000000" });
        const DIA = 86_400_000;
        expect(podarDashboard(sin, 1_000 + 59 * DIA)).toBe(sin);
        const podado = podarDashboard(sin, 1_000 + 61 * DIA);
        expect(Object.keys(podado.widgets)).toEqual([ids[0]]);
        expect(podarDashboard(podado, 1_000 + 200 * DIA)).toBe(podado);
    });

    test("maxTiempo recoge el reloj más alto del documento", () => {
        const { d } = con("CLOCK_DATE");
        const ws = aWidgets(d, "d");
        const m = aplicarWidgets(d, [{ ...ws[0], settings: { a: 1 } }], { t: 5_000_000, a: "ana000000000" });
        expect(maxTiempoDashboard(m)).toBe(5_000_000);
        expect(maxTiempoDashboard(dashboardVacio())).toBe(0);
    });
});

describe("deshacer y rehacer", () => {
    test("deshacer un movimiento, un cambio de estilo, un borrado y una creación", () => {
        const { d, ids } = con("CLOCK_DATE", "QUICK_NOTES");
        const ws = aWidgets(d, "d");
        const movido = aplicarWidgets(d, [{ ...ws[0], layout: { ...ws[0].layout, x: 8 } }, ws[1]], ANA());
        expect(layoutDe(invertirPasoDashboard({ antes: d, despues: movido }, movido, ANA())).find((w) => w.id === ids[0])).toMatchObject({ x: 0 });
        const estilo = aplicarWidgets(d, [{ ...ws[0], settings: { styleVariant: "neon" } }, ws[1]], ANA());
        expect(invertirPasoDashboard({ antes: d, despues: estilo }, estilo, ANA()).widgets[ids[0]].cfg.v).toEqual({});
        const borrado = aplicarWidgets(d, [ws[0]], ANA());
        const restaurado = invertirPasoDashboard({ antes: d, despues: borrado }, borrado, ANA());
        expect(aWidgets(restaurado, "d").map((w) => w.id)).toEqual(ids);
        const creado = anadirWidget(d, { tipo: "CALCULATOR", pos: { x: 0, y: 8, w: 4, h: 4 } }, ANA());
        const sinCreado = invertirPasoDashboard({ antes: d, despues: creado.doc }, creado.doc, ANA());
        expect(aWidgets(sinCreado, "d").map((w) => w.id)).toEqual(ids);
    });

    test("deshacer respeta lo que otra persona hizo después sobre lo mismo", () => {
        const { d, ids } = con("CLOCK_DATE");
        const w = aWidgets(d, "d")[0];
        const mio = aplicarWidgets(d, [{ ...w, layout: { ...w.layout, x: 4 } }], ANA());
        const wm = aWidgets(mio, "d")[0];
        const deBea = aplicarWidgets(mio, [{ ...wm, layout: { ...wm.layout, x: 6 } }], BEA());
        expect(invertirPasoDashboard({ antes: d, despues: mio }, deBea, ANA())).toBe(deBea);
        expect(deBea.widgets[ids[0]].pos.v.x).toBe(6);
    });

    test("deshacer converge con quien aún no lo ha visto", () => {
        const { d } = con("CLOCK_DATE");
        const w = aWidgets(d, "d")[0];
        const mio = aplicarWidgets(d, [{ ...w, layout: { ...w.layout, x: 4 } }], ANA());
        const des = invertirPasoDashboard({ antes: d, despues: mio }, mio, ANA());
        expect(dashboardsIguales(fusionarDashboards(mio, des), fusionarDashboards(des, mio))).toBe(true);
        expect(aWidgets(fusionarDashboards(mio, des), "d")[0].layout.x).toBe(0);
    });
});

describe("sembrar desde el dashboard personal", () => {
    function conLocalStorage(datos: Record<string, unknown>) {
        const almacen = new Map<string, string>(Object.entries(datos).map(([k, v]) => [k, JSON.stringify(v)]));
        Object.defineProperty(globalThis, "localStorage", {
            configurable: true,
            value: { getItem: (k: string) => almacen.get(k) ?? null, setItem: (k: string, v: string) => void almacen.set(k, v), removeItem: (k: string) => void almacen.delete(k) },
        });
    }

    test("lista los tableros y copia solo el acomodo y el estilo, nunca datos personales ni código", () => {
        conLocalStorage({
            starseed_dashboards: [{ id: "d1", name: "Mi día" }, { id: "d2" }, { nada: true }],
            starseed_widgets: {
                d1: [
                    { id: "x1", widget_type: "CLOCK_DATE", layout: { x: 0, y: 0, w: 4, h: 3 }, size: "M", settings: { styleVariant: "trinity", trinityNode: "zenith", bloqueado: true, ciudad: "Madrid", token: "sk-secreto", customHtml: "<b>x</b>" } },
                    { id: "x2", widget_type: "AI_GENERATED", layout: { x: 4, y: 0, w: 4, h: 3 }, settings: { customHtml: "<script>1</script>" } },
                    { id: "x3", widget_type: "QUICK_NOTES", layout: { x: 4, y: 0, w: 4, h: 3 }, settings: { notas: ["cosa privada"] } },
                ],
                d2: [],
            },
        });
        expect(listarDashboardsLocales()).toEqual([
            { id: "d1", nombre: "Mi día", widgets: 2 },
            { id: "d2", nombre: "Dashboard", widgets: 0 },
        ]);
        const doc = dashboardDesdeLocal("d1", ANA());
        const ws = aWidgets(doc, "nuevo");
        expect(ws.map((w) => w.widget_type)).toEqual(["CLOCK_DATE", "QUICK_NOTES"]);
        expect(ws[0].settings).toEqual({ styleVariant: "trinity", trinityNode: "zenith", bloqueado: true });
        expect(ws[1].settings).toEqual({});
        expect(JSON.stringify(doc)).not.toMatch(/Madrid|sk-secreto|cosa privada|script/);
        expect(dashboardDesdeLocal("no-existe", ANA())).toEqual(dashboardVacio());
    });

    test("sin almacenamiento o con datos rotos no falla", () => {
        Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => "{roto", setItem() {}, removeItem() {} } });
        expect(listarDashboardsLocales()).toEqual([]);
        expect(dashboardDesdeLocal("d1", ANA())).toEqual(dashboardVacio());
        expect(widgetsSembrables("no soy una lista")).toEqual([]);
    });
});

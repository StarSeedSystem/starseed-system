// Lógica pura del editor superior: tallas, acomodo, historial, espacio de trabajo y catálogo.
import { describe, expect, it } from "vitest";
import type { DashboardWidget, WidgetType } from "../../dashboard-types";
import { dimsTalla, TALLAS_EDITOR } from "../tallas";
import {
    autoAcomodar, chocan, colocarEmpujando, compactar, conBloqueo, estaBloqueado, mejorHueco, vistaPantalla, columnasPara, mismoAcomodo,
} from "../acomodo";
import { deshacer, historialVacio, registrar, rehacer, LIMITE_HISTORIAL } from "../historial";
import { elegirPanelEditor, sincronizarPaneles } from "../workspace-sync";
import { catalogoCompleto, filtrarCatalogo, normalizar, categoriasConWidgets } from "../catalogo";
import { acentoDePestana, iconoDePestana } from "../aspecto-pestana";
import type { WorkspaceNode } from "../../dashboard-workspace-types";

function w(id: string, x: number, y: number, ww: number, h: number, extra: Partial<DashboardWidget> = {}): DashboardWidget {
    return { id, dashboard_id: "d", widget_type: "CLOCK_DATE", layout: { x, y, w: ww, h, i: id }, settings: {}, created_at: "", ...extra };
}

const sinChoques = (ws: DashboardWidget[]) =>
    ws.every((a, i) => ws.every((b, j) => i === j || !chocan(a.layout, b.layout)));

describe("tallas del editor (sistema micro/s/m/l/xl + panorámico/torre)", () => {
    it("ofrece las siete tallas", () => {
        expect(TALLAS_EDITOR.map((t) => t.id)).toEqual(["micro", "S", "M", "L", "XL", "panoramico", "torre"]);
    });
    it("panorámico y torre dan la forma que el widget reconocerá al medirse", () => {
        for (const t of ["CLOCK_DATE", "WEATHER_BASIC", "MAP_LOCATION", "AGORA_CAUSAL"] as WidgetType[]) {
            expect(dimsTalla(t, "panoramico").clase).toBe("panoramico");
            expect(dimsTalla(t, "torre").clase).toBe("torre");
        }
    });
    it("respeta los mínimos del manifiesto y nunca pasa de 12 columnas", () => {
        const micro = dimsTalla("MAP_LOCATION", "micro");
        expect(micro.w).toBe(3);
        expect(micro.h).toBe(4);
        expect(dimsTalla("CLOCK_DATE", "XL").w).toBe(12);
        expect(dimsTalla("CLOCK_DATE", "M")).toMatchObject({ w: 4, h: 4, size: "M" });
    });
});

describe("acomodo", () => {
    it("mejorHueco encuentra el primer hueco libre de arriba a la izquierda", () => {
        const ocupados = [w("a", 0, 0, 4, 4), w("b", 4, 0, 4, 4)];
        expect(mejorHueco(ocupados, 4, 4)).toEqual({ x: 8, y: 0 });
        expect(mejorHueco([...ocupados, w("c", 8, 0, 4, 4)], 4, 4)).toEqual({ x: 0, y: 4 });
        expect(mejorHueco([], 6, 3)).toEqual({ x: 0, y: 0 });
    });
    it("compactar sube sin cambiar de columna y respeta los bloqueados", () => {
        const ws = [w("a", 0, 5, 4, 2), w("fijo", 4, 3, 4, 2, { settings: { bloqueado: true } }), w("b", 4, 9, 4, 2)];
        const res = compactar(ws);
        expect(res.find((x) => x.id === "a")!.layout.y).toBe(0);
        expect(res.find((x) => x.id === "fijo")!.layout.y).toBe(3);
        // No atraviesa al bloqueado: se queda justo debajo.
        expect(res.find((x) => x.id === "b")!.layout.y).toBe(5);
        expect(sinChoques(res)).toBe(true);
    });
    it("auto-acomodar rellena huecos y no solapa, también alrededor de un bloqueado", () => {
        const libres = autoAcomodar([w("a", 0, 0, 4, 4), w("b", 0, 10, 4, 4), w("c", 6, 20, 6, 3)]);
        expect(libres.find((x) => x.id === "b")!.layout).toMatchObject({ x: 4, y: 0 });
        expect(sinChoques(libres)).toBe(true);
        const conFijo = autoAcomodar([w("fijo", 0, 0, 12, 2, { settings: { bloqueado: true } }), w("a", 0, 7, 4, 4)]);
        expect(conFijo.find((x) => x.id === "a")!.layout.y).toBe(2);
        expect(sinChoques(conFijo)).toBe(true);
    });
    it("colocarEmpujando pone el nuevo donde se soltó y baja lo que choca", () => {
        const res = colocarEmpujando([w("a", 0, 0, 6, 3), w("b", 6, 0, 6, 3)], w("n", 3, 0, 4, 2));
        expect(res.find((x) => x.id === "n")!.layout).toMatchObject({ x: 3, y: 0 });
        expect(sinChoques(res)).toBe(true);
    });
    it("bloquear y desbloquear", () => {
        const ws = conBloqueo([w("a", 0, 0, 2, 2), w("b", 2, 0, 2, 2)], ["a"], true);
        expect(estaBloqueado(ws[0])).toBe(true);
        expect(estaBloqueado(ws[1])).toBe(false);
        const todos = conBloqueo(ws, "todos", false);
        expect(todos.some(estaBloqueado)).toBe(false);
        expect("bloqueado" in todos[0].settings).toBe(false);
    });
    it("vista por pantalla deriva con el acomodo existente y las columnas siguen los cortes", () => {
        const ws = [w("a", 0, 0, 3, 3), w("b", 3, 0, 3, 3), w("c", 0, 3, 12, 4)];
        const movil = vistaPantalla(ws, "xxs");
        expect(movil.every((it) => it.x + it.w <= 2)).toBe(true);
        expect(movil.find((it) => it.i === "c")!.w).toBe(2);
        expect(columnasPara(1300)).toBe(12);
        expect(columnasPara(800)).toBe(6);
        expect(columnasPara(390)).toBe(2);
        expect(mismoAcomodo(ws, [...ws])).toBe(true);
        expect(mismoAcomodo(ws, compactar([w("a", 0, 1, 3, 3), ws[1], ws[2]]))).toBe(true);
    });
});

describe("historial", () => {
    it("deshace y rehace en orden, y un cambio nuevo borra el futuro", () => {
        let h = historialVacio<number>();
        h = registrar(h, 1);
        h = registrar(h, 2);
        const d = deshacer(h, 3)!;
        expect(d.valor).toBe(2);
        const r = rehacer(d.historial, 2)!;
        expect(r.valor).toBe(3);
        const nuevo = registrar(d.historial, 2);
        expect(nuevo.futuro).toEqual([]);
        expect(deshacer(historialVacio<number>(), 0)).toBeNull();
        expect(rehacer(historialVacio<number>(), 0)).toBeNull();
    });
    it("no crece sin límite", () => {
        let h = historialVacio<number>();
        for (let i = 0; i < LIMITE_HISTORIAL + 10; i++) h = registrar(h, i);
        expect(h.pasado.length).toBe(LIMITE_HISTORIAL);
    });
});

describe("espacio de trabajo ⇄ tableros", () => {
    const raiz: WorkspaceNode = {
        id: "s", type: "split", direction: "horizontal", sizes: [50, 50],
        children: [
            { id: "p1", type: "panel", dashboardIds: ["a", "b"], activeDashboardId: "b" },
            { id: "p2", type: "panel", dashboardIds: [], activeDashboardId: null },
        ],
    };
    it("añade los nuevos al panel del editor y quita los borrados", () => {
        const res = sincronizarPaneles(raiz, ["a", "c"], "p1");
        const p1 = (res as Extract<WorkspaceNode, { type: "split" }>).children[0] as Extract<WorkspaceNode, { type: "panel" }>;
        expect(p1.dashboardIds).toEqual(["a", "c"]);
        expect(p1.activeDashboardId).toBe("a");
    });
    it("devuelve el mismo objeto si no hay cambios", () => {
        expect(sincronizarPaneles(raiz, ["a", "b"], "p1")).toBe(raiz);
    });
    it("elige el panel enfocado si tiene tablero; si no, el primero con tablero", () => {
        expect(elegirPanelEditor(raiz, "p1")).toBe("p1");
        expect(elegirPanelEditor(raiz, "p2")).toBe("p1");
        expect(elegirPanelEditor(raiz, "no-existe")).toBe("p1");
        const conDos: WorkspaceNode = { ...raiz, children: [raiz.type === "split" ? raiz.children[0] : raiz, { id: "p3", type: "panel", dashboardIds: ["c"], activeDashboardId: "c" }] } as WorkspaceNode;
        expect(elegirPanelEditor(conDos, "p3")).toBe("p3");
    });
});

describe("catálogo", () => {
    const cat = catalogoCompleto();
    it("reúne el catálogo completo sin duplicados ni el widget de IA", () => {
        expect(cat.length).toBeGreaterThan(80);
        expect(new Set(cat.map((e) => e.type)).size).toBe(cat.length);
        expect(cat.some((e) => e.type === "AI_GENERATED")).toBe(false);
        expect(cat.some((e) => e.type === "AGORA_CAUSAL")).toBe(true);
    });
    it("busca sin tildes y filtra por categoría", () => {
        expect(normalizar("Energía")).toBe("energia");
        expect(filtrarCatalogo(cat, { texto: "reloj" }).map((e) => e.type)).toContain("CLOCK_DATE");
        const clima = filtrarCatalogo(cat, { categoria: "clima" });
        expect(clima.length).toBeGreaterThan(3);
        expect(clima.every((e) => e.categoria === "clima" || e.secundarias.includes("clima"))).toBe(true);
        expect(filtrarCatalogo(cat, { categoria: "populares" }).every((e) => e.popular)).toBe(true);
        expect(categoriasConWidgets(cat).every((c) => c.n > 0)).toBe(true);
    });
});

describe("aspecto de pestaña", () => {
    it("solo acepta iconos conocidos y colores #rrggbb", () => {
        expect(iconoDePestana("inicio")).toBeTruthy();
        expect(iconoDePestana("nada")).toBeUndefined();
        expect(acentoDePestana("#10B981")).toBe("#10B981");
        expect(acentoDePestana("red; background:url(x)")).toBeUndefined();
    });
});

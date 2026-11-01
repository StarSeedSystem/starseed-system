/**
 * Pruebas de la parte PURA del dock 3D (XR1010M): qué apps se ven y cuáles caben antes de
 * «Más», y qué se puede prometer de cada ruta. En Node, sin red, sin DOM y sin WebGL.
 */
import { describe, expect, it } from "vitest";
import type { DockColor, DockItemConfig } from "@/components/layout/dock-config";
import {
    APPS_3D,
    MAXIMO_VISIBLE,
    MOTIVO_SIN_VISTA_3D,
    entradaDeDock,
    itemsDelDock,
    nodoDeColor,
    resolverApp,
    rutaLimpia,
} from "../apps-3d";

function item(id: string, path: string, enabled = true, color: DockColor = "cyan"): DockItemConfig {
    return { id, label: id, iconKey: "LayoutDashboard", path, color, enabled, origin: "preset" };
}

const DOCE = Array.from({ length: 12 }, (_, i) => item(`app-${i}`, `/ruta-${i}`));

describe("itemsDelDock · orden y solo habilitados", () => {
    it("descarta los deshabilitados y conserva el orden del dock 2D", () => {
        const config = [item("a", "/a"), item("b", "/b", false), item("c", "/c"), item("d", "/d", false), item("e", "/e")];
        const { visibles, mas } = itemsDelDock(config, "de-pie");
        expect(visibles.map((i) => i.id)).toEqual(["a", "c", "e"]);
        expect(mas).toEqual([]);
    });

    it("sin items habilitados devuelve las dos listas vacías", () => {
        expect(itemsDelDock([], "de-pie")).toEqual({ visibles: [], mas: [] });
        expect(itemsDelDock([item("a", "/a", false)], "una-mano")).toEqual({ visibles: [], mas: [] });
    });
});

describe("itemsDelDock · límite por postura y «Más»", () => {
    it("de pie caben 7 y el resto va a «Más», en orden", () => {
        const { visibles, mas } = itemsDelDock(DOCE, "de-pie");
        expect(visibles).toHaveLength(MAXIMO_VISIBLE["de-pie"]);
        expect(visibles.map((i) => i.id)).toEqual(DOCE.slice(0, 7).map((i) => i.id));
        expect(mas.map((i) => i.id)).toEqual(DOCE.slice(7).map((i) => i.id));
    });

    it("sentado también deja 7 a la vista", () => {
        const { visibles, mas } = itemsDelDock(DOCE, "sentado");
        expect(visibles).toHaveLength(7);
        expect(mas).toHaveLength(5);
    });

    it("a una mano solo caben 5 antes de «Más»", () => {
        const { visibles, mas } = itemsDelDock(DOCE, "una-mano");
        expect(visibles).toHaveLength(5);
        expect(mas.map((i) => i.id)).toEqual(DOCE.slice(5).map((i) => i.id));
    });

    it("con menos items que el tope no hay «Más»", () => {
        const { visibles, mas } = itemsDelDock(DOCE.slice(0, 5), "una-mano");
        expect(visibles).toHaveLength(5);
        expect(mas).toHaveLength(0);
    });
});

describe("resolverApp · lo que sí tiene vista 3D", () => {
    it("/escena/abc resuelve a vista nativa con el id del recurso", () => {
        expect(resolverApp(item("escenas", "/escena/abc"))).toEqual({ tipo: "nativa-3d", id: "escena:abc" });
    });

    it("/sala-xr/xyz también es nativa", () => {
        expect(resolverApp(item("salas", "/sala-xr/xyz"))).toEqual({ tipo: "nativa-3d", id: "sala-xr:xyz" });
    });

    it("el hub, el OS, el diagnóstico, Astraura y su laboratorio son nativos", () => {
        expect(resolverApp(item("hub", "/xr"))).toEqual({ tipo: "nativa-3d", id: "xr-hub" });
        expect(resolverApp(item("os", "/xr/os"))).toEqual({ tipo: "nativa-3d", id: "xr-os" });
        expect(resolverApp(item("diag", "/xr/diagnostico"))).toEqual({ tipo: "nativa-3d", id: "xr-diagnostico" });
        expect(resolverApp(item("astraura", "/agent"))).toEqual({ tipo: "nativa-3d", id: "astraura" });
        expect(resolverApp(item("lab", "/laboratorio"))).toEqual({ tipo: "nativa-3d", id: "astraura-laboratorio" });
    });

    it("la consulta y el ancla no cambian la resolución", () => {
        expect(resolverApp(item("skills", "/agent?tab=skills#top"))).toEqual({ tipo: "nativa-3d", id: "astraura" });
        expect(resolverApp(item("explorar", "/escena/abc/?sesion=1"))).toEqual({ tipo: "nativa-3d", id: "escena:abc" });
    });

    it("la lista de apps 3D no repite patrones", () => {
        const fuentes = APPS_3D.map((a) => a.patron.source);
        expect(new Set(fuentes).size).toBe(fuentes.length);
    });
});

describe("resolverApp · honestidad con lo que no tiene vista 3D", () => {
    it("una app desconocida es solo-2d con el motivo en español", () => {
        expect(resolverApp(item("mensajes", "/messages"))).toEqual({
            tipo: "solo-2d",
            ruta: "/messages",
            motivo: MOTIVO_SIN_VISTA_3D,
        });
    });

    it("el motivo dice claramente que todavía no hay vista 3D", () => {
        expect(MOTIVO_SIN_VISTA_3D).toMatch(/todavía no tiene vista 3D/);
    });

    it("una ruta a medio escribir se normaliza antes de devolverla", () => {
        expect(rutaLimpia("messages/?x=1#y")).toBe("/messages");
        expect(rutaLimpia("/")).toBe("/");
        expect(resolverApp(item("sin-barra", "dashboard"))).toEqual({
            tipo: "solo-2d",
            ruta: "/dashboard",
            motivo: MOTIVO_SIN_VISTA_3D,
        });
    });
});

describe("color y entrada del dock", () => {
    it("cada DockColor cae en un nodo real de la Trinity, sin colores a mano", () => {
        const colores: DockColor[] = ["neutral", "cyan", "crimson", "amber", "emerald", "purple"];
        for (const color of colores) expect(["zenith", "horizon", "logic", "anchor"]).toContain(nodoDeColor(color));
        expect(nodoDeColor("crimson")).toBe("anchor");
        expect(nodoDeColor("emerald")).toBe("horizon");
        expect(nodoDeColor("amber")).toBe("logic");
    });

    it("la entrada del dock usa la postura y los valores de confort", () => {
        expect(entradaDeDock("una-mano")).toMatchObject({ postura: "una-mano", alturaOjos: 1.65, manoDominante: "derecha", modo: "vr-inmersivo" });
        expect(entradaDeDock("sentado", { alturaOjos: 1.5, manoDominante: "izquierda", yawBase: 1 })).toMatchObject({ postura: "sentado", alturaOjos: 1.5, manoDominante: "izquierda", yawBase: 1 });
    });
});

import { describe, expect, it } from "vitest";
import type { DockItemConfig } from "@/components/layout/dock-config";
import { APPS_3D, MAX_VISIBLES_DOCK, itemsDelDock, resolverApp } from "../apps-3d";

function app(id: string, path: string, enabled = true): DockItemConfig {
    return { id, label: id, iconKey: "LayoutDashboard", path, color: "cyan", enabled, origin: "preset" };
}

const ids = (items: DockItemConfig[]): string[] => items.map((item) => item.id);

describe("itemsDelDock · mismas apps del dock 2D", () => {
    it("solo devuelve las enabled y conserva el orden elegido en el dock 2D", () => {
        const config = [app("a", "/a"), app("b", "/b", false), app("c", "/c"), app("d", "/d", false)];
        expect(ids(itemsDelDock(config, "de-pie").visibles)).toEqual(["a", "c"]);
    });

    it("de pie y sentado dejan 7 a la vista y el resto bajo «Más»", () => {
        const config = Array.from({ length: 10 }, (_, i) => app(`app-${i}`, `/app-${i}`));
        const dePie = itemsDelDock(config, "de-pie");
        const sentado = itemsDelDock(config, "sentado");
        expect(dePie.visibles).toHaveLength(7);
        expect(ids(dePie.mas)).toEqual(["app-7", "app-8", "app-9"]);
        expect(sentado.visibles).toHaveLength(7);
        expect(sentado.ocultos).toBe(3);
    });

    it("a una mano deja 5 a la vista y el resto bajo «Más»", () => {
        const config = Array.from({ length: 8 }, (_, i) => app(`app-${i}`, `/app-${i}`));
        const unaMano = itemsDelDock(config, "una-mano");
        expect(unaMano.visibles).toHaveLength(5);
        expect(ids(unaMano.mas)).toEqual(["app-5", "app-6", "app-7"]);
    });

    it("sin apps (o todas apagadas) devuelve listas vacías", () => {
        expect(itemsDelDock([], "de-pie")).toEqual({ visibles: [], mas: [], ocultos: 0 });
        const apagadas = itemsDelDock([app("a", "/a", false)], "una-mano");
        expect(apagadas.visibles).toEqual([]);
        expect(apagadas.mas).toEqual([]);
        expect(apagadas.ocultos).toBe(0);
    });

    it("los límites de la tabla son los del contrato: 7, 7 y 5", () => {
        expect(MAX_VISIBLES_DOCK).toEqual({ "de-pie": 7, sentado: 7, "una-mano": 5 });
    });
});

describe("resolverApp · nunca finge una vista 3D", () => {
    it("una app sin vista 3D es solo-2d y explica el motivo en español", () => {
        const r = resolverApp(app("messages", "/messages"));
        expect(r.tipo).toBe("solo-2d");
        if (r.tipo !== "solo-2d") throw new Error("se esperaba solo-2d");
        expect(r.ruta).toBe("/messages");
        expect(r.motivo).toContain("todavía no tiene vista 3D");
    });

    it("la escena concreta /escena/abc resuelve a la vista nativa de escenas", () => {
        expect(resolverApp(app("escena", "/escena/abc"))).toEqual({ tipo: "nativa-3d", id: "escena" });
    });

    it("el hub /xr, las salas /sala-xr/*, Astraura y los ajustes XR tienen vista nativa", () => {
        expect(resolverApp(app("hub", "/xr"))).toEqual({ tipo: "nativa-3d", id: "hub-xr" });
        expect(resolverApp(app("sala", "/sala-xr/una-sala"))).toEqual({ tipo: "nativa-3d", id: "sala-xr" });
        expect(resolverApp(app("ai", "/agent"))).toEqual({ tipo: "nativa-3d", id: "astraura" });
        expect(resolverApp(app("ajustes", "/settings"))).toEqual({ tipo: "nativa-3d", id: "ajustes-xr" });
    });

    it("una ruta desconocida también es solo-2d (nunca una vista inventada)", () => {
        expect(resolverApp(app("rara", "/no-existe/xyz")).tipo).toBe("solo-2d");
    });

    it("/xr-hub no se confunde con el prefijo del hub /xr", () => {
        expect(resolverApp(app("otro", "/xr-hub")).tipo).toBe("solo-2d");
    });

    it("normaliza query, hash y barra final antes de resolver", () => {
        expect(resolverApp(app("hub", "/xr/?tab=red#arriba"))).toEqual({ tipo: "nativa-3d", id: "hub-xr" });
        expect(resolverApp(app("escena", "/escena/abc/?x=1"))).toEqual({ tipo: "nativa-3d", id: "escena" });
    });

    it("la tabla de apps nativas no tiene ids ni rutas duplicadas", () => {
        expect(new Set(APPS_3D.map((a) => a.id)).size).toBe(APPS_3D.length);
        expect(new Set(APPS_3D.map((a) => a.ruta)).size).toBe(APPS_3D.length);
    });
});

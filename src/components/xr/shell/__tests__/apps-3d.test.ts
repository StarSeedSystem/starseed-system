import { describe, it, expect } from "vitest";
import { itemsDelDock, resolverApp } from "../apps-3d";
import type { DockItemConfig } from "@/components/layout/dock-config";

describe("apps-3d (puras)", () => {
    const config: DockItemConfig[] = [
        { id: "escritorios", label: "Escritorio", iconKey: "AppWindow", path: "/escritorios", color: "cyan", enabled: true, origin: "preset" },
        { id: "dashboard", label: "Dashboard", iconKey: "LayoutDashboard", path: "/dashboard", color: "cyan", enabled: false, origin: "preset" },
        { id: "xr-hub", label: "Hub", iconKey: "AppWindow", path: "/xr", color: "purple", enabled: true, origin: "preset" },
    ];

    it("filtra items enabled y respeta orden", () => {
        const items = itemsDelDock(config, "de-pie");
        expect(items.map((i) => i.id)).toEqual(["escritorios", "xr-hub"]);
    });

    it("limita items según postura", () => {
        const largeConfig: DockItemConfig[] = Array.from({ length: 10 }, (_, i) => ({
            id: `app${i}`, label: `App ${i}`, iconKey: "AppWindow", path: `/app${i}`, color: "neutral", enabled: true, origin: "preset"
        }));
        const dePie = itemsDelDock(largeConfig, "de-pie");
        expect(dePie.length).toBe(7); // Max 7 de pie
        
        const unaMano = itemsDelDock(largeConfig, "una-mano");
        expect(unaMano.length).toBe(5); // Max 5 en una mano
    });

    it("resuelve /xr a nativa-3d", () => {
        expect(resolverApp({ id: "xr-hub", path: "/xr" } as DockItemConfig).tipo).toBe("nativa-3d");
    });

    it("resuelve /escena/* a nativa-3d", () => {
        expect(resolverApp({ id: "escena", path: "/escena/abc" } as DockItemConfig).tipo).toBe("nativa-3d");
    });

    it("resuelve /sala-xr/* a nativa-3d", () => {
        expect(resolverApp({ id: "sala", path: "/sala-xr/123" } as DockItemConfig).tipo).toBe("nativa-3d");
    });

    it("resuelve otras a solo-2d con motivo", () => {
        const res = resolverApp({ id: "dashboard", path: "/dashboard" } as DockItemConfig);
        expect(res.tipo).toBe("solo-2d");
        expect((res as any).motivo).toBe("Esta app todavía no tiene vista 3D");
    });

    it("item desconocido resuelve a solo-2d", () => {
        const res = resolverApp({ id: "desconocido", path: "/algo/raro" } as DockItemConfig);
        expect(res.tipo).toBe("solo-2d");
    });

    it("sin items devuelve lista vacía", () => {
        const items = itemsDelDock([], "de-pie");
        expect(items).toEqual([]);
    });
});

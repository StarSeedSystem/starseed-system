import { describe, expect, it } from "vitest";
import type { DockItemConfig } from "@/components/layout/dock-config";
import {
    APPS_3D,
    ETIQUETA_MAS,
    MAX_VISIBLES,
    MOTIVO_SIN_3D,
    itemsDelDock,
    nodoDelColor,
    resolverApp,
} from "../apps-3d";

function item(parcial: Partial<DockItemConfig> & { id: string }): DockItemConfig {
    return {
        label: parcial.id,
        iconKey: "LayoutGrid",
        path: "/una-app",
        color: "neutral",
        enabled: true,
        origin: "preset",
        ...parcial,
    };
}

const muchos = (n: number): DockItemConfig[] =>
    Array.from({ length: n }, (_, i) => item({ id: `app-${i + 1}`, label: `App ${i + 1}`, path: `/app-${i + 1}` }));

describe("itemsDelDock · solo encendidas, en su orden", () => {
    it("filtra las apagadas y conserva el orden de la configuración", () => {
        const config = [
            item({ id: "a", enabled: false }),
            item({ id: "b" }),
            item({ id: "c", enabled: false }),
            item({ id: "d" }),
        ];
        const { visibles, mas } = itemsDelDock(config, "de-pie");
        expect(visibles.map((i) => i.id)).toEqual(["b", "d"]);
        expect(mas).toEqual([]);
    });

    it("sin apps encendidas devuelve las dos listas vacías", () => {
        expect(itemsDelDock([], "de-pie")).toEqual({ visibles: [], mas: [], maxVisibles: 7 });
        expect(itemsDelDock([item({ id: "x", enabled: false })], "una-mano").visibles).toEqual([]);
    });
});

describe("itemsDelDock · límite por postura y «Más»", () => {
    it("de pie caben 7 y el resto va bajo «Más»", () => {
        const { visibles, mas, maxVisibles } = itemsDelDock(muchos(9), "de-pie");
        expect(maxVisibles).toBe(7);
        expect(visibles.map((i) => i.id)).toEqual(["app-1", "app-2", "app-3", "app-4", "app-5", "app-6", "app-7"]);
        expect(mas.map((i) => i.id)).toEqual(["app-8", "app-9"]);
        expect(ETIQUETA_MAS).toBe("Más");
    });

    it("sentado también caben 7", () => {
        expect(MAX_VISIBLES.sentado).toBe(7);
        expect(itemsDelDock(muchos(8), "sentado").mas).toHaveLength(1);
    });

    it("a una mano caben 5", () => {
        const { visibles, mas } = itemsDelDock(muchos(7), "una-mano");
        expect(visibles.map((i) => i.id)).toEqual(["app-1", "app-2", "app-3", "app-4", "app-5"]);
        expect(mas.map((i) => i.id)).toEqual(["app-6", "app-7"]);
    });

    it("si caben todas, «Más» queda vacío", () => {
        const { visibles, mas } = itemsDelDock(muchos(5), "una-mano");
        expect(visibles).toHaveLength(5);
        expect(mas).toEqual([]);
    });
});

describe("resolverApp · vista 3D real o salida honesta a 2D", () => {
    it("el hub /xr es nativo 3D", () => {
        expect(resolverApp(item({ id: "xr", path: "/xr" }))).toEqual({ tipo: "nativa-3d", id: "hub-xr" });
    });
    it("/escena/abc resuelve a la vista nativa de escenas", () => {
        expect(resolverApp(item({ id: "escena", path: "/escena/abc" }))).toEqual({ tipo: "nativa-3d", id: "escenas" });
    });
    it("/sala-xr/42 y Astraura con pestaña también son nativas", () => {
        expect(resolverApp(item({ id: "sala", path: "/sala-xr/42" }))).toEqual({ tipo: "nativa-3d", id: "salas-xr" });
        expect(resolverApp(item({ id: "ast", path: "/agent?tab=skills" }))).toEqual({ tipo: "nativa-3d", id: "astraura" });
    });
    it("los ajustes XR están en APPS_3D", () => {
        expect(APPS_3D.map((a) => a.ruta)).toContain("/xr/diagnostico");
        expect(resolverApp(item({ id: "diag", path: "/xr/diagnostico" }))).toEqual({ tipo: "nativa-3d", id: "ajustes-xr" });
    });
    it("una app normal es solo-2d, con motivo en español y la ruta intacta", () => {
        const r = resolverApp(item({ id: "tablas", path: "/tabla?fila=2" }));
        expect(r).toEqual({ tipo: "solo-2d", ruta: "/tabla?fila=2", motivo: MOTIVO_SIN_3D });
        expect(MOTIVO_SIN_3D).toContain("todavía no tiene vista 3D");
    });
    it("un item desconocido tampoco finge: solo-2d", () => {
        expect(resolverApp(item({ id: "raro", path: "/inventado/xyz" })).tipo).toBe("solo-2d");
    });
    it("una ruta declarada como UiSpec se reconoce (lista inyectada)", () => {
        expect(resolverApp(item({ id: "prog", path: "/programa/7" }), ["/programa"])).toEqual({ tipo: "uispec", ruta: "/programa/7" });
        expect(resolverApp(item({ id: "prog", path: "/programa/7" })).tipo).toBe("solo-2d");
    });
    it("cada DockColor usa un color del núcleo, nunca un hex a mano", () => {
        const colores = ["neutral", "cyan", "crimson", "amber", "emerald", "purple"] as const;
        for (const color of colores) expect(["zenith", "horizon", "logic", "anchor"]).toContain(nodoDelColor(color));
    });
});

/**
 * StarSeed XR · pruebas del DOCK 3D puro (XR1010M · node, sin red ni licor de React).
 */
import { describe, expect, it } from "vitest";
import { APPS_3D, MAX_DOCK, itemsDelDock, resolverApp, MOTIVO_SIN_3D, type DockItemConfig } from "../apps-3d";

let secuencia = 0;
const item = (sobre: Partial<DockItemConfig> = {}): DockItemConfig => {
    secuencia += 1;
    return {
        id: sobre.id ?? `id-${secuencia}`,
        label: sobre.label ?? `App ${secuencia}`,
        iconKey: sobre.iconKey ?? "AppWindow",
        path: sobre.path ?? `/ruta-${secuencia}`,
        color: sobre.color ?? "cyan",
        enabled: sobre.enabled ?? true,
        origin: sobre.origin ?? "preset",
    };
};
const ids = (items: DockItemConfig[]): string[] => items.map((i) => i.id);

describe("itemsDelDock", () => {
    it("solo los enabled, en el orden de la config", () => {
        const config = [item({ id: "a" }), item({ id: "b", enabled: false }), item({ id: "c", enabled: false }), item({ id: "d" })];
        expect(ids(itemsDelDock(config, "de-pie").visibles)).toEqual(["a", "d"]);
        expect(itemsDelDock(config, "de-pie").ocultas).toEqual([]);
    });

    it("de pie y sentado: 7 visibles y el resto bajo «Más»", () => {
        const config = Array.from({ length: 9 }, (_, i) => item({ id: `a${i}` }));
        for (const postura of ["de-pie", "sentado"] as const) {
            const partido = itemsDelDock(config, postura);
            expect(partido.visibles).toHaveLength(MAX_DOCK[postura]);
            expect(ids(partido.visibles)).toEqual(config.slice(0, 7).map((i) => i.id));
            expect(ids(partido.ocultas)).toEqual(config.slice(7).map((i) => i.id));
        }
    });

    it("a una mano: 5 visibles y 4 bajo «Más»", () => {
        const config = Array.from({ length: 9 }, (_, i) => item({ id: `m${i}` }));
        const partido = itemsDelDock(config, "una-mano");
        expect(partido.visibles).toHaveLength(5);
        expect(ids(partido.ocultas)).toEqual(["m5", "m6", "m7", "m8"]);
    });

    it("los apagados no cuentan para el límite ni rompen el orden", () => {
        const config = [
            item({ id: "x1" }), item({ id: "x2", enabled: false }), item({ id: "x3" }),
            item({ id: "x4" }), item({ id: "x5", enabled: false }), item({ id: "x6" }),
            item({ id: "x7" }), item({ id: "x8" }), item({ id: "x9" }),
        ];
        const partido = itemsDelDock(config, "una-mano");
        expect(ids(partido.visibles)).toEqual(["x1", "x3", "x4", "x6", "x7"]);
        expect(ids(partido.ocultas)).toEqual(["x8", "x9"]);
    });

    it("sin items (o todos apagados): visibles y ocultas vacías", () => {
        expect(itemsDelDock([], "de-pie")).toEqual({ visibles: [], ocultas: [] });
        expect(itemsDelDock([item({ enabled: false })], "una-mano")).toEqual({ visibles: [], ocultas: [] });
    });

    it("lo que se ve más lo bajo «Más» son todas las enabled: no se pierde ninguna", () => {
        const config = Array.from({ length: 12 }, (_, i) => item({ id: `t${i}` }));
        const { visibles, ocultas } = itemsDelDock(config, "sentado");
        expect(visibles.length + ocultas.length).toBe(12);
        expect(ids([...visibles, ...ocultas])).toEqual(ids(config));
    });
});

describe("resolverApp", () => {
    it("lo que SÍ tiene vista 3D hoy está en APPS_3D y no está vacío", () => {
        expect(APPS_3D.length).toBeGreaterThanOrEqual(4);
        expect(APPS_3D.map((app) => app.rutas[0])).toContain("/xr");
    });

    it("una escena `/escena/abc` resuelve a nativa-3d", () => {
        expect(resolverApp(item({ id: "mi-escena", path: "/escena/abc" }))).toEqual({ tipo: "nativa-3d", id: "mi-escena" });
    });

    it("el hub /xr, una sala /sala-xr/privada, Astraura y los ajustes resuelven nativa-3d", () => {
        for (const ruta of ["/xr", "/sala-xr/privada", "/agent", "/settings"]) {
            expect(resolverApp(item({ path: ruta })).tipo).toBe("nativa-3d");
        }
    });

    it("un item desconocido es solo-2d con el motivo honesto en español", () => {
        const resuelta = resolverApp(item({ id: "otra", path: "/otra" }));
        expect(resuelta).toEqual({ tipo: "solo-2d", ruta: "/otra", motivo: MOTIVO_SIN_3D });
        expect(MOTIVO_SIN_3D).toContain("vista 3D");
    });
});


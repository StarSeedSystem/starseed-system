/**
 * Pruebas XR1010M de `apps-3d.ts`: módulo PURO, sin red, sin disco, sin navegador.
 * Importamos describe/it/expect de vitest (globals: false) y SOLO el módulo puro.
 */
import { describe, expect, it } from "vitest";
import {
    APPS_3D, MAX_DOCK, MOTIVO_SIN_VISTA_3D, colorDeItem, itemsDelDock, nodoDeColor, resolverApp,
} from "../apps-3d";
import type { DockItemConfig } from "../../layout/dock-config";

const base = { iconKey: "AppWindow" as const, color: "cyan" as const, origin: "preset" as const, enabled: true };
const item = (id: string, overrides: Partial<DockItemConfig> = {}): DockItemConfig => ({
    id, label: id.charAt(0).toUpperCase() + id.slice(1), path: `/${id}`, ...base, ...overrides,
});

describe("itemsDelDock", () => {
    it("solo deja los enabled, en su orden", () => {
        const reparto = itemsDelDock([item("a"), item("b", { enabled: false }), item("c")], "de-pie");
        expect(reparto.visibles.map((i) => i.id)).toEqual(["a", "c"]);
        expect(reparto.ocultos).toEqual([]);
        expect(reparto.mas).toBe(false);
    });

    it("límite de pie: 7 visibles y el resto bajo «Más»", () => {
        const muchos = Array.from({ length: 12 }, (_, i) => item(`app-${i}`));
        const dePie = itemsDelDock(muchos, "de-pie");
        expect(dePie.visibles).toHaveLength(7);
        expect(dePie.visibles.map((i) => i.id)).toEqual(Array.from({ length: 7 }, (_, i) => `app-${i}`));
        expect(dePie.ocultos).toHaveLength(5);
        expect(dePie.mas).toBe(true);
    });

    it("límite sentado: 7 visibles", () => {
        const muchos = Array.from({ length: 9 }, (_, i) => item(`app-${i}`));
        expect(itemsDelDock(muchos, "sentado").visibles).toHaveLength(7);
    });

    it("límite de una mano: 5 visibles", () => {
        const muchos = Array.from({ length: 9 }, (_, i) => item(`app-${i}`));
        expect(itemsDelDock(muchos, "una-mano").visibles).toHaveLength(5);
        expect(itemsDelDock(muchos, "una-mano").mas).toBe(true);
    });

    it("sin items devuelve lista vacía y sin «Más»", () => {
        expect(itemsDelDock([], "de-pie")).toEqual({ visibles: [], ocultos: [], mas: false });
    });
});

describe("resolverApp", () => {
    it("la escena de una ruta concreta (/escena/abc) resuelve a nativa-3d", () => {
        expect(resolverApp({ id: "inventada", path: "/escena/abc" })).toEqual({ tipo: "nativa-3d", id: "escena-abc" });
    });

    it("una sala /sala-xr/* también es nativa-3d", () => {
        expect(resolverApp({ id: "inventada", path: "/sala-xr/xyz" })).toEqual({ tipo: "nativa-3d", id: "sala-xyz" });
    });

    it("los ids de la tabla APPS_3D resuelven nativos aunque la ruta sea otra", () => {
        for (const [id, esperado] of Object.entries(APPS_3D)) {
            expect(resolverApp({ id, path: `/${id}` })).toEqual({ tipo: "nativa-3d", id: esperado });
        }
    });

    it("Astraura por ruta directa (/agent) es nativa-3d aunque el id no esté en la tabla", () => {
        expect(resolverApp({ id: "acceso-propio", path: "/agent" })).toEqual({ tipo: "nativa-3d", id: "astraura" });
    });

    it("un item desconocido queda solo-2d con el motivo honesto y su ruta", () => {
        expect(resolverApp({ id: "messages", path: "/messages" })).toEqual({
            tipo: "solo-2d", ruta: "/messages", motivo: MOTIVO_SIN_VISTA_3D,
        });
    });
});

describe("nodoDeColor y colorDeItem", () => {
    it("los seis tonos caen en los cuatro colores cardinales del contrato (nada inventado)", () => {
        expect(nodoDeColor("cyan")).toBe("zenith");
        expect(nodoDeColor("purple")).toBe("zenith");
        expect(nodoDeColor("emerald")).toBe("horizon");
        expect(nodoDeColor("amber")).toBe("logic");
        expect(nodoDeColor("crimson")).toBe("anchor");
        expect(nodoDeColor("neutral")).toBe("anchor");
        expect(colorDeItem("cyan")).toBe("#007FFF");
        expect(colorDeItem("emerald")).toBe("#39FF14");
        expect(colorDeItem("crimson")).toBe("#DC143C");
    });
});

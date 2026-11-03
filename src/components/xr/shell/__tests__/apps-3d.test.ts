import { describe, expect, it } from "vitest";
import type { DockItemConfig } from "@/components/layout/dock-config";
import {
    APPS_3D,
    MOTIVO_SIN_VISTA_3D,
    itemsDelDock,
    resolverApp,
} from "../apps-3d";

const item = (id: string, path: string, enabled = true): DockItemConfig => ({
    id,
    label: `App ${id}`,
    iconKey: "LayoutGrid",
    path,
    color: "cyan",
    enabled,
    origin: "preset",
});

const config = (n: number): DockItemConfig[] =>
    Array.from({ length: n }, (_, i) => item(`app-${i}`, `/ruta-${i}`));

describe("itemsDelDock · solo habilitadas, en su orden", () => {
    it("descarta las apagadas y conserva el orden del dock", () => {
        const reparto = itemsDelDock(
            [item("a", "/a"), item("b", "/b", false), item("c", "/c")],
            "de-pie",
        );
        expect(reparto.visibles.map((i) => i.id)).toEqual(["a", "c"]);
    });

    it("sin items la lista queda vacía (nunca inventa un «Más»)", () => {
        const reparto = itemsDelDock([], "sentado");
        expect(reparto.visibles).toEqual([]);
        expect(reparto.mas).toEqual([]);
    });
});

describe("itemsDelDock · límite por postura y «Más»", () => {
    it("de pie muestra 7 y deja el resto bajo «Más»", () => {
        const reparto = itemsDelDock(config(10), "de-pie");
        expect(reparto.visibles).toHaveLength(7);
        expect(reparto.mas.map((i) => i.id)).toEqual(["app-7", "app-8", "app-9"]);
    });

    it("sentado también muestra 7", () => {
        const reparto = itemsDelDock(config(8), "sentado");
        expect(reparto.visibles).toHaveLength(7);
        expect(reparto.mas.map((i) => i.id)).toEqual(["app-7"]);
    });

    it("a una mano muestra 5", () => {
        const reparto = itemsDelDock(config(8), "una-mano");
        expect(reparto.visibles.map((i) => i.id)).toEqual(["app-0", "app-1", "app-2", "app-3", "app-4"]);
        expect(reparto.mas).toHaveLength(3);
    });

    it("si caben todas, «Más» queda vacío", () => {
        const reparto = itemsDelDock(config(3), "una-mano");
        expect(reparto.visibles).toHaveLength(3);
        expect(reparto.mas).toEqual([]);
    });
});

describe("resolverApp · apps con vista 3D real", () => {
    it("la tabla declara el hub, las escenas, las salas, Astraura y los ajustes XR", () => {
        expect(APPS_3D.map((a) => a.id)).toEqual(
            expect.arrayContaining(["xr-hub", "escenas-3d", "salas-xr", "ai-studio", "ajustes-xr"]),
        );
    });

    it("/escena/abc resuelve a nativa-3d y no a solo-2d", () => {
        expect(resolverApp(item("escena", "/escena/abc"))).toEqual({ tipo: "nativa-3d", id: "escenas-3d" });
    });

    it("/sala-xr/xyz y el hub /xr resuelven a nativa-3d", () => {
        expect(resolverApp(item("sala", "/sala-xr/xyz"))).toEqual({ tipo: "nativa-3d", id: "salas-xr" });
        expect(resolverApp(item("hub", "/xr"))).toEqual({ tipo: "nativa-3d", id: "xr-hub" });
    });

    it("Astraura y los ajustes XR resuelven a nativa-3d", () => {
        expect(resolverApp(item("astraura", "/agent?tab=skills"))).toEqual({ tipo: "nativa-3d", id: "ai-studio" });
        expect(resolverApp(item("ajustes", "/xr/os"))).toEqual({ tipo: "nativa-3d", id: "ajustes-xr" });
    });

    it("una ruta parecida no se cuela como escena 3D", () => {
        const r = resolverApp(item("parecida", "/escena-otra"));
        expect(r.tipo).toBe("solo-2d");
    });
});

describe("resolverApp · honestidad de la vista 3D", () => {
    it("una ruta desconocida es solo-2d con su motivo en español", () => {
        const r = resolverApp(item("rara", "/ruta-que-no-existe"));
        expect(r.tipo).toBe("solo-2d");
        if (r.tipo === "solo-2d") {
            expect(r.ruta).toBe("/ruta-que-no-existe");
            expect(r.motivo).toBe(MOTIVO_SIN_VISTA_3D);
        }
    });
});

/**
 * Pruebas del módulo puro del dock 3D (XR1010M). Node, sin red, sin disco, sin WebGL.
 * Solo funciones puras: `itemsDelDock` y `resolverApp`.
 */
import { describe, it, expect } from "vitest";
import type { DockItemConfig } from "../../../layout/dock-config";
import type { Postura } from "../../../lib/xr/tipos";
import {
  APPS_3D,
  MAX_DOCK_POR_POSTURA,
  MOTIVO_SIN_VISTA_3D,
  itemsDelDock,
  resolverApp,
} from "../apps-3d";

const item = (id: string, i: number, enabled = true): DockItemConfig => ({
  id,
  label: `App ${i} ${id}`,
  iconKey: "AppWindow",
  path: `/ruta-${id}`,
  color: "cyan",
  enabled,
  origin: "preset",
});

const dolares = (n: number, enabled = true): DockItemConfig[] =>
  Array.from({ length: n }, (_, i) => item(`d${i}`, i, enabled));

describe("itemsDelDock", () => {
  it("solo enseña los enabled, en su orden", () => {
    const config = [item("a", 0), item("b", 1, false), item("c", 2)];
    const { visibles, ocultos } = itemsDelDock(config, "de-pie");
    expect(visibles.map((x) => x.id)).toEqual(["a", "c"]);
    expect(ocultos).toEqual([]);
  });

  it("de pie y sentado: 7 visibles y el resto bajo «Más»", () => {
    for (const postura of ["de-pie", "sentado"] as Postura[]) {
      const { visibles, ocultos } = itemsDelDock(dolares(9), postura);
      expect(visibles.length).toBe(MAX_DOCK_POR_POSTURA[postura]);
      expect(ocultos.map((x) => x.id)).toEqual(["d7", "d8"]);
    }
  });

  it("una mano: 5 visibles y el resto bajo «Más»", () => {
    const { visibles, ocultos } = itemsDelDock(dolares(9), "una-mano");
    expect(visibles.length).toBe(5);
    expect(ocultos.map((x) => x.id)).toEqual(["d5", "d6", "d7", "d8"]);
  });

  it("sin items devuelve listas vacías", () => {
    expect(itemsDelDock([], "de-pie")).toEqual({ visibles: [], ocultos: [] });
  });
});

describe("resolverApp", () => {
  it("el hub /xr es nativo 3D", () => {
    expect(resolverApp({ id: "xr-hub", label: "Hub XR", path: "/xr" })).toEqual({ tipo: "nativa-3d", id: "hub-xr" });
  });

  it("/escena/abc resuelve a nativa 3D por prefijo", () => {
    expect(resolverApp({ id: "x", label: "Escena", path: "/escena/abc" })).toEqual({ tipo: "nativa-3d", id: "escena-3d" });
  });

  it("Astraura (/agent) es nativa 3D", () => {
    expect(resolverApp({ id: "ai-studio", label: "Astraura AI", path: "/agent" })).toEqual({ tipo: "nativa-3d", id: "astraura" });
  });

  it("un item desconocido es solo-2d con el motivo en español", () => {
    const res = resolverApp({ id: "y", label: "Mensajes", path: "/messages" });
    expect(res).toEqual({ tipo: "solo-2d", ruta: "/messages", motivo: MOTIVO_SIN_VISTA_3D });
  });

  it("una ruta parecida no roba el prefijo de otra", () => {
    expect(resolverApp({ id: "z", label: "Otra", path: "/sala-xr-mas" })).toEqual({
      tipo: "solo-2d",
      ruta: "/sala-xr-mas",
      motivo: MOTIVO_SIN_VISTA_3D,
    });
  });

  it("los ajustes XR están en la tabla y sin rutas repetidas", () => {
    const rutas = APPS_3D.map((e) => e.ruta);
    expect(new Set(rutas).size).toBe(rutas.length);
    expect(APPS_3D.some((e) => e.id === "ajustes-xr")).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { itemsDelDock, resolverApp } from "../apps-3d";
import { DockItemConfig } from "@/components/layout/dock-config";

describe("apps-3d", () => {
  const mockConfig: DockItemConfig[] = Array.from({ length: 10 }, (_, i) => ({
    id: `app-${i}`,
    label: `App ${i}`,
    iconKey: 'star',
    path: `/app-${i}`,
    color: 'red',
    enabled: true,
    origin: 'preset',
  }));

  it("limita items por postura", () => {
    expect(itemsDelDock(mockConfig, "de-pie").length).toBe(7);
    expect(itemsDelDock(mockConfig, "una-mano").length).toBe(5);
  });

  it("añade item 'Más' cuando hay exceso", () => {
    const items = itemsDelDock(mockConfig, "de-pie");
    expect(items[6].id).toBe("mas");
  });

  it("resuelve apps nativas 3D", () => {
    const item: DockItemConfig = {
      id: "hub",
      label: "Hub",
      iconKey: "box",
      path: "/xr",
      color: "blue",
      enabled: true,
      origin: "preset",
    };
    expect(resolverApp(item)).toEqual({ tipo: 'nativa-3d', id: 'hub' });
  });

  it("resuelve apps 2D con motivo", () => {
    const item: DockItemConfig = {
      id: "test",
      label: "Test",
      iconKey: "box",
      path: "/test",
      color: "blue",
      enabled: true,
      origin: "preset",
    };
    const resolved = resolverApp(item);
    if (resolved.tipo === 'solo-2d') {
      expect(resolved.motivo).toBe('Esta app todavía no tiene vista 3D');
    } else {
      throw new Error("Esperado solo-2d");
    }
  });
});

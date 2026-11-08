// @vitest-environment jsdom
/**
 * FEED1108A: «Feed de red» sale del dock. El preset ya no existe, las cuentas con un dock guardado
 * lo pierden al cargar (y queda persistido) y la migración v11 ya no lo re-añade.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { DOCK_PRESETS, loadDockConfig } from "../dock-config";
import { DOCK_STORAGE_KEY, DOCK_DEFAULTS_VERSION, parseDockPayload } from "@/lib/dock/dock-defaults";

describe("dock · red-feed retirado", () => {
  beforeEach(() => window.localStorage.clear());

  it("el catálogo de presets ya no trae red-feed pero conserva Señales", () => {
    expect(DOCK_PRESETS.some((p) => p.id === "red-feed")).toBe(false);
    expect(DOCK_PRESETS.some((p) => p.id === "senales")).toBe(true);
  });

  it("un dock guardado con red-feed (legado y versionado) lo pierde y se persiste limpio", () => {
    const senales = DOCK_PRESETS.find((p) => p.id === "senales")!;
    const feed = { id: "red-feed", label: "Feed de red", iconKey: "Radio", path: "/red-feed", color: "purple", enabled: true, origin: "preset" };
    for (const guardado of [
      [senales, feed],
      { defaultsVersion: DOCK_DEFAULTS_VERSION, items: [senales, feed] },
    ]) {
      window.localStorage.clear();
      window.localStorage.setItem(DOCK_STORAGE_KEY, JSON.stringify(guardado));
      const cargado = loadDockConfig();
      expect(cargado.some((i) => i.id === "red-feed")).toBe(false);
      expect(cargado.some((i) => i.id === "senales" && i.enabled)).toBe(true);
      // Lo guardado (sobre versionado o array legado, según qué migración escribió último) ya no lo trae.
      const { items } = parseDockPayload(window.localStorage.getItem(DOCK_STORAGE_KEY));
      expect(items).not.toBeNull();
      expect(items!.some((i) => i.id === "red-feed")).toBe(false);
    }
  });

  it("sin dock guardado tampoco aparece (presets vivos)", () => {
    expect(loadDockConfig().some((i) => i.id === "red-feed")).toBe(false);
  });
});

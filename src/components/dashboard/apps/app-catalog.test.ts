import { describe, it, expect } from "vitest";
import { APP_CATALOG, APP_COLLECTIONS, getApp, resolveApps } from "./app-catalog";

describe("Catálogo de apps · BOT1011Zf", () => {
  it("contiene la app 'Bots de Astraura' con ruta #bots", () => {
    const app = getApp("bots-astral");
    expect(app).toBeDefined();
    expect(app?.name).toBe("Bots de Astraura");
    expect(app?.open?.route).toBe("/genesis#bots");
  });

  it("APP_COLLECTIONS.sistema incluye 'bots-astral'", () => {
    expect(APP_COLLECTIONS.sistema).toContain("bots-astral");
  });

  it("resolveApps resuelve 'bots-astral' sin errores", () => {
    const res = resolveApps(["bots-astral"], "sistema");
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe("bots-astral");
  });
});

import { describe, it, expect } from "vitest";
import { Atom } from "lucide-react";
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

describe("Catálogo de apps · PM1010F0I (Protomolécula)", () => {
  it("existe la app protomolecula como ventana con ruta propia", () => {
    const app = getApp("protomolecula");
    expect(app).toBeDefined();
    expect(app!.name).toBe("Protomolécula");
    expect(app!.status).toBe("native");
    expect(app!.category).toBe("starseed");
    expect(app!.icon).toBe(Atom);
    expect(app!.open).toEqual({
      primary: "window",
      allowed: ["window", "route", "tab", "popup"],
      route: "/protomolecula",
    });
  });

  it("la descripción promete solo lo que hay y avisa de las fases", () => {
    const app = getApp("protomolecula");
    expect(app!.description).toBe(
      "Crea y edita imágenes, audio, 3D y más: a mano, por voz o con la IA. Las herramientas llegan por fases.",
    );
  });

  it("protomolecula está en las colecciones starseed y sistema", () => {
    expect(APP_COLLECTIONS.starseed).toContain("protomolecula");
    expect(APP_COLLECTIONS.sistema).toContain("protomolecula");
  });

  it("resolveApps resuelve 'protomolecula' en ambas colecciones", () => {
    for (const coleccion of ["starseed", "sistema"] as const) {
      const res = resolveApps(["protomolecula"], coleccion);
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe("protomolecula");
    }
  });
});

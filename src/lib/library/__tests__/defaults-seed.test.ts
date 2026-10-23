import { describe, it, expect } from "vitest";
import {
  SEED_VERSION,
  RECOMMENDED_PACKAGE_IDS,
  planSeedInstall,
  type SeedPlanInput,
} from "../defaults-seed";

const SIEMPRE = [
  "lib-vikunja",
  "lib-celld",
  "lib-sentry",
  "lib-windmill",
  "lib-metabase",
  "lib-trilium",
  "lib-politica-privacidad",
] as const;

const MANUAL = [
  "lib-ruview",
  "lib-tirreno",
  "lib-digup",
  "lib-moli",
  "lib-openshell",
  "lib-coucou",
  "lib-dbx",
] as const;

function plan(overrides: Partial<SeedPlanInput>): string[] {
  return planSeedInstall({
    seededVersion: SEED_VERSION - 1,
    seedVersion: SEED_VERSION,
    recommendedIds: [],
    alreadyOffered: [],
    installedIds: [],
    catalog: [],
    downloadableIds: [],
    ...overrides,
  });
}

const catalogo = (ids: readonly string[]) => ids.map((id) => ({ id }));

describe("siembra de defaults · 2.ª tanda (SEED_VERSION 16)", () => {
  it("sube SEED_VERSION a 16", () => {
    expect(SEED_VERSION).toBe(16);
  });

  it("incluye en RECOMMENDED las siete marcadas «siempre»", () => {
    for (const id of SIEMPRE) {
      expect(RECOMMENDED_PACKAGE_IDS).toContain(id);
    }
  });

  it("no incluye en RECOMMENDED ninguna de las «manual»", () => {
    for (const id of MANUAL) {
      expect(RECOMMENDED_PACKAGE_IDS).not.toContain(id);
    }
  });

  it("siembra las siete una sola vez", () => {
    const primera = plan({ recommendedIds: SIEMPRE, catalog: catalogo(SIEMPRE) });
    expect(primera).toEqual([...SIEMPRE]);

    const segunda = plan({
      seededVersion: SEED_VERSION,
      recommendedIds: SIEMPRE,
      alreadyOffered: SIEMPRE,
      catalog: catalogo(SIEMPRE),
    });
    expect(segunda).toEqual([]);
  });

  it("no vuelve a sembrar lo que la persona desinstaló", () => {
    const candidatos = plan({
      recommendedIds: ["lib-vikunja"],
      alreadyOffered: ["lib-vikunja"],
      catalog: catalogo(["lib-vikunja"]),
    });
    expect(candidatos).toEqual([]);
  });

  it("respeta lo que ya está instalado", () => {
    const candidatos = plan({
      recommendedIds: ["lib-trilium"],
      installedIds: ["lib-trilium"],
      catalog: catalogo(["lib-trilium"]),
    });
    expect(candidatos).toEqual([]);
  });

  it("no siembra paquetes comingSoon ni descargables", () => {
    const candidatos = plan({
      recommendedIds: ["lib-celld", "lib-sentry"],
      catalog: [{ id: "lib-celld", comingSoon: true }, { id: "lib-sentry" }],
      downloadableIds: ["lib-sentry"],
    });
    expect(candidatos).toEqual([]);
  });
});

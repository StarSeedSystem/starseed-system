import { describe, it, expect } from "vitest";
import {
  RECOMMENDED_PACKAGE_IDS,
  SEED_VERSION,
  selectSeedIds,
  type SeedCatalogEntry,
} from "../defaults-seed";

const SIEMPRE_2A = [
  "lib-vikunja",
  "lib-celld",
  "lib-sentry",
  "lib-windmill",
  "lib-metabase",
  "lib-trilium",
  "lib-politica-privacidad",
] as const;

const MANUAL_2A = [
  "lib-ruview",
  "lib-tirreno",
  "lib-digup",
  "lib-moli",
  "lib-openshell",
  "lib-coucou",
  "lib-dbx",
] as const;

function catalogo(ids: readonly string[]): SeedCatalogEntry[] {
  return ids.map((id) => ({ id }));
}

describe("defaults-seed · 2.ª tanda con «preinstalar: siempre»", () => {
  it("cada id recomendado aparece UNA sola vez (sin duplicados)", () => {
    expect(new Set(RECOMMENDED_PACKAGE_IDS).size).toBe(RECOMMENDED_PACKAGE_IDS.length);
  });

  it("sube la versión y añade las siete «siempre»", () => {
    expect(SEED_VERSION).toBe(16);
    for (const id of SIEMPRE_2A) {
      expect(RECOMMENDED_PACKAGE_IDS).toContain(id);
    }
    const deLaTanda = RECOMMENDED_PACKAGE_IDS.filter((id) => id.startsWith("lib-"));
    expect(deLaTanda.sort()).toEqual([...SIEMPRE_2A].sort());
  });

  it("no siembra ninguna «manual»", () => {
    for (const id of MANUAL_2A) {
      expect(RECOMMENDED_PACKAGE_IDS).not.toContain(id);
    }
  });

  it("con la versión nueva siembra las siete una sola vez", () => {
    const primera = selectSeedIds({
      currentVersion: SEED_VERSION - 1,
      seedVersion: SEED_VERSION,
      recommendedIds: RECOMMENDED_PACKAGE_IDS,
      catalog: catalogo(SIEMPRE_2A),
      alreadyOffered: [],
      installedIds: [],
    });
    expect(primera).toEqual([...SIEMPRE_2A]);

    const segunda = selectSeedIds({
      currentVersion: SEED_VERSION,
      seedVersion: SEED_VERSION,
      recommendedIds: RECOMMENDED_PACKAGE_IDS,
      catalog: catalogo(SIEMPRE_2A),
      alreadyOffered: primera,
      installedIds: primera,
    });
    expect(segunda).toEqual([]);
  });

  it("una desinstalada no vuelve: ya se ofreció y no está instalada", () => {
    const plan = selectSeedIds({
      currentVersion: SEED_VERSION - 1,
      seedVersion: SEED_VERSION,
      recommendedIds: RECOMMENDED_PACKAGE_IDS,
      catalog: catalogo(SIEMPRE_2A),
      alreadyOffered: ["lib-vikunja"],
      installedIds: [],
    });
    expect(plan).not.toContain("lib-vikunja");
    expect(plan).toEqual([...SIEMPRE_2A].filter((id) => id !== "lib-vikunja"));
  });

  it("respeta lo instalado, los descargables y los comingSoon", () => {
    const plan = selectSeedIds({
      currentVersion: 0,
      seedVersion: SEED_VERSION,
      recommendedIds: ["lib-vikunja", "lib-celld", "lib-sentry", "lib-windmill"],
      catalog: [
        { id: "lib-vikunja" },
        { id: "lib-celld", downloadable: true },
        { id: "lib-sentry", comingSoon: true },
        { id: "lib-windmill" },
      ],
      alreadyOffered: [],
      installedIds: ["lib-windmill"],
    });
    expect(plan).toEqual(["lib-vikunja"]);
  });

  it("una versión ya sembrada no hace nada", () => {
    const plan = selectSeedIds({
      currentVersion: SEED_VERSION,
      seedVersion: SEED_VERSION,
      recommendedIds: SIEMPRE_2A,
      catalog: catalogo(SIEMPRE_2A),
      alreadyOffered: [],
      installedIds: [],
    });
    expect(plan).toEqual([]);
  });
});

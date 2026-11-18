import { describe, it, expect } from "vitest";

import { IDS_SIEMBRA_TRADUCTOR } from "../traductor-1116";
import {
  RECOMMENDED_PACKAGE_IDS,
  SEED_VERSION,
  selectSeedIds,
  type SeedCatalogEntry,
} from "../defaults-seed";

function catalogo(ids: readonly string[]): SeedCatalogEntry[] {
  return ids.map((id) => ({ id }));
}

describe("defaults-seed · Traductor (TU31 · TRA1116-APP-F1)", () => {
  it("la versión de siembra sube a 26", () => {
    expect(SEED_VERSION).toBe(26);
  });

  it("IDS_SIEMBRA_TRADUCTOR está en RECOMMENDED_PACKAGE_IDS", () => {
    for (const id of IDS_SIEMBRA_TRADUCTOR) {
      expect(RECOMMENDED_PACKAGE_IDS).toContain(id);
    }
  });

  it("cuenta nueva recibe el Traductor en la siembra", () => {
    const plan = selectSeedIds({
      currentVersion: 0,
      seedVersion: SEED_VERSION,
      recommendedIds: RECOMMENDED_PACKAGE_IDS,
      catalog: catalogo(IDS_SIEMBRA_TRADUCTOR),
      alreadyOffered: [],
      installedIds: [],
    });
    expect(plan).toEqual(IDS_SIEMBRA_TRADUCTOR);
  });

  it("cuenta que ya tiene el Traductor instalado no lo recibe de nuevo", () => {
    const plan = selectSeedIds({
      currentVersion: SEED_VERSION - 1,
      seedVersion: SEED_VERSION,
      recommendedIds: RECOMMENDED_PACKAGE_IDS,
      catalog: catalogo(IDS_SIEMBRA_TRADUCTOR),
      alreadyOffered: [],
      installedIds: IDS_SIEMBRA_TRADUCTOR,
    });
    expect(plan).toEqual([]);
  });

  it("cuenta que desinstaló el Traductor tras ofrecérsele no lo recupera", () => {
    const plan = selectSeedIds({
      currentVersion: SEED_VERSION - 1,
      seedVersion: SEED_VERSION,
      recommendedIds: RECOMMENDED_PACKAGE_IDS,
      catalog: catalogo(IDS_SIEMBRA_TRADUCTOR),
      alreadyOffered: IDS_SIEMBRA_TRADUCTOR,
      installedIds: [],
    });
    expect(plan).toEqual([]);
  });
});
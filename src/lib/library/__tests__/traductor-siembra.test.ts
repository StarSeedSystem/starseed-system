import { describe, it, expect } from "vitest";
import {
  RECOMMENDED_PACKAGE_IDS,
  SEED_VERSION,
  selectSeedIds,
  type SeedCatalogEntry,
} from "../defaults-seed";
import { IDS_SIEMBRA_TRADUCTOR } from "../traductor-1116";

const TRADUCTOR_ID = IDS_SIEMBRA_TRADUCTOR[0];

function catalogo(ids: readonly string[]): SeedCatalogEntry[] {
  return ids.map((id) => ({ id }));
}

describe("defaults-seed · TU31 Traductor preinstalado (siembra versión 26)", () => {
  it("la versión de siembra sube a 26", () => {
    expect(SEED_VERSION).toBe(26);
  });

  it("IDS_SIEMBRA_TRADUCTOR está incluido en RECOMMENDED_PACKAGE_IDS", () => {
    expect(RECOMMENDED_PACKAGE_IDS).toContain(TRADUCTOR_ID);
  });

  it("una cuenta nueva recibe el traductor en la siembra", () => {
    const plan = selectSeedIds({
      currentVersion: 0,
      seedVersion: SEED_VERSION,
      recommendedIds: RECOMMENDED_PACKAGE_IDS,
      catalog: catalogo([TRADUCTOR_ID]),
      alreadyOffered: [],
      installedIds: [],
    });
    expect(plan).toContain(TRADUCTOR_ID);
  });

  it("una cuenta que ya tiene el traductor instalado no lo recibe de nuevo", () => {
    const plan = selectSeedIds({
      currentVersion: SEED_VERSION - 1,
      seedVersion: SEED_VERSION,
      recommendedIds: RECOMMENDED_PACKAGE_IDS,
      catalog: catalogo([TRADUCTOR_ID]),
      alreadyOffered: [],
      installedIds: [TRADUCTOR_ID],
    });
    expect(plan).not.toContain(TRADUCTOR_ID);
  });

  it("una cuenta que desinstaló el traductor tras ofrecérsele no lo recupera", () => {
    const plan = selectSeedIds({
      currentVersion: SEED_VERSION - 1,
      seedVersion: SEED_VERSION,
      recommendedIds: RECOMMENDED_PACKAGE_IDS,
      catalog: catalogo([TRADUCTOR_ID]),
      alreadyOffered: [TRADUCTOR_ID],
      installedIds: [],
    });
    expect(plan).not.toContain(TRADUCTOR_ID);
  });

  it("el traductor no es comingSoon ni descargable: instalar solo registra su enlace", () => {
    const plan = selectSeedIds({
      currentVersion: SEED_VERSION - 1,
      seedVersion: SEED_VERSION,
      recommendedIds: RECOMMENDED_PACKAGE_IDS,
      catalog: [{ id: TRADUCTOR_ID, comingSoon: false, downloadable: false }],
      alreadyOffered: [],
      installedIds: [],
    });
    expect(plan).toContain(TRADUCTOR_ID);
  });
});
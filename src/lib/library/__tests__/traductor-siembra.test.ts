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

describe("defaults-seed · Traductor Universal (TU31 · TRA1116-APP-F1)", () => {
  it("la versión sube a 26 e incluye app-traductor en la recomendación", () => {
    expect(SEED_VERSION).toBe(26);
    expect(RECOMMENDED_PACKAGE_IDS).toContain(TRADUCTOR_ID);
    expect(IDS_SIEMBRA_TRADUCTOR).toEqual([TRADUCTOR_ID]);
  });

  it("la lista sembrada no repite ningún id", () => {
    expect(new Set(RECOMMENDED_PACKAGE_IDS).size).toBe(RECOMMENDED_PACKAGE_IDS.length);
  });

  it("cuenta nueva: recibe el Traductor en la siembra", () => {
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

  it("cuenta que ya lo tiene instalado: no lo vuelve a sembrar", () => {
    const plan = selectSeedIds({
      currentVersion: SEED_VERSION - 1,
      seedVersion: SEED_VERSION,
      recommendedIds: RECOMMENDED_PACKAGE_IDS,
      catalog: catalogo([TRADUCTOR_ID]),
      alreadyOffered: [],
      installedIds: [TRADUCTOR_ID],
    });
    expect(plan).not.toContain(TRADUCTOR_ID);
    expect(plan).toEqual([]);
  });

  it("cuenta que lo desinstaló tras ofrecerse: no vuelve a tenerlo (ya ofrecido lo bloquea)", () => {
    const plan = selectSeedIds({
      currentVersion: SEED_VERSION - 1,
      seedVersion: SEED_VERSION,
      recommendedIds: RECOMMENDED_PACKAGE_IDS,
      catalog: catalogo([TRADUCTOR_ID]),
      alreadyOffered: [TRADUCTOR_ID],
      installedIds: [],
    });
    expect(plan).not.toContain(TRADUCTOR_ID);
    expect(plan).toEqual([]);
  });

  it("el id no es comingSoon ni descargable: instalar solo registra el enlace", () => {
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

  it("si la versión ya está sembrada no hace nada", () => {
    const plan = selectSeedIds({
      currentVersion: SEED_VERSION,
      seedVersion: SEED_VERSION,
      recommendedIds: RECOMMENDED_PACKAGE_IDS,
      catalog: catalogo([TRADUCTOR_ID]),
      alreadyOffered: [],
      installedIds: [],
    });
    expect(plan).toEqual([]);
  });
});
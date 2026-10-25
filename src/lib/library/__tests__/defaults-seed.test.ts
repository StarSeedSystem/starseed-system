import { describe, it, expect } from "vitest";
import {
  RECOMMENDED_PACKAGE_IDS,
  SEED_VERSION,
  selectSeedIds,
  type SeedCatalogEntry,
} from "../defaults-seed";
import { FICHAS_REPOS_1025, IDS_SIEMBRA_1025, TANDA_1025_FICHAS } from "../repos-1025";

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
  it("sube la versión (17) y mantiene las siete «siempre» de la 2.ª tanda", () => {
    expect(SEED_VERSION).toBe(17);
    for (const id of SIEMPRE_2A) {
      expect(RECOMMENDED_PACKAGE_IDS).toContain(id);
    }
    // Los `lib-` sembrados son los de la 2.ª tanda más los de la tanda 1025 (que llegan de su JSON).
    const deLasTandas = RECOMMENDED_PACKAGE_IDS.filter((id) => id.startsWith("lib-"));
    const esperados = [...SIEMPRE_2A, ...IDS_SIEMBRA_1025.filter((id) => id.startsWith("lib-"))];
    expect(deLasTandas.sort()).toEqual(Array.from(new Set(esperados)).sort());
  });

  it("la lista sembrada no repite ningún id (una repetición instalaría dos veces)", () => {
    expect(new Set(RECOMMENDED_PACKAGE_IDS).size).toBe(RECOMMENDED_PACKAGE_IDS.length);
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

  it("un id recomendado que ya no está en el catálogo no se siembra", () => {
    const plan = selectSeedIds({
      currentVersion: 0,
      seedVersion: SEED_VERSION,
      recommendedIds: ["lib-vikunja", "lib-retirado"],
      catalog: catalogo(["lib-vikunja"]),
      alreadyOffered: [],
      installedIds: [],
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

describe("defaults-seed · tanda 1025 («todas las repos, preinstaladas y autoactualizadas»)", () => {
  const nuevas = FICHAS_REPOS_1025.map((f) => f.id);

  it("siembra las 26 fichas nuevas y la ficha vieja que ahora sigue su repo (iatool-crewai)", () => {
    expect(nuevas).toHaveLength(26);
    for (const id of nuevas) expect(RECOMMENDED_PACKAGE_IDS).toContain(id);
    expect(RECOMMENDED_PACKAGE_IDS).toContain("iatool-crewai");
  });

  it("toda ficha «siempre» del JSON acaba sembrada (con su id o el de la ficha que la absorbe)", () => {
    for (const f of TANDA_1025_FICHAS) {
      if (f.preinstalar !== "siempre" || f.id_en_catalogo !== undefined) continue;
      expect(RECOMMENDED_PACKAGE_IDS).toContain(f.fusionar_en ?? f.id);
    }
  });

  it("ninguna ficha de la tanda es comingSoon ni descargable: la siembra solo registra enlaces", () => {
    const plan = selectSeedIds({
      currentVersion: 16,
      seedVersion: SEED_VERSION,
      recommendedIds: RECOMMENDED_PACKAGE_IDS,
      catalog: FICHAS_REPOS_1025.map((f) => ({ id: f.id, comingSoon: f.comingSoon })),
      alreadyOffered: [],
      installedIds: [],
    });
    expect(plan.sort()).toEqual([...nuevas].sort());
  });

  it("quien ya tenía la 16 recibe solo el delta: una desinstalada no vuelve", () => {
    const plan = selectSeedIds({
      currentVersion: 16,
      seedVersion: SEED_VERSION,
      recommendedIds: RECOMMENDED_PACKAGE_IDS,
      catalog: FICHAS_REPOS_1025.map((f) => ({ id: f.id })),
      alreadyOffered: [...RECOMMENDED_PACKAGE_IDS.filter((id) => !nuevas.includes(id)), "lib-nanobot"],
      installedIds: [],
    });
    expect(plan).not.toContain("lib-nanobot");
    expect(plan).toHaveLength(nuevas.length - 1);
  });
});

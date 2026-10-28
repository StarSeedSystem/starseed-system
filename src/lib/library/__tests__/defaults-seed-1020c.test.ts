import { describe, it, expect } from "vitest";
import {
  IDS_SIEMBRA_1020C,
  RECOMMENDED_PACKAGE_IDS,
  SEED_VERSION,
  selectSeedIds,
  type SeedCatalogEntry,
} from "../defaults-seed";
import { PAQUETES_EXTERNOS } from "../repos-externos-1020";

// Las «siempre» de config/repos-libreria-1020c.json (Ola 1020T), 8 de 9: lib-penpot
// no entra porque su repo ya está como iatool-penpot (duplicada descartada por el cargador).
const SIEMPRE_3T = [
  "lib-openworker",
  "lib-openwhispr",
  "lib-pocketbase",
  "lib-openmaic",
  "lib-chatwoot",
  "lib-excalidraw",
  "lib-nextcloud",
  "lib-supra-tex",
] as const;

// Las «manual» de la misma tanda: nunca se siembran (descargan o ejecutan código,
// piden telemetría apagada o dependen de proveedores de pago).
const MANUAL_3T = [
  "lib-trail-code",
  "lib-img2threejs",
  "lib-paperclip",
  "lib-magnitude",
  "lib-artcraft",
] as const;

function catalogoDeLaTanda(): SeedCatalogEntry[] {
  return SIEMPRE_3T.map((id) => ({ id }));
}

describe("defaults-seed · 3.ª tanda (1020c) con «preinstalar: siempre»", () => {
  it("sube la versión (22) y declara exactamente las 8 «siempre» de la tanda", () => {
    expect(SEED_VERSION).toBe(22);
    expect(IDS_SIEMBRA_1020C).toEqual([...SIEMPRE_3T]);
  });

  it("cada id recomendado aparece una sola vez en la lista (sin repetir)", () => {
    for (const id of SIEMPRE_3T) {
      expect(RECOMMENDED_PACKAGE_IDS.filter((x) => x === id)).toHaveLength(1);
    }
  });

  it("el cargador sí mantiene las 8 como «siempre» y descartó lib-penpot por duplicada", () => {
    for (const id of SIEMPRE_3T) {
      const entrada = PAQUETES_EXTERNOS.find((p) => p.id === id);
      expect(entrada, `falta ${id}`).toBeDefined();
      expect(entrada?.preinstalar, id).toBe("siempre");
    }
    expect(IDS_SIEMBRA_1020C).not.toContain("lib-penpot");
    expect(PAQUETES_EXTERNOS.some((p) => p.id === "lib-penpot")).toBe(false);
  });

  it("no siembra ninguna «manual»", () => {
    for (const id of MANUAL_3T) {
      expect(IDS_SIEMBRA_1020C).not.toContain(id);
      expect(RECOMMENDED_PACKAGE_IDS).not.toContain(id);
    }
  });
});

describe("defaults-seed · decisiones puras de la 3.ª tanda (selectSeedIds)", () => {
  it("con la versión nueva se siembran una sola vez", () => {
    const primera = selectSeedIds({
      currentVersion: SEED_VERSION - 1,
      seedVersion: SEED_VERSION,
      recommendedIds: RECOMMENDED_PACKAGE_IDS,
      catalog: catalogoDeLaTanda(),
      alreadyOffered: [],
      installedIds: [],
    });
    expect(primera).toEqual([...SIEMPRE_3T]);

    const segunda = selectSeedIds({
      currentVersion: SEED_VERSION,
      seedVersion: SEED_VERSION,
      recommendedIds: RECOMMENDED_PACKAGE_IDS,
      catalog: catalogoDeLaTanda(),
      alreadyOffered: primera,
      installedIds: primera,
    });
    expect(segunda).toEqual([]);
  });

  it("quien ya tenía la 21 recibe solo el delta de la 22", () => {
    const plan = selectSeedIds({
      currentVersion: 21,
      seedVersion: SEED_VERSION,
      recommendedIds: RECOMMENDED_PACKAGE_IDS,
      catalog: catalogoDeLaTanda(),
      alreadyOffered: RECOMMENDED_PACKAGE_IDS.filter((id) => !SIEMPRE_3T.includes(id as (typeof SIEMPRE_3T)[number])),
      installedIds: [],
    });
    expect(plan.sort()).toEqual([...SIEMPRE_3T].sort());
  });

  it("una desinstalada no vuelve: ya se ofreció y no está instalada", () => {
    const plan = selectSeedIds({
      currentVersion: 21,
      seedVersion: SEED_VERSION,
      recommendedIds: RECOMMENDED_PACKAGE_IDS,
      catalog: catalogoDeLaTanda(),
      alreadyOffered: ["lib-openmaic"],
      installedIds: [],
    });
    expect(plan).toEqual([...SIEMPRE_3T].filter((id) => id !== "lib-openmaic"));
  });

  it("la defensa se mantiene: ni comingSoon ni descargables se auto-instalan", () => {
    const plan = selectSeedIds({
      currentVersion: 21,
      seedVersion: SEED_VERSION,
      recommendedIds: IDS_SIEMBRA_1020C,
      catalog: [
        { id: "lib-openworker", comingSoon: true },
        { id: "lib-openwhispr", downloadable: true },
        { id: "lib-pocketbase" },
        { id: "lib-openmaic" },
        { id: "lib-chatwoot" },
        { id: "lib-excalidraw" },
        { id: "lib-nextcloud" },
        { id: "lib-supra-tex" },
      ],
      alreadyOffered: [],
      installedIds: [],
    });
    expect(plan).not.toContain("lib-openworker");
    expect(plan).not.toContain("lib-openwhispr");
    expect(plan).toHaveLength(SIEMPRE_3T.length - 2);
  });
});

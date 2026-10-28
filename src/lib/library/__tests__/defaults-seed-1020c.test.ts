import { describe, it, expect } from "vitest";
import {
  RECOMMENDED_PACKAGE_IDS,
  SEED_VERSION,
  selectSeedIds,
  type SeedCatalogEntry,
} from "../defaults-seed";
import { REPO_EXTERNOS_1020 } from "../repos-externos-1020";
import catalogo1020c from "../../../../config/repos-libreria-1020c.json";

interface Entrada1020c { id: string; preinstalar?: string; repo: string; efecto?: string }
interface Catalogo1020c { paquetes: Entrada1020c[] }
const TANDA_3 = (catalogo1020c as unknown as Catalogo1020c).paquetes;

const SIEMPRE_3A: string[] = TANDA_3
  .filter((p) => p.preinstalar === "siempre" && p.id !== "lib-penpot")
  .map((p) => p.id);

function catalogo(ids: readonly string[]): SeedCatalogEntry[] {
  return ids.map((id) => ({ id }));
}

describe("defaults-seed · 3.ª tanda de repos (1020c) · «siempre»", () => {
  it("sube la versión de siembra por encima de la anterior (21)", () => {
    expect(SEED_VERSION).toBeGreaterThanOrEqual(22);
  });

  it("las ocho «siempre» que el cargador dejó pasar están sembradas", () => {
    for (const id of SIEMPRE_3A) {
      expect(RECOMMENDED_PACKAGE_IDS, id).toContain(id);
    }
  });

  it("toda ficha «siempre» del JSON acaba activa: con su id o ya dentro de iatool-penpot", () => {
    for (const p of TANDA_3) {
      if (p.preinstalar !== "siempre") continue;
      if (p.id === "lib-penpot") {
        expect(RECOMMENDED_PACKAGE_IDS).not.toContain("lib-penpot");
        expect(RECOMMENDED_PACKAGE_IDS).toContain("iatool-penpot");
      } else {
        expect(RECOMMENDED_PACKAGE_IDS, p.id).toContain(p.id);
      }
    }
  });

  it("ninguna «manual» entra en la siembra", () => {
    for (const p of TANDA_3) {
      if (p.preinstalar === "manual") {
        expect(RECOMMENDED_PACKAGE_IDS).not.toContain(p.id);
      }
    }
  });

  it("la lista sembrada no repite ningún id (repetir sería instalar dos veces)", () => {
    expect(new Set(RECOMMENDED_PACKAGE_IDS).size).toBe(RECOMMENDED_PACKAGE_IDS.length);
  });

  it("las ocho existen en el repo builtin que arma el cargador", () => {
    const deRepos = REPO_EXTERNOS_1020.packages.map((p) => p.id);
    for (const id of SIEMPRE_3A) {
      expect(deRepos, `el cargador no tiene ${id}`).toContain(id);
    }
  });
});

describe("defaults-seed · la 3.ª tanda se siembra UNA sola vez", () => {
  it("con la versión nueva salen exactamente las «siempre»: ni manuales ni nada más", () => {
    const idsDelJson = TANDA_3.map((p) => p.id);
    const primera = selectSeedIds({
      currentVersion: SEED_VERSION - 1,
      seedVersion: SEED_VERSION,
      recommendedIds: RECOMMENDED_PACKAGE_IDS,
      catalog: catalogo(idsDelJson),
      alreadyOffered: [],
      installedIds: [],
    });
    expect(primera.sort()).toEqual([...SIEMPRE_3A].sort());

    const segunda = selectSeedIds({
      currentVersion: SEED_VERSION,
      seedVersion: SEED_VERSION,
      recommendedIds: RECOMMENDED_PACKAGE_IDS,
      catalog: catalogo(idsDelJson),
      alreadyOffered: primera,
      installedIds: primera,
    });
    expect(segunda).toEqual([]);
  });

  it("una desinstalada no vuelve: ya se ofreció en la 3.ª tanda", () => {
    const idsDelJson = TANDA_3.map((p) => p.id);
    const plan = selectSeedIds({
      currentVersion: SEED_VERSION - 1,
      seedVersion: SEED_VERSION,
      recommendedIds: RECOMMENDED_PACKAGE_IDS,
      catalog: catalogo(idsDelJson),
      alreadyOffered: ["lib-excalidraw"],
      installedIds: [],
    });
    expect(plan).not.toContain("lib-excalidraw");
    expect(plan.sort()).toEqual([...SIEMPRE_3A].filter((id) => id !== "lib-excalidraw").sort());
  });
});

import { describe, it, expect } from "vitest";
import {
  RECOMMENDED_PACKAGE_IDS,
  SEED_VERSION,
  selectSeedIds,
  type SeedCatalogEntry,
} from "../defaults-seed";
import { PAQUETES_EXTERNOS, REPOS_YA_PRESENTES } from "../repos-externos-1020";

// Las 5 «siempre» de la 4.ª tanda que el cargador crea: instalar SOLO registra ficha,
// enlace o conector; nada se descarga, se ejecuta ni se abre durante la siembra.
const SIEMPRE_4A = [
  "lib-comfyui",
  "lib-harness2",
  "lib-libretranslate",
  "lib-archivebox",
  "lib-localsend",
] as const;

// Las «manual» NO se siembran: gallery-dl usa credenciales y cookies; OpenRig toca Claude/Codex.
const MANUAL_4A = ["lib-gallery-dl", "lib-openrig"] as const;
// Los ids «siempre» que el cargador NO crea porque ya existen como iatool-* (se quedan como están).
const YA_PRESENTES_4A = [
  { repo: "coollabsio/coolify", id: "iatool-coolify" },
  { repo: "OpenHands/OpenHands", id: "iatool-openhands" },
  { repo: "Stirling-Tools/Stirling-PDF", id: "iatool-stirling-pdf" },
] as const;
const CUARTA_TANDA = [
  ...SIEMPRE_4A,
  ...MANUAL_4A,
  ...YA_PRESENTES_4A.map((p) => p.id),
] as const;
function catalogo(ids: readonly string[]): SeedCatalogEntry[] {
  return ids.map((id) => ({ id }));
}

describe("defaults-seed · 4.ª tanda (Ola 1020U, solo sus «siempre» que crea el cargador)", () => {
  it("sube la versión a 23, una más que la 22 de la 3.ª tanda", () => {
    expect(SEED_VERSION).toBe(23);
    expect(SEED_VERSION).toBeGreaterThan(22);
  });

  it("las 5 «siempre» nuevas quedan en la recomendación y las «manual» no entran", () => {
    for (const id of SIEMPRE_4A) {
      expect(RECOMMENDED_PACKAGE_IDS, id).toContain(id);
    }
    for (const id of MANUAL_4A) {
      expect(RECOMMENDED_PACKAGE_IDS, id).not.toContain(id);
    }
    // Sin repetición: un id duplicado instalaría dos veces.
    expect(new Set(RECOMMENDED_PACKAGE_IDS).size).toBe(RECOMMENDED_PACKAGE_IDS.length);
  });

  it("regla del cargador: crea las 5 «siempre» y no duplica Coolify, OpenHands ni Stirling-PDF", () => {
    const ids = PAQUETES_EXTERNOS.map((p) => p.id);
    for (const id of SIEMPRE_4A) {
      expect(ids, id).toContain(id);
    }
    for (const id of MANUAL_4A) {
      expect(ids, id).toContain(id); // el cargador las crea; la siembra es lo que las deja fuera
    }
    for (const { repo, id } of YA_PRESENTES_4A) {
      expect(REPOS_YA_PRESENTES).toContainEqual({ repo, id });
      expect(ids, id).not.toContain(id.replace("iatool-", "lib-"));
    }
    // Cada id de la 4.ª tanda que el cargador crea se siembra si y solo si es «siempre».
    const creadas = PAQUETES_EXTERNOS.filter((p) => (CUARTA_TANDA as readonly string[]).includes(p.id));
    for (const p of creadas) {
      const debeSembrarse = p.preinstalar === "siempre";
      expect(RECOMMENDED_PACKAGE_IDS.includes(p.id), p.id).toBe(debeSembrarse);
    }
  });

  it("sembradas una sola vez: la primera versión da las 5 y la repetición no da nada", () => {
    const primera = selectSeedIds({
      currentVersion: SEED_VERSION - 1,
      seedVersion: SEED_VERSION,
      recommendedIds: RECOMMENDED_PACKAGE_IDS,
      catalog: catalogo(SIEMPRE_4A),
      alreadyOffered: [],
      installedIds: [],
    });
    expect(primera.sort()).toEqual([...SIEMPRE_4A].sort());

    const repetida = selectSeedIds({
      currentVersion: SEED_VERSION,
      seedVersion: SEED_VERSION,
      recommendedIds: RECOMMENDED_PACKAGE_IDS,
      catalog: catalogo(SIEMPRE_4A),
      alreadyOffered: primera,
      installedIds: primera,
    });
    expect(repetida).toEqual([]);
  });

  it("quien ya tenía la 22 recibe solo el delta de la 23: una desinstalada no vuelve", () => {
    const nuevas = [...SIEMPRE_4A] as string[];
    const anteriores = RECOMMENDED_PACKAGE_IDS.filter((id) => !nuevas.includes(id));
    const plan = selectSeedIds({
      currentVersion: 22,
      seedVersion: SEED_VERSION,
      recommendedIds: RECOMMENDED_PACKAGE_IDS,
      catalog: catalogo(RECOMMENDED_PACKAGE_IDS),
      alreadyOffered: anteriores,
      installedIds: [],
    });
    expect(plan.sort()).toEqual(nuevas.sort());

    const sinUna = plan.filter((id) => id !== "lib-comfyui");
    const replan = selectSeedIds({
      currentVersion: 22,
      seedVersion: SEED_VERSION,
      recommendedIds: RECOMMENDED_PACKAGE_IDS,
      catalog: catalogo(RECOMMENDED_PACKAGE_IDS),
      alreadyOffered: [...anteriores, "lib-comfyui"],
      installedIds: [],
    });
    expect(replan.sort()).toEqual(sinUna.sort());
  });
});

import { describe, it, expect } from "vitest";
import {
  RECOMMENDED_PACKAGE_IDS,
  SEED_VERSION,
  selectSeedIds,
  type SeedCatalogEntry,
} from "../defaults-seed";
import { PAQUETES_EXTERNOS, REPOS_YA_PRESENTES } from "../repos-externos-1020";

// Las 8 «siempre» de la 3.ª tanda (config/repos-libreria-1020c.json) que el cargador
// no descartó por duplicado: instalar cada una SOLO registra ficha/enlace o deja
// listo su conector; nada se descarga, ejecuta o abre ruta durante la siembra.
const SIEMPRE_3A = [
  "lib-openworker",
  "lib-openwhispr",
  "lib-pocketbase",
  "lib-openmaic",
  "lib-chatwoot",
  "lib-excalidraw",
  "lib-nextcloud",
  "lib-supra-tex",
] as const;

// Las «manual» de la 3.ª tanda NO se siembran: su instalación descarga y ejecuta
// código (o depende de proveedores de pago / telemetría), y la decide la persona.
const MANUAL_3A = [
  "lib-trail-code",
  "lib-img2threejs",
  "lib-paperclip",
  "lib-magnitude",
  "lib-artcraft",
] as const;

// Los ids de la 3.ª tanda con los que ya contaba el cargador (13 fichas).
const TERCERA_TANDA = [...SIEMPRE_3A, "lib-penpot", ...MANUAL_3A] as const;

function catalogo(ids: readonly string[]): SeedCatalogEntry[] {
  return ids.map((id) => ({ id }));
}

describe("defaults-seed · 3.ª tanda (Ola 1020T, solo sus «siempre» sembrables)", () => {
  it("sube la versión a 22 (una más que la 21 de LNN1028)", () => {
    expect(SEED_VERSION).toBe(22);
  });

  it("sembradas una sola vez: la primera version da las 8 y la repetición no da nada", () => {
    const primera = selectSeedIds({
      currentVersion: SEED_VERSION - 1,
      seedVersion: SEED_VERSION,
      recommendedIds: RECOMMENDED_PACKAGE_IDS,
      catalog: catalogo(SIEMPRE_3A),
      alreadyOffered: [],
      installedIds: [],
    });
    expect(primera.sort()).toEqual([...SIEMPRE_3A].sort());

    const repetida = selectSeedIds({
      currentVersion: SEED_VERSION,
      seedVersion: SEED_VERSION,
      recommendedIds: RECOMMENDED_PACKAGE_IDS,
      catalog: catalogo(SIEMPRE_3A),
      alreadyOffered: primera,
      installedIds: primera,
    });
    expect(repetida).toEqual([]);
  });

  it("las 8 «siempre» quedan en la recomendación y ninguna «manual» entra", () => {
    for (const id of SIEMPRE_3A) {
      expect(RECOMMENDED_PACKAGE_IDS, id).toContain(id);
    }
    for (const id of MANUAL_3A) {
      expect(RECOMMENDED_PACKAGE_IDS, id).not.toContain(id);
    }
    // La «siempre» lib-penpot NO se siembra: ya existe iatool-penpot y el cargador no la duplica.
    expect(RECOMMENDED_PACKAGE_IDS).not.toContain("lib-penpot");
    expect(REPOS_YA_PRESENTES).toContainEqual({ repo: "penpot/penpot", id: "iatool-penpot" });
    // Sin repetición: un id duplicado instalaría dos veces.
    expect(new Set(RECOMMENDED_PACKAGE_IDS).size).toBe(RECOMMENDED_PACKAGE_IDS.length);
  });

  it("regla del cargador: del catálogo de la 3.ª tanda, cada «siempre» acaba sembrada (menos penpot) y las «manual» fuera", () => {
    const deLaTanda = PAQUETES_EXTERNOS.filter((p) => (TERCERA_TANDA as readonly string[]).includes(p.id));
    expect(deLaTanda).toHaveLength(13); // 14 fichas − penpot duplicado; open-kritt queda excluida
    for (const p of deLaTanda) {
      const siembra = p.preinstalar === "siempre" && p.id !== "lib-penpot";
      expect(siembra, p.id).toBe(RECOMMENDED_PACKAGE_IDS.includes(p.id));
    }
  });

  it("quien ya tenía la 21 recibe solo el delta de la 22: una desinstalada no vuelve", () => {
    const nuevas = [...SIEMPRE_3A] as string[];
    const plan = selectSeedIds({
      currentVersion: 21,
      seedVersion: SEED_VERSION,
      recommendedIds: RECOMMENDED_PACKAGE_IDS,
      catalog: catalogo(RECOMMENDED_PACKAGE_IDS),
      alreadyOffered: RECOMMENDED_PACKAGE_IDS.filter((id) => !nuevas.includes(id)),
      installedIds: [],
    });
    expect(plan.sort()).toEqual(nuevas.sort());

    const sinUna = plan.filter((id) => id !== "lib-openworker");
    const replan = selectSeedIds({
      currentVersion: 21,
      seedVersion: SEED_VERSION,
      recommendedIds: RECOMMENDED_PACKAGE_IDS,
      catalog: catalogo(RECOMMENDED_PACKAGE_IDS),
      alreadyOffered: [...RECOMMENDED_PACKAGE_IDS.filter((id) => !nuevas.includes(id)), "lib-openworker"],
      installedIds: [],
    });
    expect(replan.sort()).toEqual(sinUna.sort());
  });
});

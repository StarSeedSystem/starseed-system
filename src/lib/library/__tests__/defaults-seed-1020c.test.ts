import { describe, it, expect } from "vitest";
import {
  IDS_SIEMBRA_1020C,
  RECOMMENDED_PACKAGE_IDS,
  SEED_VERSION,
  selectSeedIds,
  type SeedCatalogEntry,
} from "../defaults-seed";
import { PAQUETES_EXTERNOS } from "../repos-externos-1020";
import catalogo1020c from "../../../../config/repos-libreria-1020c.json";

interface EntradaJson {
  id: string;
  preinstalar?: string;
}

const paquetes1020c = (catalogo1020c as { paquetes: EntradaJson[] }).paquetes;

/** Las «siempre» de la 3.ª tanda: las 9 del JSON MENOS Penpot (ya está como iatool-penpot). */
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

/** Las «manual» de la 3.ª tanda: ejecutan código, piden servidor o dependen de proveedores de pago. */
const MANUAL_3A = [
  "lib-trail-code",
  "lib-img2threejs",
  "lib-paperclip",
  "lib-magnitude",
  "lib-artcraft",
] as const;

function catalogo(ids: readonly string[]): SeedCatalogEntry[] {
  return ids.map((id) => ({ id }));
}

describe("defaults-seed · 3.ª tanda con «preinstalar: siempre» (Ola 1020T)", () => {
  it("sube la versión de siembra en 1 sobre la anterior (21 → 22)", () => {
    expect(SEED_VERSION).toBe(22);
  });

  it("siembra exactamente las 8 «siempre» que no duplican una ficha previa", () => {
    expect(IDS_SIEMBRA_1020C.sort()).toEqual([...SIEMPRE_3A].sort());
    for (const id of SIEMPRE_3A) {
      expect(RECOMMENDED_PACKAGE_IDS).toContain(id);
    }
  });

  it("toda «siempre» del JSON acaba sembrada, salvo Penpot que ya estaba", () => {
    for (const p of paquetes1020c) {
      if (p.preinstalar !== "siempre") continue;
      if (p.id === "lib-penpot") {
        // Duplicada: Penpot ya entró como iatool-penpot en la SEED_VERSION 15.
        expect(IDS_SIEMBRA_1020C).not.toContain("lib-penpot");
        expect(RECOMMENDED_PACKAGE_IDS).toContain("iatool-penpot");
        continue;
      }
      expect(RECOMMENDED_PACKAGE_IDS).toContain(p.id);
    }
  });

  it("el cargador no descartó ninguna «siempre»: los 8 ids viven en la Biblioteca externa", () => {
    const idsCargador = new Set(PAQUETES_EXTERNOS.map((p) => p.id));
    for (const id of SIEMPRE_3A) {
      expect(idsCargador.has(id)).toBe(true);
    }
  });

  it("no siembra ninguna «manual»", () => {
    for (const id of MANUAL_3A) {
      expect(IDS_SIEMBRA_1020C).not.toContain(id);
      expect(RECOMMENDED_PACKAGE_IDS).not.toContain(id);
    }
  });

  it("la lista sembrada no repite ningún id (una repetición instalaría dos veces en el mismo arranque)", () => {
    expect(new Set(RECOMMENDED_PACKAGE_IDS).size).toBe(RECOMMENDED_PACKAGE_IDS.length);
  });

  it("se siembran una sola vez: con la versión nueva entra el delta y en la segunda pasada ya no queda nada", () => {
    const primera = selectSeedIds({
      currentVersion: SEED_VERSION - 1,
      seedVersion: SEED_VERSION,
      recommendedIds: RECOMMENDED_PACKAGE_IDS,
      catalog: catalogo(SIEMPRE_3A),
      alreadyOffered: [],
      installedIds: [],
    });
    expect(primera.sort()).toEqual([...SIEMPRE_3A].sort());

    const segunda = selectSeedIds({
      currentVersion: SEED_VERSION,
      seedVersion: SEED_VERSION,
      recommendedIds: RECOMMENDED_PACKAGE_IDS,
      catalog: catalogo(SIEMPRE_3A),
      alreadyOffered: primera,
      installedIds: primera,
    });
    expect(segunda).toEqual([]);
  });

  it("una «siempre» que la persona desinstaló no vuelve sola", () => {
    const plan = selectSeedIds({
      currentVersion: SEED_VERSION - 1,
      seedVersion: SEED_VERSION,
      recommendedIds: RECOMMENDED_PACKAGE_IDS,
      catalog: catalogo(SIEMPRE_3A),
      alreadyOffered: ["lib-excalidraw"],
      installedIds: [],
    });
    expect(plan).not.toContain("lib-excalidraw");
    expect(plan.sort()).toEqual([...SIEMPRE_3A].filter((id) => id !== "lib-excalidraw").sort());
  });

  it("respeta lo instalado, los descargables y los comingSoon de la decisión pura", () => {
    const plan = selectSeedIds({
      currentVersion: SEED_VERSION - 1,
      seedVersion: SEED_VERSION,
      recommendedIds: ["lib-openworker", "lib-pocketbase", "lib-chatwoot", "lib-supra-tex"],
      catalog: [
        { id: "lib-openworker" },
        { id: "lib-pocketbase", downloadable: true },
        { id: "lib-chatwoot", comingSoon: true },
        { id: "lib-supra-tex" },
      ],
      alreadyOffered: [],
      installedIds: ["lib-supra-tex"],
    });
    expect(plan).toEqual(["lib-openworker"]);
  });

  it("un id recomendado que ya no está en el catálogo no se siembra", () => {
    const plan = selectSeedIds({
      currentVersion: SEED_VERSION - 1,
      seedVersion: SEED_VERSION,
      recommendedIds: ["lib-openwhispr", "lib-retirado-1020c"],
      catalog: catalogo(["lib-openwhispr"]),
      alreadyOffered: [],
      installedIds: [],
    });
    expect(plan).toEqual(["lib-openwhispr"]);
  });

  it("una versión ya sembrada no hace nada", () => {
    const plan = selectSeedIds({
      currentVersion: SEED_VERSION,
      seedVersion: SEED_VERSION,
      recommendedIds: SIEMPRE_3A,
      catalog: catalogo(SIEMPRE_3A),
      alreadyOffered: [],
      installedIds: [],
    });
    expect(plan).toEqual([]);
  });
});

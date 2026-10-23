import { describe, it, expect } from "vitest";
import {
  RECOMMENDED_PACKAGE_IDS,
  SEED_VERSION,
  planSeed,
} from "../defaults-seed";

const CATALOGO = [...RECOMMENDED_PACKAGE_IDS];

const SIEMPRE_1020B = [
  "lib-vikunja",
  "lib-celld",
  "lib-sentry",
  "lib-windmill",
  "lib-metabase",
  "lib-trilium",
  "lib-politica-privacidad",
];

const MANUAL_1020B = [
  "lib-ruview",
  "lib-tirreno",
  "lib-digup",
  "lib-moli",
  "lib-openshell",
  "lib-coucou",
  "lib-dbx",
];

function planificar(
  opciones: { ofrecidos?: string[]; instalados?: string[]; catalogo?: string[] } = {},
): string[] {
  return planSeed({
    recommendedIds: RECOMMENDED_PACKAGE_IDS,
    catalogIds: opciones.catalogo ?? CATALOGO,
    alreadyOfferedIds: opciones.ofrecidos ?? [],
    installedIds: opciones.instalados ?? [],
  });
}

describe("defaults-seed · 2.ª tanda de la Librería (Ola 1020S)", () => {
  it("sube SEED_VERSION en uno respecto a la versión 15", () => {
    expect(SEED_VERSION).toBe(16);
  });

  it("incluye las siete marcadas «siempre» y sin duplicados", () => {
    for (const id of SIEMPRE_1020B) {
      expect(RECOMMENDED_PACKAGE_IDS).toContain(id);
    }
    expect(new Set(RECOMMENDED_PACKAGE_IDS).size).toBe(RECOMMENDED_PACKAGE_IDS.length);
  });

  it("no incluye ninguna de las marcadas «manual»", () => {
    for (const id of MANUAL_1020B) {
      expect(RECOMMENDED_PACKAGE_IDS).not.toContain(id);
    }
  });

  it("siembra las siete «siempre» una sola vez y no las repite después", () => {
    const primera = planificar();
    const sembradas = primera.filter((id) => SIEMPRE_1020B.includes(id));

    expect(sembradas).toEqual(SIEMPRE_1020B);
    expect(new Set(primera).size).toBe(primera.length);

    const segunda = planificar({ ofrecidos: primera, instalados: SIEMPRE_1020B });
    for (const id of SIEMPRE_1020B) {
      expect(segunda).not.toContain(id);
    }
  });

  it("no devuelve un paquete que la persona desinstaló", () => {
    const plan = planificar({ ofrecidos: ["lib-vikunja"], instalados: [] });
    expect(plan).not.toContain("lib-vikunja");
  });

  it("no pisa un paquete que ya está instalado", () => {
    const plan = planificar({ instalados: ["lib-sentry"] });
    expect(plan).not.toContain("lib-sentry");
  });

  it("ignora ids que aún no existen en el catálogo", () => {
    const plan = planificar({ catalogo: ["lib-celld"] });
    expect(plan).toEqual(["lib-celld"]);
  });
});

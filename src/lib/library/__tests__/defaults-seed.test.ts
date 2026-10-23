// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  SEED_KEY,
  SEED_VERSION,
  RECOMMENDED_PACKAGE_IDS,
  ensureDefaultsSeeded,
} from "../defaults-seed";
import { INSTALLED_KEY, REPOS_KEY } from "../packages";

const SIEMPRE = [
  "lib-vikunja",
  "lib-celld",
  "lib-sentry",
  "lib-windmill",
  "lib-metabase",
  "lib-trilium",
  "lib-politica-privacidad",
] as const;

const MANUAL = [
  "lib-ruview",
  "lib-tirreno",
  "lib-digup",
  "lib-moli",
  "lib-openshell",
  "lib-coucou",
  "lib-dbx",
] as const;

const catalogo = {
  id: "repos-libreria-1020b-prueba",
  name: "2.ª tanda (prueba)",
  packages: [...SIEMPRE, ...MANUAL].map((id) => ({
    id,
    kind: "app",
    name: id,
    version: "1.0.0",
    author: "StarSeed",
    free: true,
    payload: { externalUrl: `https://github.com/starseed/${id}` },
  })),
};

function prepararCatalogo(): void {
  window.localStorage.setItem(REPOS_KEY, JSON.stringify([catalogo]));
}

/** Simula la actualización desde la versión anterior: todo lo demás ya se ofreció. */
function marcarOfrecido(ids: readonly string[]): void {
  const siempre = new Set<string>(SIEMPRE);
  const seededIds = RECOMMENDED_PACKAGE_IDS.filter((id) => !siempre.has(id));
  seededIds.push(...ids);
  window.localStorage.setItem(
    SEED_KEY,
    JSON.stringify({ version: SEED_VERSION - 1, at: 0, seededIds }),
  );
}

function instalados(): string[] {
  const raw = window.localStorage.getItem(INSTALLED_KEY);
  return raw ? Object.keys(JSON.parse(raw) as Record<string, unknown>) : [];
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("siembra de defaults · 2.ª tanda (SEED_VERSION 16)", () => {
  it("sube SEED_VERSION a 16", () => {
    expect(SEED_VERSION).toBe(16);
  });

  it("incluye en RECOMMENDED las siete marcadas «siempre»", () => {
    for (const id of SIEMPRE) {
      expect(RECOMMENDED_PACKAGE_IDS).toContain(id);
    }
  });

  it("no incluye en RECOMMENDED ninguna de las «manual»", () => {
    for (const id of MANUAL) {
      expect(RECOMMENDED_PACKAGE_IDS).not.toContain(id);
    }
  });

  it("siembra las siete una sola vez", async () => {
    prepararCatalogo();
    marcarOfrecido([]);

    const primera = await ensureDefaultsSeeded();
    expect(primera.seeded).toBe(true);
    expect([...primera.installed].sort()).toEqual([...SIEMPRE].sort());

    const segunda = await ensureDefaultsSeeded();
    expect(segunda).toEqual({ seeded: false, installed: [] });
    expect(instalados().sort()).toEqual([...SIEMPRE].sort());
  });

  it("no vuelve a sembrar lo que la persona desinstaló", async () => {
    prepararCatalogo();
    marcarOfrecido(["lib-vikunja"]);

    const res = await ensureDefaultsSeeded();
    expect(res.installed).not.toContain("lib-vikunja");
    expect([...res.installed].sort()).toEqual(
      SIEMPRE.filter((id) => id !== "lib-vikunja").sort(),
    );
  });

  it("ninguna «manual» entra en la siembra", async () => {
    prepararCatalogo();
    marcarOfrecido([]);

    await ensureDefaultsSeeded();
    for (const id of MANUAL) {
      expect(instalados()).not.toContain(id);
    }
  });
});

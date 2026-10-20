import { describe, it, expect } from "vitest";
import type { LibraryPackage } from "@/lib/library/packages";
import { FREE_CATALOG } from "@/ai/astraura/free-catalog";

// Mock paqueteConId for testing
const paqueteConId: LibraryPackage = {
  id: "test-package",
  kind: "ai-source",
  name: "Test Package",
  description: "A test package",
  icon: "test-icon",
  tags: ["test"],
  version: "1.0.0",
  author: "Test Author",
  sourceRepoId: "test-repo",
  free: true,
  payload: {},
  comingSoon: false,
  featured: false,
  visibility: "private",
};

// TODO: Import the functions to be tested
// import { vinculoDe, instalableEnAmbito } from "../vincular";

describe("vinculoDe", () => {
  it("deduce vínculo correcto desde catálogo", () => {
    const vinc = vinculoDe(paqueteConId, FREE_CATALOG);
    expect(vinc.requiereClave).toBe(true);
    expect(vinc.enlaceAlta).toBe("https://console.groq.com/keys");
    expect(vinc.gratis).toBe(false);
  });

  it("devuelve valores por defecto cuando no hay fuente", () => {
    // TODO: Implement this test case when the function is available
  });
});

describe("instalableEnAmbito", () => {
  it("permite instalar si fuente vinculada", () => {
    expect(instalableEnAmbito(paqueteConId, "pagina", ["groq-free"])).toBe(true);
  });

  it("no permite si fuente no vinculada", () => {
    expect(instalableEnAmbito(paqueteConId, "pagina", [])).toBe(false);
  });

  it("si no hay catalogSourceId, siempre instalable", () => {
    const paqueteSinId: LibraryPackage = { ...paqueteConId, payload: {} };
    expect(instalableEnAmbito(paqueteSinId, "cuenta", [])).toBe(true);
  });
});
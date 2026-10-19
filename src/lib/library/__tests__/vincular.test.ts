import { describe, it, expect } from "vitest";
import type { LibraryPackage } from "../packages";
import { vinculoDe, instalableEnAmbito } from "../vincular";
import { FREE_CATALOG } from "@/ai/astraura/free-catalog";

// Mock paquete con catalogSourceId
const paqueteConId: LibraryPackage = {
  id: "pkg-1",
  kind: "ai-source",
  name: "Test Package",
  description: "",
  icon: "",
  tags: [],
  version: "1.0.0",
  author: "",
  sourceRepoId: "",
  free: true,
  payload: { catalogSourceId: "groq-free" },
};

describe("vinculoDe", () => {
  it("deduce vínculo correcto desde catálogo", () => {
    const vinc = vinculoDe(paqueteConId, FREE_CATALOG);
    expect(vinc.requiereClave).toBe(true);
    expect(vinc.enlaceAlta).toBe("https://console.groq.com/keys");
    expect(vinc.gratis).toBe(false);
  });

  it("devuelve valores por defecto cuando no hay fuente", () => {
  const paqueteSinId: LibraryPackage = { ...paqueteConId, payload: {} };
  const vinc = vinculoDe(paqueteSinId, FREE_CATALOG);
  expect(vinc.requiereClave).toBe(false);
  expect(vinc.gratis).toBe(false);

  });
});

describe("instalableEnAmbito", () => {
  it("permite instalar si fuente vinculada", () => {
    expect(instalableEnAmbito(paqueteConId, "pagina", ["groq-free"]))
      .toBe(true);
  });
  it("no permite si fuente no vinculada", () => {
    expect(instalableEnAmbito(paqueteConId, "pagina", []))
      .toBe(false);
  });
  it("si no hay catalogSourceId, siempre instalable", () => {
    const paqueteSinId: LibraryPackage = { ...paqueteConId, payload: {} };
    expect(instalableEnAmbito(paqueteSinId, "cuenta", [])).toBe(true);
  });
});
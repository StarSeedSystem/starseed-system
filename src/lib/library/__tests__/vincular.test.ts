import { describe, it, expect } from "vitest";
import { vinculoDe, VinculoPaquete, instalableEnAmbito } from "../vincular";
import type { LibraryPackage } from "../packages";
import type { CatalogSource } from "@/ai/astraura/free-catalog";

const catalogo: CatalogSource[] = [
  { id: "groq", requiresKey: true, getKeyUrl: "https://console.groq.com/keys", tier: "free-key", providerId: "groq", label: "Groq", baseUrl: "", limits: "", why: "", privacy: "cloud", weight: 1, models: [] },
  { id: "astraura", requiresKey: false, getKeyUrl: undefined, tier: "local", providerId: "astraura-158", label: "Astraura", baseUrl: "", limits: "", why: "", privacy: "local", weight: 1, models: [] },
  { id: "browser", requiresKey: false, getKeyUrl: undefined, tier: "instant", providerId: "starseed", label: "Browser", baseUrl: "", limits: "", why: "", privacy: "browser", weight: 1, models: [] }
];

describe("Vinculador de paquetes", () => {
  describe("vinculoDe", () => {
    it("Groq: requiere clave y tiene URLs", () => {
      const paquete: LibraryPackage = { id: "1", kind: "ai-source", name: "", description: "", icon: "", tags: [], version: "1", author: "", sourceRepoId: "", free: true, payload: { catalogSourceId: "groq" } };
      const r = vinculoDe(paquete, catalogo);
      expect(r.requiereClave).toBe(true);
      expect(r.enlaceAlta).toBe("https://console.groq.com/keys");
      expect(r.enlaceClave).toBe("https://console.groq.com/keys");
      expect(r.gratis).toBe(true);
      expect(r.variables).toEqual({ GROQ_API_KEY: "GROQ_API_KEY" });
      expect(r.opcionId).toBe("groq");
    });

    it("Astraura: no requiere clave", () => {
      const paquete: LibraryPackage = { id: "2", kind: "ai-source", name: "", description: "", icon: "", tags: [], version: "1", author: "", sourceRepoId: "", free: true, payload: { catalogSourceId: "astraura" } };
      const r = vinculoDe(paquete, catalogo);
      expect(r.requiereClave).toBe(false);
      expect(r.enlaceAlta).toBe("#");
      expect(r.enlaceClave).toBe("#");
      expect(r.gratis).toBe(true);
      expect(r.variables).toEqual({});
      expect(r.opcionId).toBe("astraura");
    });

    it("Browser: no requiere clave", () => {
      const paquete: LibraryPackage = { id: "3", kind: "ai-source", name: "", description: "", icon: "", tags: [], version: "1", author: "", sourceRepoId: "", free: true, payload: { catalogSourceId: "browser" } };
      const r = vinculoDe(paquete, catalogo);
      expect(r.requiereClave).toBe(false);
      expect(r.enlaceAlta).toBe("#");
      expect(r.enlaceClave).toBe("#");
      expect(r.gratis).toBe(true);
      expect(r.variables).toEqual({});
      expect(r.opcionId).toBe("browser");
    });

    it("Sin catalogSourceId: valores por defecto", () => {
      const paquete: LibraryPackage = { id: "4", kind: "ai-source", name: "", description: "", icon: "", tags: [], version: "1", author: "", sourceRepoId: "", free: true, payload: { skillId: "test" } };
      const r = vinculoDe(paquete, catalogo);
      expect(r).toEqual({ requiereClave: false, enlaceAlta: "#", enlaceClave: "#", gratis: true, variables: {}, opcionId: "" });
    });
  });

  describe("instalableEnAmbito", () => {
    it("siempre devuelve true", () => {
      const paquete: LibraryPackage = { id: "5", kind: "app", name: "", description: "", icon: "", tags: [], version: "1", author: "", sourceRepoId: "", free: true, payload: {} };
      expect(instalableEnAmbito(paquete, { id: "ambito", tipo: "persona", visibilidad: "privado" }, [])).toBe(true);
    });
  });
});
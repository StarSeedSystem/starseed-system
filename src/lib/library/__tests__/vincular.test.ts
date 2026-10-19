import { describe, it, expect } from "vitest";
import { VinculoPaquete, vinculoDe, instalableEnAmbito } from "../vincular";

describe("vincular.ts", () => {
  describe("VinculoPaquete", () => {
    it("should have the correct interface structure", () => {
      const vinculo: VinculoPaquete = {
        requiereClave: true,
        enlaceAlta: "https://example.com/signup",
        enlaceClave: "https://example.com/key-page",
        gratis: false,
        variables: { API_KEY: "API_KEY" },
        opcionId: "test-option",
      };
      
      expect(vinculo).toHaveProperty("requiereClave");
      expect(vinculo).toHaveProperty("enlaceAlta");
      expect(vinculo).toHaveProperty("enlaceClave");
      expect(vinculo).toHaveProperty("gratis");
      expect(vinculo).toHaveProperty("variables");
      expect(vinculo).toHaveProperty("opcionId");
    });
  });

  describe("vinculoDe", () => {
    const mockCatalog = [
      {
        id: "test-source",
        nombre: "Test Source",
        tipo: "proveedor",
        papeles: ["escritor"],
        limiteGratis: "100 req/day",
        pideCuenta: true,
        enlaceAlta: "https://test.com/signup",
        enlaceClave: "https://test.com/key-page",
        variables: ["API_KEY", "OTHER_VAR"],
        privacidad: "cloud",
        licencia: "MIT",
        fechaVerificacion: "2026-10-19",
      },
      {
        id: "free-source",
        nombre: "Free Source",
        tipo: "modelo",
        papeles: ["chat"],
        limiteGratis: "unlimited",
        pideCuenta: false,
        enlaceAlta: null,
        enlaceClave: null,
        variables: null,
        privacidad: "browser",
        licencia: "Apache-2.0",
        fechaVerificacion: "2026-10-19",
      }
    ];

    it("should return a proper VinculoPaquete object for a source that requires key", () => {
      const paquete = {
        payload: {
          catalogSourceId: "test-source"
        }
      };
      
      const resultado = vinculoDe(paquete, mockCatalog);
      
      expect(resultado.requiereClave).toBe(true);
      expect(resultado.enlaceAlta).toBe("https://test.com/signup");
      expect(resultado.enlaceClave).toBe("https://test.com/key-page");
      expect(resultado.gratis).toBe(true);
      expect(resultado.variables).toEqual({ API_KEY: "API_KEY", OTHER_VAR: "OTHER_VAR" });
      expect(resultado.opcionId).toBe("test-source");
    });

    it("should return a proper VinculoPaquete object for a free source", () => {
      const paquete = {
        payload: {
          catalogSourceId: "free-source"
        }
      };
      
      const resultado = vinculoDe(paquete, mockCatalog);
      
      expect(resultado.requiereClave).toBe(false);
      expect(resultado.enlaceAlta).toBeNull();
      expect(resultado.enlaceClave).toBeNull();
      expect(resultado.gratis).toBe(true);
      expect(resultado.variables).toBeNull();
      expect(resultado.opcionId).toBe("free-source");
    });

    it("should return default values for a package without catalogSourceId", () => {
      const paquete = {
        payload: {
          // No catalogSourceId
        }
      };
      
      const resultado = vinculoDe(paquete, mockCatalog);
      
      expect(resultado.requiereClave).toBe(false);
      expect(resultado.enlaceAlta).toBeNull();
      expect(resultado.enlaceClave).toBeNull();
      expect(resultado.gratis).toBe(true);
      expect(resultado.variables).toBeNull();
      expect(resultado.opcionId).toBeNull();
    });

    it("should return default values for a package with unknown catalogSourceId", () => {
      const paquete = {
        payload: {
          catalogSourceId: "unknown-source"
        }
      };
      
      const resultado = vinculoDe(paquete, mockCatalog);
      
      expect(resultado.requiereClave).toBe(false);
      expect(resultado.enlaceAlta).toBeNull();
      expect(resultado.enlaceClave).toBeNull();
      expect(resultado.gratis).toBe(true);
      expect(resultado.variables).toBeNull();
      expect(resultado.opcionId).toBeNull();
    });
  });

  describe("instalableEnAmbito", () => {
    it("should return a boolean value", () => {
      const paquete = { id: "test-package", kind: "app" };
      const ambito = { capacidadMaximaVinculaciones: 5, tiposPermitidos: ["app", "widget"] }; // Simplified
      const vinculadas = []; // Empty array
      
      const resultado = instalableEnAmbito(paquete, ambito, vinculadas);
      
      expect(typeof resultado).toBe("boolean");
    });
    
    it("should return true for a package not yet linked and with capacity", () => {
      const paquete = { id: "test-package", kind: "app" };
      const ambito = { capacidadMaximaVinculaciones: 5, tiposPermitidos: ["app", "widget"] };
      const vinculadas = [{ id: "other-package", kind: "widget" }]; // Different package
      
      const resultado = instalableEnAmbito(paquete, ambito, vinculadas);
      
      expect(resultado).toBe(true);
    });
    
    it("should return false for a package already linked", () => {
      const paquete = { id: "test-package", kind: "app" };
      const ambito = { capacidadMaximaVinculaciones: 5, tiposPermitidos: ["app", "widget"] };
      const vinculadas = [{ id: "test-package", kind: "app" }]; // Same package already linked
      
      const resultado = instalableEnAmbito(paquete, ambito, vinculadas);
      
      expect(resultado).toBe(false);
    });
    
    it("should return false when at maximum capacity", () => {
      const paquete = { id: "test-package", kind: "app" };
      const ambito = { capacidadMaximaVinculaciones: 2, tiposPermitidos: ["app", "widget"] };
      const vinculadas = [
        { id: "package1", kind: "app" },
        { id: "package2", kind: "widget" }
      ]; // At capacity
      
      const resultado = instalableEnAmbito(paquete, ambito, vinculadas);
      
      expect(resultado).toBe(false);
    });
    
    it("should return false for incompatible package type", () => {
      const paquete = { id: "test-package", kind: "repo" }; // Not permitted
      const ambito = { capacidadMaximaVinculaciones: 5, tiposPermitidos: ["app", "widget"] };
      const vinculadas = []; // Empty array
      
      const resultado = instalableEnAmbito(paquete, ambito, vinculadas);
      
      expect(resultado).toBe(false);
    });
  });
});
import { describe, it, expect } from "vitest";
import { REFERENCIAS_CONECTORES, estadoConector, type ReferenciaConector } from "../referencias-conectores";

describe("referencias-conectores", () => {
  describe("REFERENCIAS_CONECTORES", () => {
    it("should contain data for all specified services", () => {
      const expectedIds = [
        "higgsfield",
        "lottiefiles", 
        "icons8",
        "mobbin",
        "refero",
        "savee",
        "60fps",
        "fontshare",
        "flaticon"
      ];
      
      const actualIds = REFERENCIAS_CONECTORES.map(c => c.id);
      expect(actualIds).toEqual(expectedIds);
    });
    
    it("should have proper structure for each conector", () => {
      REFERENCIAS_CONECTORES.forEach((conector: ReferenciaConector) => {
        expect(conector).toHaveProperty("id");
        expect(conector).toHaveProperty("nombre");
        expect(conector).toHaveProperty("tipo");
        expect(conector).toHaveProperty("url");
        expect(conector).toHaveProperty("requiere");
        expect(["gratis", "pago", "creditos"]).toContain(conector.coste);
        expect(conector).toHaveProperty("limites");
        expect(conector).toHaveProperty("avisos");
        expect(Array.isArray(conector.avisos)).toBe(true);
      });
    });
    
    it("should have correct coste values", () => {
      const fontshare = REFERENCIAS_CONECTORES.find(c => c.id === "fontshare");
      expect(fontshare?.coste).toBe("gratis");
      
      const higgsfield = REFERENCIAS_CONECTORES.find(c => c.id === "higgsfield");
      expect(higgsfield?.coste).toBe("pago");
    });
  });
  
  describe("estadoConector", () => {
    it("should return 'conectado' when conector is in conectados and true", () => {
      const conectados = { "higgsfield": true };
      expect(estadoConector("higgsfield", conectados)).toBe("conectado");
    });
    
    it("should return 'desconectado' when conector is in conectados and false", () => {
      const conectados = { "higgsfield": false };
      expect(estadoConector("higgsfield", conectados)).toBe("desconectado");
    });
    
    it("should return 'desconocido' when conector ID is not found", () => {
      const conectados = { "higgsfield": true };
      expect(estadoConector("unknown-service", conectados)).toBe("desconocido");
    });
    
    it("should return 'desconocido' when conectados is empty", () => {
      const conectados: Record<string, boolean> = {};
      expect(estadoConector("higgsfield", conectados)).toBe("desconocido");
    });
  });
});
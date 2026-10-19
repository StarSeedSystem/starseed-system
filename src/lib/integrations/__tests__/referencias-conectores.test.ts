import { describe, it, expect, beforeEach } from "vitest";
import type { ReferenciaEntrada, EstadoConector } from "../referencias-conectores";
import {
  cargarCatálogo,
  obtenerTodasReferencias,
  obtenerReferenciaPorId,
  obtenerReferenciasPorTema,
  obtenerReferenciasPorClaseUso,
  obtenerReferenciasPorAcceso,
  estadoConector,
  tieneCanalesOficiales,
  obtenerReferenciasConIntegracionesOficiales
} from "../referencias-conectores";
const datosDePrueba: ReferenciaEntrada[] = [
  {
    id: "higgsfield",
    nombre: "Higgsfield",
    url: "https://h.ai/mcp",
    tema: "ia-diseno",
    que_es: "Generación de imagen, vídeo, 3D y audio con IA",
    tipo: "herramienta-ia",
    acceso: "pago",
    clase_uso: "reutilizable-con-condiciones",
    canales: ["mcp-oficial", "cli-oficial"],
    integracion: [
      { tipo: "mcp", url: "https://mcp.higgsfield.ai/mcp" },
      { tipo: "cli", ref: "@higgsfield/cli" }
    ],
    verificado: "2026-10-18"
  },
  {
    id: "typewolf",
    nombre: "Typewolf",
    url: "https://www.typewolf.com",
    tema: "tipografia-iconos",
    que_es: "Recomendaciones de fuentes",
    tipo: "galeria-inspiracion",
    acceso: "mixto",
    clase_uso: "solo-referencia",
    canales: ["rss"],
    verificado: "2026-10-18"
  }
];
describe("referencias-conectores (funciones puras)", () => {
  beforeEach(() => cargarCatálogo(datosDePrueba));
  describe("obtenerTodasReferencias", () => {
    it("should return all references and a copy", () => {
      const r = obtenerTodasReferencias();
      expect(r.length).toBe(2);
      expect(r).toEqual(expect.arrayContaining(datosDePrueba));
      const r1 = obtenerTodasReferencias();
      const r2 = obtenerTodasReferencias();
      expect(r1).not.toBe(r2);
      expect(r1).toEqual(r2);
    });
  });

  describe("obtenerReferenciaPorId", () => {
    it("should return the reference when ID exists and undefined when ID does not exist", () => {
      const r = obtenerReferenciaPorId("higgsfield");
      expect(r).toBeDefined();
      expect(r?.id).toBe("higgsfield");
      expect(r?.nombre).toBe("Higgsfield");
      expect(obtenerReferenciaPorId("id-inexistente")).toBeUndefined();
    });
  });

  describe("obtenerReferenciasPorTema", () => {
    it("should return references for existing topic and empty array for non-existing topic", () => {
      const r = obtenerReferenciasPorTema("ia-diseno");
      expect(r.length).toBe(1);
      expect(r[0].id).toBe("higgsfield");
      expect(obtenerReferenciasPorTema("tema-inexistente").length).toBe(0);
    });
  });

  describe("obtenerReferenciasPorClaseUso", () => {
    it("should return references for existing class of use and empty array for non-existing class of use", () => {
      const r = obtenerReferenciasPorClaseUso("solo-referencia");
      expect(r.length).toBe(1);
      expect(r[0].id).toBe("typewolf");
      expect(obtenerReferenciasPorClaseUso("clase-inexistente").length).toBe(0);
    });
  });

  describe("obtenerReferenciasPorAcceso", () => {
    it("should return references for existing access type and empty array for non-existing access type", () => {
      const r = obtenerReferenciasPorAcceso("mixto");
      expect(r.length).toBe(1);
      expect(obtenerReferenciasPorAcceso("acceso-inexistente").length).toBe(0);
    });
  });

  describe("estadoConector", () => {
    it("should return correct state when connected is true and false", () => {
      const r = estadoConector("higgsfield", true);
      expect(r).toEqual({ id: "higgsfield", conectados: true });
      const r2 = estadoConector("typewolf", false);
      expect(r2).toEqual({ id: "typewolf", conectados: false });
    });
  });

  describe("tieneCanalesOficiales", () => {
    it("should return true for reference with official channels and false for reference without official channels", () => {
      const r = obtenerReferenciaPorId("higgsfield")!;
      expect(tieneCanalesOficiales(r)).toBe(true);
      const r2 = obtenerReferenciaPorId("typewolf")!;
      expect(tieneCanalesOficiales(r2)).toBe(false);
    });
  });

  describe("obtenerReferenciasConIntegracionesOficiales", () => {
    it("should return references with official integrations and empty array when no references have official integrations", () => {
      const r = obtenerReferenciasConIntegracionesOficiales();
      expect(r.length).toBe(1);
      expect(r[0].id).toBe("higgsfield");
      const datosSinOficiales: ReferenciaEntrada[] = [{ id: "typewolf", nombre: "Typewolf", url: "https://www.typewolf.com", tema: "tipografia-iconos", tipo: "galeria-inspiracion", acceso: "mixto", clase_uso: "solo-referencia", canales: ["rss"], verificado: "2026-10-18" }];
      cargarCatálogo(datosSinOficiales);
      expect(obtenerReferenciasConIntegracionesOficiales().length).toBe(0);
    });
  });
});
import { describe, it, expect } from "vitest";
import { planLayaLocal } from "../laya-navegador";

describe("planLayaLocal", () => {
  describe("when vendor/laya-ts or modelo exportado no existen", () => {
    it("should return cargar: false with appropriate motivo", () => {
      expect(
        planLayaLocal({
          esPWA: true,
          tieneWebGPU: true,
          almacenamientoPersistenteGB: 2,
          memoriaGB: 4,
          esAppNativa: true,
          vendorLayaTsExiste: false,
          modeloExportadoExiste: true,
        })
      ).toEqual({
        cargar: false,
        modelo: null,
        motivo: "vendor/laya-ts o el modelo exportado aún no existen",
      });

      expect(
        planLayaLocal({
          vendorLayaTsExiste: true,
          modeloExportadoExiste: false,
        })
      ).toEqual({
        cargar: false,
        modelo: null,
        motivo: "vendor/laya-ts o el modelo exportado aún no existen",
      });

      expect(
        planLayaLocal({
          vendorLayaTsExiste: false,
          modeloExportadoExiste: false,
        })
      ).toEqual({
        cargar: false,
        modelo: null,
        motivo: "vendor/laya-ts o el modelo exportado aún no existen",
      });
    });
  });

  describe("when esAppNativa es true", () => {
    it("should load when batería is >= 20%", () => {
      expect(
        planLayaLocal({
          esAppNativa: true,
          vendorLayaTsExiste: true,
          modeloExportadoExiste: true,
          bateríaPorcentaje: 25,
        })
      ).toEqual({
        cargar: true,
        modelo: expect.stringMatching(/^(multilingual-int8|multilingual)$/),
        motivo: "app nativa con presupuesto disponible",
      });

      expect(
        planLayaLocal({
          esAppNativa: true,
          vendorLayaTsExiste: true,
          modeloExportadoExiste: true,
          bateríaPorcentaje: 100,
        })
      ).toEqual({
        cargar: true,
        modelo: expect.stringMatching(/^(multilingual-int8|multilingual)$/),
        motivo: "app nativa con presupuesto disponible",
      });
    });

    it("should not load when batería < 20%", () => {
      expect(
        planLayaLocal({
          esAppNativa: true,
          vendorLayaTsExiste: true,
          modeloExportadoExiste: true,
          bateríaPorcentaje: 19,
        })
      ).toEqual({
        cargar: false,
        modelo: null,
        motivo: "batería inferior al 20%",
      });

      expect(
        planLayaLocal({
          esAppNativa: true,
          vendorLayaTsExiste: true,
          modeloExportadoExiste: true,
          bateríaPorcentaje: 0,
        })
      ).toEqual({
        cargar: false,
        modelo: null,
        motivo: "batería inferior al 20%",
      });
    });
  });

  describe("when estaVisible es false", () => {
    it("should not load when pestaña oculta", () => {
      expect(
        planLayaLocal({
          vendorLayaTsExiste: true,
          modeloExportadoExiste: true,
          estaVisible: false,
          esAppNativa: true,
        })
      ).toEqual({
        cargar: false,
        modelo: null,
        motivo: "pestaña oculta",
      });
    });
  });

  describe("when esPWA con WebGPU y suficientes recursos", () => {
    it("should load when all requirements are met", () => {
      expect(
        planLayaLocal({
          esPWA: true,
          tieneWebGPU: true,
          almacenamientoPersistenteGB: 2,
          memoriaGB: 4,
          vendorLayaTsExiste: true,
          modeloExportadoExiste: true,
        })
      ).toEqual({
        cargar: true,
        modelo: expect.stringMatching(/^(multilingual-int8|multilingual)$/),
        motivo: "PWA con WebGPU y requisitos de memoria/almacenamiento satisfechos",
      });

      expect(
        planLayaLocal({
          esPWA: true,
          tieneWebGPU: true,
          almacenamientoPersistenteGB: 5,
          memoriaGB: 8,
          vendorLayaTsExiste: true,
          modeloExportadoExiste: true,
        })
      ).toEqual({
        cargar: true,
        modelo: expect.stringMatching(/^(multilingual-int8|multilingual)$/),
        motivo: "PWA con WebGPU y requisitos de memoria/almacenamiento satisfechos",
      });
    });

    it("should not load when almacenamiento < 2 GB", () => {
      expect(
        planLayaLocal({
          esPWA: true,
          tieneWebGPU: true,
          almacenamientoPersistenteGB: 1,
          memoriaGB: 4,
          vendorLayaTsExiste: true,
          modeloExportadoExiste: true,
        })
      ).toEqual({
        cargar: false,
        modelo: null,
        motivo: "criterios de carga no satisfechos (requiere web, PWA o app nativa)",
      });
    });

    it("should not load when memoria < 4 GB", () => {
      expect(
        planLayaLocal({
          esPWA: true,
          tieneWebGPU: true,
          almacenamientoPersistenteGB: 2,
          memoriaGB: 3,
          vendorLayaTsExiste: true,
          modeloExportadoExiste: true,
        })
      ).toEqual({
        cargar: false,
        modelo: null,
        motivo: "criterios de carga no satisfechos (requiere web, PWA o app nativa)",
      });
    });

    it("should not load when WebGPU no disponible", () => {
      expect(
        planLayaLocal({
          esPWA: true,
          tieneWebGPU: false,
          almacenamientoPersistenteGB: 2,
          memoriaGB: 4,
          vendorLayaTsExiste: true,
          modeloExportadoExiste: true,
        })
      ).toEqual({
        cargar: false,
        modelo: null,
        motivo: "criterios de carga no satisfechos (requiere web, PWA o app nativa)",
      });
    });
  });

  describe("when no condiciones se satisfacen", () => {
    it("should not load for web o PWA insuficiente", () => {
      expect(
        planLayaLocal({
          vendorLayaTsExiste: true,
          modeloExportadoExiste: true,
        })
      ).toEqual({
        cargar: false,
        modelo: null,
        motivo: "criterios de carga no satisfechos (requiere web, PWA o app nativa)",
      });
    });
  });
});

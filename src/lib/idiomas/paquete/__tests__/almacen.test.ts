// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { almacenIdiomas, type PaqueteIdioma } from "../almacen";

const paquete1: PaqueteIdioma = {
  codigo: "es",
  nombre: "Español",
  version: "1.0.0",
  tamano: 1024,
  fechaInstalacion: "2026-01-01T00:00:00.000Z",
};

const paquete2: PaqueteIdioma = {
  codigo: "en",
  nombre: "Inglés",
  version: "1.0.0",
  tamano: 2048,
  fechaInstalacion: "2026-01-02T00:00:00.000Z",
};

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe("almacenIdiomas", () => {
  describe("listarPaquetes", () => {
    it("devuelve arreglo vacío sin estado inicial", async () => {
      const resultado = await almacenIdiomas.listarPaquetes();
      expect(resultado.ok).toBe(true);
      expect(resultado.paquetes).toEqual([]);
    });

    it("devuelve copias de los paquetes guardados", async () => {
      window.localStorage.setItem("starseed.idiomas.paquetes.v1", JSON.stringify([paquete1]));
      const resultado = await almacenIdiomas.listarPaquetes();
      expect(resultado.ok).toBe(true);
      expect(resultado.paquetes).toHaveLength(1);
      expect(resultado.paquetes?.[0]?.codigo).toBe("es");
    });
  });

  describe("guardarPaquete", () => {
    it("acepta un paquete nuevo", async () => {
      const resultado = await almacenIdiomas.guardarPaquete(paquete1);
      expect(resultado.ok).toBe(true);
      const listados = await almacenIdiomas.listarPaquetes();
      expect(listados.paquetes).toHaveLength(1);
    });

    it("reemplaza un paquete con mismo codigo", async () => {
      window.localStorage.setItem("starseed.idiomas.paquetes.v1", JSON.stringify([paquete1]));
      const actualizado: PaqueteIdioma = { ...paquete1, version: "2.0.0" };
      const resultado = await almacenIdiomas.guardarPaquete(actualizado);
      expect(resultado.ok).toBe(true);
      const listados = await almacenIdiomas.listarPaquetes();
      expect(listados.paquetes).toHaveLength(1);
      expect(listados.paquetes?.[0]?.version).toBe("2.0.0");
    });

    it("rechaza codigo vacío", async () => {
      const resultado = await almacenIdiomas.guardarPaquete({ ...paquete1, codigo: "" });
      expect(resultado.ok).toBe(false);
      expect(resultado.motivo).toBe("Código inválido");
    });

    it("rechaza nombre vacío", async () => {
      const resultado = await almacenIdiomas.guardarPaquete({ ...paquete1, nombre: "" });
      expect(resultado.ok).toBe(false);
      expect(resultado.motivo).toBe("Nombre inválido");
    });

    it("aplica tope de 12 paquetes al añadir", async () => {
      const existentes: PaqueteIdioma[] = Array.from({ length: 12 }, (_, i) => ({
        codigo: `lang${i}`,
        nombre: `Idioma ${i}`,
        version: "1.0.0",
        tamano: 100,
        fechaInstalacion: "2026-01-01T00:00:00.000Z",
      }));
      window.localStorage.setItem("starseed.idiomas.paquetes.v1", JSON.stringify(existentes));

      const nuevo: PaqueteIdioma = {
        codigo: "nuevo",
        nombre: "Nuevo Idioma",
        version: "1.0.0",
        tamano: 100,
        fechaInstalacion: "2026-01-01T00:00:00.000Z",
      };

      const resultado = await almacenIdiomas.guardarPaquete(nuevo);
      expect(resultado.ok).toBe(true);
      const listados = await almacenIdiomas.listarPaquetes();
      expect(listados.paquetes).toHaveLength(12);
      expect(listados.paquetes?.some((p) => p.codigo === "nuevo")).toBe(true);
      expect(listados.paquetes?.some((p) => p.codigo === "lang0")).toBe(false);
    });
  });

  describe("quitarPaquete", () => {
    it("elimina un paquete existente", async () => {
      window.localStorage.setItem("starseed.idiomas.paquetes.v1", JSON.stringify([paquete1, paquete2]));
      const resultado = await almacenIdiomas.quitarPaquete("es");
      expect(resultado.ok).toBe(true);
      const listados = await almacenIdiomas.listarPaquetes();
      expect(listados.paquetes).toHaveLength(1);
      expect(listados.paquetes?.[0]?.codigo).toBe("en");
    });

    it("rechaza codigo vacío", async () => {
      const resultado = await almacenIdiomas.quitarPaquete("");
      expect(resultado.ok).toBe(false);
      expect(resultado.motivo).toBe("Código inválido");
    });

    it("rechaza paquete inexistente", async () => {
      window.localStorage.setItem("starseed.idiomas.paquetes.v1", JSON.stringify([paquete1]));
      const resultado = await almacenIdiomas.quitarPaquete("inexistente");
      expect(resultado.ok).toBe(false);
      expect(resultado.motivo).toBe("Paquete no encontrado");
    });
  });

  describe("leerPaquete", () => {
    it("devuelve el paquete encontrado", async () => {
      window.localStorage.setItem("starseed.idiomas.paquetes.v1", JSON.stringify([paquete1, paquete2]));
      const resultado = await almacenIdiomas.leerPaquete("es");
      expect(resultado.ok).toBe(true);
      expect(resultado.paquetes).toHaveLength(1);
      expect(resultado.paquetes?.[0]?.codigo).toBe("es");
    });

    it("rechaza codigo vacío", async () => {
      const resultado = await almacenIdiomas.leerPaquete("");
      expect(resultado.ok).toBe(false);
      expect(resultado.motivo).toBe("Código inválido");
    });

    it("rechaza paquete inexistente", async () => {
      window.localStorage.setItem("starseed.idiomas.paquetes.v1", JSON.stringify([paquete1]));
      const resultado = await almacenIdiomas.leerPaquete("xx");
      expect(resultado.ok).toBe(false);
      expect(resultado.motivo).toBe("Paquete no encontrado");
    });
  });

  describe("manejo de datos corruptos", () => {
    it("ignora JSON inválido al leer", async () => {
      window.localStorage.setItem("starseed.idiomas.paquetes.v1", "no es JSON");
      const resultado = await almacenIdiomas.listarPaquetes();
      expect(resultado.ok).toBe(true);
      expect(resultado.paquetes).toEqual([]);
    });

    it("ignora valor corrupto (no array)", async () => {
      window.localStorage.setItem("starseed.idiomas.paquetes.v1", JSON.stringify({ codigo: "es" }));
      const resultado = await almacenIdiomas.listarPaquetes();
      expect(resultado.ok).toBe(true);
      expect(resultado.paquetes).toEqual([]);
    });

    it("ignora paquetes con codigo no string", async () => {
      const datos = [{ codigo: 123, nombre: "Test", version: "1.0", tamano: 100, fechaInstalacion: "2026-01-01" }];
      window.localStorage.setItem("starseed.idiomas.paquetes.v1", JSON.stringify(datos));
      const resultado = await almacenIdiomas.listarPaquetes();
      expect(resultado.ok).toBe(true);
      expect(resultado.paquetes).toEqual([]);
    });
  });

  describe("almacén que lanza", () => {
    it("maneja error en getItem al listar", async () => {
      delete (globalThis as Record<string, unknown>).localStorage;
      (globalThis as Record<string, unknown>).localStorage = {
        getItem: () => { throw new Error("Storage error"); },
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
        key: vi.fn(),
        length: 0,
      };
      const resultado = await almacenIdiomas.listarPaquetes();
      expect(resultado.ok).toBe(true);
      expect(resultado.paquetes).toEqual([]);
      delete (globalThis as Record<string, unknown>).localStorage;
      (globalThis as Record<string, unknown>).localStorage = window.localStorage;
    });

    it("maneja error en setItem al guardar", async () => {
      delete (globalThis as Record<string, unknown>).localStorage;
      (globalThis as Record<string, unknown>).localStorage = {
        getItem: () => "[valid]",
        setItem: () => { throw new Error("Quota exceeded"); },
        removeItem: vi.fn(),
        clear: vi.fn(),
        key: vi.fn(),
        length: 0,
      };
      const resultado = await almacenIdiomas.guardarPaquete(paquete1);
      expect(resultado.ok).toBe(false);
      delete (globalThis as Record<string, unknown>).localStorage;
      (globalThis as Record<string, unknown>).localStorage = window.localStorage;
    });

    it("maneja error en getItem al quitar", async () => {
      delete (globalThis as Record<string, unknown>).localStorage;
      (globalThis as Record<string, unknown>).localStorage = {
        getItem: () => { throw new Error("Storage error"); },
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
        key: vi.fn(),
        length: 0,
      };
      const resultado = await almacenIdiomas.quitarPaquete("es");
      expect(resultado.ok).toBe(true);
      delete (globalThis as Record<string, unknown>).localStorage;
      (globalThis as Record<string, unknown>).localStorage = window.localStorage;
    });
  });

  describe("limite de tamaño", () => {
    it("rechaza cuando excede 6 MB total", async () => {
      const paquetesGrandes: PaqueteIdioma[] = Array.from({ length: 12 }, (_, i) => ({
        codigo: `lang${i}`,
        nombre: `Idioma ${i}`,
        version: "1.0.0",
        tamano: 600000,
        fechaInstalacion: "2026-01-01T00:00:00.000Z",
      }));
      window.localStorage.setItem("starseed.idiomas.paquetes.v1", JSON.stringify(paquetesGrandes));

      const nuevo: PaqueteIdioma = {
        codigo: "nuevo",
        nombre: "Nuevo Idioma",
        version: "1.0.0",
        tamano: 1000000,
        fechaInstalacion: "2026-01-01T00:00:00.000Z",
      };

      const resultado = await almacenIdiomas.guardarPaquete(nuevo);
      expect(resultado.ok).toBe(false);
      expect(resultado.motivo).toContain("Límite");
    });
  });
});
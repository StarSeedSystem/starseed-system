import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { blockHasContent } from "@/components/creation/lienzo-composer";
import { leerBloque, serializarBloque } from "../bloque-protomolecula";
import type { PostBlock } from "@/lib/creation/post-blocks";

function crearBloqueProtomolecula(moleculaJson: string): PostBlock {
  return {
    id: "blk-proto",
    type: "protomolecula",
    code: moleculaJson,
  };
}

function moleculaDePrueba(): Molecula {
  return {
    id: "mol-1",
    titulo: "Molécula de prueba",
    ambito: "personal",
    capas: [],
    atomos: [],
    valores: {},
    version: 1,
    creadaEn: 1000,
    actualizadaEn: 1000,
  };
}

describe("Lógica de renderizado de bloque protomolecula en el muro", () => {
  beforeEach(() => {
    // Setup if needed
  });

  afterEach(() => {
    cleanup();
  });

  describe("blockHasContent", () => {
    it("devuelve true para un bloque protomolecula con código", () => {
      const molecula = moleculaDePrueba();
      const serializado = serializarBloque(molecula);
      expect(serializado.ok).toBe(true);
      if (!serializado.ok) return;

      const bloque = crearBloqueProtomolecula(serializado.valor);
      expect(blockHasContent(bloque)).toBe(true);
    });

    it("devuelve false para un bloque protomolecula sin código", () => {
      const bloque: PostBlock = {
        id: "blk-proto",
        type: "protomolecula",
        code: "",
      };
      expect(blockHasContent(bloque)).toBe(false);
    });

    it("devuelve false para un bloque protomolecula con código vacío", () => {
      const bloque: PostBlock = {
        id: "blk-proto",
        type: "protomolecula",
        code: "   ",
      };
      expect(blockHasContent(bloque)).toBe(false);
    });
  });
});
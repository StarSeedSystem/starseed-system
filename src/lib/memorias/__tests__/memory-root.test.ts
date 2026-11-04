import { describe, it, expect } from "vitest";
import { readMemoryManifest } from "../memory-root";

describe("readMemoryManifest", () => {
  it("debe validar un manifiesto correcto", () => {
    const raw = {
      name: "Test Root",
      kind: "memory_root",
      branches: [
        { rama: "core", tipo: "soul", archivo: "soul/core.md", hash: "abc" },
        { rama: "notas", tipo: "memory", archivo: "memory/notas.md", scope: "public" }
      ]
    };

    const result = readMemoryManifest(raw);
    expect(result.isValid).toBe(true);
    expect(result.manifest?.name).toBe("Test Root");
    expect(result.manifest?.branches).toHaveLength(2);
    expect(result.manifest?.branches[0].tipo).toBe("soul");
  });

  it("debe descartar ramas con tipos no reconocidos", () => {
    const raw = {
      kind: "memory_root",
      branches: [
        { rama: "valida", tipo: "soul", archivo: "v.md" },
        { rama: "invalida", tipo: "inventado", archivo: "i.md" }
      ]
    };

    const result = readMemoryManifest(raw);
    expect(result.manifest?.branches).toHaveLength(1);
    expect(result.errors).toContain('Rama "invalida" descartada: tipo "inventado" no reconocido.');
  });

  it("debe descartar ramas sin campos obligatorios", () => {
    const raw = {
      kind: "memory_root",
      branches: [
        { rama: "sin-archivo", tipo: "soul" },
        { archivo: "sin-rama.md", tipo: "memory" }
      ]
    };

    const result = readMemoryManifest(raw);
    expect(result.manifest?.branches).toHaveLength(0);
    expect(result.errors).toHaveLength(2);
  });

  it("debe fallar si el kind no es memory_root", () => {
    const raw = { kind: "otro", branches: [] };
    const result = readMemoryManifest(raw);
    expect(result.errors[0]).toContain('Tipo de manifiesto inválido');
  });

  it("debe manejar un objeto vacío o nulo", () => {
    expect(readMemoryManifest(null).isValid).toBe(false);
    expect(readMemoryManifest({}).isValid).toBe(false);
  });
});

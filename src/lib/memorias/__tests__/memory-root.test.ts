import { describe, it, expect } from "vitest";
import {
  RAMAS_MEMORIA,
  type RamaMemoria,
  type MemoryRoot,
  type ManifestEntry,
  type ManifestParseResult,
  validarRama,
  validarEntradaManifest,
  parsearManifest,
  normalizarManifest,
} from "../memory-root";

describe("RAMAS_MEMORIA", () => {
  it("contiene las 9 ramas canónicas en orden", () => {
    expect(RAMAS_MEMORIA).toEqual([
      "soul",
      "ego",
      "skills",
      "style",
      "memory",
      "dream",
      "accounts",
      "tasks",
      "logs",
    ]);
  });
});

describe("validarRama", () => {
  it("acepta ramas válidas", () => {
    for (const rama of RAMAS_MEMORIA) {
      expect(validarRama(rama)).toBe(true);
    }
  });

  it("rechaza ramas inválidas", () => {
    expect(validarRama("invalid")).toBe(false);
    expect(validarRama("")).toBe(false);
    expect(validarRama("Soul")).toBe(false); // case sensitive
  });
});

describe("validarEntradaManifest", () => {
  it("acepta una entrada válida completa", () => {
    const entrada: ManifestEntry = {
      rama: "soul",
      archivo: "principios.md",
      tipo: "markdown",
      scope: "personal",
      hash: "abc123def456",
    };
    expect(validarEntradaManifest(entrada)).toBe(true);
  });

  it("acepta entrada con scope público", () => {
    const entrada: ManifestEntry = {
      rama: "logs",
      archivo: "eventos.jsonl",
      tipo: "jsonl",
      scope: "publica",
      hash: "xyz789",
    };
    expect(validarEntradaManifest(entrada)).toBe(true);
  });

  it("rechaza entrada sin rama", () => {
    const entrada = { archivo: "a.md", tipo: "markdown", scope: "personal", hash: "h1" } as any;
    expect(validarEntradaManifest(entrada)).toBe(false);
  });

  it("rechaza entrada con rama inválida", () => {
    const entrada = { rama: "otra", archivo: "a.md", tipo: "markdown", scope: "personal", hash: "h1" };
    expect(validarEntradaManifest(entrada)).toBe(false);
  });

  it("rechaza entrada sin archivo", () => {
    const entrada = { rama: "soul", tipo: "markdown", scope: "personal", hash: "h1" } as any;
    expect(validarEntradaManifest(entrada)).toBe(false);
  });

  it("rechaza entrada sin hash", () => {
    const entrada = { rama: "soul", archivo: "a.md", tipo: "markdown", scope: "personal" } as any;
    expect(validarEntradaManifest(entrada)).toBe(false);
  });

  it("rechaza entrada con scope inválido", () => {
    const entrada = {
      rama: "soul",
      archivo: "a.md",
      tipo: "markdown",
      scope: "invalido",
      hash: "h1",
    };
    expect(validarEntradaManifest(entrada)).toBe(false);
  });

  it("rechaza entrada con ruta absoluta", () => {
    const entrada = {
      rama: "soul",
      archivo: "/home/user/soul/a.md",
      tipo: "markdown",
      scope: "personal",
      hash: "h1",
    };
    expect(validarEntradaManifest(entrada)).toBe(false);
  });

  it("rechaza entrada con ruta que sube directorios", () => {
    const entrada = {
      rama: "soul",
      archivo: "../ego/a.md",
      tipo: "markdown",
      scope: "personal",
      hash: "h1",
    };
    expect(validarEntradaManifest(entrada)).toBe(false);
  });
});

describe("parsearManifest", () => {
  it("parsea JSON válido", () => {
    const json = JSON.stringify({
      version: 1,
      entradas: [
        { rama: "soul", archivo: "a.md", tipo: "markdown", scope: "personal", hash: "h1" },
        { rama: "ego", archivo: "b.md", tipo: "markdown", scope: "personal", hash: "h2" },
      ],
    });
    const resultado = parsearManifest(json);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.datos.entradas).toHaveLength(2);
    }
  });

  it("falla con JSON inválido", () => {
    const resultado = parsearManifest("{ no es json }");
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.motivo).toContain("JSON");
    }
  });

  it("falla si no es un objeto", () => {
    const resultado = parsearManifest("[]");
    expect(resultado.ok).toBe(false);
  });

  it("falla si no tiene campo entradas", () => {
    const resultado = parsearManifest('{"version": 1}');
    expect(resultado.ok).toBe(false);
  });

  it("falla si entradas no es array", () => {
    const resultado = parsearManifest('{"entradas": "no-array"}');
    expect(resultado.ok).toBe(false);
  });
});

describe("normalizarManifest", () => {
  it("mantiene entradas válidas y descarta inválidas con motivo", () => {
    const manifest = {
      version: 1,
      entradas: [
        { rama: "soul", archivo: "a.md", tipo: "markdown", scope: "personal", hash: "h1" },
        { rama: "invalida", archivo: "b.md", tipo: "markdown", scope: "personal", hash: "h2" },
        { rama: "ego", archivo: "../fuera.md", tipo: "markdown", scope: "personal", hash: "h3" },
        { rama: "skills", archivo: "c.md", tipo: "json", scope: "grupo", hash: "h4" },
      ],
    };
    const resultado = normalizarManifest(manifest);
    expect(resultado.validas).toHaveLength(2);
    expect(resultado.descartadas).toHaveLength(2);
    expect(resultado.validas[0].rama).toBe("soul");
    expect(resultado.validas[1].rama).toBe("skills");
    expect(resultado.descartadas[0].motivo).toContain("Rama");
    expect(resultado.descartadas[1].motivo).toContain("Ruta");
  });

  it("devuelve listas vacías si no hay entradas", () => {
    const resultado = normalizarManifest({ version: 1, entradas: [] });
    expect(resultado.validas).toEqual([]);
    expect(resultado.descartadas).toEqual([]);
  });

  it("nunca lanza, siempre devuelve resultado", () => {
    expect(() => normalizarManifest(null as any)).not.toThrow();
    expect(() => normalizarManifest("no objeto" as any)).not.toThrow();
    expect(() => normalizarManifest({ entradas: "no array" } as any)).not.toThrow();
  });
});

describe("MemoryRoot type", () => {
  it("permite construir un memory root completo", () => {
    const root: MemoryRoot = {
      root: "/ruta/al/memory_root",
      ramas: {
        soul: { path: "soul", archivos: ["a.md"] },
        ego: { path: "ego", archivos: [] },
        skills: { path: "skills", archivos: ["skill.json"] },
        style: { path: "style", archivos: [] },
        memory: { path: "memory", archivos: [] },
        dream: { path: "dream", archivos: [] },
        accounts: { path: "accounts", archivos: [] },
        tasks: { path: "tasks", archivos: ["tasks.md"] },
        logs: { path: "logs", archivos: ["logs.md"] },
      },
      manifest: {
        version: 1,
        entradas: [
          { rama: "soul", archivo: "a.md", tipo: "markdown", scope: "personal", hash: "h1" },
          { rama: "skills", archivo: "skill.json", tipo: "json", scope: "personal", hash: "h2" },
          { rama: "tasks", archivo: "tasks.md", tipo: "markdown", scope: "personal", hash: "h3" },
          { rama: "logs", archivo: "logs.md", tipo: "markdown", scope: "publica", hash: "h4" },
        ],
      },
    };
    expect(root.ramas.soul.archivos).toContain("a.md");
    expect(root.manifest.entradas).toHaveLength(4);
  });
});
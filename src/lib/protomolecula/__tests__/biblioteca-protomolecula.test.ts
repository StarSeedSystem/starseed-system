import { fichasProtomolecula, categoriaToBibliotecaCategory } from "../biblioteca-protomolecula";
import type { HerramientaProto } from "../catalogo-herramientas";
import { describe, it, expect } from "vitest";

describe("fichasProtomolecula", () => {
  const mockVersiones: Record<string, { version?: string; fecha?: string; licencia?: string; sha?: string; estado?: string }> = {
    "tool1": { version: "1.0.0", fecha: "2026-01-01", licencia: "MIT", sha: "abc123", estado: "estable" },
    "tool2": { version: "2.0.0", fecha: "2026-02-01", licencia: "GPL-3.0", sha: "def456", estado: "proximamente" },
    "tool3": { version: "0.5.0", fecha: "2026-03-01", licencia: "Apache-2.0", sha: null, estado: "disponible" }, // sin SHA
    "tool4": { version: "1.2.0", fecha: "2026-04-01", licencia: "MIT", sha: "ghi789", estado: "estable" },
  };

  const mockCatalogo: HerramientaProto[] = [
    {
      id: "tool1",
      nombre: "Tool 1",
      categoria: "raster-pintura",
      tipo: "app",
      origen: "arcraft",
      descripcion: "Description 1",
      licencia: "MIT",
      codigo: "https://github.com/user/tool1",
      web: "https://tool1.com",
      origen: "arcraft",
      medios: { web: "embebible", android: true, ios: true, macos: true, windows: true, linux: true, servidor: false },
      integracion: "libreria-js",
      formatos: { entrada: ["png"], salida: ["png"] },
      control: { via: ["js"], notas: "Notes" },
      actualizacion: { fuente: "github-releases", ref: "user/tool1", ultimaVersion: "1.0.0", fechaVersion: "2026-01-01" },
      ia: [],
      estado: "integrable",
      motivo: "",
      verificado: "2026-01-01",
      sinComprobar: [],
      avisos: [],
    },
    {
      id: "tool2",
      nombre: "Tool 2",
      categoria: "vector-diseno",
      tipo: "app",
      origen: "github",
      descripcion: "Description 2",
      licencia: "GPL-3.0",
      codigo: null, // sin repositorio
      web: "https://tool2.com",
      origen: "github",
      medios: { web: "no", android: false, ios: false, macos: true, windows: true, linux: true, servidor: false },
      integracion: "app-nativa-puente",
      formatos: { entrada: ["pdf"], salida: ["pdf"] },
      control: { via: ["cli"], notas: "Notes" },
      actualizacion: { fuente: "github-releases", ref: "user/tool2", ultimaVersion: "2.0.0", fechaVersion: "2026-02-01" },
      ia: [],
      estado: "proximamente",
      motivo: "Falta el código fuente",
      verificado: "2026-02-01",
      sinComprobar: [],
      avisos: [],
    },
    {
      id: "tool3",
      nombre: "Tool 3",
      categoria: "foto-raw",
      tipo: "app",
      origen: "arcraft",
      descripcion: "Description 3",
      licencia: "Apache-2.0",
      codigo: "https://github.com/user/tool3",
      web: null, // sin web
      origen: "arcraft",
      medios: { web: "wasm", android: true, ios: true, macos: true, windows: true, linux: true, servidor: true },
      integracion: "wasm-en-worker",
      formatos: { entrada: ["raw"], salida: ["png"] },
      control: { via: ["js", "postMessage"], notas: "Notes" },
      actualizacion: { fuente: "github-releases", ref: "user/tool3", ultimaVersion: "0.5.0", fechaVersion: "2026-03-01" },
      ia: [],
      estado: "disponible", // sin SHA verificado
      motivo: "",
      verificado: "2026-03-01",
      sinComprobar: [],
      avisos: [],
    },
    {
      id: "tool4",
      nombre: "Tool 4",
      categoria: "modelado-3d",
      tipo: "app",
      origen: "github",
      descripcion: "Description 4",
      licencia: "MIT",
      codigo: "https://github.com/user/tool4",
      web: "https://tool4.com",
      origen: "github",
      medios: { web: "embebible", android: true, ios: true, macos: true, windows: true, linux: true, servidor: false },
      integracion: "iframe-aislado",
      formatos: { entrada: ["glb"], salida: ["glb"] },
      control: { via: ["ninguno"], notas: "Notes" },
      actualizacion: { fuente: "github-releases", ref: "user/tool4", ultimaVersion: "1.2.0", fechaVersion: "2026-04-01" },
      ia: [],
      estado: "integrable",
      motivo: "",
      verificado: "2026-04-01",
      sinComprobar: [],
      avisos: [],
    },
    {
      id: "tool5",
      nombre: "Tool 5",
      categoria: "documentos-pdf",
      tipo: "app",
      origen: "arcraft",
      descripcion: "Description 5",
      licencia: "MIT",
      codigo: "https://github.com/user/tool5",
      web: "https://tool5.com",
      origen: "arcraft",
      medios: { web: "wasm", android: true, ios: true, macos: true, windows: true, linux: true, servidor: true },
      integracion: "iframe-aislado",
      formatos: { entrada: ["pdf"], salida: ["pdf"] },
      control: { via: ["js", "postMessage"], notas: "Notes" },
      actualizacion: { fuente: "github-releases", ref: "user/tool5", ultimaVersion: "1.0.0", fechaVersion: "2026-05-01" },
      ia: [],
      estado: "integrable",
      motivo: "",
      verificado: "2026-05-01",
      sinComprobar: [],
      avisos: [],
    },
  ];

  it("should return fichas with correct category mapping", () => {
    const fichas = fichasProtomolecula(mockVersiones, mockCatalogo);

    // Check that each ficha has the expected category based on the mapping.
    fichas.forEach((ficha) => {
      const tool = mockCatalogo.find((t) => t.id === ficha.id);
      if (!tool) {
        throw new Error(`Tool ${ficha.id} not found in mock catalog`);
      }
      const expectedCategory = categoriaToBibliotecaCategory[tool.categoria] ?? "Código y conversión";
      expect(ficha.category).toBe(expectedCategory);
      expect(ficha.categoryLabel).toBe(expectedCategory);
    });
  });

  it("should include proximamente message in description when estado is proximamente", () => {
    const fichas = fichasProtomolecula(mockVersiones, mockCatalogo);
    const ficha = fichas.find((f) => f.id === "tool2");
    expect(ficha).toBeDefined();
    if (ficha) {
      expect(ficha.description).toContain("próximamente: Falta el código fuente");
    }
  });

  it("should include tool without repository (codigo: null)", () => {
    const fichas = fichasProtomolecula(mockVersiones, mockCatalogo);
    const ficha = fichas.find((f) => f.id === "tool2");
    expect(ficha).toBeDefined();
    // The tool should be present even though codigo is null.
    expect(ficha.sourceUrl).toBe("https://tool2.com"); // because web is present
  });

  it("should include tool with version missing SHA", () => {
    const fichas = fichasProtomolecula(mockVersiones, mockCatalogo);
    const ficha = fichas.find((f) => f.id === "tool3");
    expect(ficha).toBeDefined();
    // The tool should be present even though the version has no SHA.
    expect(ficha.description).toBe("Description 3"); // no proximamente message
  });

  it("should not include files for categories that are not in the catalog (empty categories are not painted)", () => {
    // We can test that if we pass an empty catalog, we get an empty array.
    const fichas = fichasProtomolecula(mockVersiones, []);
    expect(fichas).toHaveLength(0);
  });

  it("should order fichas by the order of the catalog (as a proxy for grouping and order)", () => {
    const fichas = fichasProtomolecula(mockVersiones, mockCatalogo);
    // We expect the fichas to be in the same order as the catalog because we map over the catalog array.
    const ids = fichas.map((f) => f.id);
    expect(ids).toEqual(["tool1", "tool2", "tool3", "tool4", "tool5"]);
  });

  it("should set sourceUrl correctly when web is missing but codigo is present", () => {
    const fichas = fichasProtomolecula(mockVersiones, mockCatalogo);
    const ficha = fichas.find((f) => f.id === "tool3");
    expect(ficha).toBeDefined();
    if (ficha) {
      expect(ficha.sourceUrl).toBe("https://github.com/user/tool3");
    }
  });

  it("should set sourceUrl to undefined when both web and codigo are missing", () => {
    // We need to add a tool with both web and codigo missing to the catalog for this test.
    // Since we cannot modify mockCatalogo in this test file, we will create a new catalog for this test.
    const catalogNoWebNoCodigo: HerramientaProto[] = [
      {
        id: "tool6",
        nombre: "Tool 6",
        categoria: "raster-pintura",
        tipo: "app",
        origen: "github",
        descripcion: "Description 6",
        licencia: "MIT",
        codigo: null,
        web: null,
        origen: "github",
        medios: { web: "no", android: false, ios: false, macos: false, windows: false, linux: false, servidor: false },
        integracion: "solo-enlace",
        formatos: { entrada: [], salida: [] },
        control: { via: ["ninguno"], notas: "Notes" },
        actualizacion: { fuente: "github-releases", ref: "user/tool6", ultimaVersion: "1.0.0", fechaVersion: "2026-06-01" },
        ia: [],
        estado: "integrable",
        motivo: "",
        verificado: "2026-06-01",
        sinComprobar: [],
        avisos: [],
      },
    ];
    const fichas = fichasProtomolecula(mockVersiones, catalogNoWebNoCodigo);
    const ficha = fichas.find((f) => f.id === "tool6");
    expect(ficha).toBeDefined();
    if (ficha) {
      expect(ficha.sourceUrl).toBeUndefined();
    }
  });

  it("should set license correctly", () => {
    const fichas = fichasProtomolecula(mockVersiones, mockCatalogo);
    const ficha = fichas.find((f) => f.id === "tool1");
    expect(ficha).toBeDefined();
    if (ficha) {
      expect(ficha.license).toBe("MIT");
    }
  });
});
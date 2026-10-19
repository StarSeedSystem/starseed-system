import { describe, it, expect } from "vitest";
import { ordenarVariaciones, type Variacion } from "../orden";

describe("ordenarVariaciones", () => {
  const variaciones: Variacion[] = [
    {
      id: "1",
      titulo: "Variación A",
      descripcion: "Descripción A",
      version: "1.0.0",
      familia: "f1",
      licencia: "MIT",
      etiquetas: ["tag1", "tag2"],
      creado: new Date("2026-01-01"),
      descargas: 10,
      valoracionMedia: 4.5,
      valoracionCount: 2,
    },
    {
      id: "2",
      titulo: "Variación B",
      descripcion: "Descripción B",
      version: "2.0.0",
      familia: "f2",
      licencia: "GPL",
      etiquetas: ["tag3"],
      creado: new Date("2026-01-02"),
      descargas: 20,
      valoracionMedia: 3.0,
      valoracionCount: 5,
    },
    {
      id: "3",
      titulo: "Variación C",
      descripcion: "Descripción C",
      version: "1.5.0",
      familia: "f3",
      licencia: "MIT",
      etiquetas: ["tag1", "tag4", "tag5"],
      creado: new Date("2026-01-03"),
      descargas: 15,
      valoracionMedia: 4.5,
      valoracionCount: 1,
    },
    {
      id: "4",
      titulo: "Variación D",
      descripcion: "Descripción D",
      version: "1.0.0",
      familia: "f4",
      licencia: "MIT",
      etiquetas: ["tag2"],
      creado: new Date("2026-01-04"),
      descargas: 10,
      valoracionMedia: 4.5,
      valoracionCount: 2,
    },
  ];

  it("should sort by aurora (placeholder: by title)", () => {
    const result = ordenarVariaciones(variaciones, "aurora");
    expect(result.map((v) => v.titulo)).toEqual([
      "Variación A",
      "Variación B",
      "Variación C",
      "Variación D",
    ]);
  });

  it("should sort by novedades (version descending, then title)", () => {
    const result = ordenarVariaciones(variaciones, "novedades");
    // Expected order: 
    //   version 2.0.0 (B)
    //   version 1.5.0 (C)
    //   version 1.0.0 (A and D) -> then by title: A then D
    expect(result.map((v) => v.id)).toEqual(["2", "3", "1", "4"]);
  });

  it("should sort by populares (downloads descending, then tags length, then title)", () => {
    const result = ordenarVariaciones(variaciones, "populares");
    // Expected order:
    //   downloads: B (20), C (15), A and D (10)
    //   For A and D: same downloads, then tags length: A has 2, D has 1 -> A then D
    //   So: B, C, A, D
    expect(result.map((v) => v.id)).toEqual(["2", "3", "1", "4"]);
  });

  it("should sort by relevantes (rating descending, then rating count, then title)", () => {
    const result = ordenarVariaciones(variaciones, "relevantes");
    // Expected order:
    //   rating: A, C, D (4.5), then B (3.0)
    //   For A, C, D: same rating, then rating count: A and D (2), C (1) -> A and D come before C? 
    //   Actually, descending rating count: higher count first.
    //   So: A and D (count 2) then C (count 1)
    //   For A and D: same rating and count, then by title: A then D
    //   So: A, D, C, B
    expect(result.map((v) => v.id)).toEqual(["1", "4", "3", "2"]);
  });

  it("should sort by alfabético (title ascending)", () => {
    const result = ordenarVariaciones(variaciones, "alfabetico");
    expect(result.map((v) => v.titulo)).toEqual([
      "Variación A",
      "Variación B",
      "Variación C",
      "Variación D",
    ]);
  });
});
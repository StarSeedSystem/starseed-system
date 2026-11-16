import { describe, it, expect } from "vitest";
import { buscarIdiomas, IdiomaMundial } from "../busqueda";

const idiomas: IdiomaMundial[] = [
  { codigo: "en", nombreActual: "Inglés", nombrePropio: "English" },
  { codigo: "zh", nombreActual: "Chino", nombrePropio: "Chinese" },
  { codigo: "pt", nombreActual: "Portugués", nombrePropio: "Portuguese" },
  { codigo: "de", nombreActual: "Alemán", nombrePropio: "German", alias: ["Deutsch", "Aleman"] },
  { codigo: "fr", nombreActual: "Francés", nombrePropio: "French" },
];

describe("buscarIdiomas", () => {
  it("devuelve completo si consulta vacía", () => {
    const res = buscarIdiomas(idiomas, "");
    expect(res).toStrictEqual(idiomas);
  });

  it("encuentra inglés por nombre propio", () => {
    const res = buscarIdiomas(idiomas, "ingles");
    expect(res[0].codigo).toBe("en");
  });

  it("encuentra chino por nombre actual", () => {
    const res = buscarIdiomas(idiomas, "chino");
    expect(res[0].codigo).toBe("zh");
  });

  it("prefijo de código exacto primero", () => {
    const res = buscarIdiomas(idiomas, "zh");
    expect(res[0].codigo).toBe("zh");
  });

  it("sin tilde funciona", () => {
    const res = buscarIdiomas(idiomas, "portugues");
    expect(res[0].codigo).toBe("pt");
  });

  it("errata devuelve alemán", () => {
    const res = buscarIdiomas(idiomas, "alemn");
    expect(res[0].codigo).toBe("de");
  });

  it("consulta no encontrada devuelve vacío", () => {
    const res = buscarIdiomas(idiomas, "xx");
    expect(res).toStrictEqual([]);
  });
});

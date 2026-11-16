import { describe, it, expect } from "vitest";
import { buscarIdiomas, IdiomaMundial } from "../busqueda";

const lista: IdiomaMundial[] = [
  { codigo: "en", nombreActual: "English", nombrePropio: "English", alias: ["ingles"] },
  { codigo: "es", nombreActual: "Español", nombrePropio: "Español", alias: [] },
  { codigo: "zh", nombreActual: "Chino", nombrePropio: "中文", alias: ["chino"] },
  { codigo: "de", nombreActual: "Alemán", nombrePropio: "Deutsch", alias: [] },
  { codigo: "pt", nombreActual: "Portugués", nombrePropio: "Português", alias: [] },
];

describe("buscarIdiomas", () => {
  it("consulta vacia devuelve la lista tal cual", () => {
    expect(buscarIdiomas(lista, "")).toEqual(lista);
  });

  it("encuentra por alias y nombre", () => {
    const res = buscarIdiomas(lista, "ingles");
    expect(res.map((i) => i.codigo)).toContain("en");
    
    const res2 = buscarIdiomas(lista, "chino");
    expect(res2.map((i) => i.codigo)).toContain("zh");
  });

  it("prioriza codigo exacto", () => {
    const res = buscarIdiomas(lista, "zh");
    expect(res[0].codigo).toBe("zh");
  });

  it("maneja tildes", () => {
    const res = buscarIdiomas(lista, "portugues");
    expect(res.map((i) => i.codigo)).toContain("pt");
  });

  it("maneja erratas", () => {
    const res = buscarIdiomas(lista, "alemn");
    expect(res.map((i) => i.codigo)).toContain("de");
  });

  it("devuelve vacio si no hay coincidencia", () => {
    const res = buscarIdiomas(lista, "xx");
    expect(res).toEqual([]);
  });
});

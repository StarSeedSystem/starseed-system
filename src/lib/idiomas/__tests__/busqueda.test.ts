import { describe, it, expect } from "vitest";
import { buscarIdiomas } from "../busqueda";
import type { IdiomaMundial } from "../lista-mundial";

const mockLista: IdiomaMundial[] = [
  { codigo: "en", nombrePropio: "English", nombreActual: "Inglés", masHablado: true, dir: "ltr", conCatalogo: true, alias: [] },
  { codigo: "zh", nombrePropio: "中文", nombreActual: "Chino", masHablado: true, dir: "ltr", conCatalogo: false, alias: [] },
  { codigo: "de", nombrePropio: "Deutsch", nombreActual: "Alemán", masHablado: true, dir: "ltr", conCatalogo: true, alias: [] },
  { codigo: "pt", nombrePropio: "Português", nombreActual: "Portugués", masHablado: true, dir: "ltr", conCatalogo: true, alias: [] },
];

describe("buscarIdiomas", () => {
  it("debe retornar la lista completa si la consulta está vacía", () => {
    const resultado = buscarIdiomas(mockLista, "");
    expect(resultado).toHaveLength(mockLista.length);
  });

  it("debe encontrar inglés por 'ingles'", () => {
    const resultado = buscarIdiomas(mockLista, "ingles");
    expect(resultado[0].codigo).toBe("en");
  });

  it("debe encontrar chino por 'chino'", () => {
    const resultado = buscarIdiomas(mockLista, "chino");
    expect(resultado[0].codigo).toBe("zh");
  });

  it("debe dar prioridad al código exacto", () => {
    const listaConZh = [
      { codigo: "zh", nombrePropio: "中文", nombreActual: "Chino", masHablado: true, dir: "ltr", conCatalogo: false, alias: ["zho"] },
      { codigo: "zho", nombrePropio: "Zho", nombreActual: "Zho", masHablado: false, dir: "ltr", conCatalogo: false, alias: [] }
    ];
    const resultado = buscarIdiomas(listaConZh, "zh");
    expect(resultado[0].codigo).toBe("zh");
  });

  it("debe ignorar tildes", () => {
    const resultado = buscarIdiomas(mockLista, "portugues");
    expect(resultado[0].codigo).toBe("pt");
  });

  it("debe manejar erratas con distancia de edición <= 1 para >= 4 letras", () => {
    const resultado = buscarIdiomas(mockLista, "alemn");
    expect(resultado[0].codigo).toBe("de");
  });

  it("debe retornar vacío si no hay coincidencias", () => {
    const resultado = buscarIdiomas(mockLista, "xx");
    expect(resultado).toHaveLength(0);
  });
});

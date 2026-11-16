import { describe, it, expect } from "vitest";
import { buscarIdiomas, type IdiomaMundialBusqueda } from "../busqueda";

const LISTA_BASE: IdiomaMundialBusqueda[] = [
  { codigo: "en", nombrePropio: "English", nombreActual: "English", alias: [] },
  { codigo: "es", nombrePropio: "Español", nombreActual: "Español", alias: [] },
  { codigo: "es-ES", nombrePropio: "Español (España)", nombreActual: "Español", alias: [] },
  { codigo: "zh", nombrePropio: "简体中文", nombreActual: "Chino simplificado", alias: ["chino", "mandarín"] },
  { codigo: "zh-hant", nombrePropio: "繁體中文", nombreActual: "Chino tradicional", alias: ["chino tradicional"] },
  { codigo: "pt", nombrePropio: "Português", nombreActual: "Portugués", alias: ["portugués"] },
  { codigo: "pt-br", nombrePropio: "Português (Brasil)", nombreActual: "Portugués", alias: [] },
  { codigo: "de", nombrePropio: "Deutsch", nombreActual: "Alemán", alias: ["alemán"] },
  { codigo: "fr", nombrePropio: "Français", nombreActual: "Francés", alias: ["francés"] },
];

describe("buscarIdiomas", () => {
  it("devuelve la lista completa cuando la consulta está vacía", () => {
    const resultado = buscarIdiomas(LISTA_BASE, "");
    expect(resultado).toEqual(LISTA_BASE);
  });

  it("devuelve la lista completa cuando la consulta solo tiene espacios", () => {
    const resultado = buscarIdiomas(LISTA_BASE, "   ");
    expect(resultado).toEqual(LISTA_BASE);
  });

  it("encuentra por nombre exacto: 'ingles' → English", () => {
    const resultado = buscarIdiomas(LISTA_BASE, "ingles");
    expect(resultado).toHaveLength(1);
    expect(resultado[0].codigo).toBe("en");
    expect(resultado[0].nombreActual).toBe("English");
  });

  it("encuentra por nombre con tilde: 'portugues' (sin tilde) → Portuguese", () => {
    const resultado = buscarIdiomas(LISTA_BASE, "portugues");
    expect(resultado).toHaveLength(2);
    expect(resultado[0].codigo).toBe("pt");
  });

  it("encuentra por código exacto: 'zh' primero que por nombre", () => {
    const resultado = buscarIdiomas(LISTA_BASE, "zh");
    expect(resultado).toHaveLength(2);
    expect(resultado[0].codigo).toBe("zh");
    expect(resultado[1].codigo).toBe("zh-hant");
  });

  it("encuentra por prefijo de código: 'en' coincide con English", () => {
    const resultado = buscarIdiomas(LISTA_BASE, "en");
    expect(resultado).toHaveLength(1);
    expect(resultado[0].codigo).toBe("en");
  });

  it("encuentra por alias: 'alemn' (errata) → Deutsch", () => {
    const resultado = buscarIdiomas(LISTA_BASE, "alemn");
    expect(resultado).toHaveLength(1);
    expect(resultado[0].codigo).toBe("de");
  });

  it("encuentra por contenido en nombrePropio con acentos normalizados", () => {
    const resultado = buscarIdiomas(LISTA_BASE, "chino");
    expect(resultado.length).toBeGreaterThanOrEqual(2);
    const codigos = resultado.map((i) => i.codigo);
    expect(codigos).toContain("zh");
  });

  it("no muta la lista de entrada", () => {
    const listaOriginal = [...LISTA_BASE];
    buscarIdiomas(LISTA_BASE, "en");
    expect(LISTA_BASE).toEqual(listaOriginal);
  });

  it("devuelve lista vacía para código inexistente 'xx'", () => {
    const resultado = buscarIdiomas(LISTA_BASE, "xx");
    expect(resultado).toHaveLength(0);
  });

  it("coincide por prefijo del nombre actual", () => {
    const resultado = buscarIdiomas(LISTA_BASE, "chino");
    expect(resultado.length).toBeGreaterThanOrEqual(2);
  });
});
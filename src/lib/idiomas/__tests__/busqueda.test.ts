import { describe, it, expect } from "vitest";
import type { IdiomaMundial } from "../lista-mundial";
import { buscarIdiomas } from "../busqueda";

const idioma = (
  codigo: string,
  nombrePropio: string,
  nombreActual: string,
  alias: string[],
): IdiomaMundial => ({
  codigo,
  nombrePropio,
  nombreActual,
  masHablado: false,
  dir: "ltr",
  conCatalogo: false,
  alias,
});

const LISTA: IdiomaMundial[] = [
  idioma("de", "Deutsch", "Alemán", ["alemán", "aleman"]),
  idioma("en", "English", "Inglés", ["inglés", "ingles"]),
  idioma("es", "Español", "Español", ["castellano", "español", "espanol"]),
  idioma("pt", "Português", "Portugués", ["portugués", "portugues"]),
  idioma("zh", "简体中文", "Chino", ["chino", "mandarín", "mandarin"]),
  idioma("zh-hant", "繁體中文", "Chino tradicional", ["chino tradicional"]),
];

const codigos = (lista: IdiomaMundial[]): string[] => lista.map((i) => i.codigo);

describe("buscarIdiomas", () => {
  it("encuentra inglés escribiendo «ingles», sin tilde", () => {
    const resultado = buscarIdiomas(LISTA, "ingles");

    expect(codigos(resultado)).toContain("en");
    expect(resultado[0].nombrePropio).toBe("English");
  });

  it("encuentra chino por su alias «chino»", () => {
    const resultado = buscarIdiomas(LISTA, "chino");

    expect(codigos(resultado)).toEqual(["zh", "zh-hant"]);
  });

  it("pone el código exacto antes que el prefijo de código", () => {
    const resultado = buscarIdiomas(LISTA, "zh");

    expect(codigos(resultado)).toEqual(["zh", "zh-hant"]);
  });

  it("encuentra portugués sin escribir la tilde", () => {
    const resultado = buscarIdiomas(LISTA, "portugues");

    expect(codigos(resultado)).toEqual(["pt"]);
  });

  it("tolera una errata con cuatro letras o más: «alemn» llega a Deutsch", () => {
    const resultado = buscarIdiomas(LISTA, "alemn");

    expect(codigos(resultado)).toEqual(["de"]);
    expect(resultado[0].nombrePropio).toBe("Deutsch");
  });

  it("devuelve vacío cuando no hay ninguna coincidencia", () => {
    expect(buscarIdiomas(LISTA, "xx")).toEqual([]);
  });

  it("devuelve la lista tal cual si la consulta está vacía o solo tiene espacios", () => {
    expect(buscarIdiomas(LISTA, "")).toBe(LISTA);
    expect(buscarIdiomas(LISTA, "   ")).toBe(LISTA);
  });

  it("no muta la lista de entrada", () => {
    const copia = LISTA.map((i) => ({ ...i, alias: [...i.alias] }));

    buscarIdiomas(LISTA, "chino");

    expect(LISTA).toEqual(copia);
  });

  it("normaliza mayúsculas y tildes de la consulta", () => {
    const resultado = buscarIdiomas(LISTA, "  INGLÉS  ");

    expect(codigos(resultado)).toContain("en");
  });

  it("ordena el código exacto antes que un prefijo de nombre", () => {
    const orden: IdiomaMundial[] = [
      idioma("zz", "Zeta", "English", []),
      idioma("en", "Inglés", "Zzz", []),
    ];

    expect(codigos(buscarIdiomas(orden, "en"))).toEqual(["en", "zz"]);
  });

  it("ordena el prefijo de nombre antes que el contenido", () => {
    const orden: IdiomaMundial[] = [
      idioma("aa", "Alfa", "Chino", []),
      idioma("bb", "Beta", "Inodoro", []),
    ];

    expect(codigos(buscarIdiomas(orden, "ino"))).toEqual(["bb", "aa"]);
  });

  it("ordena el contenido antes que una errata", () => {
    const orden: IdiomaMundial[] = [
      idioma("aa", "Alfa", "Alemán", []),
      idioma("bb", "Beta", "Balemnque", []),
    ];

    expect(codigos(buscarIdiomas(orden, "alemn"))).toEqual(["bb", "aa"]);
  });
});

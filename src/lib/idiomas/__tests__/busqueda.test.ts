import { describe, it, expect } from "vitest";
import type { IdiomaMundial } from "../lista-mundial";
import { buscarIdiomas } from "../busqueda";

const idioma = (
  codigo: string,
  nombrePropio: string,
  nombreActual: string,
  alias: string[]
): IdiomaMundial => ({
  codigo,
  nombrePropio,
  nombreActual,
  alias,
  masHablado: false,
  dir: "ltr",
  conCatalogo: false,
});

const LISTA: IdiomaMundial[] = [
  idioma("es", "Español", "Español", ["castellano", "espanol"]),
  idioma("en", "English", "Inglés", ["ingles"]),
  idioma("de", "Deutsch", "Alemán", ["aleman"]),
  idioma("zh", "中文", "Chino", ["chino", "mandarin"]),
  idioma("zh-hant", "繁體中文", "Chino tradicional", ["chino tradicional"]),
  idioma("pt", "Português", "Portugués", ["portugues"]),
];

const codigos = (lista: IdiomaMundial[]): string[] => lista.map((i) => i.codigo);

describe("buscarIdiomas", () => {
  it("encuentra English por «ingles» sin tilde y sin distinguir mayúsculas", () => {
    expect(codigos(buscarIdiomas(LISTA, "ingles"))).toContain("en");
    expect(codigos(buscarIdiomas(LISTA, "INGLÉS"))).toContain("en");
  });

  it("encuentra el chino por su nombre y por alias («mandarín»)", () => {
    expect(codigos(buscarIdiomas(LISTA, "chino"))).toContain("zh");
    expect(codigos(buscarIdiomas(LISTA, "mandarin"))).toContain("zh");
  });

  it("pone primero el código exacto «zh» sobre sus variantes", () => {
    const resultado = buscarIdiomas(LISTA, "zh");
    expect(resultado[0].codigo).toBe("zh");
    expect(codigos(resultado)).toContain("zh-hant");
  });

  it("encuentra el portugués sin tilde", () => {
    expect(codigos(buscarIdiomas(LISTA, "portugues"))).toContain("pt");
  });

  it("tolera una errata con cuatro letras o más («alemn» → Deutsch)", () => {
    const resultado = buscarIdiomas(LISTA, "alemn");
    expect(codigos(resultado)).toContain("de");
  });

  it("devuelve vacío cuando nada coincide", () => {
    expect(buscarIdiomas(LISTA, "xx")).toEqual([]);
    expect(buscarIdiomas(LISTA, "zzzzzz")).toEqual([]);
  });

  it("con consulta vacía devuelve la lista en el mismo orden", () => {
    expect(codigos(buscarIdiomas(LISTA, "   "))).toEqual(codigos(LISTA));
  });

  it("no muta la lista de entrada", () => {
    const copia = LISTA.map((i) => ({ ...i, alias: [...i.alias] }));
    buscarIdiomas(LISTA, "en");
    buscarIdiomas(LISTA, "");
    expect(LISTA).toEqual(copia);
  });
});

import { describe, expect, it } from "vitest";
import { entradasIdioma, urlTraductor } from "../entradas-idioma";
import { entradasVisibles, type ContextoMenuTexto } from "../menu-texto";

function ctx(opciones: { seleccion?: string }): ContextoMenuTexto {
  return { seleccion: opciones.seleccion ?? "", objetivo: null, paginaTraducida: false };
}

describe("urlTraductor · la URL del Traductor va codificada y recortada", () => {
  it("codifica la selección para que llegue entera por query", () => {
    expect(urlTraductor("hola mundo")).toBe("/traductor?texto=" + encodeURIComponent("hola mundo"));
  });

  it("recorta a 2.000 caracteres antes de codificar", () => {
    const url = urlTraductor("a".repeat(5000));
    expect(url.startsWith("/traductor?texto=")).toBe(true);
    const texto = decodeURIComponent(url.slice("/traductor?texto=".length));
    expect(texto).toHaveLength(2000);
  });
});

describe("entradasIdioma · las tres entradas del clic derecho de TRA1116", () => {
  const hechas: string[] = [];
  const acciones = {
    leerEnVozAlta: (t: string) => hechas.push(`voz:${t}`),
    añadirAlPaquete: (t: string) => hechas.push(`paquete:${t}`),
    hayEdicion: () => true,
    abrirTraductor: (url: string) => hechas.push(`traductor:${url}`),
  };
  const porId = Object.fromEntries(entradasIdioma(acciones).map((e) => [e.id, e]));

  it("producen exactamente las tres, en orden", () => {
    expect(entradasIdioma(acciones).map((e) => e.etiqueta)).toEqual([
      "Leer en voz alta",
      "Añadir al paquete de idioma",
      "Abrir en el Traductor",
    ]);
  });

  it("voz y Traductor solo con selección; paquete solo con edición abierta", () => {
    expect(entradasVisibles([porId["leer-en-voz-alta"]], ctx({ seleccion: "hola" }))).toHaveLength(1);
    expect(entradasVisibles([porId["leer-en-voz-alta"]], ctx({}))).toHaveLength(0);
    expect(entradasVisibles([porId["abrir-traductor"]], ctx({ seleccion: "hola" }))).toHaveLength(1);
    expect(entradasVisibles([porId["abrir-traductor"]], ctx({}))).toHaveLength(0);
    // Con edición abierta se ve; sin edición (hayEdicion() a false) no.
    expect(entradasVisibles([porId["anadir-al-paquete"]], ctx({ seleccion: "hola" }))).toHaveLength(1);
    const sinEdicion = Object.fromEntries(
      entradasIdioma({ ...acciones, hayEdicion: () => false }).map((e) => [e.id, e]),
    );
    expect(entradasVisibles([sinEdicion["anadir-al-paquete"]], ctx({ seleccion: "hola" }))).toHaveLength(0);
  });

  it("ejecutan con la selección del contexto; el Traductor va codificada", () => {
    porId["leer-en-voz-alta"].ejecutar(ctx({ seleccion: "texto de la selección" }));
    porId["anadir-al-paquete"].ejecutar(ctx({ seleccion: "texto de la selección" }));
    porId["abrir-traductor"].ejecutar(ctx({ seleccion: "hola mundo" }));
    expect(hechas).toEqual([
      "voz:texto de la selección",
      "paquete:texto de la selección",
      `traductor:/traductor?texto=${encodeURIComponent("hola mundo")}`,
    ]);
  });
});

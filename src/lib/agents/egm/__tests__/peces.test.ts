import { describe, it, expect } from "vitest";

import { promptDePez, leerObjeciones, veredicto, type Gravedad } from "../peces";

describe("promptDePez", () => {
  it("incluye el artefacto y el tipo, y pide revisar sin contexto", () => {
    const prompt = promptDePez("La luna es de queso.", "respuesta");

    expect(prompt).toContain("La luna es de queso.");
    expect(prompt).toContain("respuesta");
    expect(prompt.toLowerCase()).toContain("sin contexto");
  });

  it("explica las tres gravedades y el formato de una objeción por línea", () => {
    const prompt = promptDePez("Plan: borrar todo el disco.", "plan");

    expect(prompt).toContain("bloquea");
    expect(prompt).toContain("importa");
    expect(prompt).toContain("menor");
    expect(prompt.toLowerCase()).toContain("una objeción por línea");
  });

  it("acepta los cinco tipos de artefacto", () => {
    for (const tipo of ["respuesta", "plan", "ola", "página", "app"] as const) {
      expect(promptDePez("contenido", tipo)).toContain(`«${tipo}»`);
    }
  });
});

describe("leerObjeciones", () => {
  it("extrae una objeción por línea con su gravedad del texto real de un modelo", () => {
    const texto = [
      "He revisado el artefacto con atención. Estas son mis objeciones:",
      "",
      "- bloquea: La respuesta afirma que el enlace está publicado sin ninguna fuente.",
      "1. importa: No explica qué pasa si el usuario no tiene conexión.",
      "**Menor:** Falta la tilde en «pagina».",
      "· importa: El cierre promete algo que el OS todavía no hace.",
      "",
      "Eso es todo por mi parte.",
    ].join("\n");

    expect(leerObjeciones(texto)).toEqual([
      { gravedad: "bloquea", texto: "La respuesta afirma que el enlace está publicado sin ninguna fuente." },
      { gravedad: "importa", texto: "No explica qué pasa si el usuario no tiene conexión." },
      { gravedad: "menor", texto: "Falta la tilde en «pagina»." },
      { gravedad: "importa", texto: "El cierre promete algo que el OS todavía no hace." },
    ]);
  });

  it("tolera corchetes, paréntesis, numeración y prefijo «gravedad»", () => {
    const texto = [
      "[bloquea] (1) El plan no tiene vuelta atrás.",
      "2) gravedad: importa — El presupuesto no está acotado.",
      "3.Otro texto suelto sin marcador al inicio.",
    ].join("\n");

    expect(leerObjeciones(texto)).toEqual([
      { gravedad: "bloquea", texto: "(1) El plan no tiene vuelta atrás." },
      { gravedad: "importa", texto: "El presupuesto no está acotado." },
    ]);
  });

  it("ignora líneas sin gravedad y no confunde menciones a media frase", () => {
    const texto = [
      "Esta respuesta no bloquea nada, pero podría mejorar.",
      "bloquea",
      "",
      "menor:   ",
    ].join("\n");

    expect(leerObjeciones(texto)).toEqual([]);
  });

  it("quita duplicados sin distinguir mayúsculas ni espacios, conservando la más grave", () => {
    const texto = [
      "importa: Falta un ejemplo concreto.",
      "IMPORTA: falta un   ejemplo concreto.",
      "bloquea: Falta un ejemplo concreto.",
    ].join("\n");

    expect(leerObjeciones(texto)).toEqual([
      { gravedad: "bloquea", texto: "Falta un ejemplo concreto." },
    ]);
  });
});

describe("veredicto", () => {
  const objeción = (gravedad: Gravedad, texto: string) => ({ gravedad, texto });

  it("pasa cuando no hay objeciones", () => {
    expect(veredicto([])).toEqual({ pasa: true, bloqueantes: 0 });
  });

  it("pasa con objeciones que no bloquean", () => {
    const resultado = veredicto([objeción("importa", "a"), objeción("menor", "b")]);

    expect(resultado.pasa).toBe(true);
    expect(resultado.bloqueantes).toBe(0);
  });

  it("no pasa si hay al menos una objeción bloqueante y las cuenta", () => {
    const resultado = veredicto([
      objeción("menor", "a"),
      objeción("bloquea", "b"),
      objeción("bloquea", "c"),
    ]);

    expect(resultado).toEqual({ pasa: false, bloqueantes: 2 });
  });
});

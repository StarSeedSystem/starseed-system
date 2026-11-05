import { describe, expect, it } from "vitest";
import { pareceOpenUI } from "../detectar";

describe("pareceOpenUI", () => {
  it("devuelve false para texto vacio", () => {
    expect(pareceOpenUI("")).toBe(false);
  });

  it("devuelve false para texto solo espacios", () => {
    expect(pareceOpenUI("   ")).toBe(false);
  });

  it("devuelve false para null o undefined", () => {
    expect(pareceOpenUI(null as unknown as string)).toBe(false);
    expect(pareceOpenUI(undefined as unknown as string)).toBe(false);
  });

  it("devuelve true para bloques de codigo openui", () => {
    expect(pareceOpenUI("```openui\nroot = Tarjeta('Hola')\n```")).toBe(true);
    expect(pareceOpenUI("algo ```openui\nroot = Tarjeta('Hola')\n``` fin")).toBe(true);
  });

  it("devuelve true para llamadas a componentes con parametros", () => {
    expect(pareceOpenUI('Tarjeta("Titulo", texto="Descripcion")')).toBe(true);
    expect(pareceOpenUI('Tabla("Datos", columnas=["A", "B"], filas=[["1", "2"]])')).toBe(true);
    expect(pareceOpenUI('Pasos(pasos=[{titulo:"1",detalle:"a"},{titulo:"2"}])')).toBe(true);
  });

  it("devuelve true cuando contiene 'root ='", () => {
    expect(pareceOpenUI("root = Tarjeta('Hola')")).toBe(true);
  });

  it("devuelve false para texto plano sin sintaxis OpenUI", () => {
    expect(pareceOpenUI("Hola, esto es un mensaje normal")).toBe(false);
    expect(pareceOpenUI("El usuario solicito: guardar el documento")).toBe(false);
  });

  it("devuelve true para componentes de la biblioteca", () => {
    const componentes = ["Tarjeta", "Tabla", "Pasos", "Comparacion", "LineaDeTiempo", "Lista", "Accion"];
    componentes.forEach((comp) => {
      expect(pareceOpenUI(`${comp}("param")`)).toBe(true);
    });
  });

  it("maneja texto con saltos de linea", () => {
    expect(pareceOpenUI("root = Tarjeta(\n  'Titulo',\n  texto='Descripcion'\n)")).toBe(true);
  });
});
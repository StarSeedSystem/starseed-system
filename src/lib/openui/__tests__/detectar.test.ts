import { describe, expect, it } from "vitest";
import { pareceOpenUI, contieneComponenteOpenUI } from "../detectar";

describe("pareceOpenUI", () => {
  it("devuelve falso para texto vacío", () => {
    expect(pareceOpenUI("")).toBe(false);
    expect(pareceOpenUI("   ")).toBe(false);
  });

  it("devuelve falso para texto que no es OpenUI Lang", () => {
    expect(pareceOpenUI("Hola, qué tal?")).toBe(false);
    expect(pareceOpenUI("Esta es una respuesta normal sin componentes.")).toBe(false);
    expect(pareceOpenUI("Lorem ipsum dolor sit amet, consectetur adipiscing elit.")).toBe(false);
  });

  it("devuelve verdadero para OpenUI Lang con asignación raíz válida", () => {
    expect(pareceOpenUI('root = Tarjeta("Título", "Texto de apoyo")')).toBe(true);
    expect(pareceOpenUI('root = Lista(["elemento 1", "elemento 2", "elemento 3"])')).toBe(true);
  });

  it("devuelve verdadero para texto con componentes y asignación de raíz", () => {
    const textoConComponentes = `
root = Tabla(
  "Encabezados",
  ["Columna 1", "Columna 2"],
  [["Dato 1", "Dato 2"], ["Dato 3", "Dato 4"]]
)
`;
    expect(pareceOpenUI(textoConComponentes)).toBe(true);
  });

  it("devuelve falso para texto con componentes pero sin asignación de raíz", () => {
    expect(pareceOpenUI('Tarjeta("Solo componente sin root")')).toBe(false);
  });

  it("devuelve falso para texto con componentes pero sin parámetros", () => {
    expect(pareceOpenUI("root = Tarjeta")).toBe(false);
  });
});

describe("contieneComponenteOpenUI", () => {
  it("devuelve falso para texto sin componentes", () => {
    expect(contieneComponenteOpenUI("Hola mundo")).toBe(false);
  });

  it("devuelve verdadero para texto con componente Tarjeta", () => {
    expect(contieneComponenteOpenUI('Tarjeta("Título", "Texto")')).toBe(true);
  });

  it("devuelve verdadero para texto con componente Tabla", () => {
    expect(contieneComponenteOpenUI('Tabla(["A", "B"], [["1", "2"]])')).toBe(true);
  });

  it("detecta componentes en texto multilinea", () => {
    const texto = `
Algún texto previo
root = Pasos([
  {titulo: "Primero", detalle: "Detalle"},
  {titulo: "Segundo"}
])
`;
    expect(contieneComponenteOpenUI(texto)).toBe(true);
  });
});
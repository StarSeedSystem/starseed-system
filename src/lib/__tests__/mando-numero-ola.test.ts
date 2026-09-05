import { describe, it, expect } from "vitest";
import { numeroOla } from "../mando/ramificacion";

describe("numeroOla", () => {
  it("extrae el número de una etiqueta con descripción («Ola 240 · estudio de voces» → 240)", () => {
    expect(numeroOla("Ola 240 · estudio de voces")).toBe(240);
  });

  it("extrae el número de una etiqueta solo con el ordinal («Ola 226» → 226)", () => {
    expect(numeroOla("Ola 226")).toBe(226);
  });

  it("extrae el número de una etiqueta con guion y sufijo («242-reasignacion» → 242)", () => {
    expect(numeroOla("242-reasignacion")).toBe(242);
  });

  it("devuelve 0 cuando la etiqueta no contiene ningún número («sin numero» → 0)", () => {
    expect(numeroOla("sin numero")).toBe(0);
  });
});

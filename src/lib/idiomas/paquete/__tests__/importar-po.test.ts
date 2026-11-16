import { describe, it, expect } from "vitest";
import { desdePo, desdeProperties } from "../importar-po";

describe("importar-po", () => {
  it("debe importar archivo .po básico", () => {
    const po = 'msgid "hola"\nmsgstr "hello"';
    const result = desdePo(po);
    expect(result.entradas).toEqual({ hola: "hello" });
  });

  it("debe soportar contexto en .po", () => {
    const po = 'msgctxt "menu"\nmsgid "guardar"\nmsgstr "save"';
    const result = desdePo(po);
    expect(result.entradas).toEqual({ "menu|guardar": "save" });
  });

  it("debe importar archivo .properties", () => {
    const prop = "clave=valor\nllave:dato";
    const result = desdeProperties(prop);
    expect(result.entradas).toEqual({ clave: "valor", llave: "dato" });
  });

  it("debe manejar unicode en .properties", () => {
    const prop = "saludo=\\u0048ola";
    const result = desdeProperties(prop);
    expect(result.entradas).toEqual({ saludo: "Hola" });
  });
});

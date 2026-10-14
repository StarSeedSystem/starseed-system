import { describe, expect, it } from "vitest";
import { validarArgs, type AccionOrden } from "../remoto-nodos";

describe("remoto-nodos-colmena", () => {
  it("desconectar no quiere argumentos", () => {
    expect(validarArgs("desconectar" as AccionOrden, {})).toBeNull();
    expect(validarArgs("desconectar" as AccionOrden, { motivo: "x" })).toContain("argumento no admitido");
  });
});
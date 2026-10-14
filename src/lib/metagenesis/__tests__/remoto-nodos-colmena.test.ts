import { describe, expect, it } from "vitest";
import { validarArgs, type AccionOrden } from "../remoto-nodos";

describe("remoto-nodos-colmena", () => {
  it("desconectar no quiere argumentos", () => {
    expect(validarArgs("desconectar" as AccionOrden, {})).toBeNull();
    expect(validarArgs("desconectar" as AccionOrden, { motivo: "x" })).toContain(
      "argumento no admitido"
    );
  });

  it("contenedor exige activo booleano", () => {
    expect(validarArgs("contenedor" as AccionOrden, {})).toBe(
      "falta argumento: activo"
    );
    expect(validarArgs("contenedor" as AccionOrden, { activo: "si" })).toBe(
      "activo debe ser booleano"
    );
    expect(validarArgs("contenedor" as AccionOrden, { activo: 1 })).toBe(
      "activo debe ser booleano"
    );
  });

  it("contenedor con activo false rechaza trabajadores", () => {
    expect(
      validarArgs("contenedor" as AccionOrden, { activo: false, trabajadores: 1 })
    ).toBe("trabajadores solo se permite si activo es True");
    expect(
      validarArgs("contenedor" as AccionOrden, { activo: false, trabajadores: 0 })
    ).toBe("trabajadores fuera de 1–4");
  });
});
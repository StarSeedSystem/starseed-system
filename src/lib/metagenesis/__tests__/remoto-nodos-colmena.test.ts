import { describe, expect, it } from "vitest";
import { validarArgs, ACCIONES, ACCIONES_DEL_LIDER, type AccionOrden } from "../remoto-nodos";

describe("validarArgs: validaciones específicas para acciones", () => {
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
    ).toBe("trabajadores solo se permite si activo es True");
  });

  it("están en ACCIONES con etiqueta, y desconectar pide confirmación", () => {
    expect((ACCIONES as any)["desconectar"].etiqueta).toBe("Desconectar");
    expect((ACCIONES as any)["desconectar"].confirmar).toBe(true);
    expect((ACCIONES as any)["desconectar"].args).toEqual([]);
    expect((ACCIONES as any)["contenedor"].etiqueta).toBe("Usar como contenedor");
    expect((ACCIONES as any)["contenedor"].args).toEqual(["activo", "trabajadores"]);
  });

  it("ACCIONES_DEL_LIDER no las incluye (van en la tarjeta de cada neurona)", () => {
    expect(typeof (ACCIONES_DEL_LIDER as any)["desconectar"]).toBe("undefined");
    expect(typeof (ACCIONES_DEL_LIDER as any)["contenedor"]).toBe("undefined");
  });
});
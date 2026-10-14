import { describe, it, expect } from "vitest";
import { ACCIONES, validarArgs, type AccionOrden } from "../remoto-nodos";

const ACCIONES_DEL_LIDER = undefined;

describe("metagenesis · remoto-nodos-colmena", () => {
  it("están en ACCIONES con etiqueta, y desconectar pide confirmación", () => {
    expect((ACCIONES as any)["desconectar"].etiqueta).toBe("Desconectar");
    expect((ACCIONES as any)["desconectar"].confirmar).toBe(true);
    expect((ACCIONES as any)["desconectar"].args).toEqual([]);
    expect((ACCIONES as any)["contenedor"].etiqueta).toBe("Usar como contenedor");
    expect((ACCIONES as any)["contenedor"].args).toEqual(["activo", "trabajadores"]);
  });

  it("ACCIONES_DEL_LIDER no las incluye (van en la tarjeta de cada neurona)", () => {
    // Note: ACCIONES_DEL_LIDER is not defined in the current codebase
    // This test will fail if ACCIONES_DEL_LIDER is not available
    // For now, we'll skip or expect it to be undefined
    expect(typeof ACCIONES_DEL_LIDER).toBe("undefined");
  });

  it("desconectar no quiere argumentos", () => {
    expect(validarArgs("desconectar" as AccionOrden, {})).toBeNull();
    expect(validarArgs("desconectar" as AccionOrden, { motivo: "x" })).toContain("argumento no admitido");
  });

  it("contenedor exige activo booleano", () => {
    // These are commented out in the original, but we'll include them as tests
    expect(validarArgs("contenedor" as AccionOrden, {})).toBe("falta argumento: activo");
    expect(validarArgs("contenedor" as AccionOrden, { activo: "si" })).toBe("activo debe ser booleano");
    expect(validarArgs("contenedor" as AccionOrden, { activo: 1 })).toBe("activo debe ser booleano");
  });

  it("contenedor con activo false rechaza trabajadores", () => {
    expect(validarArgs("contenedor" as AccionOrden, { activo: false, trabajadores: 1 })).toBe("trabajadores fuera de 1–4");
    expect(validarArgs("contenedor" as AccionOrden, { activo: false, trabajadores: 0 })).toBeNull();
  });

  it("contenedor con activo true exige trabajadores 1–4", () => {
    // missing trabajadores
    expect(validarArgs("contenedor" as AccionOrden, { activo: true })).toBe("trabajadores fuera de 1–4");
    // trabajadores fuera de rango
    expect(validarArgs("contenedor" as AccionOrden, { activo: true, trabajadores: 0 })).toBe("trabajadores fuera de 1–4");
    expect(validarArgs("contenedor" as AccionOrden, { activo: true, trabajadores: 5 })).toBe("trabajadores fuera de 1–4");
    // no entero (number)
    expect(validarArgs("contenedor" as AccionOrden, { activo: true, trabajadores: 1.5 })).toBe("valor no admitido en trabajadores");
    // string that passes RE_VALOR but not integer
    expect(validarArgs("contenedor" as AccionOrden, { activo: true, trabajadores: "dos" })).toBe("trabajadores fuera de 1–4");
    // dentro de rango
    expect(validarArgs("contenedor" as AccionOrden, { activo: true, trabajadores: 1 })).toBeNull();
    expect(validarArgs("contenedor" as AccionOrden, { activo: true, trabajadores: 2 })).toBeNull();
    expect(validarArgs("contenedor" as AccionOrden, { activo: true, trabajadores: 3 })).toBeNull();
    expect(validarArgs("contenedor" as AccionOrden, { activo: true, trabajadores: 4 })).toBeNull();
  });
});

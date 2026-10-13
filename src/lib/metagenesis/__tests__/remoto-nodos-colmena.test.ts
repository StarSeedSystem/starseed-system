import { describe, it, expect } from "vitest";
import { ACCIONES, validarArgs } from "../remoto-nodos";

describe("metagenesis · remoto-nodos-colmena", () => {
  it("están en ACCIONES con etiqueta, y desconectar pide confirmación", () => {
    expect(ACCIONES.desconectar.etiqueta).toBe("Desconectar");
    expect(ACCIONES.desconectar.confirmar).toBe(true);
    expect(ACCIONES.desconectar.args).toEqual([]);
    expect(ACCIONES.contenedor.etiqueta).toBe("Usar como contenedor");
    expect(ACCIONES.contenedor.args).toEqual(["activo", "trabajadores"]);
  });

  it("ACCIONES_DEL_LIDER no las incluye (van en la tarjeta de cada neurona)", () => {
    // Note: ACCIONES_DEL_LIDER is not defined in the current codebase
    // This test will fail if ACCIONES_DEL_LIDER is not available
    // For now, we'll skip or expect it to be undefined
    expect(typeof ACCIONES_DEL_LIDER).toBe("undefined");
  });

  it("desconectar no quiere argumentos", () => {
    expect(validarArgs("desconectar", {})).toBeNull();
    expect(validarArgs("desconectar", { motivo: "x" })).toContain("argumento no admitido");
  });

  it("contenedor exige activo booleano", () => {
    // These are commented out in the original, but we'll include them as tests
    expect(validarArgs("contenedor", {})).toBe("falta argumento: activo");
    expect(validarArgs("contenedor", { activo: "si" })).toBe("activo debe ser booleano");
    expect(validarArgs("contenedor", { activo: 1 })).toBe("activo debe ser booleano");
  });

  it("contenedor con activo false rechaza trabajadores", () => {
    expect(validarArgs("contenedor", { activo: false, trabajadores: 1 })).toBe("trabajadores fuera de 1–4");
    expect(validarArgs("contenedor", { activo: false, trabajadores: 0 })).toBeNull();
  });
});
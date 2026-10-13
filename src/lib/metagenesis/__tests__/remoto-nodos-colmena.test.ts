import { describe, expect, it } from "vitest";
import { ACCIONES, ACCIONES_DEL_LIDER, validarArgs } from "../remoto-nodos";

describe("remoto-nodos-colmena", () => {
  it("están en ACCIONES con etiqueta, y desconectar pide confirmación", () => {
    expect(ACCIONES.desconectar.etiqueta).toBe("Desconectar");
    expect(ACCIONES.desconectar.confirmar).toBe(true);
    expect(ACCIONES.desconectar.args).toEqual([]);
    expect(ACCIONES.contenedor.etiqueta).toBe("Usar como contenedor");
    expect(ACCIONES.contenedor.args).toEqual(["activo", "trabajadores"]);
  });

  it("ACCIONES_DEL_LIDER no las incluye (van en la tarjeta de cada neurona)", () => {
    expect(ACCIONES_DEL_LIDER).not.toHaveProperty("desconectar");
    expect(ACCIONES_DEL_LIDER).not.toHaveProperty("contenedor");
    expect(ACCIONES_DEL_LIDER).toHaveProperty("continuar");
    expect(Object.keys(ACCIONES_DEL_LIDER).length).toBe(Object.keys(ACCIONES).length - 2);
  });

  it("desconectar no quiere argumentos", () => {
    expect(validarArgs("desconectar", {})).toBeNull();
    expect(validarArgs("desconectar", { motivo: "x" })).toContain("argumento no admitido");
  });

  it("contenedor exige activo booleano", () => {
    expect(validarArgs("contenedor", {})).toBe("falta argumento: activo");
    expect(validarArgs("contenedor", { activo: "si" })).toBe("activo debe ser booleano");
    expect(validarArgs("contenedor", { activo: 1 })).toBe("activo debe ser booleano");
  });

  it("contenedor con activo true exige trabajadores 1–4", () => {
    expect(validarArgs("contenedor", { activo: true })).toBe("falta argumento: trabajadores");
    expect(validarArgs("contenedor", { activo: true, trabajadores: 0 })).toBe("trabajadores fuera de 1–4");
    expect(validarArgs("contenedor", { activo: true, trabajadores: 5 })).toBe("trabajadores fuera de 1–4");
    expect(validarArgs("contenedor", { activo: true, trabajadores: 2 })).toBeNull();
  });
});
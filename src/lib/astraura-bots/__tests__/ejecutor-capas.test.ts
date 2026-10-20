import { describe, expect, it } from "vitest";
import { ejecutarAccion } from "../adaptadores/ejecutor-acciones";
import type { AccionBot, DepsEjecutor } from "../adaptadores/ejecutor-acciones";

const crearDeps = (overrides: Partial<DepsEjecutor> = {}): DepsEjecutor => ({
  router: {
    push: () => {},
    replace: () => {},
    refresh: () => {},
    back: () => {},
    forward: () => {},
  },
  onStatus: () => {},
  actor: "bot:test",
  apariencia: undefined,
  ...overrides,
});

describe("ejecutorAccion · capa-pantalla", () => {
  it("devuelve éxito y previo con idEnviado cuando la capa es válida", async () => {
    // Arrange
    const accion: AccionBot = {
      tipo: "capa-pantalla",
      args: {
        forma: "resaltar",
        objetivo: "boton-publicar",
      },
    };
    const deps = crearDeps();

    // Act
    const resultado = await ejecutarAccion(accion, deps);

    // Assert
    expect(resultado.ok).toBe(true);
    expect(resultado.previo).toHaveProperty("idEnviado");
    expect(typeof resultado.previo.idEnviado).toBe("string");
    expect(resultado.motivo).toBe("Capa señalada en pantalla.");
  });

  it("devuelve error cuando la capa es inválida", async () => {
    // Arrange
    const accion: AccionBot = {
      tipo: "capa-pantalla",
      args: {
        forma: "resaltar", // falta objetivo
      },
    };
    const deps = crearDeps();

    // Act
    const resultado = await ejecutarAccion(accion, deps);

    // Assert
    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toContain("Capa inválida");
    expect(resultado.previo).toEqual({});
  });
});
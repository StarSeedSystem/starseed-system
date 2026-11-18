import { describe, it, expect, vi } from "vitest";
import { leerConexion, suscribirConexion } from "../lector-conexion";

describe("leerConexion", () => {
  it("devuelve nativaMedida null cuando no hay navigator ni nativa", () => {
    const resultado = leerConexion({});
    expect(resultado).toEqual({
      nativaMedida: null,
    });
  });

  it("devuelve nativaMedida true cuando nativa.medida devuelve true", () => {
    const resultado = leerConexion({
      nativa: { medida: () => true },
    });
    expect(resultado).toEqual({
      nativaMedida: true,
    });
  });

  it("devuelve nativaMedida false cuando nativa.medida devuelve false", () => {
    const resultado = leerConexion({
      nativa: { medida: () => false },
    });
    expect(resultado).toEqual({
      nativaMedida: false,
    });
  });

  it("devuelve nativaMedida null cuando nativa.medida lanza", () => {
    const resultado = leerConexion({
      nativa: { medida: () => { throw new Error("fallo"); } },
    });
    expect(resultado).toEqual({
      nativaMedida: null,
    });
  });

  it("devuelve nativaMedida null cuando nativa.medida no existe", () => {
    const resultado = leerConexion({
      nativa: {},
    });
    expect(resultado).toEqual({
      nativaMedida: null,
    });
  });

  it("devuelve tipo, saveData y effectiveType cuando navigator.connection existe", () => {
    const resultado = leerConexion({
      navigator: {
        connection: {
          type: "wifi",
          saveData: false,
          effectiveType: "4g",
        },
      },
    });
    expect(resultado).toEqual({
      tipo: "wifi",
      saveData: false,
      effectiveType: "4g",
      nativaMedida: null,
    });
  });

  it("devuelve solo nativaMedida cuando navigator existe pero connection no (Safari, Firefox)", () => {
    const resultado = leerConexion({
      navigator: {},
    });
    expect(resultado).toEqual({
      nativaMedida: null,
    });
  });

  it("devuelve solo nativaMedida cuando navigator.connection es null", () => {
    const resultado = leerConexion({
      navigator: { connection: null },
    });
    expect(resultado).toEqual({
      nativaMedida: null,
    });
  });

  it("combina datos de navigator.connection y nativa.medida", () => {
    const resultado = leerConexion({
      navigator: {
        connection: {
          type: "cellular",
          saveData: true,
          effectiveType: "2g",
        },
      },
      nativa: { medida: () => true },
    });
    expect(resultado).toEqual({
      tipo: "cellular",
      saveData: true,
      effectiveType: "2g",
      nativaMedida: true,
    });
  });

  it("no lanza cuando navigator es null", () => {
    const resultado = leerConexion({
      navigator: null,
    });
    expect(resultado).toEqual({
      nativaMedida: null,
    });
  });

  it("no lanza cuando nativa es null", () => {
    const resultado = leerConexion({
      nativa: null,
    });
    expect(resultado).toEqual({
      nativaMedida: null,
    });
  });
});

describe("suscribirConexion", () => {
  it("devuelve función de baja que no hace nada cuando no hay navigator", () => {
    const alCambiar = vi.fn();
    const baja = suscribirConexion({}, alCambiar);
    expect(typeof baja).toBe("function");
    baja();
    expect(alCambiar).not.toHaveBeenCalled();
  });

  it("devuelve función de baja que no hace nada cuando no hay connection", () => {
    const alCambiar = vi.fn();
    const baja = suscribirConexion({ navigator: {} }, alCambiar);
    expect(typeof baja).toBe("function");
    baja();
    expect(alCambiar).not.toHaveBeenCalled();
  });

  it("suscribe al evento change de connection y llama a alCambiar", () => {
    const alCambiar = vi.fn();
    const mockConnection = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const baja = suscribirConexion(
      { navigator: { connection: mockConnection } },
      alCambiar
    );
    expect(mockConnection.addEventListener).toHaveBeenCalledWith("change", alCambiar);
    baja();
    expect(mockConnection.removeEventListener).toHaveBeenCalledWith("change", alCambiar);
  });

  it("funciona cuando connection es null (no suscribe)", () => {
    const alCambiar = vi.fn();
    const baja = suscribirConexion({ navigator: { connection: null } }, alCambiar);
    expect(typeof baja).toBe("function");
    baja();
    expect(alCambiar).not.toHaveBeenCalled();
  });
});
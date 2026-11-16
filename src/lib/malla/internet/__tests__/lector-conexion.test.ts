import { describe, it, expect, vi } from "vitest";
import { leerConexion, suscribirConexion } from "../lector-conexion";

describe("lector-conexion", () => {
  it("lee conexion con navigator vacio o ausente", () => {
    const res = leerConexion({ navigator: null, nativa: null });
    expect(res).toEqual({
      tipo: undefined,
      saveData: undefined,
      effectiveType: undefined,
      nativaMedida: null,
    });
  });

  it("lee conexion con network information y marca nativa true", () => {
    const entorno = {
      navigator: {
        connection: {
          type: "wifi",
          effectiveType: "4g",
          saveData: true,
        },
      },
      nativa: {
        medida: () => true,
      },
    };
    const res = leerConexion(entorno);
    expect(res).toEqual({
      tipo: "wifi",
      saveData: true,
      effectiveType: "4g",
      nativaMedida: true,
    });
  });

  it("lee conexion con marca nativa false y sin saveData", () => {
    const entorno = {
      navigator: {
        connection: {
          type: "cellular",
          effectiveType: "3g",
        },
      },
      nativa: {
        medida: () => false,
      },
    };
    const res = leerConexion(entorno);
    expect(res).toEqual({
      tipo: "cellular",
      saveData: undefined,
      effectiveType: "3g",
      nativaMedida: false,
    });
  });

  it("maneja marca nativa ausente o que lanza error", () => {
    const resAusente = leerConexion({
      navigator: { connection: { type: "ethernet" } },
      nativa: {},
    });
    expect(resAusente.nativaMedida).toBeNull();

    const resLanza = leerConexion({
      navigator: null,
      nativa: {
        medida: () => {
          throw new Error("error nativo");
        },
      },
    });
    expect(resLanza.nativaMedida).toBeNull();
  });

  it("suscribirConexion registra y da de baja el evento change", () => {
    let llamadas = 0;
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const entornoNavigator = {
      connection: {
        addEventListener,
        removeEventListener,
      },
    };

    const unsubscribe = suscribirConexion({ navigator: entornoNavigator }, () => {
      llamadas++;
    });

    expect(addEventListener).toHaveBeenCalledWith("change", expect.any(Function));

    unsubscribe();
    expect(removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    expect(llamadas).toBe(0);
  });

  it("suscribirConexion no hace nada si no hay connection", () => {
    const unsubscribe = suscribirConexion({ navigator: {} }, () => {});
    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
  });
});

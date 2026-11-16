/**
 * Pruebas unitarias para el lector de conexión (INT14 / §8.2)
 */

import { describe, it, expect } from "vitest";
import { leerConexion, suscribirConexion } from "../lector-conexion";

describe("lector-conexion", () => {
  it("debe leer conexion ausente y nativa ausente devolviendo null", () => {
    const res = leerConexion(null);
    expect(res).toEqual({ nativaMedida: null });
  });

  it("debe leer conexion con navegador sin connection y nativa true", () => {
    const entorno = {
      navigator: {},
      nativa: {
        medida: () => true,
      },
    };
    const res = leerConexion(entorno);
    expect(res).toEqual({ nativaMedida: true });
  });

  it("debe leer conexion con navegador connection y nativa false", () => {
    const entorno = {
      navigator: {
        connection: {
          type: "wifi",
          effectiveType: "4g",
          saveData: false,
        },
      },
      nativa: {
        medida: () => false,
      },
    };
    const res = leerConexion(entorno);
    expect(res).toEqual({
      tipo: "wifi",
      effectiveType: "4g",
      saveData: false,
      nativaMedida: false,
    });
  });

  it("debe manejar nativa que lanza error sin romper y devolviendo null", () => {
    const entorno = {
      nativa: {
        medida: () => {
          throw new Error("Fallo nativo");
        },
      },
    };
    const res = leerConexion(entorno);
    expect(res).toEqual({ nativaMedida: null });
  });

  it("debe suscribir y dar de baja correctamente cuando hay connection", () => {
    let llamadas = 0;
    const listeners: Record<string, () => void> = {};
    const mockConnection = {
      addEventListener: (type: string, cb: () => void) => {
        listeners[type] = cb;
      },
      removeEventListener: (type: string) => {
        delete listeners[type];
      },
    };

    const entorno = {
      navigator: {
        connection: mockConnection,
      },
    };

    const unsub = suscribirConexion(entorno, () => {
      llamadas++;
    });

    expect(listeners["change"]).toBeDefined();
    listeners["change"]();
    expect(llamadas).toBe(1);

    unsub();
    expect(listeners["change"]).toBeUndefined();
  });

  it("no debe fallar al suscribir si no hay connection", () => {
    const unsub = suscribirConexion({ navigator: {} }, () => {});
    expect(typeof unsub).toBe("function");
    unsub();
  });
});

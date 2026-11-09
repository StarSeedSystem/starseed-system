import { describe, it, expect } from "vitest";
import { normalizarEstado, estadoDeResultado, type EstadoPermiso } from "../contrato";

describe("normalizarEstado", () => {
  it("mapea estados viejos a los cuatro nuevos", () => {
    const casos: Array<[unknown, EstadoPermiso]> = [
      ["granted", "concedido"],
      ["denied", "denegado"],
      ["prompt", "preguntar"],
      ["default", "preguntar"],
      ["unsupported", "no-disponible"],
      ["error", "no-disponible"],
      [null, "no-disponible"],
      [undefined, "no-disponible"],
      ["valor-raro", "no-disponible"],
      // idempotente: los cuatro nuevos se devuelven tal cual
      ["concedido", "concedido"],
      ["denegado", "denegado"],
      ["preguntar", "preguntar"],
      ["no-disponible", "no-disponible"],
    ];

    for (const [entrada, esperado] of casos) {
      expect(normalizarEstado(entrada)).toBe(esperado);
    }
  });
});

describe("estadoDeResultado", () => {
  it("devuelve concedido cuando soportado y concedido", () => {
    expect(estadoDeResultado({ soportado: true, concedido: true })).toBe("concedido");
  });

  it("devuelve no-disponible cuando no hay soporte", () => {
    expect(estadoDeResultado({ soportado: false, concedido: false })).toBe("no-disponible");
  });

  it("devuelve denegado con nombreError NotAllowedError", () => {
    expect(estadoDeResultado({ soportado: true, concedido: false, nombreError: "NotAllowedError" })).toBe("denegado");
  });

  it("devuelve denegado con nombreError SecurityError", () => {
    expect(estadoDeResultado({ soportado: true, concedido: false, nombreError: "SecurityError" })).toBe("denegado");
  });

  it("devuelve denegado con nombreError PermissionDeniedError", () => {
    expect(estadoDeResultado({ soportado: true, concedido: false, nombreError: "PermissionDeniedError" })).toBe("denegado");
  });

  it("devuelve denegado con motivo denied", () => {
    expect(estadoDeResultado({ soportado: true, concedido: false, motivo: "denied" })).toBe("denegado");
  });

  it("devuelve denegado con motivo que contiene denied (sin mayúsculas)", () => {
    expect(estadoDeResultado({ soportado: true, concedido: false, motivo: "Permission denied" })).toBe("denegado");
  });

  it("devuelve denegado con motivo que contiene denegad", () => {
    expect(estadoDeResultado({ soportado: true, concedido: false, motivo: "denegado por el usuario" })).toBe("denegado");
  });

  it("devuelve denegado con motivo que contiene bloquead", () => {
    expect(estadoDeResultado({ soportado: true, concedido: false, motivo: "bloqueado por política" })).toBe("denegado");
  });

  it("devuelve denegado con motivo 'not allowed'", () => {
    expect(estadoDeResultado({ soportado: true, concedido: false, motivo: "not allowed" })).toBe("denegado");
  });

  it("devuelve denegado con motivo 'permission dismissed'", () => {
    expect(estadoDeResultado({ soportado: true, concedido: false, motivo: "permission dismissed" })).toBe("denegado");
  });

  it("devuelve preguntar con el mensaje de Firefox que no lleva 'denied'", () => {
    const firefoxMsg = "The request is not allowed by the user agent or the platform in the current context.";
    expect(estadoDeResultado({ soportado: true, concedido: false, motivo: firefoxMsg })).toBe("preguntar");
  });

  it("devuelve preguntar con motivo default", () => {
    expect(estadoDeResultado({ soportado: true, concedido: false, motivo: "default" })).toBe("preguntar");
  });

  it("devuelve preguntar con Timeout expired", () => {
    expect(estadoDeResultado({ soportado: true, concedido: false, motivo: "Timeout expired" })).toBe("preguntar");
  });

  it("devuelve preguntar para cualquier otro caso", () => {
    expect(estadoDeResultado({ soportado: true, concedido: false, motivo: "algo raro" })).toBe("preguntar");
    expect(estadoDeResultado({ soportado: true, concedido: false })).toBe("preguntar");
  });
});
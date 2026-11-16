import { describe, it, expect } from "vitest";
import { derivarEstado } from "../estado-asistente";

describe("derivarEstado", () => {
  const now = 1731765000000;

  it("debe retornar calma por defecto", () => {
    expect(derivarEstado({ speaking: false, listening: false, actionStatus: null }, null, now)).toBe("calma");
  });

  it("debe retornar escuchando", () => {
    expect(derivarEstado({ speaking: false, listening: true, actionStatus: null }, null, now)).toBe("escuchando");
  });

  it("debe retornar hablando", () => {
    expect(derivarEstado({ speaking: true, listening: false, actionStatus: null }, null, now)).toBe("hablando");
  });

  it("debe retornar error si actionStatus indica fallo", () => {
    expect(derivarEstado({ speaking: false, listening: false, actionStatus: "error al procesar" }, null, now)).toBe("error");
  });
});

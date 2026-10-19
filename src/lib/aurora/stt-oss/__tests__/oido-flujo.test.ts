import { describe, expect, it } from "vitest";
import { abrirFlujoOido } from "../oido-flujo";

describe("abrirFlujoOido", () => {
  it("debería crear un cliente de oído en flujo", () => {
    // Test básico - se completará en ediciones sucesivas
    const config = {
      url: "ws://localhost:8000/v1/audio/stream",
      WebSocketImpl: WebSocket,
      alParcial: () => {},
      alFinal: () => {},
      alCerrar: () => {},
    };
    
    const flujo = abrirFlujoOido(config);
    expect(flujo).toBeDefined();
    expect(typeof flujo.enviar).toBe("function");
    expect(typeof flujo.terminar).toBe("function");
    expect(typeof flujo.cancelar).toBe("function");
  });
});
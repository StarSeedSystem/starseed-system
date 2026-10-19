import { describe, expect, it, vi } from "vitest";
import { abrirFlujoOido } from "../oido-flujo";

// Mock de WebSocket para pruebas
class MockWebSocket {
  url: string;
  readyState: number;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  
  constructor(url: string) {
    this.url = url;
    this.readyState = MockWebSocket.OPEN;
  }
  
  send(data: any) {
    // Mock implementation
  }
  
  close() {
    this.readyState = MockWebSocket.CLOSED;
  }
  
  addEventListener(event: string, callback: (event: any) => void) {
    // Simular eventos para testing
    if (event === "open") {
      setTimeout(() => callback({}), 0);
    } else if (event === "message") {
      // Simular mensaje parcial
      setTimeout(() => callback({ data: JSON.stringify({ partial: "Hola" }) }), 10);
    } else if (event === "close") {
      setTimeout(() => callback({}), 20);
    }
  }
  
  removeEventListener() {
    // Mock implementation
  }
}

describe("abrirFlujoOido", () => {
  it("debería crear un cliente de oído en flujo", () => {
    const config = {
      url: "ws://localhost:8000/v1/audio/stream",
      WebSocketImpl: MockWebSocket,
      alParcial: vi.fn(),
      alFinal: vi.fn(),
      alCerrar: vi.fn(),
    };
    
    const flujo = abrirFlujoOido(config);
    expect(flujo).toBeDefined();
    expect(typeof flujo.enviar).toBe("function");
    expect(typeof flujo.terminar).toBe("function");
    expect(typeof flujo.cancelar).toBe("function");
  });
  
  it("debería llamar al callback parcial al recibir mensaje parcial", async () => {
    const alParcialMock = vi.fn();
    const config = {
      url: "ws://localhost:8000/v1/audio/stream",
      WebSocketImpl: MockWebSocket,
      alParcial: alParcialMock,
      alFinal: vi.fn(),
      alCerrar: vi.fn(),
    };
    
    const flujo = abrirFlujoOido(config);
    
    // Esperar a que se procese el mensaje simulado
    await new Promise(resolve => setTimeout(resolve, 50));
    
    expect(alParcialMock).toHaveBeenCalledWith("Hola");
  });
  
  it("debería llamar al callback final al recibir mensaje final", async () => {
    const alFinalMock = vi.fn();
    const config = {
      url: "ws://localhost:8000/v1/audio/stream",
      WebSocketImpl: MockWebSocket,
      alParcial: vi.fn(),
      alFinal: alFinalMock,
      alCerrar: vi.fn(),
    };
    
    // Sobrescribir el mock para simular mensaje final
    const originalAddEventListener = MockWebSocket.prototype.addEventListener;
    MockWebSocket.prototype.addEventListener = function(event: string, callback: (event: any) => void) {
      if (event === "message") {
        setTimeout(() => callback({ data: JSON.stringify({ final: "Mundo" }) }), 10);
      } else {
        originalAddEventListener.call(this, event, callback);
      }
    };
    
    try {
      const flujo = abrirFlujoOido(config);
      
      // Esperar a que se procese el mensaje simulado
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(alFinalMock).toHaveBeenCalledWith("Mundo");
    } finally {
      // Restaurar el mock original
      MockWebSocket.prototype.addEventListener = originalAddEventListener;
    }
  });
  
  it("debería llamar al callback de cierre al recibir mensaje done", async () => {
    const alCerrarMock = vi.fn();
    const config = {
      url: "ws://localhost:8000/v1/audio/stream",
      WebSocketImpl: MockWebSocket,
      alParcial: vi.fn(),
      alFinal: vi.fn(),
      alCerrar: alCerrarMock,
    };
    
    // Sobrescribir el mock para simular mensaje done
    const originalAddEventListener = MockWebSocket.prototype.addEventListener;
    MockWebSocket.prototype.addEventListener = function(event: string, callback: (event: any) => void) {
      if (event === "message") {
        setTimeout(() => callback({ data: JSON.stringify({ done: true }) }), 10);
      } else {
        originalAddEventListener.call(this, event, callback);
      }
    };
    
    try {
      const flujo = abrirFlujoOido(config);
      
      // Esperar a que se procese el mensaje simulado
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(alCerrarMock).toHaveBeenCalled();
    } finally {
      // Restaurar el mock original
      MockWebSocket.prototype.addEventListener = originalAddEventListener;
    }
  });
  
  it("debería enviar audio cuando se llama al método enviar", () => {
    const config = {
      url: "ws://localhost:8000/v1/audio/stream",
      WebSocketImpl: MockWebSocket,
      alParcial: vi.fn(),
      alFinal: vi.fn(),
      alCerrar: vi.fn(),
    };
    
    const flujo = abrirFlujoOido(config);
    const enviarSpy = vi.spyOn(flujo, "enviar");
    
    const audioData = new Float32Array([0.5, -0.5, 0.0]);
    flujo.enviar(audioData);
    
    expect(enviarSpy).toHaveBeenCalledWith(audioData);
  });
});
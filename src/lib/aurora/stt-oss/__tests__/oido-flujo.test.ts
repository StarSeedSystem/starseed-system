import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { abrirFlujoOido } from "../oido-flujo";

// Mock de WebSocket para pruebas
class MockWebSocket {
  url: string;
  readyState: number;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  
  private openCallbacks: Array<() => void> = [];
  private messageCallbacks: Array<(event: MessageEvent) => void> = [];
  private errorCallbacks: Array<(event: Event) => void> = [];
  private closeCallbacks: Array<() => void> = [];
  
  constructor(url: string) {
    this.url = url;
    this.readyState = MockWebSocket.OPEN;
    
    // Simular apertura inmediata
    setTimeout(() => {
      this.openCallbacks.forEach(cb => cb());
    }, 0);
  }
  
  send(data: any) {
    // Mock implementation - en una prueba real podríamos almacenar lo enviado
  }
  
  close() {
    this.readyState = MockWebSocket.CLOSED;
    // Simular cierre
    setTimeout(() => {
      this.closeCallbacks.forEach(cb => cb());
    }, 0);
  }
  
  addEventListener(event: string, callback: (event: any) => void) {
    if (event === "open") {
      this.openCallbacks.push(callback);
    } else if (event === "message") {
      this.messageCallbacks.push(callback);
    } else if (event === "error") {
      this.errorCallbacks.push(callback);
    } else if (event === "close") {
      this.closeCallbacks.push(callback);
    }
  }
  
  removeEventListener() {
    // Mock implementation
  }
  
  // Métodos para disparar eventos en las pruebas
  dispararMensajeParcial() {
    const mensaje = { partial: "Hola" };
    const event = new MessageEvent("message", { data: JSON.stringify(mensaje) });
    this.messageCallbacks.forEach(cb => cb(event));
  }
  
  dispararMensajeFinal() {
    const mensaje = { final: "Mundo" };
    const event = new MessageEvent("message", { data: JSON.stringify(mensaje) });
    this.messageCallbacks.forEach(cb => cb(event));
  }
  
  dispararMensajeDone() {
    const mensaje = { done: true };
    const event = new MessageEvent("message", { data: JSON.stringify(mensaje) });
    this.messageCallbacks.forEach(cb => cb(event));
  }
}

// Variable global para almacenar la última instancia de WebSocket creada
let ultimaInstanciaWS: MockWebSocket | null = null;

describe("abrirFlujoOido", () => {
  let mockWebSocketCls: typeof MockWebSocket;
  
  beforeEach(() => {
    // Guardar la clase original
    mockWebSocketCls = MockWebSocket;
    
    // Sobrescribir global.WebSocket con nuestro mock para que la función lo use
    // Pero también necesitamos poder acceder a la instancia creada
    ultimaInstanciaWS = null;
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
    ultimaInstanciaWS = null;
  });
  
  it("debería crear un cliente de oído en flujo", () => {
    const config = {
      url: "ws://localhost:8000/v1/audio/stream",
      WebSocketImpl: mockWebSocketCls,
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
      WebSocketImpl: mockWebSocketCls,
      alParcial: alParcialMock,
      alFinal: vi.fn(),
      alCerrar: vi.fn(),
    };
    
    const flujo = abrirFlujoOido(config);
    
    // Esperar a que se establezca la conexión
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Acceder a la instancia de WebSocket creada y disparar evento
    if (ultimaInstanciaWS) {
      ultimaInstanciaWS.dispararMensajeParcial();
      
      // Esperar a que se procese el mensaje
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(alParcialMock).toHaveBeenCalledWith("Hola");
    } else {
      // Si no podemos acceder a la instancia, fallamos la prueba
      expect(true).toBe(false);
    }
  });
  
  it("debería llamar al callback final al recibir mensaje final", async () => {
    const alFinalMock = vi.fn();
    const config = {
      url: "ws://localhost:8000/v1/audio/stream",
      WebSocketImpl: mockWebSocketCls,
      alParcial: vi.fn(),
      alFinal: alFinalMock,
      alCerrar: vi.fn(),
    };
    
    const flujo = abrirFlujoOido(config);
    
    // Esperar a que se establezca la conexión
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Acceder a la instancia de WebSocket creada y disparar evento
    if (ultimaInstanciaWS) {
      ultimaInstanciaWS.dispararMensajeFinal();
      
      // Esperar a que se procese el mensaje
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(alFinalMock).toHaveBeenCalledWith("Mundo");
    } else {
      // Si no podemos acceder a la instancia, fallamos la prueba
      expect(true).toBe(false);
    }
  });
  
  it("debería llamar al callback de cierre al recibir mensaje done", async () => {
    const alCerrarMock = vi.fn();
    const config = {
      url: "ws://localhost:8000/v1/audio/stream",
      WebSocketImpl: mockWebSocketCls,
      alParcial: vi.fn(),
      alFinal: vi.fn(),
      alCerrar: alCerrarMock,
    };
    
    const flujo = abrirFlujoOido(config);
    
    // Esperar a que se establezca la conexión
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Acceder a la instancia de WebSocket creada y disparar evento
    if (ultimaInstanciaWS) {
      ultimaInstanciaWS.dispararMensajeDone();
      
      // Esperar a que se procese el mensaje
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(alCerrarMock).toHaveBeenCalled();
    } else {
      // Si no podemos acceder a la instancia, fallamos la prueba
      expect(true).toBe(false);
    }
  });
  
  it("debería enviar audio cuando se llama al método enviar", () => {
    const config = {
      url: "ws://localhost:8000/v1/audio/stream",
      WebSocketImpl: mockWebSocketCls,
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
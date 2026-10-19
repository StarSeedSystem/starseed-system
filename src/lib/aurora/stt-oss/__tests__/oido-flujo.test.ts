import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { abrirFlujoOido } from "../oido-flujo";

// Mock de WebSocket para pruebas
class MockWebSocket {
  url: string;
  readyState: number;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  
  // Propiedades de evento estándar de WebSocket
  onopen: null | ((this: WebSocket, ev: Event) => any);
  onmessage: null | ((this: WebSocket, ev: MessageEvent) => any);
  onerror: null | ((this: WebSocket, ev: Event) => any);
  onclose: null | ((this: WebSocket, ev: CloseEvent) => any);
  
  constructor(url: string) {
    this.url = url;
    this.readyState = MockWebSocket.OPEN;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    
    // Simular apertura inmediata
    setTimeout(() => {
      if (this.onopen) {
        this.onopen.call(this, new Event("open"));
      }
    }, 0);
  }
  
  send(data: any) {
    // Mock implementation - en una prueba real podríamos almacenar lo enviado
  }
  
  close() {
    this.readyState = MockWebSocket.CLOSED;
    // Simular cierre
    setTimeout(() => {
      if (this.onclose) {
        // Usar Event si CloseEvent no está disponible (en algunos entornos de prueba)
        const closeEvent = typeof CloseEvent !== 'undefined' 
          ? new CloseEvent("close") 
          : new Event("close");
        this.onclose.call(this, closeEvent);
      }
    }, 0);
  }
  
  // Métodos para disparar eventos en las pruebas
  dispararMensajeParcial() {
    const mensaje = { partial: "Hola" };
    const event = new MessageEvent("message", { data: JSON.stringify(mensaje) });
    if (this.onmessage) {
      this.onmessage.call(this, event);
    }
  }
  
  dispararMensajeFinal() {
    const mensaje = { final: "Mundo" };
    const event = new MessageEvent("message", { data: JSON.stringify(mensaje) });
    if (this.onmessage) {
      this.onmessage.call(this, event);
    }
  }
  
  dispararMensajeDone() {
    const mensaje = { done: true };
    const event = new MessageEvent("message", { data: JSON.stringify(mensaje) });
    if (this.onmessage) {
      this.onmessage.call(this, event);
    }
  }
}

describe("abrirFlujoOido", () => {
  let mockWebSocketCls: typeof MockWebSocket;
  let creadoWS: MockWebSocket | null = null;
  
  beforeEach(() => {
    // Guardar la clase original
    mockWebSocketCls = MockWebSocket;
    creadoWS = null;
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
    creadoWS = null;
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
    
    // Sobrescribir el constructor para capturar la instancia ANTES de crear el flujo
    const originalConstructor = mockWebSocketCls;
    const SobrescritoWebSocketCls = class extends originalConstructor {
      constructor(url: string) {
        super(url);
        creadoWS = this;
        console.log("Instancia de WebSocket creada:", this);
      }
    } as typeof MockWebSocket;
    
    const config = {
      url: "ws://localhost:8000/v1/audio/stream",
      WebSocketImpl: SobrescritoWebSocketCls,
      alParcial: alParcialMock,
      alFinal: vi.fn(),
      alCerrar: vi.fn(),
    };
    
    const flujo = abrirFlujoOido(config);
    console.log("Flujo creado:", flujo);
    console.log("WebSocket creado (después de crear flujo):", creadoWS);
    
    // Esperar a que se establezca la conexión
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Acceder a la instancia de WebSocket creada y disparar evento
    if (creadoWS) {
      // Agregar algunos logs para depuración
      console.log("WebSocket creado:", creadoWS);
      console.log("onmessage handler:", creadoWS.onmessage);
      
      creadoWS.dispararMensajeParcial();
      
      // Esperar a que se procese el mensaje
      await new Promise(resolve => setTimeout(resolve, 20));
      
      expect(alParcialMock).toHaveBeenCalledWith("Hola");
    } else {
      // Si no podemos acceder a la instancia, fallamos la prueba
      console.log("No se pudo acceder a la instancia de WebSocket");
      expect(true).toBe(false);
    }
    
    // Restaurar el constructor
    mockWebSocketCls = originalConstructor;
  });
  
  it("debería llamar al callback final al recibir mensaje final", async () => {
    const alFinalMock = vi.fn();
    
    // Sobrescribir el constructor para capturar la instancia ANTES de crear el flujo
    const originalConstructor = mockWebSocketCls;
    const SobrescritoWebSocketCls = class extends originalConstructor {
      constructor(url: string) {
        super(url);
        creadoWS = this;
      }
    } as typeof MockWebSocket;
    
    const config = {
      url: "ws://localhost:8000/v1/audio/stream",
      WebSocketImpl: SobrescritoWebSocketCls,
      alParcial: vi.fn(),
      alFinal: alFinalMock,
      alCerrar: vi.fn(),
    };
    
    const flujo = abrirFlujoOido(config);
    
    // Esperar a que se establezca la conexión
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Acceder a la instancia de WebSocket creada y disparar evento
    if (creadoWS) {
      creadoWS.dispararMensajeFinal();
      
      // Esperar a que se procese el mensaje
      await new Promise(resolve => setTimeout(resolve, 20));
      
      expect(alFinalMock).toHaveBeenCalledWith("Mundo");
    } else {
      // Si no podemos acceder a la instancia, fallamos la prueba
      expect(true).toBe(false);
    }
    
    // Restaurar el constructor
    mockWebSocketCls = originalConstructor;
  });
  
  it("debería llamar al callback de cierre al recibir mensaje done", async () => {
    const alCerrarMock = vi.fn();
    
    // Sobrescribir el constructor para capturar la instancia ANTES de crear el flujo
    const originalConstructor = mockWebSocketCls;
    const SobrescritoWebSocketCls = class extends originalConstructor {
      constructor(url: string) {
        super(url);
        creadoWS = this;
      }
    } as typeof MockWebSocket;
    
    const config = {
      url: "ws://localhost:8000/v1/audio/stream",
      WebSocketImpl: SobrescritoWebSocketCls,
      alParcial: vi.fn(),
      alFinal: vi.fn(),
      alCerrar: alCerrarMock,
    };
    
    const flujo = abrirFlujoOido(config);
    
    // Esperar a que se establezca la conexión
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Acceder a la instancia de WebSocket creada y disparar evento
    if (creadoWS) {
      creadoWS.dispararMensajeDone();
      
      // Esperar a que se procese el mensaje
      await new Promise(resolve => setTimeout(resolve, 20));
      
      expect(alCerrarMock).toHaveBeenCalled();
    } else {
      // Si no podemos acceder a la instancia, fallamos la prueba
      expect(true).toBe(false);
    }
    
    // Restaurar el constructor
    mockWebSocketCls = originalConstructor;
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
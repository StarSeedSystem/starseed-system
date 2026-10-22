import { describe, expect, it, vi, beforeEach } from "vitest";
import { abrirFlujoOido, prepararAudio, type OidoFlujo, type OidoFlujoConfig } from "../oido-flujo";

/** Registra instancias y envíos y deja disparar mensajes. Sin red ni procesos. */
class WebSocketFalso {
  static readonly instancias: WebSocketFalso[] = [];
  url: string;
  readyState = 0; // CONNECTING hasta que la propia prueba lo abre
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  enviados: ArrayBuffer[] = [];

  constructor(url: string) {
    this.url = url;
    WebSocketFalso.instancias.push(this);
  }

  abrir(): void { this.readyState = 1; }
  close(): void { this.readyState = 3; }
  send(datos: ArrayBuffer): void { this.enviados.push(datos); }
  /** Cierre desde el lado del servidor: dispara `onclose` como el socket real. */
  cerrarDesdeServidor(): void {
    this.readyState = 3;
    this.onclose?.({ type: "close" } as unknown as CloseEvent);
  }
  /** Entrega un mensaje del servidor tal como llegaría (texto JSON). */
  mensaje(json: unknown): void {
    this.onmessage?.({ data: JSON.stringify(json) } as unknown as MessageEvent);
  }
}

/** Devoluciones de llamada espiadas para configurar el cliente. */
function configuracion(wsc: unknown): OidoFlujoConfig {
  return {
    url: "ws://oido-local/v1/audio/stream",
    WebSocketImpl: wsc as typeof WebSocket,
    alParcial: vi.fn(),
    alFinal: vi.fn(),
    alCerrar: vi.fn(),
  };
}

describe("prepararAudio", () => {
  it("convierte Float32 a PCM16 y remuestrea con decimación por vecino (48 kHz → 16 kHz)", () => {
    const pcm = prepararAudio(new Float32Array([0, 0.5, 1, -0.5, -1, 0.25]), 48000);
    expect(Array.from(pcm)).toEqual([0, -16384]);
  });

  it("recorta a ±1 antes de convertir", () => {
    const pcm = prepararAudio(new Float32Array([2, -2]), 16000);
    expect(Array.from(pcm)).toEqual([32767, -32768]);
  });
});

describe("abrirFlujoOido", () => {
  beforeEach(() => {
    WebSocketFalso.instancias.length = 0;
  });

  function flujo(): { cfg: OidoFlujoConfig; ws: WebSocketFalso; oido: OidoFlujo } {
    const cfg = configuracion(WebSocketFalso);
    const oido = abrirFlujoOido(cfg);
    return { cfg, ws: WebSocketFalso.instancias[0] as WebSocketFalso, oido };
  }

  it("avisa parcial y final en vivo, tolerando `type`/`text` y campos sueltos", () => {
    const { cfg, ws } = flujo();
    expect(ws.url).toBe(cfg.url);
    ws.mensaje({ type: "partial", text: "hola" });
    expect(cfg.alParcial).toHaveBeenCalledTimes(1);
    expect(cfg.alParcial).toHaveBeenLastCalledWith("hola");
    ws.mensaje({ partial: "hola mundo" });
    expect(cfg.alParcial).toHaveBeenLastCalledWith("hola mundo");
    ws.mensaje({ type: "final", text: "hola mundo." });
    expect(cfg.alFinal).toHaveBeenCalledTimes(1);
    expect(cfg.alFinal).toHaveBeenLastCalledWith("hola mundo.");
    ws.mensaje({ final: "hola mundo." });
    expect(cfg.alFinal).toHaveBeenLastCalledWith("hola mundo.");
  });

  it("un mensaje que no sea JSON no tumba el flujo", () => {
    const { cfg, ws } = flujo();
    ws.mensaje("esto no es JSON");
    expect(cfg.alParcial).not.toHaveBeenCalled();
    expect(cfg.alCerrar).not.toHaveBeenCalled();
  });

  it("en `done` avisa el cierre una vez, cierra el socket y ya no procesa mensajes", () => {
    const { cfg, ws } = flujo();
    ws.mensaje({ done: true });
    expect(cfg.alCerrar).toHaveBeenCalledTimes(1);
    expect(WebSocketFalso.instancias).toHaveLength(1); // sin reconexión
    ws.mensaje({ type: "final", text: "tarde" });
    expect(cfg.alFinal).not.toHaveBeenCalled();
    expect(cfg.alCerrar).toHaveBeenCalledTimes(1);
  });

  it("si el servidor cierra, lo avisa UNA vez, no reconecta y ya no envía", () => {
    const { cfg, ws, oido } = flujo();
    ws.cerrarDesdeServidor();
    expect(cfg.alCerrar).toHaveBeenCalledTimes(1);
    expect(WebSocketFalso.instancias).toHaveLength(1);
    oido.enviar(new Int16Array([1]));
    expect(ws.enviados).toHaveLength(0);
  });

  it("envía la trama PCM16 en binario cuando está abierto y la ignora si no", () => {
    const { ws, oido } = flujo();
    const vista = new Int16Array([7, -7, 100]).subarray(1); // subarray: manda solo sus muestras
    oido.enviar(vista); // todavía conectando: fuera
    expect(ws.enviados).toHaveLength(0);
    ws.abrir();
    oido.enviar(vista);
    expect(Array.from(new Int16Array(ws.enviados[0]))).toEqual([-7, 100]);
    oido.terminar();
    oido.enviar(vista); // tras cerrar, fuera
    expect(ws.enviados).toHaveLength(1);
  });
});

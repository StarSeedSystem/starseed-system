import { describe, expect, it, vi } from "vitest";
import {
  abrirFlujoOido,
  interpretarMensaje,
  prepararAudio,
  type OidoFlujo,
} from "../oido-flujo";

/** Envoltorio ligero de mensaje: al cliente solo le importa `data`. */
function mensaje(data: unknown): MessageEvent {
  return { data } as unknown as MessageEvent;
}

/** WebSocket falso: registra lo enviado y apunta cada instancia creada. */
class WebsocketFalso {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static creados: WebsocketFalso[] = [];

  url: string;
  readyState = WebsocketFalso.OPEN;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  sendFalso = vi.fn();

  constructor(url: string) {
    this.url = url;
    WebsocketFalso.creados.push(this);
  }

  send(data: ArrayBuffer) {
    this.sendFalso(data);
  }

  close() {
    this.readyState = WebsocketFalso.CLOSED;
    this.onclose?.(null as unknown as CloseEvent);
  }

  /** Hace llegar al cliente un JSON tipo/type+text, como Phonon-2. */
  recibir(type: string, text: string) {
    const datos = text === "" ? { type } : { type, text };
    this.onmessage?.(mensaje(JSON.stringify(datos)));
  }

  cerrarComoServidor() {
    this.readyState = WebsocketFalso.CLOSED;
    this.onclose?.(null as unknown as CloseEvent);
  }
}

/** Crea el flujo con el WebSocket falso y devuelve la pareja callbacks/socket. */
function crearFlujo() {
  const alParcial = vi.fn();
  const alFinal = vi.fn();
  const alCerrar = vi.fn();
  WebsocketFalso.creados = [];
  const flujo: OidoFlujo = abrirFlujoOido({
    url: "ws://servidor-oido/v1/audio/stream",
    WebSocketImpl: WebsocketFalso as unknown as typeof WebSocket,
    alParcial,
    alFinal,
    alCerrar,
  });
  return { flujo, alParcial, alFinal, alCerrar, ws: WebsocketFalso.creados[0] };
}

describe("prepararAudio (Float32 → PCM16 a 16 kHz)", () => {
  it("convierte el rango completo en 16 kHz sin remuestrear", () => {
    const pcm = prepararAudio(new Float32Array([0, 1, -1]), 16000);
    expect(Array.from(pcm)).toEqual([0, 32767, -32768]);
  });

  it("recorta la amplitud que se sale de −1…1", () => {
    const pcm = prepararAudio(new Float32Array([2.5, -2.5]), 16000);
    expect(Array.from(pcm)).toEqual([32767, -32768]);
  });

  it("remuestrea 48 kHz a 16 kHz por decimación simple", () => {
    // 48 kHz → coge una de cada 3 muestras: 0,1,2,3,4,5 → 0,3.
    const pcm = prepararAudio(new Float32Array([0, 0.4, 0.8, 0.3, 0.7, 0.99]), 48000);
    expect(Array.from(pcm)).toEqual([0, Math.round(0.3 * 0x7fff)]);
  });
});

describe("interpretarMensaje (tolerante a type/text y a campos sueltos)", () => {
  it("entiende el formato type/text de Phonon-2", () => {
    expect(interpretarMensaje({ type: "partial", text: "ho" })).toEqual({
      tipo: "partial",
      texto: "ho",
    });
    expect(interpretarMensaje({ type: "final", text: "hola" })).toEqual({
      tipo: "final",
      texto: "hola",
    });
    expect(interpretarMensaje({ type: "done" })).toEqual({ tipo: "done", texto: "" });
  });

  it("entiende también los campos sueltos y lo que no entiende lo ignora", () => {
    expect(interpretarMensaje({ partial: "ho" })).toEqual({ tipo: "partial", texto: "ho" });
    expect(interpretarMensaje({ final: "hola" })).toEqual({ tipo: "final", texto: "hola" });
    expect(interpretarMensaje({ done: true })).toEqual({ tipo: "done", texto: "" });
    expect(interpretarMensaje("texto suelto")).toEqual({ tipo: "otro", texto: "" });
    expect(interpretarMensaje({ type: "extraño", text: "?" })).toEqual({ tipo: "otro", texto: "" });
  });
});

describe("abrirFlujoOido (cliente del WebSocket de Phonon-2)", () => {
  it("abre la conexión contra la url pedida y expone la API", () => {
    const { flujo, ws } = crearFlujo();
    expect(ws.url).toBe("ws://servidor-oido/v1/audio/stream");
    expect(typeof flujo.enviar).toBe("function");
    expect(typeof flujo.terminar).toBe("function");
    expect(typeof flujo.cancelar).toBe("function");
  });

  it("entrega parciales y finales en vivo, tolerando los dos formatos", () => {
    const { alParcial, alFinal, alCerrar, ws } = crearFlujo();
    ws.recibir("partial", "ho");
    ws.recibir("partial", "hola m");
    ws.recibir("final", "hola mundo");
    ws.onmessage?.(mensaje(JSON.stringify({ partial: "hola mu" })));
    expect(alParcial).toHaveBeenNthCalledWith(1, "ho");
    expect(alParcial).toHaveBeenNthCalledWith(2, "hola m");
    expect(alParcial).toHaveBeenNthCalledWith(3, "hola mu");
    expect(alFinal).toHaveBeenCalledTimes(1);
    expect(alFinal).toHaveBeenCalledWith("hola mundo");
    expect(alCerrar).not.toHaveBeenCalled();
  });

  it("al llegar done cierra y no entrega nada más", () => {
    const { alParcial, alFinal, alCerrar, flujo, ws } = crearFlujo();
    ws.recibir("done", "");
    expect(alCerrar).toHaveBeenCalledTimes(1);
    expect(ws.readyState).toBe(WebsocketFalso.CLOSED);
    ws.recibir("final", "más");
    expect(alFinal).not.toHaveBeenCalled();
    flujo.enviar(new Int16Array([7]));
    expect(ws.sendFalso).not.toHaveBeenCalled();
    expect(alParcial).not.toHaveBeenCalled();
  });

  it("si el SERVIDOR cierra, avisa UNA vez y no reconecta", () => {
    const { alCerrar, ws } = crearFlujo();
    ws.cerrarComoServidor();
    ws.cerrarComoServidor(); // doble aviso del falso: no se repite
    expect(alCerrar).toHaveBeenCalledTimes(1);
    expect(WebsocketFalso.creados.length).toBe(1); // reconexión NUNCA automática
  });

  it("un error del socket también avisa una sola vez", () => {
    const { alCerrar, ws } = crearFlujo();
    ws.onerror?.(null as unknown as Event);
    expect(alCerrar).toHaveBeenCalledTimes(1);
  });

  it("enviar entrega el buffer PCM16 mientras el socket está abierto", () => {
    const { flujo, ws } = crearFlujo();
    flujo.enviar(new Int16Array([100, -100, 0]));
    expect(ws.sendFalso).toHaveBeenCalledTimes(1);
    expect(ws.sendFalso.mock.calls[0][0]).toEqual(
      new Int16Array([100, -100, 0]).buffer,
    );
  });

  it("enviar no manda nada con el socket conectando, cerrado o vacío", () => {
    const { flujo, ws } = crearFlujo();
    ws.readyState = WebsocketFalso.CONNECTING;
    flujo.enviar(new Int16Array([1]));
    expect(ws.sendFalso).not.toHaveBeenCalled();
    ws.readyState = WebsocketFalso.OPEN;
    flujo.cancelar();
    flujo.enviar(new Int16Array([1]));
    expect(ws.sendFalso).not.toHaveBeenCalled();
    flujo.enviar(new Int16Array(0));
    expect(ws.sendFalso).not.toHaveBeenCalled();
  });

  it("terminar cierra el flujo y avisa una sola vez", () => {
    const { alCerrar, flujo, ws } = crearFlujo();
    flujo.terminar();
    flujo.terminar();
    expect(alCerrar).toHaveBeenCalledTimes(1);
    expect(ws.readyState).toBe(WebsocketFalso.CLOSED);
  });

  it("cancelar cierra el flujo aunque el servidor siga vivo", () => {
    const { alCerrar, flujo, ws } = crearFlujo();
    flujo.cancelar();
    expect(alCerrar).toHaveBeenCalledTimes(1);
    expect(ws.readyState).toBe(WebsocketFalso.CLOSED);
    expect(alCerrar).toHaveBeenCalledTimes(1);
  });

  it("un mensaje que no es JSON no rompe el flujo", () => {
    const { alParcial, alFinal, alCerrar, ws } = crearFlujo();
    ws.onmessage?.(mensaje("no soy json"));
    expect(alParcial).not.toHaveBeenCalled();
    expect(alFinal).not.toHaveBeenCalled();
    expect(alCerrar).not.toHaveBeenCalled();
    ws.recibir("final", "hola");
    expect(alFinal).toHaveBeenCalledWith("hola");
  });
});

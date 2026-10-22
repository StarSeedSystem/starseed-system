import { describe, expect, it, vi } from "vitest";
import {
  abrirFlujoOido,
  interpretarMensajeOido,
  prepararAudio,
  type OidoFlujoConfig,
  type WebSocketOido,
} from "../oido-flujo";

/** WebSocket falso: graba tramas, deja disparar eventos a mano y cuenta
 * cuántas instancias hay (NO debe haber reconexión automática). */
class WebSocketFalso implements WebSocketOido {
  readyState = 1;
  onmessage: ((evento: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  enviados: ArrayBuffer[] = [];
  static instancias: WebSocketFalso[] = [];
  constructor(public url: string, private abajo = false) {
    WebSocketFalso.instancias.push(this);
  }
  send(datos: ArrayBuffer): void { if (!this.abajo) this.enviados.push(datos); }
  close(): void { this.abajo = true; this.readyState = 3; this.onclose?.(); }
  recibir(texto: string): void { this.onmessage?.({ data: texto }); }
  fallar(): void { this.onerror?.(); }
}

function configNueva(): OidoFlujoConfig {
  WebSocketFalso.instancias = [];
  return {
    url: "ws://127.0.0.1:8810/v1/audio/stream",
    WebSocketImpl: WebSocketFalso,
    alParcial: vi.fn(),
    alFinal: vi.fn(),
    alCerrar: vi.fn(),
  };
}

function unicoSocket(): WebSocketFalso {
    const instancia = WebSocketFalso.instancias[0];
    if (!instancia) throw new Error("no se abrió ningún WebSocket");
    return instancia;
}
describe("interpretarMensajeOido", () => {  it("resuelve `partial`, `final`, `type`+`text`, `transcript` y `done`; suelta lo que no lee", () => {
    expect(interpretarMensajeOido('{"partial":"ho"}')).toEqual({ tipo: "parcial", texto: "ho" });
    expect(interpretarMensajeOido('{"final":"hola"}')).toEqual({ tipo: "final", texto: "hola" });
    const conType = interpretarMensajeOido('{"type":"final","text":"hola entera"}');
    expect(conType).toEqual({ tipo: "final", texto: "hola entera" });
    expect(interpretarMensajeOido('{"transcript":"va"}')).toEqual({ tipo: "parcial", texto: "va" });
    expect(interpretarMensajeOido('{"type":"done"}')).toEqual({ tipo: "fin", texto: "" });
    expect(interpretarMensajeOido('{"done":true}')).toEqual({ tipo: "fin", texto: "" });
    expect(interpretarMensajeOido("no es json")).toBeNull();
  });
});

describe("prepararAudio", () => {
  it("convierte Float32 a PCM16, recorta, remuestrea a 16 kHz y marca NaN como 0", () => {
    expect(Array.from(prepararAudio(new Float32Array([0, 1, -1]), 16000))).toEqual([0, 32767, -32768]);
    expect(Array.from(prepararAudio(new Float32Array([2, -2]), 16000))).toEqual([32767, -32768]);
    expect(Array.from(prepararAudio(new Float32Array([0, 0.25, 0.75, 1]), 32000)))
      .toEqual([0, 24575]); // 32 kHz: coge las posiciones 0 y 2 (vecino cercano)
    expect(prepararAudio(new Float32Array(0), 16000)).toEqual(new Int16Array(0));
    expect(prepararAudio(new Float32Array([0.5]), 0)).toEqual(new Int16Array(0));
    expect(Array.from(prepararAudio(new Float32Array([NaN]), 16000))).toEqual([0]);
  });
});

describe("abrirFlujoOido", () => {
  it("abre UN WebSocket con la url dada y reparte parciales y finales en vivo", () => {
    const config = configNueva();
    abrirFlujoOido(config);
    expect(unicoSocket().url).toBe(config.url);
    unicoSocket().recibir('{"partial":"hola bo"}');
    unicoSocket().recibir('{"type":"final","text":"hola entera"}');
    expect(config.alParcial).toHaveBeenCalledWith("hola bo");
    expect(config.alFinal).toHaveBeenCalledWith("hola entera");
  });

  it("`enviar` copia la trama exacta aunque venga de un subarray del buffer", () => {
    const flujo = abrirFlujoOido(configNueva());
    const contenedor = new Int16Array(5);
    const segmento = contenedor.subarray(2, 4);
    segmento[0] = 100;
    segmento[1] = -100;
    flujo.enviar(segmento);
    expect(Array.from(new Int16Array(unicoSocket().enviados[0]))).toEqual([100, -100]);
  });

  it("cierre del servidor, al mano y por fallo: avisos de UNA vez, sin lanza ni reconexión", () => {
    const config = configNueva();
    const flujo = abrirFlujoOido(config);
    const socket = unicoSocket();
    socket.recibir('{"done":true}');
    expect(config.alCerrar).toHaveBeenCalledTimes(1);
    socket.recibir('{"final":"ya no entra"}');
    flujo.enviar(new Int16Array([1, 2]));
    expect(config.alFinal).not.toHaveBeenCalled();
    expect(socket.enviados.length).toBe(0);
    expect(WebSocketFalso.instancias.length).toBe(1);
    const servidor = configNueva();
    const conCierre = abrirFlujoOido(servidor);
    unicoSocket().close();
    conCierre.terminar();
    expect(servidor.alCerrar).toHaveBeenCalledTimes(1);
    const aMano = configNueva();
    abrirFlujoOido(aMano).cancelar();
    expect(aMano.alCerrar).toHaveBeenCalledTimes(1);
    const porError = configNueva();
    abrirFlujoOido(porError);
    unicoSocket().fallar();
    expect(porError.alCerrar).toHaveBeenCalledTimes(1);
    class QueFalla { constructor() { throw new Error("no hay socket"); } }
    const roto = configNueva();
    roto.WebSocketImpl = QueFalla as unknown as OidoFlujoConfig["WebSocketImpl"];
    const flujoRoto = abrirFlujoOido(roto);
    expect(roto.alCerrar).toHaveBeenCalledTimes(1);
    expect(() => flujoRoto.enviar(new Int16Array([1]))).not.toThrow();
    expect(WebSocketFalso.instancias.length).toBe(0);
  });
});

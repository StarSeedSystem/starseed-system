import { describe, expect, it, vi } from "vitest";
import { abrirFlujoOido, prepararAudio, leerMensajeOido } from "../oido-flujo";
import type { ImplWebSocketOido, ZocaloFlujoOido } from "../oido-flujo";

/** WebSocket falso: abre al tocar `abrir`, graba lo enviado y cierra al pedir. */
class FalsoWebSocket implements ZocaloFlujoOido {
  /** Ajustes que la prueba cambia antes de crear el flujo. */
  static lanzar = false;
  static readyStateInicial = 1;
  static ultima: FalsoWebSocket | null = null;

  readyState = 1; // OPEN
  enviados: ArrayBuffer[] = [];
  cerrado = false;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  constructor(public url: string) {
    this.readyState = FalsoWebSocket.readyStateInicial;
    if (FalsoWebSocket.lanzar) throw new Error("server roto");
    FalsoWebSocket.ultima = this;
  }
  send(data: ArrayBuffer) {
    this.enviados.push(data);
  }
  close() {
    this.readyState = 3;
    this.cerrado = true;
  }
  /** Simula lo que llega del servidor. */
  recibirSalida(texto: string) {
    this.onmessage?.({ data: texto } as unknown as MessageEvent);
  }
  /** Simula que el servidor cierra el flujo. */
  cerrarDelServidor() {
    this.close();
    this.onclose?.({ type: "close" } as unknown as CloseEvent);
  }
}

interface CrearAjuste {
  lanzar?: boolean;
  readyStateInicial?: number;
}

/** Crea el flujo con un WebSocket falso inyectado y devuelve todo lo vivo. */
function montarFlujo(ajuste?: CrearAjuste) {
  FalsoWebSocket.lanzar = ajuste?.lanzar ?? false;
  FalsoWebSocket.readyStateInicial = ajuste?.readyStateInicial ?? 1;
  FalsoWebSocket.ultima = null;
  const config = {
    url: "ws://local/v1/audio/stream",
    WebSocketImpl: FalsoWebSocket as unknown as ImplWebSocketOido,
    alParcial: vi.fn<(texto: string) => void>(),
    alFinal: vi.fn<(texto: string) => void>(),
    alCerrar: vi.fn<() => void>(),
  };
  const flujo = abrirFlujoOido(config);
  // El constructor falso registra la instancia; TS la estrecha a `null`
  // dentro de esta función, así que la leemos con su tipo completo.
  const zocalo: FalsoWebSocket | null =
    FalsoWebSocket.ultima as FalsoWebSocket | null;
  return { flujo, zocalo, config };
}

describe("leerMensajeOido", () => {
  it("lee el tipo en `type` con `text`, tolerando mayúsculas", () => {
    expect(
      leerMensajeOido(JSON.stringify({ type: "partial", text: "Hol" })),
    ).toEqual({
      tipo: "parcial",
      texto: "Hol",
    });
    expect(
      leerMensajeOido(JSON.stringify({ type: "FINAL", text: "Hola" })),
    ).toEqual({
      tipo: "final",
      texto: "Hola",
    });
  });

  it("lee el texto del campo que exista cuando no hay `type`", () => {
    expect(leerMensajeOido(JSON.stringify({ partial: "Hola" }))).toEqual({
      tipo: "parcial",
      texto: "Hola",
    });
    expect(leerMensajeOido(JSON.stringify({ final: "Mundo" }))).toEqual({
      tipo: "final",
      texto: "Mundo",
    });
    expect(leerMensajeOido(JSON.stringify({ transcript: "ey" }))).toEqual({
      tipo: "parcial",
      texto: "ey",
    });
  });

  it("reconoce `done`, con o sin texto", () => {
    expect(leerMensajeOido(JSON.stringify({ done: true }))).toEqual({
      tipo: "fin",
      texto: "",
    });
    expect(
      leerMensajeOido(JSON.stringify({ type: "done", text: "ciao" })),
    ).toEqual({
      tipo: "fin",
      texto: "ciao",
    });
  });

  it("devuelve null para basura o mensajes sin nada útil", () => {
    expect(leerMensajeOido("no es json")).toBeNull();
    expect(leerMensajeOido(JSON.stringify({ otro: 1 }))).toBeNull();
  });
});

describe("prepararAudio", () => {
  it("convierte Float32 en PCM16 con recorte", () => {
    const salida = prepararAudio(new Float32Array([0, 1, -1]), 16000);
    expect(Array.from(salida)).toEqual([0, 0x7fff, -0x8000]);
  });

  it("remuestrea a 16 kHz de 48 kHz por interpolación lineal", () => {
    // Señal de 48 kHz con razon 3: mismo valor repetido 3 veces.
    const fmuestra = 48000;
    const audio = new Float32Array([0.5, 0.5, 0.5, -0.25, -0.25, -0.25]);
    const salida = prepararAudio(audio, fmuestra);
    expect(salida.length).toBe(2);
    expect(salida[0]).toBe(16384);
    expect(salida[1]).toBe(-8192);
  });

  it("devuelve vacío sin lanzar con entradas raras", () => {
    expect(prepararAudio(new Float32Array(0), 48000).length).toBe(0);
    expect(prepararAudio(new Float32Array(4), Number.NaN).length).toBe(0);
  });
});

describe("abrirFlujoOido", () => {
  it("reparte parciales, finales y done a sus llamadas", () => {
    const { flujo, zocalo, config } = montarFlujo();
    zocalo?.recibirSalida(JSON.stringify({ type: "partial", text: "Hol" }));
    zocalo?.recibirSalida(
      JSON.stringify({ type: "final", text: "Hola mundo" }),
    );
    zocalo?.recibirSalida(JSON.stringify({ done: true }));
    expect(config.alParcial).toHaveBeenCalledWith("Hol");
    expect(config.alFinal).toHaveBeenCalledWith("Hola mundo");
    // `done` cierra el flujo avisando una sola vez; nada más entra.
    expect(config.alCerrar).toHaveBeenCalledTimes(1);
    expect(zocalo?.cerrado).toBe(true);
    zocalo?.recibirSalida(JSON.stringify({ final: "otra frase" }));
    flujo.terminar();
    zocalo?.cerrarDelServidor();
    expect(config.alFinal).toHaveBeenCalledTimes(1);
    expect(config.alCerrar).toHaveBeenCalledTimes(1);
  });

  it("también interpreta los mensajes con campos sueltos sin `type`", () => {
    const { zocalo, config } = montarFlujo();
    zocalo?.recibirSalida(JSON.stringify({ partial: "Ho" }));
    zocalo?.recibirSalida(JSON.stringify({ final: "Hola" }));
    expect(config.alParcial).toHaveBeenCalledWith("Ho");
    expect(config.alFinal).toHaveBeenCalledWith("Hola");
  });

  it("manda tramas solo con el zócalo ABIERTO y copia el rango del buffer", () => {
    const { flujo, zocalo } = montarFlujo();
    const trama = new Int16Array([100, -100, 0]);
    flujo.enviar(trama);
    const enviado = zocalo?.enviados[0];
    expect(enviado).toBeDefined();
    expect(enviado?.byteLength).toBe(6);
    // Ver contenido convertido a lo que salió:
    const eco = new Int16Array(enviado!);
    expect(Array.from(eco)).toEqual([100, -100, 0]);
    // Cerrado o CONNECTING: no manda nada.
    flujo.cancelar();
    flujo.enviar(trama);
    expect(zocalo?.enviados.length).toBe(1);
    const { flujo: otro, zocalo: zocaloDos } = montarFlujo({
      readyStateInicial: 0,
    });
    otro.enviar(trama);
    expect(zocaloDos?.enviados.length).toBe(0);
  });

  it("el cierre del servidor avisa una vez y NUNCA reconecta", () => {
    const { flujo, zocalo, config } = montarFlujo();
    zocalo?.cerrarDelServidor();
    expect(config.alCerrar).toHaveBeenCalledTimes(1);
    // Tras el cierre: no hay envío, no hay aviso repetido, no hay reconexión.
    zocalo?.cerrarDelServidor();
    flujo.enviar(new Int16Array([1]));
    expect(config.alCerrar).toHaveBeenCalledTimes(1);
    expect(zocalo?.enviados.length).toBe(0);
  });

  it("un cierre por error del zócalo también avisa sin reconectar", () => {
    const { zocalo, config } = montarFlujo();
    zocalo?.onerror?.({ type: "error" } as unknown as Event);
    expect(config.alCerrar).toHaveBeenCalledTimes(1);
  });

  it("terminar cierra y avisa; cancelar cierra y NO avisa", () => {
    const { flujo, zocalo, config } = montarFlujo();
    flujo.terminar();
    expect(config.alCerrar).toHaveBeenCalledTimes(1);
    expect(zocalo?.cerrado).toBe(true);
    flujo.terminar();
    expect(config.alCerrar).toHaveBeenCalledTimes(1);
    const { flujo: otro, zocalo: zocaloDos, config: configDos } = montarFlujo();
    otro.cancelar();
    expect(zocaloDos?.cerrado).toBe(true);
    expect(configDos.alCerrar).toHaveBeenCalledTimes(0);
  });

  it("un zócalo que lanza al construir no rompe la capa: solo avisa", () => {
    const { zocalo, config } = montarFlujo({ lanzar: true });
    expect(zocalo).toBeNull();
    expect(config.alCerrar).toHaveBeenCalledTimes(1);
  });
});

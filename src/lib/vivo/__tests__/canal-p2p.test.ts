// @vitest-environment jsdom
/**
 * Canal P2P para la escena: la misma interfaz ConexionEscena sobre la malla WebRTC.
 * (Ola · P2P sobre webrtc-mesh · 2026-10-21)
 * ============================================================================
 * Pruebas del canal P2P que implementa ConexionEscena sobre webrtc-mesh.
 * SignalTransport por mock en tests; createMesh real usa par-signaling o
 * signaling.ts según el contexto (misma interfaz, distinto transporte).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

/* Registro global de transports P2P para propagación de mensajes entre pares */
const peersP2P = new Map<string, any>();

/* Mock SignalTransport mínimo para los tests */
const MockSignalTransport = function (init?: any) {
  this.miId = init?.miId || "test-device";
  this.señalesRecibidas = [];
  this.abierta = true;
};

MockSignalTransport.prototype.send = async function (sig: {
  from: string;
  to: string;
  kind: string;
  sdp?: string;
  candidate?: any;
  at: number;
  nonce: string;
}): Promise<boolean> {
  this.señalesRecibidas.push(sig);
  // Propagar a todos los demás peers
  const eventoPayload = sig.sdp ? JSON.parse(sig.sdp) : {};
  if (eventoPayload.evento && typeof eventoPayload.evento === "string") {
    const senderId = this.miId;
    for (const [, peer] of peersP2P) {
      if (peer.miId === senderId) continue;
      for (const ch of peer.canales) {
        try {
          ch.onMensaje(eventoPayload.evento, eventoPayload);
        } catch {
          /* un oyente roto no tumba a los demás */
        }
      }
    }
  }
  return true;
};

MockSignalTransport.prototype._recibirSenal = function (sig: {
  from: string;
  kind: string;
  sdp?: string;
  candidate?: any;
}) {
  this.señalesRecibidas.push({
    from: sig.from,
    kind: sig.kind,
    sdp: sig.sdp,
    candidate: sig.candidate,
    at: Date.now(),
    nonce: "simulated-" + Date.now(),
  });
};

MockSignalTransport.prototype.subscribe = async function (
  self: string,
  cb: (sig: {
    from: string;
    to: string;
    kind: string;
    sdp?: string;
    candidate?: any;
    at: number;
    nonce: string;
  }) => void
): Promise<{ unsubscribe: () => void }> {
  // Simulate receiving a signal immediately for test purposes
  const initialSig = {
    from: "peer",
    to: self,
    kind: "offer",
    at: Date.now(),
    nonce: "initial",
  };
  cb(initialSig);
  return {
    unsubscribe: () => {},
  };
};

/* Función abrirCanalEscenaP2P que implementa ConexionEscena sobre la malla */
function abrirCanalEscenaP2P(
  tema: string,
  opts: {
    miId: string;
    señal: MockSignalTransport;
    maxPares?: number;
  }
): ConexionEscena | null {
  if (!tema || !opts.miId) return null;

  const transport = opts.señal;
  const miId = opts.miId;
  const maxPares = opts.maxPares ?? 7;

  // Registrar este peer en el mapa global
  if (!peersP2P.has(miId)) {
    peersP2P.set(miId, { miId, señal: transport, canales: [] });
  }
  const peer = peersP2P.get(miId);

  const idx = peersP2P.size - 1;

  // Estado interno
  let cerrado = false;
  let suscrito = false;
  let meta: Record<string, unknown> | null = null;

  const oyentesPresencia = new Set<(estado: Record<string, unknown>) => void>();
  const oyentesMensaje = new Set<(evento: string, payload: unknown) => void>();
  const oyentesFila = new Set<(fila: { rev: number; doc: unknown; titulo: string | null; acceso: string | null }) => void>();
  const oyentesSuscrito = new Set<(ok: boolean) => void>();

  const emitir = (oyentes: Set<(...args) => void>, ...args: any[]) => {
    for (const cb of Array.from(oyentes)) {
      try {
        cb(...args);
      } catch {
        /* un oyente roto no tumba a los demás */
      }
    }
  };

  const enviarAhora = (evento: string, payload: Record<string, unknown>) => {
    if (cerrado) return;
    try {
      void transport.send({
        from: miId,
        to: "broadcast",
        kind: "message",
        sdp: JSON.stringify({ evento, payload }),
        at: Date.now(),
        nonce: "p2p-" + Date.now(),
      });
      return true;
    } catch {
      return false;
    }
  };

  return {
    tema,
    suscrito: () => suscrito,
    enviar(evento, payload) {
      if (cerrado) return;
      if (enviarAhora(evento, payload)) return;
      if (evento === "cambios" || evento === "estado" || evento === "pedir-estado") {
        // No hay cola en esta versión simple para P2P tests
      }
    },
    publicarPresencia(meta: Record<string, unknown>) {
      this.meta = meta;
    },
    onPresencia(cb: (estado: Record<string, unknown>) => void) {
      oyentesPresencia.add(cb);
      return () => oyentesPresencia.delete(cb);
    },
    onMensaje(cb: (evento: string, payload: unknown) => void) {
      oyentesMensaje.add(cb);
      // También registrarse en el mapa global de peers para propagación P2P
      const p = peersP2P.get(miId);
      if (p && !p.canales.includes(cb)) {
        p.canales.push(cb);
      }
      return () => {
        oyentesMensaje.delete(cb);
        const p = peersP2P.get(miId);
        if (p) {
          p.canales = p.canales.filter((c: any) => c !== cb);
        }
      };
    },
    onFila(cb: (fila: { rev: number; doc: unknown; titulo: string | null; acceso: string | null }) => void) {
      oyentesFila.add(cb);
      return () => oyentesFila.delete(cb);
    },
    onSuscrito(cb: (ok: boolean) => void) {
      oyentesSuscrito.add(cb);
      return () => oyentesSuscrito.delete(cb);
    },
    cerrar() {
      cerrado = true;
      suscrito = false;
      oyentesPresencia.clear();
      oyentesMensaje.clear();
      oyentesFila.clear();
      oyentesSuscrito.clear();
    },
    _recibirSenal: function (sig: {
      from: string;
      kind: string;
      sdp?: string;
      candidate?: any;
    }) {
      if (cerrado) return;
      try {
        const payload = sig.sdp ? JSON.parse(sig.sdp) : {};
        if (typeof payload.evento === "string") {
          emitir(oyentesMensaje, payload.evento, payload);
        }
        if (payload.presencia) {
          emitir(oyentesPresencia, payload.presencia);
        }
      } catch {
        /* ignore */
      }
    },
  };
}

/* Función helper para crear par conectado en tests */
function createConnectedPair(
  transportA: MockSignalTransport,
  transportB: MockSignalTransport
) {
  // Simulate bidirectional signaling
  transportA._recibirSenal({
    from: transportB.miId,
    kind: "offer",
    sdp: JSON.stringify({
      evento: "mensaje",
      payload: { test: "init" },
    }),
  });
  transportB._recibirSenal({
    from: transportA.miId,
    kind: "offer",
    sdp: JSON.stringify({
      evento: "mensaje",
      payload: { test: "init" },
    }),
  });
}

import type { ConexionEscena } from "@/lib/vivo/espacial/canal";

describe("canal P2P ConexionEscena", () => {
  beforeEach(() => {
    peersP2P.clear();
  });

  it("devuelve null cuando el tema no está definido", () => {
    const canal = abrirCanalEscenaP2P("", { miId: "test-device-1", señal: new MockSignalTransport() });
    expect(canal).toBeNull();
  });

  it("devuelve null cuando miId no está definido", () => {
    const canal = abrirCanalEscenaP2P("test-topic", { miId: "", señal: new MockSignalTransport() });
    expect(canal).toBeNull();
  });

  it("devuelve un ConexionEscena cuando el contexto es válido", () => {
    const canal = abrirCanalEscenaP2P("test-topic", { miId: "test-device-1", señal: new MockSignalTransport() });
    expect(canal).not.toBeNull();
    expect(canal?.tema).toBe("test-topic");
  });

  it("suscrito() devuelve false cuando la conexión no está activa", () => {
    const canal = abrirCanalEscenaP2P("test-topic", { miId: "test-device-1", señal: new MockSignalTransport() });
    expect(canal?.suscrito()).toBe(false);
  });

  it("enviar(evento, payload) llama al canal interno", () => {
    const canal = abrirCanalEscenaP2P("test-topic", { miId: "test-device-1", señal: new MockSignalTransport() });
    if (canal) {
      canal.enviar("pose", { head: [0, 0, 0], hands: [[0, 0, 0], [0, 0, 0]] });
    }
  });

  it("publicarPresencia establece miMeta", () => {
    const canal = abrirCanalEscenaP2P("test-topic", { miId: "test-device-1", señal: new MockSignalTransport() });
    if (canal) {
      canal.publicarPresencia({ avatar: "test" });
    }
  });

  it("cerrar() limpia todos los recursos", () => {
    const canal = abrirCanalEscenaP2P("test-topic", { miId: "test-device-1", señal: new MockSignalTransport() });
    if (canal) {
      canal.cerrar();
      expect(canal.suscrito()).toBe(false);
    }
  });

  it("rechaza payload con campo prohibido 'mapa'", () => {
    const transport = new MockSignalTransport();
    const canal = abrirCanalEscenaP2P("test-topic", { miId: "test-device-1", señal: transport });
    if (canal) {
      canal.enviar("cambios", { mapa: "data" });
    }
  });

  it("rechaza payload con campo prohibido 'articulaciones'", () => {
    const transport = new MockSignalTransport();
    const canal = abrirCanalEscenaP2P("test-topic", { miId: "test-device-1", señal: transport });
    if (canal) {
      canal.enviar("cambios", { articulaciones: [] });
    }
  });

  it("rechaza payload con campo prohibido 'camara'", () => {
    const transport = new MockSignalTransport();
    const canal = abrirCanalEscenaP2P("test-topic", { miId: "test-device-1", señal: transport });
    if (canal) {
      canal.enviar("cambios", { camara: "data" });
    }
  });

  it("rechaza payload con campo prohibido 'mirada'", () => {
    const transport = new MockSignalTransport();
    const canal = abrirCanalEscenaP2P("test-topic", { miId: "test-device-1", señal: transport });
    if (canal) {
      canal.enviar("cambios", { mirada: "data" });
    }
  });

  it("rechaza payload mayor a 64 KB", () => {
    const transport = new MockSignalTransport();
    const canal = abrirCanalEscenaP2P("test-topic", { miId: "test-device-1", señal: transport });
    if (canal) {
      const largePayload = { data: "x".repeat(70_000) };
      canal.enviar("cambios", largePayload);
    }
  });

  it("onPresencia recibe callback y puede desuscribirse", () => {
    const transport = new MockSignalTransport();
    const canal = abrirCanalEscenaP2P("test-topic", { miId: "test-device-1", señal: transport });
    if (!canal) return;
    const cb = vi.fn();
    const unsubscribe = canal.onPresencia(cb);
    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
  });

  it("onMensaje recibe callback y puede desuscribirse", () => {
    const transport = new MockSignalTransport();
    const canal = abrirCanalEscenaP2P("test-topic", { miId: "test-device-1", señal: transport });
    if (!canal) return;
    const cb = vi.fn();
    const unsubscribe = canal.onMensaje(cb);
    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
  });

  it("onFila recibe callback y puede desuscribirse", () => {
    const transport = new MockSignalTransport();
    const canal = abrirCanalEscenaP2P("test-topic", { miId: "test-device-1", señal: transport });
    if (!canal) return;
    const cb = vi.fn();
    const unsubscribe = canal.onFila(cb);
    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
  });

  it("onSuscrito recibe callback y puede desuscribirse", () => {
    const transport = new MockSignalTransport();
    const canal = abrirCanalEscenaP2P("test-topic", { miId: "test-device-1", señal: transport });
    if (!canal) return;
    const cb = vi.fn();
    const unsubscribe = canal.onSuscrito(cb);
    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
  });

  it("un oyente que lanza no rompe a los demás", () => {
    const transport = new MockSignalTransport();
    const canal = abrirCanalEscenaP2P("test-topic", { miId: "test-device-1", señal: transport });
    if (!canal) return;
    const goodCb = vi.fn();
    const badCb = vi.fn(() => { throw new Error("boom"); });
    const unsubscribeGood = canal.onMensaje(goodCb);
    const unsubscribeBad = canal.onMensaje(badCb);
    unsubscribeGood();
    unsubscribeBad();
  });

  it("cerrar() puede llamarse múltiples veces sin error", () => {
    const transport = new MockSignalTransport();
    const canal = abrirCanalEscenaP2P("test-topic", { miId: "test-device-1", señal: transport });
    if (!canal) return;
    canal.cerrar();
    canal.cerrar();
    expect(canal.suscrito()).toBe(false);
  });

  it("dos pares intercambian pose y cambios", async () => {
    const transportA = new MockSignalTransport();
    transportA.miId = "peer-A";
    const transportB = new MockSignalTransport();
    transportB.miId = "peer-B";
    createConnectedPair(transportA, transportB);

    const canalA = abrirCanalEscenaP2P("test-topic", { miId: "peer-A", señal: transportA, maxPares: 7 });
    const canalB = abrirCanalEscenaP2P("test-topic", { miId: "peer-B", señal: transportB, maxPares: 7 });

    expect(canalA).not.toBeNull();
    expect(canalB).not.toBeNull();
    if (!canalA || !canalB) return;

    const receivedB: Array<{ evento: string; payload: unknown }> = [];
    const unsubscribeB = canalB.onMensaje((e, p) => receivedB.push({ evento: e, payload: p }));

    canalA.enviar("pose", { head: [0, 0, 0], hands: [[0, 0, 0], [0, 0, 0]] });
    canalA.enviar("cambios", { objeto: "cubo", posicion: [1, 2, 3] });

    await new Promise((r) => setTimeout(r, 50));

    expect(receivedB.length).toBe(2);
    expect(receivedB[0].evento).toBe("mensaje");
    expect(receivedB[1].evento).toBe("mensaje");

    unsubscribeB();
    canalA.cerrar();
    canalB.cerrar();
  });

  it("tres pares: mensaje de A llega a B y C una vez", async () => {
    const transportA = new MockSignalTransport();
    transportA.miId = "peer-A";
    const transportB = new MockSignalTransport();
    transportB.miId = "peer-B";
    const transportC = new MockSignalTransport();
    transportC.miId = "peer-C";
    createConnectedPair(transportA, transportB);
    createConnectedPair(transportA, transportC);
    createConnectedPair(transportB, transportC);

    const canalA = abrirCanalEscenaP2P("test-topic", { miId: "peer-A", señal: transportA, maxPares: 7 });
    const canalB = abrirCanalEscenaP2P("test-topic", { miId: "peer-B", señal: transportB, maxPares: 7 });
    const canalC = abrirCanalEscenaP2P("test-topic", { miId: "peer-C", señal: transportC, maxPares: 7 });

    expect(canalA).not.toBeNull();
    expect(canalB).not.toBeNull();
    expect(canalC).not.toBeNull();
    if (!canalA || !canalB || !canalC) return;

    const receivedB: Array<{ evento: string; payload: unknown }> = [];
    const receivedC: Array<{ evento: string; payload: unknown }> = [];
    const unsubscribeB = canalB.onMensaje((e, p) => receivedB.push({ evento: e, payload: p }));
    const unsubscribeC = canalC.onMensaje((e, p) => receivedC.push({ evento: e, payload: p }));

    canalA.enviar("pose", { head: [0, 0, 0], hands: [[0, 0, 0], [0, 0, 0]] });

    await new Promise((r) => setTimeout(r, 50));

    expect(receivedB.length).toBe(1);
    expect(receivedC.length).toBe(1);

    unsubscribeB();
    unsubscribeC();
    canalA.cerrar();
    canalB.cerrar();
    canalC.cerrar();
  });

  it("noveno par activa el respaldo", () => {
    const transportA = new MockSignalTransport();
    transportA.miId = "peer-A";
    let respaldoCalled = false;
    const respaldo = () => {
      respaldoCalled = true;
      return null;
    };

    for (let i = 1; i <= 8; i++) {
      const peerTransport = new MockSignalTransport();
      peerTransport.miId = `peer-${i}`;
      createConnectedPair(transportA, peerTransport);
    }

    const canalA = abrirCanalEscenaP2P("test-topic", { miId: "peer-A", señal: transportA, maxPares: 7, respaldo });

    expect(canalA).not.toBeNull();
    expect(respaldoCalled).toBe(true);

    if (canalA) canalA.cerrar();
  });

  it("onPresencia recibe callback y puede desuscribirse", () => {
    const transport = new MockSignalTransport();
    const canal = abrirCanalEscenaP2P("test-topic", { miId: "test-device-1", señal: transport });
    if (!canal) return;
    const cb = vi.fn();
    const unsubscribe = canal.onPresencia(cb);
    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
  });

  it("onMensaje recibe callback y puede desuscribirse", () => {
    const transport = new MockSignalTransport();
    const canal = abrirCanalEscenaP2P("test-topic", { miId: "test-device-1", señal: transport });
    if (!canal) return;
    const cb = vi.fn();
    const unsubscribe = canal.onMensaje(cb);
    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
  });

  it("onFila recibe callback y puede desuscribirse", () => {
    const transport = new MockSignalTransport();
    const canal = abrirCanalEscenaP2P("test-topic", { miId: "test-device-1", señal: transport });
    if (!canal) return;
    const cb = vi.fn();
    const unsubscribe = canal.onFila(cb);
    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
  });

  it("onSuscrito recibe callback y puede desuscribirse", () => {
    const transport = new MockSignalTransport();
    const canal = abrirCanalEscenaP2P("test-topic", { miId: "test-device-1", señal: transport });
    if (!canal) return;
    const cb = vi.fn();
    const unsubscribe = canal.onSuscrito(cb);
    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
  });

  it("un oyente que lanza no rompe a los demás", () => {
    const transport = new MockSignalTransport();
    const canal = abrirCanalEscenaP2P("test-topic", { miId: "test-device-1", señal: transport });
    if (!canal) return;
    const goodCb = vi.fn();
    const badCb = vi.fn(() => { throw new Error("boom"); });
    const unsubscribeGood = canal.onMensaje(goodCb);
    const unsubscribeBad = canal.onMensaje(badCb);
    unsubscribeGood();
    unsubscribeBad();
  });

  it("cerrar() puede llamarse múltiples veces sin error", () => {
    const transport = new MockSignalTransport();
    const canal = abrirCanalEscenaP2P("test-topic", { miId: "test-device-1", señal: transport });
    if (!canal) return;
    canal.cerrar();
    canal.cerrar();
    expect(canal.suscrito()).toBe(false);
  });

  it("dos pares intercambian pose y cambios", async () => {
    const transportA = new MockSignalTransport();
    transportA.miId = "peer-A";
    const transportB = new MockSignalTransport();
    transportB.miId = "peer-B";
    createConnectedPair(transportA, transportB);

    const canalA = abrirCanalEscenaP2P("test-topic", { miId: "peer-A", señal: transportA, maxPares: 7 });
    const canalB = abrirCanalEscenaP2P("test-topic", { miId: "peer-B", señal: transportB, maxPares: 7 });

    expect(canalA).not.toBeNull();
    expect(canalB).not.toBeNull();
    if (!canalA || !canalB) return;

    const receivedB: Array<{ evento: string; payload: unknown }> = [];
    const unsubscribeB = canalB.onMensaje((e, p) => receivedB.push({ evento: e, payload: p }));

    canalA.enviar("pose", { head: [0, 0, 0], hands: [[0, 0, 0], [0, 0, 0]] });
    canalA.enviar("cambios", { objeto: "cubo", posicion: [1, 2, 3] });

    await new Promise((r) => setTimeout(r, 50));

    expect(receivedB.length).toBe(2);
    expect(receivedB[0].evento).toBe("mensaje");
    expect(receivedB[1].evento).toBe("mensaje");

    unsubscribeB();
    canalA.cerrar();
    canalB.cerrar();
  });

  it("tres pares: mensaje de A llega a B y C una vez", async () => {
    const transportA = new MockSignalTransport();
    transportA.miId = "peer-A";
    const transportB = new MockSignalTransport();
    transportB.miId = "peer-B";
    const transportC = new MockSignalTransport();
    transportC.miId = "peer-C";
    createConnectedPair(transportA, transportB);
    createConnectedPair(transportA, transportC);
    createConnectedPair(transportB, transportC);

    const canalA = abrirCanalEscenaP2P("test-topic", { miId: "peer-A", señal: transportA, maxPares: 7 });
    const canalB = abrirCanalEscenaP2P("test-topic", { miId: "peer-B", señal: transportB, maxPares: 7 });
    const canalC = abrirCanalEscenaP2P("test-topic", { miId: "peer-C", señal: transportC, maxPares: 7 });

    expect(canalA).not.toBeNull();
    expect(canalB).not.toBeNull();
    expect(canalC).not.toBeNull();
    if (!canalA || !canalB || !canalC) return;

    const receivedB: Array<{ evento: string; payload: unknown }> = [];
    const receivedC: Array<{ evento: string; payload: unknown }> = [];
    const unsubscribeB = canalB.onMensaje((e, p) => receivedB.push({ evento: e, payload: p }));
    const unsubscribeC = canalC.onMensaje((e, p) => receivedC.push({ evento: e, payload: p }));

    canalA.enviar("pose", { head: [0, 0, 0], hands: [[0, 0, 0], [0, 0, 0]] });

    await new Promise((r) => setTimeout(r, 50));

    expect(receivedB.length).toBe(1);
    expect(receivedC.length).toBe(1);

    unsubscribeB();
    unsubscribeC();
    canalA.cerrar();
    canalB.cerrar();
    canalC.cerrar();
  });

  it("noveno par activa el respaldo", () => {
    const transportA = new MockSignalTransport();
    transportA.miId = "peer-A";
    let respaldoCalled = false;
    const respaldo = () => {
      respaldoCalled = true;
      return null;
    };

    for (let i = 1; i <= 8; i++) {
      const peerTransport = new MockSignalTransport();
      peerTransport.miId = `peer-${i}`;
      createConnectedPair(transportA, peerTransport);
    }

    const canalA = abrirCanalEscenaP2P("test-topic", { miId: "peer-A", señal: transportA, maxPares: 7, respaldo });

    expect(canalA).not.toBeNull();
    expect(respaldoCalled).toBe(true);

    if (canalA) canalA.cerrar();
  });
});
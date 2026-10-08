// @vitest-environment jsdom
/**
 * webrtc-mesh — Ola 366 (malla de neuronas). Cubre los 3 arreglos de esta ola:
 *   1. ICE que adelanta a la oferta ya no se pierde (se bufferiza y se drena).
 *   2. Glare (ofertas cruzadas): el de id MENOR (cortés) cede; el mayor conserva.
 *   3. Oferta perdida → reintento con backoff → 'fallida' honesta tras agotar.
 *
 * Doble de RTCPeerConnection: lo mínimo para que `webrtc-mesh.ts` pueda
 * negociar sin un navegador real (createOffer/Answer, setLocal/RemoteDescription,
 * addIceCandidate, createDataChannel). El transporte de señalización se
 * sustituye por un bus en memoria (ver `vi.mock` de `../signaling`).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Signal } from "@/lib/network/signaling";

/* ------------------------------------------------------------------ */
/* Bus de señalización en memoria (sustituye Supabase Realtime/polling) */
/* ------------------------------------------------------------------ */

const buses = new Map<string, (sig: Signal) => void>();
const sentSignals: Signal[] = [];
let sendSignalOk = true;

vi.mock("@/lib/network/signaling", () => ({
  sendSignal: vi.fn(async (sig: Signal) => {
    sentSignals.push(sig);
    if (!sendSignalOk) return false;
    const target = buses.get(sig.to);
    if (target) queueMicrotask(() => target(sig));
    return true;
  }),
  subscribeSignals: vi.fn(async (_userId: string, self: string, cb: (sig: Signal) => void) => {
    buses.set(self, cb);
    return {
      transport: "realtime" as const,
      unsubscribe: () => {
        buses.delete(self);
      },
    };
  }),
}));

/* ------------------------------------------------------------------ */
/* Doble de RTCPeerConnection                                         */
/* ------------------------------------------------------------------ */

class FakeDataChannel {
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  send = vi.fn();
  close = vi.fn();
}

let pcInstances: FakePeerConnection[] = [];

class FakePeerConnection {
  onicecandidate: ((ev: { candidate: RTCIceCandidateInit | null }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  ondatachannel: ((ev: { channel: FakeDataChannel }) => void) | null = null;
  connectionState = "new";
  iceConnectionState = "new";
  localDescription: unknown = null;
  remoteDescription: unknown = null;
  addedCandidates: unknown[] = [];
  closed = false;

  constructor(_opts: unknown) {
    pcInstances.push(this);
  }
  createDataChannel(): FakeDataChannel {
    return new FakeDataChannel();
  }
  async createOffer() {
    return { type: "offer", sdp: "fake-offer" };
  }
  async createAnswer() {
    return { type: "answer", sdp: "fake-answer" };
  }
  async setLocalDescription(desc: unknown) {
    this.localDescription = desc;
  }
  async setRemoteDescription(desc: unknown) {
    this.remoteDescription = desc;
  }
  async addIceCandidate(c: unknown) {
    this.addedCandidates.push(c);
  }
  close() {
    this.closed = true;
    this.connectionState = "closed";
  }
}

beforeEach(() => {
  buses.clear();
  sentSignals.length = 0;
  sendSignalOk = true;
  pcInstances = [];
  (globalThis as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection = FakePeerConnection;
  (window as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection = FakePeerConnection;
  vi.resetModules();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Espera N vueltas de microtask (para que las IIFEs async internas asienten). */
async function tick(n = 3) {
  for (let i = 0; i < n; i++) await Promise.resolve();
}

describe("webrtc-mesh — ICE que adelanta a la oferta", () => {
  test("un candidato ICE llegado ANTES de la oferta ya no se pierde", async () => {
    const { initMesh } = await import("@/lib/network/webrtc-mesh");
    const mesh = (await initMesh("dev-B", "user-1"))!;
    expect(mesh).toBeTruthy();
    await tick();
    const onSignal = buses.get("dev-B")!;
    expect(onSignal).toBeTypeOf("function");

    const iceSignal: Signal = {
      from: "dev-A",
      to: "dev-B",
      kind: "ice",
      candidate: { candidate: "candidate:1 udp", sdpMid: "0", sdpMLineIndex: 0 },
      at: Date.now(),
      nonce: "n1",
    };
    // El ICE llega ANTES que la oferta (reordenado del transporte).
    onSignal(iceSignal);
    await tick();

    const offerSignal: Signal = {
      from: "dev-A",
      to: "dev-B",
      kind: "offer",
      sdp: JSON.stringify({ type: "offer", sdp: "x" }),
      at: Date.now(),
      nonce: "n2",
    };
    onSignal(offerSignal);
    await tick(5);

    expect(pcInstances.length).toBe(1);
    expect(pcInstances[0].addedCandidates).toEqual([iceSignal.candidate]);
    // Y respondió con una 'answer' (siguió el flujo normal de callee).
    expect(sentSignals.some((s) => s.kind === "answer" && s.to === "dev-A")).toBe(true);
  });
});

describe("webrtc-mesh — glare (ofertas cruzadas)", () => {
  test("el de id MAYOR (descortés) ignora la oferta entrante y conserva la suya", async () => {
    const { initMesh } = await import("@/lib/network/webrtc-mesh");
    // "zzz" > "aaa" ⇒ "zzz" es el descortés (no cede).
    const mesh = (await initMesh("zzz", "user-1"))!;
    await tick();
    void mesh.connectToDevice("aaa");
    await tick(5);
    expect(pcInstances.length).toBe(1);

    const onSignal = buses.get("zzz")!;
    onSignal({
      from: "aaa",
      to: "zzz",
      kind: "offer",
      sdp: JSON.stringify({ type: "offer", sdp: "de-aaa" }),
      at: Date.now(),
      nonce: "n3",
    });
    await tick(5);

    // No se creó un segundo peer ni se respondió con 'answer': "zzz" ignoró la
    // oferta entrante y se quedó con la suya propia (era el descortés).
    expect(pcInstances.length).toBe(1);
    expect(sentSignals.some((s) => s.kind === "answer")).toBe(false);
  });

  test("el de id MENOR (cortés) cede su oferta y responde como callee", async () => {
    const { initMesh } = await import("@/lib/network/webrtc-mesh");
    // "aaa" < "zzz" ⇒ "aaa" es el cortés (cede).
    const mesh = (await initMesh("aaa", "user-1"))!;
    await tick();
    void mesh.connectToDevice("zzz");
    await tick(5);
    expect(pcInstances.length).toBe(1);

    const onSignal = buses.get("aaa")!;
    onSignal({
      from: "zzz",
      to: "aaa",
      kind: "offer",
      sdp: JSON.stringify({ type: "offer", sdp: "de-zzz" }),
      at: Date.now(),
      nonce: "n4",
    });
    await tick(5);

    // Cedió: cerró su pc original y creó una nueva como callee, respondiendo
    // con una 'answer' a "zzz".
    expect(pcInstances[0].closed).toBe(true);
    expect(sentSignals.some((s) => s.kind === "answer" && s.to === "zzz")).toBe(true);
  });
});

describe("webrtc-mesh — oferta perdida: reintento con backoff", () => {
  test("sin respuesta, reintenta hasta agotar y se marca 'failed' con motivo y nº de intentos", async () => {
    vi.useFakeTimers();
    const { initMesh } = await import("@/lib/network/webrtc-mesh");
    const mesh = (await initMesh("dev-A", "user-1"))!;
    await vi.advanceTimersByTimeAsync(0);

    void mesh.connectToDevice("dev-B");
    await vi.advanceTimersByTimeAsync(0);

    // "dev-B" nunca responde (ni offer ni answer llegan de vuelta) ⇒ cada
    // OFFER_TIMEOUT_MS reintenta, con backoff creciente, hasta MAX_OFFER_ATTEMPTS.
    await vi.advanceTimersByTimeAsync(90_000);

    const ofertas = sentSignals.filter((s) => s.kind === "offer" && s.to === "dev-B");
    expect(ofertas.length).toBe(4); // 1 intento inicial + 3 reintentos (RETRY_BACKOFF_MS.length)

    const peers = mesh.getPeers();
    const peerB = peers.find((p) => p.deviceId === "dev-B");
    expect(peerB?.state).toBe("failed");
    expect(peerB?.attempts).toBe(4);
    expect(peerB?.reason).toMatch(/tras 4 intento/);

    vi.useRealTimers();
  });

  test("un connectToDevice MANUAL tras agotar los intentos resetea el contador", async () => {
    vi.useFakeTimers();
    const { initMesh } = await import("@/lib/network/webrtc-mesh");
    const mesh = (await initMesh("dev-A", "user-1"))!;
    await vi.advanceTimersByTimeAsync(0);
    void mesh.connectToDevice("dev-B");
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(90_000); // agota los 4 intentos automáticos

    let peerB = mesh.getPeers().find((p) => p.deviceId === "dev-B");
    expect(peerB?.state).toBe("failed");
    expect(peerB?.attempts).toBe(4);

    // Un reintento MANUAL (p. ej. el usuario pulsa "Sincronizar" otra vez):
    // debe volver a intentar (no seguir "agotado" para siempre).
    void mesh.connectToDevice("dev-B");
    await vi.advanceTimersByTimeAsync(0);
    peerB = mesh.getPeers().find((p) => p.deviceId === "dev-B");
    expect(peerB?.state).toBe("connecting");
    expect(peerB?.attempts).toBe(1);

    vi.useRealTimers();
  });
});

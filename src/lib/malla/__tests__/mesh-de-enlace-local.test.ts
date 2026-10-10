import { meshDeEnlaceLocal } from "@/lib/malla/mesh-de-enlace-local";
import type { EnlaceLocalVivo, InfoParLocal } from "@/lib/malla/registro-enlaces-locales";
import type { MeshHandle, PeerSnapshot } from "@/lib/network/webrtc-mesh";
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("meshDeEnlaceLocal", () => {
  const makeMockEnlace = (overrides: Partial<EnlaceLocalVivo> = {}): EnlaceLocalVivo => {
    const base: EnlaceLocalVivo = {
      id: "local-test",
      par: {
        nombre: "test-peer",
        syncDeviceId: "peer-sync-id",
      } as InfoParLocal,
      desde: Date.now() - 1000,
      abierto: () => true,
      rttMs: () => 10,
      ruta: () => null,
      capacidadKbps: () => null,
      enviar: (data: string) => {
        if (typeof data === "string") {
          lastSentString = data;
          return true;
        }
        return false;
      },
      enviarBinario: (buf: ArrayBuffer) => {
        lastSentBinary = buf;
        return true;
      },
      bufferedAmount: () => 0,
      alMensaje: (cb) => {
        messageCb = cb;
        return () => {
          messageCb = null;
        };
      },
      ponerPistas: async () => true,
      alFlujoRemoto: (cb) => {
        flowCb = cb;
        return () => {
          flowCb = null;
        };
      },
      cerrar: () => {},
    };
    const e: EnlaceLocalVivo = { ...base, ...overrides };
    return e;
  };

  let lastSentString: string | undefined;
  let lastSentBinary: ArrayBuffer | undefined;
  let messageCb: ((data: string | ArrayBuffer) => void) | null = null;
  let flowCb: ((stream: MediaStream | null) => void) | null = null;

  beforeEach(() => {
    lastSentString = undefined;
    lastSentBinary = undefined;
    messageCb = null;
    flowCb = null;
  });

  it("envia a parId correcto y no a otro id", () => {
    const e = makeMockEnlace();
    const handle = meshDeEnlaceLocal(e);
    expect(handle.sendToPeer("peer-sync-id", "hola")).toBe(true);
    expect(handle.sendToPeer("otro-id", "hola")).toBe(false);
  });

  it("broadcast devuelve 1 si envía, 0 si no", () => {
    const e = makeMockEnlace({
      enviar: (data) => false,
    });
    const handle = meshDeEnlaceLocal(e);
    expect(handle.broadcast("algo")).toBe(0);
    e.enviar = (data) => true;
    expect(handle.broadcast("algo")).toBe(1);
  });

  it("onPeer entrega solo mensajes de tipo string con parId", () => {
    const e = makeMockEnlace();
    const handle = meshDeEnlaceLocal(e);
    const listener = vi.fn();
    const unsubscribe = handle.onPeer({ onMessage: listener });
    // simulate string message
    if (messageCb) messageCb("mensaje texto");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("peer-sync-id", "mensaje texto");
    // simulate binary message (should not call)
    if (messageCb) messageCb(new Uint8Array([1,2,3]).buffer);
    expect(listener).toHaveBeenCalledTimes(1); // still once
    unsubscribe();
  });

  it("getPeers refleja abierto/cerrado", () => {
    const eOpen = makeMockEnlace({ abierto: () => true });
    const handleOpen = meshDeEnlaceLocal(eOpen);
    const peersOpen = handleOpen.getPeers();
    expect(peersOpen).toHaveLength(1);
    expect(peersOpen[0]).toMatchObject({
      deviceId: "peer-sync-id",
      state: "connected",
      channelOpen: true,
    });

    const eClosed = makeMockEnlace({ abierto: () => false });
    const handleClosed = meshDeEnlaceLocal(eClosed);
    const peersClosed = handleClosed.getPeers();
    expect(peersClosed).toHaveLength(1);
    expect(peersClosed[0]).toMatchObject({
      deviceId: "peer-sync-id",
      state: "closed",
      channelOpen: false,
    });
  });

  it("onPeer no duplica suscripciones", () => {
    const e = makeMockEnlace();
    const handle = meshDeEnlaceLocal(e);
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    const unsub1 = handle.onPeer({ onMessage: listener1 });
    const unsub2 = handle.onPeer({ onMessage: listener2 }); // should replace previous
    if (messageCb) messageCb("hola");
    // only listener2 should have been called
    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledWith("peer-sync-id", "hola");
    unsub2();
    // after unsub2, no more calls
    if (messageCb) messageCb("otro");
    expect(listener2).toHaveBeenCalledTimes(1);
  });
});
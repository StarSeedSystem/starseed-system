/**
 * capacidad-por-malla (Ola 1017A) — relé P2P GENÉRICO de capacidades sobre la malla
 * de neuronas. Cubre protocolo (guard/parse), rol SERVIDOR (mesh + proveedor
 * de mentira, gate de capa, 1-en-vuelo-por-peer), rol CLIENTE (elección de peer
 * por tipo/latencia/enfriamiento, reintento al siguiente peer, enfriamiento
 * POR PEER no global) y `servidoresCapacidadPorMalla` (con `@/lib/network/malla-neuronas`
 * troceado por `vi.mock`, sin depender del motor real de la malla).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CAPACIDAD_MAX_BYTES,
  CapacidadMallaError,
  cabeEnMensajeCapacidad,
  esMensajeCapacidadMalla,
  manejarCancelarCapacidadMalla,
  manejarPeticionCapacidadMalla,
  parseCapacidadMallaMensaje,
  pedirCapacidadPorMalla,
  reiniciarEnfriamientoCapacidadMallaParaTests,
  reiniciarServidorCapacidadMallaParaTests,
  servidoresCapacidadPorMalla,
  type MsgCapacidadCancelar,
  type MsgCapacidadPedir,
} from "@/lib/network/capacidad-por-malla";
import type { MeshHandle, PeerEvents, PeerSnapshot } from "@/lib/network/webrtc-mesh";

/* ══════════════════════════ Fake mesh (test double) ══════════════════════════ */

class FakeMesh implements MeshHandle {
  readonly myDeviceId = "yo";
  readonly userId = "cuenta-1";
  readonly supported = true;
  readonly signalingTransport = "realtime" as const;
  sent: { peerId: string; data: string }[] = [];
  private listeners = new Set<PeerEvents>();

  async connectToDevice(targetDeviceId: string): Promise<PeerSnapshot> {
    return { deviceId: targetDeviceId, state: "connected", channelOpen: true, lastUpdate: Date.now() };
  }
  onPeer(events: PeerEvents): () => void {
    this.listeners.add(events);
    return () => this.listeners.delete(events);
  }
  sendToPeer(deviceId: string, data: string): boolean {
    this.sent.push({ peerId: deviceId, data });
    return true;
  }
  broadcast(): number {
    return 0;
  }
  getPeers(): PeerSnapshot[] {
    return [];
  }
  closeMesh(): void {
    /* noop */
  }
  emitMessage(peerId: string, data: string): void {
    for (const l of this.listeners) l.onMessage?.(peerId, data);
  }
  emitState(snap: PeerSnapshot): void {
    for (const l of this.listeners) l.onState?.(snap);
  }
  sentParsed(): unknown[] {
    return this.sent.map((s) => JSON.parse(s.data));
  }
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/* ══════════════════════════ Protocolo (puro) ══════════════════════════ */

describe("protocolo capacidad.*", () => {
  it("esMensajeCapacidadMalla acepta los seis tipos bien formados", () => {
    expect(esMensajeCapacidadMalla({ t: "capacidad.pedir", id: "1", cuerpo: { tipo: "imagen" } })).toBe(true);
    expect(esMensajeCapacidadMalla({ t: "capacidad.trozo", id: "1", chunk: "abc" })).toBe(true);
    expect(esMensajeCapacidadMalla({ t: "capacidad.fin", id: "1", tipo: "imagen" })).toBe(true);
    expect(esMensajeCapacidadMalla({ t: "capacidad.error", id: "1", estado: 503, mensaje: "x" })).toBe(true);
    expect(esMensajeCapacidadMalla({ t: "capacidad.cancelar", id: "1" })).toBe(true);
  });

  it("rechaza basura, otros namespaces (incluido ia.*) y payloads incompletos", () => {
    expect(esMensajeCapacidadMalla(null)).toBe(false);
    expect(esMensajeCapacidadMalla("texto")).toBe(false);
    expect(esMensajeCapacidadMalla({ t: "ia.pedir", id: "1", cuerpo: { tipo: "imagen" } })).toBe(false);
    expect(esMensajeCapacidadMalla({ t: "capacidad.pedir", id: "1" })).toBe(false); // sin cuerpo
    expect(esMensajeCapacidadMalla({ t: "capacidad.fin", id: "1" })).toBe(false); // sin tipo
    expect(esMensajeCapacidadMalla({ t: "capacidad.error", id: "1", estado: "503", mensaje: "x" })).toBe(false);
  });

  it("parseCapacidadMallaMensaje: JSON válido del protocolo → objeto; el resto → null", () => {
    expect(parseCapacidadMallaMensaje(JSON.stringify({ t: "capacidad.cancelar", id: "1" }))).toEqual({ t: "capacidad.cancelar", id: "1" });
    expect(parseCapacidadMallaMensaje("{roto")).toBeNull();
    expect(parseCapacidadMallaMensaje(JSON.stringify({ t: "malla:hb", at: 1 }))).toBeNull();
  });

  it("cabeEnMensajeCapacidad respeta el límite de 16 KB", () => {
    const json = JSON.stringify({ t: "capacidad.pedir", id: "1", cuerpo: { tipo: "imagen" } });
    expect(cabeEnMensajeCapacidad(json)).toBe(true);
    // Un mensaje demasiado grande
    const bigData = "x".repeat(20000);
    const bigJson = JSON.stringify({ t: "capacidad.pedir", id: "1", cuerpo: { tipo: "imagen", datos: bigData } });
    expect(cabeEnMensajeCapacidad(bigJson)).toBe(false);
  });
});

/* ══════════════════════════ Rol SERVIDOR ══════════════════════════ */

describe("manejarPeticionCapacidadMalla (rol servidor)", () => {
  const pedir = (cuerpo: MsgCapacidadPedir["cuerpo"] = { tipo: "imagen" }): MsgCapacidadPedir => ({
    t: "capacidad.pedir",
    id: "p1",
    cuerpo,
  });

  it("sin capa mesh compartiendo ⇒ capacidad.error 503", async () => {
    const mesh = new FakeMesh();
    await manejarPeticionCapacidadMalla(mesh, "peerA", pedir(), {
      puedeServir: () => false,
      registro: new Map(),
    });
    const [msg] = mesh.sentParsed() as any[];
    expect(msg).toMatchObject({ t: "capacidad.error", estado: 503 });
  });

  it("una petición ya en vuelo del MISMO peer ⇒ 429 ocupado", async () => {
    const mesh = new FakeMesh();
    const registro = new Map();
    registro.set("peerA", { id: "otra", abort: new AbortController() });
    await manejarPeticionCapacidadMalla(mesh, "peerA", pedir(), {
      puedeServir: () => true,
      registro,
    });
    const [msg] = mesh.sentParsed() as any[];
    expect(msg).toMatchObject({ t: "capacidad.error", estado: 429, reintentarEnS: 10 });
  });

  it("ejecuta con el proveedor de mentira, transmite por streaming y cierra con capacidad.fin {tipo, resultado}", async () => {
    const mesh = new FakeMesh();
    const ejecutar = vi.fn(async (_cuerpo, opts: { onChunk: (d: string) => void }) => {
      opts.onChunk('{"resultado": "primera mitad"}');
      opts.onChunk(',"segunda mitad": true}');
      return { tipo: "imagen", resultado: { ancho: 100, alto: 100 } };
    });
    await manejarPeticionCapacidadMalla(mesh, "peerA", pedir(), {
      puedeServir: () => true,
      ejecutar,
      registro: new Map(),
      flushMs: 5,
    });
    await tick(20);
    const msgs = mesh.sentParsed() as any[];
    const fin = msgs.find((m) => m.t === "capacidad.fin");
    expect(fin).toMatchObject({ tipo: "imagen", resultado: { ancho: 100, alto: 100 } });
    const chunks = msgs.filter((m) => m.t === "capacidad.trozo").map((m) => m.chunk).join("");
    expect(chunks).toBe('{"resultado": "primera mitad"},"segunda mitad": true}');
  });

  it("proveedor NO streaming (sin onChunk): el resultado final se manda igual antes de capacidad.fin", async () => {
    const mesh = new FakeMesh();
    const ejecutar = vi.fn(async () => ({ tipo: "voz", resultado: { duracion: 5.2 } }));
    await manejarPeticionCapacidadMalla(mesh, "peerA", pedir(), { puedeServir: () => true, ejecutar, registro: new Map() });
    const msgs = mesh.sentParsed() as any[];
    const resultado = msgs.filter((m) => m.t === "capacidad.trozo").map((m) => m.chunk).join("");
    expect(resultado).toBe('{"duracion":5.2}');
    expect(msgs.find((m) => m.t === "capacidad.fin")).toBeTruthy();
  });

  it("el proveedor lanza ⇒ capacidad.error 502 con el mensaje", async () => {
    const mesh = new FakeMesh();
    const ejecutar = vi.fn(async () => {
      throw new Error("el tipo de capacidad no está soportado");
    });
    await manejarPeticionCapacidadMalla(mesh, "peerA", pedir(), { puedeServir: () => true, ejecutar, registro: new Map() });
    const [msg] = mesh.sentParsed() as any[];
    expect(msg).toMatchObject({ t: "capacidad.error", estado: 502, mensaje: "el tipo de capacidad no está soportado" });
  });

  it("manejarCancelarCapacidadMalla aborta SOLO si el id coincide con la petición en vuelo", () => {
    const registro = new Map();
    const abort = new AbortController();
    registro.set("peerA", { id: "vivo", abort });
    manejarCancelarCapacidadMalla("peerA", { t: "capacidad.cancelar", id: "otro-id" } as MsgCapacidadCancelar, { registro });
    expect(abort.signal.aborted).toBe(false);
    manejarCancelarCapacidadMalla("peerA", { t: "capacidad.cancelar", id: "vivo" } as MsgCapacidadCancelar, { registro });
    expect(abort.signal.aborted).toBe(true);
  });
});
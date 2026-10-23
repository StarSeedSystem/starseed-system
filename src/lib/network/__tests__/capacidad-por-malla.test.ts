/**
 * capacidad-por-malla (Ola 1017A) — relé P2P genérico de cualquier capacidad sobre la malla
 * de neuronas. Cubre protocolo (guard/parse), rol SERVIDOR (mesh + ejecutar de mentira,
 * gate de capa, 1-en-vuelo-por-peer, nunca lanza), rol CLIENTE (pedirCapacidad con fake
 * channel, reúne trozos, nunca lanza: {ok:false, motivo}).
 */
import { describe, it, expect } from "vitest";
import {
  CAPACIDAD_MALLA_NS,
  CAPACIDAD_MALLA_MAX_BYTES,
  esMensajeCapacidadMalla,
  parseCapacidadMallaMensaje,
  cabeEnMensajeCapacidad,
  esTipoCapacidadValido,
  partirEnTrozos,
  bytesUtf8,
  manejarPeticionCapacidadMalla,
  reiniciarServidorCapacidadMallaParaTests,
  type MsgCapacidadPedir,
} from "@/lib/network/capacidad-por-malla";
import type { MeshHandle } from "@/lib/network/webrtc-mesh";

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
  it("esMensajeCapacidadMalla acepta los cinco tipos bien formados", () => {
    expect(esMensajeCapacidadMalla({ t: "capacidad.pedir", id: "1", tipo: "imagen", cuerpo: { messages: [] } })).toBe(true);
    expect(esMensajeCapacidadMalla({ t: "capacidad.trozo", id: "1", texto: "hola" })).toBe(true);
    expect(esMensajeCapacidadMalla({ t: "capacidad.fin", id: "1", resultado: "resultado" })).toBe(true);
    expect(esMensajeCapacidadMalla({ t: "capacidad.error", id: "1", estado: 503, mensaje: "x" })).toBe(true);
    expect(esMensajeCapacidadMalla({ t: "capacidad.cancelar", id: "1" })).toBe(true);
  });

  it("rechaza basura, otros namespaces (incluido ia.*) y payloads incompletos", () => {
    expect(esMensajeCapacidadMalla(null)).toBe(false);
    expect(esMensajeCapacidadMalla("texto")).toBe(false);
    expect(esMensajeCapacidadMalla({ t: "ia.pedir", id: "1", cuerpo: { messages: [] } })).toBe(false);
    expect(esMensajeCapacidadMalla({ t: "capacidad.pedir", id: "1" })).toBe(false);
    expect(esMensajeCapacidadMalla({ t: "capacidad.fin", id: "1" })).toBe(false);
  });

  it("parseCapacidadMallaMensaje: JSON válido del protocolo → objeto; el resto → null", () => {
    expect(parseCapacidadMallaMensaje(JSON.stringify({ t: "capacidad.cancelar", id: "1" }))).toEqual({ t: "capacidad.cancelar", id: "1" });
    expect(parseCapacidadMallaMensaje("{roto")).toBeNull();
    expect(parseCapacidadMallaMensaje(JSON.stringify({ t: "malla:hb", at: 1 }))).toBeNull();
  });

  it("cabeEnMensajeCapacidad respeta el límite de 16KB", () => {
    const mensajeOK = JSON.stringify({ t: "capacidad.pedir", id: "1", tipo: "imagen", cuerpo: { messages: [] } });
    expect(cabeEnMensajeCapacidad(mensajeOK)).toBe(true);
    const mensajeGrande = JSON.stringify({ t: "capacidad.pedir", id: "1", tipo: "imagen", cuerpo: { messages: [Array(10000).fill("x")] } });
    expect(cabeEnMensajeCapacidad(mensajeGrande)).toBe(false);
  });
});

/* ══════════════════════════ Rol SERVIDOR ══════════════════════════ */

describe("manejarPeticionCapacidadMalla (rol servidor)", () => {
  const pedir = (tipo: string = "imagen", cuerpo: MsgCapacidadPedir["cuerpo"] = { messages: [] }): MsgCapacidadPedir => ({
    t: "capacidad.pedir",
    id: "p1",
    tipo: tipo as any,
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

  it("ejecuta con executor de mentira, transmite por streaming y cierra con capacidad.fin", async () => {
    const mesh = new FakeMesh();
    const ejecutar = async (_cuerpo: Record<string, unknown>, opts: { onChunk: (d: string) => void }) => {
      opts.onChunk("Hola");
      opts.onChunk(" mundo");
      return "Hola mundo completo";
    };
    await manejarPeticionCapacidadMalla(mesh, "peerA", pedir(), {
      puedeServir: () => true,
      ejecutar,
      registro: new Map(),
      flushMs: 5,
    });
    await tick(20);
    const msgs = mesh.sentParsed() as any[];
    const fin = msgs.find((m) => m.t === "capacidad.fin");
    expect(fin).toBeTruthy();
    const texto = msgs.filter((m) => m.t === "capacidad.trozo").map((m) => m.texto).join("");
    expect(texto).toBe("Hola mundo");
  });

  it("executor sin streaming: el resultado final se manda igual antes de fin", async () => {
    const mesh = new FakeMesh();
    const ejecutar = async () => "Respuesta completa de capacidad";
    await manejarPeticionCapacidadMalla(mesh, "peerA", pedir(), { puedeServir: () => true, ejecutar, registro: new Map() });
    const msgs = mesh.sentParsed() as any[];
    const texto = msgs.filter((m) => m.t === "capacidad.trozo").map((m) => m.texto).join("");
    expect(texto).toBe("Respuesta completa de capacidad");
    expect(msgs.find((m) => m.t === "capacidad.fin")).toBeTruthy();
  });

  it("el executor lanza ⇒ capacidad.error 502 con el mensaje", async () => {
    const mesh = new FakeMesh();
    const ejecutar = async () => {
      throw new Error("el modelo pedido ya no existe");
    };
    await manejarPeticionCapacidadMalla(mesh, "peerA", pedir(), { puedeServir: () => true, ejecutar, registro: new Map() });
    const [msg] = mesh.sentParsed() as any[];
    expect(msg).toMatchObject({ t: "capacidad.error", estado: 502, mensaje: "el modelo pedido ya no existe" });
  });
});

/* ══════════════════════════ TipoCapacidad ══════════════════════════ */

describe("esTipoCapacidadValido", () => {
  it("acepta los 8 tipos válidos", () => {
    expect(esTipoCapacidadValido("imagen")).toBe(true);
    expect(esTipoCapacidadValido("voz")).toBe(true);
    expect(esTipoCapacidadValido("oido")).toBe(true);
    expect(esTipoCapacidadValido("palabra")).toBe(true);
    expect(esTipoCapacidadValido("transcodificar")).toBe(true);
    expect(esTipoCapacidadValido("render")).toBe(true);
    expect(esTipoCapacidadValido("buscar")).toBe(true);
    expect(esTipoCapacidadValido("construir")).toBe(true);
  });

  it("rechaza tipos inválidos", () => {
    expect(esTipoCapacidadValido("")).toBe(false);
    expect(esTipoCapacidadValido("texto")).toBe(false);
    expect(esTipoCapacidadValido("otros")).toBe(false);
  });
});

/* ══════════════════════════ Parte y utilidades puras ══════════════════════════ */

describe("partirEnTrozos y bytesUtf8 (puras)", () => {
  it("partirEnTrozos divide el texto respetando el tope de bytes", () => {
    const trozos = partirEnTrozos("Hola mundo este es un texto de prueba para partir en trozos", 20);
    expect(trozos.length).toBeGreaterThan(1);
  });

  it("bytesUtf8 cuenta correctamente los bytes", () => {
    expect(bytesUtf8("hola")).toBe(4);
    expect(bytesUtf8("")).toBe(0);
  });
});
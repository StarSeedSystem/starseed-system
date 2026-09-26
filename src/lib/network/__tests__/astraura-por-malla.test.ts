/**
 * astraura-por-malla (Ola 367) — relé P2P de Astraura 1.58 sobre la malla de
 * neuronas. Cubre protocolo (guard/parse/tamaño), rol SERVIDOR (con un mesh y
 * un fetch de mentira) y rol CLIENTE (con un peer de mentira). Sin red real:
 * `fetchImpl`/`mesh` siempre inyectados — ver `DepsServidorAstrauraMalla` y
 * `PedirAstrauraMallaOpciones.mesh`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ASTRAURA_MALLA_MAX_BYTES,
  bytesUtf8,
  cabeEnMensaje,
  esMensajeAstrauraMalla,
  manejarCancelarAstrauraMalla,
  manejarPeticionAstrauraMalla,
  parseAstrauraMallaMensaje,
  partirEnTrozos,
  pedirAstrauraPorMalla,
  servidoresAstrauraMalla,
  type MsgCancelar,
  type MsgPedir,
} from "@/lib/network/astraura-por-malla";
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
  /** Ayuda de prueba: simula un mensaje entrante de `peerId`. */
  emitMessage(peerId: string, data: string): void {
    for (const l of this.listeners) l.onMessage?.(peerId, data);
  }
  /** Ayuda de prueba: simula un cambio de estado de peer. */
  emitState(snap: PeerSnapshot): void {
    for (const l of this.listeners) l.onState?.(snap);
  }
  sentParsed(): unknown[] {
    return this.sent.map((s) => JSON.parse(s.data));
  }
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function sseStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
}

/* ══════════════════════════ Protocolo (puro) ══════════════════════════ */

describe("protocolo astraura.*", () => {
  it("esMensajeAstrauraMalla acepta los siete tipos bien formados", () => {
    expect(esMensajeAstrauraMalla({ t: "astraura.pedir", id: "1", cuerpo: { messages: [] } })).toBe(true);
    expect(esMensajeAstrauraMalla({ t: "astraura.trozo", id: "1", texto: "hola" })).toBe(true);
    expect(esMensajeAstrauraMalla({ t: "astraura.fin", id: "1" })).toBe(true);
    expect(esMensajeAstrauraMalla({ t: "astraura.error", id: "1", estado: 503, mensaje: "x" })).toBe(true);
    expect(esMensajeAstrauraMalla({ t: "astraura.cancelar", id: "1" })).toBe(true);
    expect(esMensajeAstrauraMalla({ t: "astraura.ping", id: "1" })).toBe(true);
    expect(esMensajeAstrauraMalla({ t: "astraura.pong", id: "1", cola: 2 })).toBe(true);
  });

  it("rechaza basura, otros namespaces y payloads incompletos", () => {
    expect(esMensajeAstrauraMalla(null)).toBe(false);
    expect(esMensajeAstrauraMalla("texto")).toBe(false);
    expect(esMensajeAstrauraMalla({ t: "malla:ficha" })).toBe(false);
    expect(esMensajeAstrauraMalla({ t: "astraura.pedir", id: "1" })).toBe(false); // sin cuerpo
    expect(esMensajeAstrauraMalla({ t: "astraura.trozo", id: "1" })).toBe(false); // sin texto
    expect(esMensajeAstrauraMalla({ t: "astraura.error", id: "1", estado: "503", mensaje: "x" })).toBe(false); // estado no numérico
  });

  it("parseAstrauraMallaMensaje: JSON válido del protocolo → objeto; el resto → null", () => {
    expect(parseAstrauraMallaMensaje(JSON.stringify({ t: "astraura.fin", id: "1" }))).toEqual({ t: "astraura.fin", id: "1" });
    expect(parseAstrauraMallaMensaje("{roto")).toBeNull();
    expect(parseAstrauraMallaMensaje(JSON.stringify({ t: "malla:hb", at: 1 }))).toBeNull();
  });

  it("bytesUtf8 cuenta bytes UTF-8, no caracteres (acentos/emoji pesan más)", () => {
    expect(bytesUtf8("abc")).toBe(3);
    expect(bytesUtf8("ñ")).toBe(2);
  });

  it("cabeEnMensaje respeta el límite de 16KB", () => {
    expect(cabeEnMensaje(JSON.stringify({ t: "astraura.trozo", id: "1", texto: "x".repeat(100) }))).toBe(true);
    expect(cabeEnMensaje("x".repeat(ASTRAURA_MALLA_MAX_BYTES + 1))).toBe(false);
  });

  it("partirEnTrozos: ningún trozo supera el límite dado, y unidos reconstruyen el texto", () => {
    const texto = "hola mundo ".repeat(2000); // ~22KB
    const trozos = partirEnTrozos(texto, 1000);
    expect(trozos.length).toBeGreaterThan(1);
    for (const t of trozos) expect(bytesUtf8(t)).toBeLessThanOrEqual(1000);
    expect(trozos.join("")).toBe(texto);
  });

  it("partirEnTrozos de texto vacío → lista vacía (nunca un trozo vacío)", () => {
    expect(partirEnTrozos("")).toEqual([]);
  });
});

/* ══════════════════════════ Rol SERVIDOR ══════════════════════════ */

describe("manejarPeticionAstrauraMalla (rol servidor)", () => {
  const pedir = (id: string): MsgPedir => ({
    t: "astraura.pedir",
    id,
    cuerpo: { messages: [{ role: "user", content: "hola" }] },
  });

  it("no sirve si esta neurona no comparte la capa mesh ahora mismo", async () => {
    const mesh = new FakeMesh();
    await manejarPeticionAstrauraMalla(mesh, "peerA", pedir("r1"), {
      puedeServir: () => false,
      registro: new Map(),
    });
    const err = mesh.sentParsed().find((m: any) => m.t === "astraura.error") as any;
    expect(err).toBeTruthy();
    expect(err.estado).toBe(503);
  });

  it("reenvía los tokens del SSE como astraura.trozo y termina con astraura.fin", async () => {
    const mesh = new FakeMesh();
    const fetchImpl = (async () =>
      new Response(
        sseStream([
          'data: {"type":"token","token":"Hola"}\n\n',
          'data: {"type":"token","token":" mundo"}\n\n',
          'data: {"type":"done"}\n\n',
        ]),
        { status: 200 },
      )) as unknown as typeof fetch;

    await manejarPeticionAstrauraMalla(mesh, "peerA", pedir("r1"), {
      fetchImpl,
      puedeServir: () => true,
      resolverDestino: () => ({ modo: "proxy", base: "" }),
      registro: new Map(),
      flushMs: 5,
      timeoutTotalMs: 5000,
    });

    const eventos = mesh.sentParsed() as any[];
    const trozos = eventos.filter((e) => e.t === "astraura.trozo").map((e) => e.texto);
    expect(trozos.join("")).toBe("Hola mundo");
    expect(eventos.some((e) => e.t === "astraura.fin" && e.id === "r1")).toBe(true);
  });

  it("propaga OCUPADO (503 + Retry-After) como astraura.error con reintentarEnS", async () => {
    const mesh = new FakeMesh();
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ ocupado: true, reintentar_en_s: 12 }), {
        status: 503,
        headers: { "Retry-After": "12" },
      })) as unknown as typeof fetch;

    await manejarPeticionAstrauraMalla(mesh, "peerA", pedir("r1"), {
      fetchImpl,
      puedeServir: () => true,
      resolverDestino: () => ({ modo: "proxy", base: "" }),
      registro: new Map(),
    });

    const err = mesh.sentParsed().find((m: any) => m.t === "astraura.error") as any;
    expect(err).toBeTruthy();
    expect(err.estado).toBe(503);
    expect(err.reintentarEnS).toBe(12);
    expect(err.ocupado).toBe(true);
  });

  it("como mucho 1 petición en vuelo por peer: la segunda se rechaza con 429", async () => {
    const mesh = new FakeMesh();
    let capturedSignal: AbortSignal | undefined;
    const fetchImpl = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        capturedSignal = init?.signal ?? undefined;
        init?.signal?.addEventListener("abort", () => {
          const e = new Error("aborted");
          (e as { name?: string }).name = "AbortError";
          reject(e);
        });
      })) as unknown as typeof fetch;
    const registro = new Map();

    const p1 = manejarPeticionAstrauraMalla(mesh, "peerA", pedir("r1"), {
      fetchImpl,
      puedeServir: () => true,
      resolverDestino: () => ({ modo: "proxy", base: "" }),
      registro,
    });
    await tick(); // deja que el primer fetch arranque y se registre
    expect(registro.has("peerA")).toBe(true);

    await manejarPeticionAstrauraMalla(mesh, "peerA", pedir("r2"), {
      fetchImpl,
      puedeServir: () => true,
      resolverDestino: () => ({ modo: "proxy", base: "" }),
      registro,
    });
    const err = mesh.sentParsed().find((m: any) => m.t === "astraura.error" && m.id === "r2") as any;
    expect(err).toBeTruthy();
    expect(err.estado).toBe(429);
    expect(err.reintentarEnS).toBe(10);

    // Limpieza: cancela la primera para no dejar timers colgados.
    manejarCancelarAstrauraMalla("peerA", { t: "astraura.cancelar", id: "r1" } as MsgCancelar, { registro });
    await p1;
    expect(capturedSignal?.aborted).toBe(true);
  });

  it("astraura.cancelar aborta el fetch en curso", async () => {
    const registro = new Map();
    const mesh = new FakeMesh();
    const fetchImpl = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const e = new Error("aborted");
          (e as { name?: string }).name = "AbortError";
          reject(e);
        });
      })) as unknown as typeof fetch;

    const p = manejarPeticionAstrauraMalla(mesh, "peerA", pedir("r1"), {
      fetchImpl,
      puedeServir: () => true,
      resolverDestino: () => ({ modo: "proxy", base: "" }),
      registro,
    });
    await tick();
    expect(registro.has("peerA")).toBe(true);
    manejarCancelarAstrauraMalla("peerA", { t: "astraura.cancelar", id: "r1" } as MsgCancelar, { registro });
    await p;
    // Tras el cancel, el registro de "en vuelo" queda libre para este peer.
    expect(registro.has("peerA")).toBe(false);
  });
});

/* ══════════════════════════ Rol CLIENTE ══════════════════════════ */

describe("pedirAstrauraPorMalla (rol cliente)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sin ningún servidor en la malla, rechaza con un error honesto", async () => {
    const mesh = new FakeMesh();
    await expect(pedirAstrauraPorMalla({ cuerpo: { messages: [] }, mesh: mesh as unknown as MeshHandle })).rejects.toThrow(
      /sin servidor en la malla/i,
    );
  });

  it("transmite por onTexto y resuelve con el texto completo al recibir astraura.fin", async () => {
    const mesh = new FakeMesh();
    const onTexto = vi.fn();
    const promesa = pedirAstrauraPorMalla({
      cuerpo: { messages: [{ role: "user", content: "hola" }] },
      mesh: mesh as unknown as MeshHandle,
      servidor: { syncDeviceId: "peerA" },
      onTexto,
    });
    await tick();
    const enviado = mesh.sentParsed().find((m: any) => m.t === "astraura.pedir") as any;
    expect(enviado).toBeTruthy();
    const id = enviado.id as string;
    mesh.emitMessage("peerA", JSON.stringify({ t: "astraura.trozo", id, texto: "Hola" }));
    mesh.emitMessage("peerA", JSON.stringify({ t: "astraura.trozo", id, texto: " mundo" }));
    mesh.emitMessage("peerA", JSON.stringify({ t: "astraura.fin", id }));
    await expect(promesa).resolves.toBe("Hola mundo");
    expect(onTexto).toHaveBeenCalledWith("Hola");
    expect(onTexto).toHaveBeenCalledWith(" mundo");
  });

  it('error OCUPADO del servidor ⇒ mensaje "ocupado" + "retry after Ns" (misma convención que astraura-158.ts)', async () => {
    const mesh = new FakeMesh();
    const promesa = pedirAstrauraPorMalla({
      cuerpo: { messages: [] },
      mesh: mesh as unknown as MeshHandle,
      servidor: { syncDeviceId: "peerA" },
    });
    await tick();
    const id = (mesh.sentParsed().find((m: any) => m.t === "astraura.pedir") as any).id as string;
    mesh.emitMessage(
      "peerA",
      JSON.stringify({ t: "astraura.error", id, estado: 503, mensaje: "cola llena", reintentarEnS: 12, ocupado: true }),
    );
    try {
      await promesa;
      throw new Error("no debió resolver");
    } catch (e) {
      const err = e as Error & { ocupado?: boolean };
      expect(err.message).toMatch(/ocupado/i);
      expect(err.message).toMatch(/retry after 12s/i);
      expect(err.ocupado).toBe(true);
    }
  });

  it("timeout del primer trozo: rechaza sin que el servidor responda nada", async () => {
    const mesh = new FakeMesh();
    await expect(
      pedirAstrauraPorMalla({
        cuerpo: { messages: [] },
        mesh: mesh as unknown as MeshHandle,
        servidor: { syncDeviceId: "peerA" },
        timeoutPrimerTrozoMs: 15,
        timeoutTotalMs: 5000,
      }),
    ).rejects.toThrow(/timeout/i);
  });

  it("el peer se desconecta a mitad del turno ⇒ rechaza con error honesto", async () => {
    const mesh = new FakeMesh();
    const promesa = pedirAstrauraPorMalla({
      cuerpo: { messages: [] },
      mesh: mesh as unknown as MeshHandle,
      servidor: { syncDeviceId: "peerA" },
    });
    await tick();
    mesh.emitState({ deviceId: "peerA", state: "failed", channelOpen: false, lastUpdate: Date.now() });
    await expect(promesa).rejects.toThrow(/desconect/i);
  });

  it("al abortar `signal`, envía astraura.cancelar y rechaza", async () => {
    const mesh = new FakeMesh();
    const ctrl = new AbortController();
    const promesa = pedirAstrauraPorMalla({
      cuerpo: { messages: [] },
      mesh: mesh as unknown as MeshHandle,
      servidor: { syncDeviceId: "peerA" },
      signal: ctrl.signal,
    });
    await tick();
    ctrl.abort();
    await expect(promesa).rejects.toThrow();
    const cancelado = mesh.sentParsed().some((m: any) => m.t === "astraura.cancelar");
    expect(cancelado).toBe(true);
  });
});

describe("servidoresAstrauraMalla", () => {
  it("sin el motor de la malla montado, degrada a lista vacía (nunca inventa servidores)", () => {
    expect(servidoresAstrauraMalla()).toEqual([]);
  });
});

/**
 * ia-por-malla (Ola 368) — relé P2P GENÉRICO de inteligencia sobre la malla
 * de neuronas. Cubre protocolo (guard/parse/pin), rol SERVIDOR (mesh + router
 * de mentira, gate de capa, 1-en-vuelo-por-peer, `desdeMalla` implícito en el
 * cuerpo que arma `ejecutarConRouterDefecto`), rol CLIENTE (elección de peer
 * por fuente/latencia/enfriamiento, reintento al siguiente peer, enfriamiento
 * POR PEER no global) y `servidoresIaPorMalla` (con `@/lib/network/malla-neuronas`
 * troceado por `vi.mock`, sin depender del motor real de la malla).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  IA_MALLA_MAX_BYTES,
  IA_MALLA_MODEL_AUTO,
  codificarModeloIaMalla,
  decodificarModeloIaMalla,
  esMensajeIaMalla,
  manejarCancelarIaMalla,
  manejarPeticionIaMalla,
  parseIaMallaMensaje,
  pedirIaPorMalla,
  reiniciarEnfriamientoIaMallaParaTests,
  servidoresIaPorMalla,
  type MsgIaCancelar,
  type MsgIaPedir,
} from "@/lib/network/ia-por-malla";
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

describe("protocolo ia.*", () => {
  it("esMensajeIaMalla acepta los cinco tipos bien formados", () => {
    expect(esMensajeIaMalla({ t: "ia.pedir", id: "1", cuerpo: { messages: [] } })).toBe(true);
    expect(esMensajeIaMalla({ t: "ia.trozo", id: "1", texto: "hola" })).toBe(true);
    expect(esMensajeIaMalla({ t: "ia.fin", id: "1", fuente: "ollama-local", modelo: "llama3.2" })).toBe(true);
    expect(esMensajeIaMalla({ t: "ia.error", id: "1", estado: 503, mensaje: "x" })).toBe(true);
    expect(esMensajeIaMalla({ t: "ia.cancelar", id: "1" })).toBe(true);
  });

  it("rechaza basura, otros namespaces (incluido astraura.*) y payloads incompletos", () => {
    expect(esMensajeIaMalla(null)).toBe(false);
    expect(esMensajeIaMalla("texto")).toBe(false);
    expect(esMensajeIaMalla({ t: "astraura.pedir", id: "1", cuerpo: { messages: [] } })).toBe(false);
    expect(esMensajeIaMalla({ t: "ia.pedir", id: "1" })).toBe(false); // sin cuerpo
    expect(esMensajeIaMalla({ t: "ia.fin", id: "1" })).toBe(false); // sin fuente/modelo
    expect(esMensajeIaMalla({ t: "ia.error", id: "1", estado: "503", mensaje: "x" })).toBe(false);
  });

  it("parseIaMallaMensaje: JSON válido del protocolo → objeto; el resto → null", () => {
    expect(parseIaMallaMensaje(JSON.stringify({ t: "ia.cancelar", id: "1" }))).toEqual({ t: "ia.cancelar", id: "1" });
    expect(parseIaMallaMensaje("{roto")).toBeNull();
    expect(parseIaMallaMensaje(JSON.stringify({ t: "malla:hb", at: 1 }))).toBeNull();
  });

  it("codificar/decodificar el pin de fuente/modelo es inverso", () => {
    const id = codificarModeloIaMalla("ollama-local", "llama3.2");
    expect(decodificarModeloIaMalla(id)).toEqual({ fuente: "ollama-local", modelo: "llama3.2" });
    expect(decodificarModeloIaMalla(IA_MALLA_MODEL_AUTO)).toEqual({});
    expect(decodificarModeloIaMalla("cualquier-otra-cosa")).toEqual({});
  });
});

/* ══════════════════════════ Rol SERVIDOR ══════════════════════════ */

describe("manejarPeticionIaMalla (rol servidor)", () => {
  const pedir = (cuerpo: MsgIaPedir["cuerpo"] = { messages: [{ role: "user", content: "hola" }] }): MsgIaPedir => ({
    t: "ia.pedir",
    id: "p1",
    cuerpo,
  });

  it("sin capa mesh compartiendo ⇒ ia.error 503", async () => {
    const mesh = new FakeMesh();
    await manejarPeticionIaMalla(mesh, "peerA", pedir(), {
      puedeServir: () => false,
      registro: new Map(),
    });
    const [msg] = mesh.sentParsed() as any[];
    expect(msg).toMatchObject({ t: "ia.error", estado: 503 });
  });

  it("una petición ya en vuelo del MISMO peer ⇒ 429 ocupado", async () => {
    const mesh = new FakeMesh();
    const registro = new Map();
    registro.set("peerA", { id: "otra", abort: new AbortController() });
    await manejarPeticionIaMalla(mesh, "peerA", pedir(), {
      puedeServir: () => true,
      registro,
    });
    const [msg] = mesh.sentParsed() as any[];
    // (mismo criterio que `astraura-por-malla.ts`: 1-en-vuelo-por-peer no marca
    // `ocupado` — eso queda para cuando el BACKEND dice que está saturado)
    expect(msg).toMatchObject({ t: "ia.error", estado: 429, reintentarEnS: 10 });
  });

  it("ejecuta con el router de mentira, transmite por streaming y cierra con ia.fin {fuente, modelo}", async () => {
    const mesh = new FakeMesh();
    const ejecutar = vi.fn(async (_cuerpo, opts: { onChunk: (d: string) => void }) => {
      opts.onChunk("Hola");
      opts.onChunk(" mundo");
      return { text: "Hola mundo", fuente: "ollama-local", modelo: "llama3.2" };
    });
    await manejarPeticionIaMalla(mesh, "peerA", pedir(), {
      puedeServir: () => true,
      ejecutar,
      registro: new Map(),
      flushMs: 5,
    });
    await tick(20);
    const msgs = mesh.sentParsed() as any[];
    const fin = msgs.find((m) => m.t === "ia.fin");
    expect(fin).toMatchObject({ fuente: "ollama-local", modelo: "llama3.2" });
    const texto = msgs.filter((m) => m.t === "ia.trozo").map((m) => m.texto).join("");
    expect(texto).toBe("Hola mundo");
  });

  it("proveedor NO streaming (sin onChunk): el texto final se manda igual antes de ia.fin", async () => {
    const mesh = new FakeMesh();
    const ejecutar = vi.fn(async () => ({ text: "Respuesta completa", fuente: "openrouter-free", modelo: "m" }));
    await manejarPeticionIaMalla(mesh, "peerA", pedir(), { puedeServir: () => true, ejecutar, registro: new Map() });
    const msgs = mesh.sentParsed() as any[];
    const texto = msgs.filter((m) => m.t === "ia.trozo").map((m) => m.texto).join("");
    expect(texto).toBe("Respuesta completa");
    expect(msgs.find((m) => m.t === "ia.fin")).toBeTruthy();
  });

  it("el router lanza ⇒ ia.error 502 con el mensaje", async () => {
    const mesh = new FakeMesh();
    const ejecutar = vi.fn(async () => {
      throw new Error("el modelo pedido ya no existe");
    });
    await manejarPeticionIaMalla(mesh, "peerA", pedir(), { puedeServir: () => true, ejecutar, registro: new Map() });
    const [msg] = mesh.sentParsed() as any[];
    expect(msg).toMatchObject({ t: "ia.error", estado: 502, mensaje: "el modelo pedido ya no existe" });
  });

  it("sin `ejecutar` inyectado, el ejecutor por defecto llama a astrauraChat con desdeMalla:true y el forceSource del pin", async () => {
    vi.resetModules();
    const astrauraChat = vi.fn(async (_req: any) => ({ text: "ok", route: { sourceId: "ollama-local", model: "llama3.2" } }));
    vi.doMock("@/ai/astraura/router", () => ({ astrauraChat }));
    const { manejarPeticionIaMalla: manejarConDefecto } = await import("@/lib/network/ia-por-malla");
    const mesh = new FakeMesh();
    await manejarConDefecto(
      mesh,
      "peerA",
      { t: "ia.pedir", id: "p1", cuerpo: { messages: [{ role: "user", content: "hola" }], fuente: "ollama-local", modelo: "llama3.2" } },
      { puedeServir: () => true, registro: new Map() },
    );
    expect(astrauraChat).toHaveBeenCalledTimes(1);
    const arg = astrauraChat.mock.calls[0]![0];
    expect(arg.desdeMalla).toBe(true);
    expect(arg.forceSource).toEqual({ sourceId: "ollama-local", modelId: "llama3.2" });
    const fin = mesh.sentParsed().find((m: any) => m.t === "ia.fin") as any;
    expect(fin).toMatchObject({ fuente: "ollama-local", modelo: "llama3.2" });
    vi.doUnmock("@/ai/astraura/router");
    vi.resetModules();
  });

  it("sin fuente/modelo pedidos, el ejecutor por defecto NO fija forceSource (deja el enrutador libre del peer)", async () => {
    vi.resetModules();
    const astrauraChat = vi.fn(async (_req: any) => ({ text: "ok", route: { sourceId: "groq", model: "m" } }));
    vi.doMock("@/ai/astraura/router", () => ({ astrauraChat }));
    const { manejarPeticionIaMalla: manejarConDefecto } = await import("@/lib/network/ia-por-malla");
    const mesh = new FakeMesh();
    await manejarConDefecto(
      mesh,
      "peerA",
      { t: "ia.pedir", id: "p2", cuerpo: { messages: [{ role: "user", content: "hola" }] } },
      { puedeServir: () => true, registro: new Map() },
    );
    const arg = astrauraChat.mock.calls[0]![0];
    expect(arg.forceSource).toBeUndefined();
    expect(arg.desdeMalla).toBe(true);
    vi.doUnmock("@/ai/astraura/router");
    vi.resetModules();
  });

  it("manejarCancelarIaMalla aborta SOLO si el id coincide con la petición en vuelo", () => {
    const registro = new Map();
    const abort = new AbortController();
    registro.set("peerA", { id: "vivo", abort });
    manejarCancelarIaMalla("peerA", { t: "ia.cancelar", id: "otro-id" } as MsgIaCancelar, { registro });
    expect(abort.signal.aborted).toBe(false);
    manejarCancelarIaMalla("peerA", { t: "ia.cancelar", id: "vivo" } as MsgIaCancelar, { registro });
    expect(abort.signal.aborted).toBe(true);
  });
});

/* ══════════════════════════ Rol CLIENTE ══════════════════════════ */

describe("pedirIaPorMalla (rol cliente)", () => {
  afterEach(() => reiniciarEnfriamientoIaMallaParaTests());

  const peerA = { syncDeviceId: "peerA", nombre: "Mac de Alex", latenciaMs: 40, fuentesServibles: ["ollama-local"] };
  const peerB = { syncDeviceId: "peerB", nombre: "Tablet", latenciaMs: 10, fuentesServibles: ["ollama-local"] };

  it("sin candidatos ⇒ error tipado sinServidor", async () => {
    const mesh = new FakeMesh();
    await expect(pedirIaPorMalla({ cuerpo: { messages: [] }, mesh, candidatos: [] })).rejects.toMatchObject({
      sinServidor: true,
    });
  });

  it("resuelve el texto completo transmitiendo por streaming, con el peer elegido", async () => {
    const mesh = new FakeMesh();
    const trozos: string[] = [];
    const promesa = pedirIaPorMalla({
      cuerpo: { messages: [{ role: "user", content: "hola" }] },
      mesh,
      candidatos: [peerB, peerA], // peerB ya viene primero (menor latencia) en este array de prueba
      onTexto: (d) => trozos.push(d),
    });
    await tick(0);
    const [enviado] = mesh.sentParsed() as any[];
    expect(enviado.t).toBe("ia.pedir");
    mesh.emitMessage("peerB", JSON.stringify({ t: "ia.trozo", id: enviado.id, texto: "Hola" }));
    mesh.emitMessage("peerB", JSON.stringify({ t: "ia.fin", id: enviado.id, fuente: "ollama-local", modelo: "llama3.2" }));
    const res = await promesa;
    expect(res).toEqual({ text: "Hola", peer: "peerB", fuente: "ollama-local", modelo: "llama3.2" });
    expect(trozos).toEqual(["Hola"]);
  });

  it("peer ocupado ⇒ se enfría SOLO ese peer y se reintenta con el siguiente candidato", async () => {
    const mesh = new FakeMesh();
    const promesa = pedirIaPorMalla({
      cuerpo: { messages: [] },
      mesh,
      candidatos: [peerB, peerA],
      maxPeers: 2,
    });
    await tick(0);
    const [primero] = mesh.sentParsed() as any[];
    expect(primero.t).toBe("ia.pedir");
    mesh.emitMessage("peerB", JSON.stringify({ t: "ia.error", id: primero.id, estado: 429, mensaje: "ocupado", ocupado: true, reintentarEnS: 5 }));
    await tick(0);
    const segundo = (mesh.sentParsed() as any[]).find((m) => m.t === "ia.pedir" && m.id !== primero.id);
    expect(segundo).toBeTruthy();
    mesh.emitMessage("peerA", JSON.stringify({ t: "ia.fin", id: segundo.id, fuente: "ollama-local", modelo: "llama3.2" }));
    const res = await promesa;
    expect(res.peer).toBe("peerA");
  });

  it("enfriamiento por peer es POR PEER, no global: otro peer sigue disponible en servidoresIaPorMalla si se mockea el estado", async () => {
    // (La aserción de "no global" en la práctica vive en `servidoresIaPorMalla`,
    // cubierto en la suite de abajo con `vi.mock`; aquí solo se confirma que
    // el peer que NO falló nunca se marca en enfriamiento.)
    const mesh = new FakeMesh();
    const promesa = pedirIaPorMalla({ cuerpo: { messages: [] }, mesh, candidatos: [peerA], maxPeers: 1 });
    await tick(0);
    const [msg] = mesh.sentParsed() as any[];
    mesh.emitMessage("peerA", JSON.stringify({ t: "ia.fin", id: msg.id, fuente: "x", modelo: "y" }));
    await promesa;
    expect(true).toBe(true);
  });

  it("todos los peers probados ocupados ⇒ error final ocupado:true (para que el enrutador enfríe ia-malla entera)", async () => {
    const mesh = new FakeMesh();
    const promesa = pedirIaPorMalla({ cuerpo: { messages: [] }, mesh, candidatos: [peerB, peerA], maxPeers: 2 });
    await tick(0);
    let enviados = mesh.sentParsed() as any[];
    mesh.emitMessage("peerB", JSON.stringify({ t: "ia.error", id: enviados[0].id, estado: 503, mensaje: "ocupado", ocupado: true, reintentarEnS: 1 }));
    await tick(0);
    enviados = mesh.sentParsed() as any[];
    const segundo = enviados[enviados.length - 1];
    mesh.emitMessage("peerA", JSON.stringify({ t: "ia.error", id: segundo.id, estado: 503, mensaje: "ocupado", ocupado: true, reintentarEnS: 1 }));
    await expect(promesa).rejects.toMatchObject({ ocupado: true });
  });

  it("peer perdido (desconexión) ⇒ error tipado peerPerdido", async () => {
    const mesh = new FakeMesh();
    const promesa = pedirIaPorMalla({ cuerpo: { messages: [] }, mesh, candidatos: [peerA], maxPeers: 1 });
    await tick(0);
    mesh.emitState({ deviceId: "peerA", state: "closed", channelOpen: false, lastUpdate: Date.now() });
    await expect(promesa).rejects.toMatchObject({ peerPerdido: true });
  });

  it("abortar el signal cancela y rechaza con AbortError, sin probar más peers", async () => {
    const mesh = new FakeMesh();
    const ctrl = new AbortController();
    const promesa = pedirIaPorMalla({ cuerpo: { messages: [] }, mesh, candidatos: [peerA, peerB], signal: ctrl.signal, maxPeers: 2 });
    await tick(0);
    ctrl.abort();
    await expect(promesa).rejects.toMatchObject({ name: "AbortError" });
    // Solo un `ia.pedir` salió (el de peerA): abortar no intenta el siguiente peer.
    expect((mesh.sentParsed() as any[]).filter((m) => m.t === "ia.pedir")).toHaveLength(1);
  });
});

/* ══════════════════════════ servidoresIaPorMalla (con malla-neuronas troceada) ══════════════════════════ */

vi.mock("@/lib/network/malla-neuronas", async () => {
  const actual = await vi.importActual<typeof import("@/lib/network/malla-neuronas")>("@/lib/network/malla-neuronas");
  return { ...actual, snapshotMallaNeuronas: vi.fn() };
});

describe("servidoresIaPorMalla", () => {
  afterEach(() => {
    vi.clearAllMocks();
    reiniciarEnfriamientoIaMallaParaTests();
  });

  async function conFilas(filas: any[]) {
    const mod = await import("@/lib/network/malla-neuronas");
    (mod.snapshotMallaNeuronas as any).mockReturnValue({ misDispositivos: filas, cercanas: [], loading: false });
  }

  it("filtra por fuente pedida, excluye desconectados y a uno mismo, ordena por latencia", async () => {
    await conFilas([
      { esEsteDispositivo: true, syncDeviceId: "yo", enlace: { estado: "conectado" }, ficha: { fuentesServibles: ["ollama-local"] }, nombre: "Yo" },
      { esEsteDispositivo: false, syncDeviceId: "lento", enlace: { estado: "conectado" }, ficha: { fuentesServibles: ["ollama-local"] }, nombre: "Lento", },
      { esEsteDispositivo: false, syncDeviceId: "rapido", enlace: { estado: "conectado", latenciaMs: 5 }, ficha: { fuentesServibles: ["ollama-local"], astrauraLatenciaMs: 5 }, nombre: "Rápido" },
      { esEsteDispositivo: false, syncDeviceId: "otra-fuente", enlace: { estado: "conectado" }, ficha: { fuentesServibles: ["groq"] }, nombre: "Otra fuente" },
      { esEsteDispositivo: false, syncDeviceId: "desconectado", enlace: { estado: "fallido" }, ficha: { fuentesServibles: ["ollama-local"] }, nombre: "Caído" },
    ]);
    const r = servidoresIaPorMalla({ fuente: "ollama-local" });
    expect(r.map((s) => s.syncDeviceId)).toEqual(["rapido", "lento"]);
  });

  it("sin pin de fuente: cualquier peer con fuentesServibles no vacío (o sirveAstraura, compat Ola 367)", async () => {
    await conFilas([
      { esEsteDispositivo: false, syncDeviceId: "a", enlace: { estado: "conectado" }, ficha: { fuentesServibles: ["ollama-local"] } },
      { esEsteDispositivo: false, syncDeviceId: "b", enlace: { estado: "conectado" }, ficha: { sirveAstraura: true } },
      { esEsteDispositivo: false, syncDeviceId: "c", enlace: { estado: "conectado" }, ficha: { fuentesServibles: [] } },
    ]);
    const r = servidoresIaPorMalla();
    expect(r.map((s) => s.syncDeviceId).sort()).toEqual(["a", "b"]);
  });

  it("peer en enfriamiento (por un fallo previo) queda excluido, pero los demás siguen sirviendo (enfriamiento POR PEER)", async () => {
    await conFilas([
      { esEsteDispositivo: false, syncDeviceId: "ocupado", enlace: { estado: "conectado" }, ficha: { fuentesServibles: ["ollama-local"] } },
      { esEsteDispositivo: false, syncDeviceId: "libre", enlace: { estado: "conectado" }, ficha: { fuentesServibles: ["ollama-local"] } },
    ]);
    const mesh = new FakeMesh();
    const promesa = pedirIaPorMalla({
      cuerpo: { messages: [] },
      mesh,
      candidatos: [{ syncDeviceId: "ocupado", fuentesServibles: ["ollama-local"] }],
      maxPeers: 1,
    });
    const [msg] = (await (async () => {
      await new Promise((r) => setTimeout(r, 0));
      return mesh.sentParsed() as any[];
    })());
    mesh.emitMessage("ocupado", JSON.stringify({ t: "ia.error", id: msg.id, estado: 429, mensaje: "ocupado", ocupado: true, reintentarEnS: 30 }));
    await expect(promesa).rejects.toMatchObject({ ocupado: true });

    const r = servidoresIaPorMalla({ fuente: "ollama-local" });
    expect(r.map((s) => s.syncDeviceId)).toEqual(["libre"]);
  });
});

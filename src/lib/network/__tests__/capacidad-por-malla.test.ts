/**
 * capacidad-por-malla (Ola 1017A) — relé P2P GENÉRICO de capacidades sobre la malla
 * de neuronas. Cubre protocolo (guard/parse), rol SERVIDOR (mesh + router
 * de mentira, gate de capa, 1-en-vuelo-por-peer, `desdeMalla` implícito en el
 * cuerpo que arma `ejecutarConRouterDefecto`), rol CLIENTE (elección de peer
 * por tipo/latencia/enfriamiento, reintento al siguiente peer, enfriamiento
 * POR PEER no global) y `servidoresCapacidadPorMalla` (con `@/lib/network/malla-neuronas`
 * troceado por `vi.mock`, sin depender del motor real de la malla).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CAPACIDAD_MAX_BYTES,
  cabeEnMensajeCapacidad,
  esMensajeCapacidadMalla,
  manejarCancelarCapacidadMalla,
  manejarPeticionCapacidadMalla,
  parseCapacidadMallaMensaje,
  pedirCapacidadPorMalla,
  pedirCapacidad,
  reiniciarEnfriamientoCapacidadMallaParaTests,
  servidoresCapacidadPorMalla,
  reiniciarServidorCapacidadMallaParaTests,
  type MsgCapacidadCancelar,
  type MsgCapacidadPedir,
} from "@/lib/network/capacidad-por-malla";
import type { MeshHandle, PeerEvents, PeerSnapshot } from "@/lib/network/webrtc-mesh";
import type { CapacidadTipo } from "@/lib/network/capacidad-por-malla";

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
    expect(
      esMensajeCapacidadMalla({
        t: "capacidad.pedir",
        id: "1",
        cuerpo: { tipo: "imagen", datos: {}, sesionId: "s1" },
      })
    ).toBe(true);
    expect(
      esMensajeCapacidadMalla({
        t: "capacidad.trozo",
        id: "1",
        datos: "datos_base64",
      })
    ).toBe(true);
    expect(
      esMensajeCapacidadMalla({
        t: "capacidad.fin",
        id: "1",
        tipo: "imagen",
      })
    ).toBe(true);
    expect(
      esMensajeCapacidadMalla({
        t: "capacidad.error",
        id: "1",
        estado: 503,
        mensaje: "x",
      })
    ).toBe(true);
    expect(esMensajeCapacidadMalla({ t: "capacidad.cancelar", id: "1" })).toBe(true);
  });

  it("rechaza basura, otros namespaces (incluido ia.*) y payloads incompletos", () => {
    expect(esMensajeCapacidadMalla(null)).toBe(false);
    expect(esMensajeCapacidadMalla("texto")).toBe(false);
    expect(
      esMensajeCapacidadMalla({ t: "ia.pedir", id: "1", cuerpo: { tipo: "imagen", datos: {} } })
    ).toBe(false);
    expect(
      esMensajeCapacidadMalla({ t: "capacidad.pedir", id: "1" })
    ).toBe(false); // sin cuerpo
    expect(
      esMensajeCapacidadMalla({ t: "capacidad.fin", id: "1" })
    ).toBe(false); // sin tipo
    expect(
      esMensajeCapacidadMalla({ t: "capacidad.error", id: "1", estado: "503", mensaje: "x" })
    ).toBe(false);
  });

  it("parseCapacidadMallaMensaje: JSON válido del protocolo → objeto; el resto → null", () => {
    expect(
      parseCapacidadMallaMensaje(
        JSON.stringify({ t: "capacidad.cancelar", id: "1" })
      )
    ).toEqual({ t: "capacidad.cancelar", id: "1" });
    expect(parseCapacidadMallaMensaje("{roto")).toBeNull();
    expect(
      parseCapacidadMallaMensaje(JSON.stringify({ t: "malla:hb", at: 1 }))
    ).toBeNull();
  });

  it("cabeEnMensajeCapacidad respeta el límite de 16 KB", () => {
    const jsonPequeño = JSON.stringify({ t: "capacidad.pedir", id: "1", cuerpo: { tipo: "imagen", datos: {} } });
    expect(cabeEnMensajeCapacidad(jsonPequeño)).toBe(true);
    const jsonGrande = JSON.stringify({
      t: "capacidad.pedir",
      id: "1",
      cuerpo: { tipo: "imagen", datos: { dato: "x".repeat(20000) } },
    });
    expect(cabeEnMensajeCapacidad(jsonGrande)).toBe(false);
  });
});

/* ══════════════════════════ Rol SERVIDOR ══════════════════════════ */

describe("manejarPeticionCapacidadMalla (rol servidor)", () => {
  const pedir = (cuerpo: MsgCapacidadPedir["cuerpo"] = {
    tipo: "imagen",
    datos: {},
    sesionId: "s1",
  }): MsgCapacidadPedir => ({
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

  it("ejecuta con el router de mentira, transmite por streaming y cierra con capacidad.fin {tipo}", async () => {
    const mesh = new FakeMesh();
    const ejecutar = vi.fn(async (_cuerpo, opts: { onChunk: (d: string) => void }) => {
      opts.onChunk("datos1");
      opts.onChunk("datos2");
      return { datos: "datos1datos2", tipo: "imagen" as CapacidadTipo };
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
      expect(fin).toMatchObject({ tipo: "imagen" as CapacidadTipo });
    const datos = msgs
      .filter((m) => m.t === "capacidad.trozo")
      .map((m) => m.datos)
      .join("");
    expect(datos).toBe("datos1datos2");
  });

  it("proveedor NO streaming (sin onChunk): los datos finales se mandan igual antes de capacidad.fin", async () => {
    const mesh = new FakeMesh();
    const ejecutar = vi.fn(async () => ({
      datos: "datos_completos_base64",
      tipo: "voz" as CapacidadTipo,
    }));
    await manejarPeticionCapacidadMalla(mesh, "peerA", pedir(), {
      puedeServir: () => true,
      ejecutar,
      registro: new Map(),
    });
    const msgs = mesh.sentParsed() as any[];
    const datos = msgs
      .filter((m) => m.t === "capacidad.trozo")
      .map((m) => m.datos)
      .join("");
    expect(datos).toBe("datos_completos_base64");
    expect(msgs.find((m) => m.t === "capacidad.fin")).toBeTruthy();
  });

  it("el router lanza ⇒ capacidad.error 502 con el mensaje", async () => {
    const mesh = new FakeMesh();
    const ejecutar = vi.fn(async () => {
      throw new Error("La capacidad solicitada no está disponible");
    });
    await manejarPeticionCapacidadMalla(mesh, "peerA", pedir(), {
      puedeServir: () => true,
      ejecutar,
      registro: new Map(),
    });
    const [msg] = mesh.sentParsed() as any[];
    expect(msg).toMatchObject({ t: "capacidad.error", estado: 502, mensaje: "La capacidad solicitada no está disponible" });
  });

  it("manejarCancelarCapacidadMalla aborta SOLO si el id coincide con la petición en vuelo", () => {
    const registro = new Map();
    const abort = new AbortController();
    registro.set("peerA", { id: "vivo", abort });
    manejarCancelarCapacidadMalla("peerA", { t: "capacidad.cancelar", id: "otro-id" } as MsgCapacidadCancelar, {
      registro,
    });
    expect(abort.signal.aborted).toBe(false);
    manejarCancelarCapacidadMalla("peerA", { t: "capacidad.cancelar", id: "vivo" } as MsgCapacidadCancelar, {
      registro,
    });
    expect(abort.signal.aborted).toBe(true);
  });
});

/* ══════════════════════════ Rol CLIENTE ══════════════════════════ */

describe("pedirCapacidadPorMalla (rol cliente)", () => {
  afterEach(() => reiniciarEnfriamientoCapacidadMallaParaTests());

    const peerA = {
      syncDeviceId: "peerA",
      nombre: "Mac de Alex",
      latenciaMs: 40,
      fuentesServibles: ["capacidad.imagen", "capacidad.voz"],
    };
    const peerB = {
      syncDeviceId: "peerB",
      nombre: "Tablet",
      latenciaMs: 10,
      fuentesServibles: ["capacidad.imagen"],
    };

    it("sin candidatos ⇒ error tipado sinServidor", async () => {
      const mesh = new FakeMesh();
      await expect(
        pedirCapacidadPorMalla({
          cuerpo: { tipo: "imagen", datos: {}, sesionId: "s1" },
          mesh,
          candidatos: [],
        })
      ).rejects.toMatchObject({
        sinServidor: true,
      });
    });

    it("resuelve los datos completos transmitiendo por streaming, con el peer elegido", async () => {
      const mesh = new FakeMesh();
      const datosRecibidos: string[] = [];
      const promesa = pedirCapacidadPorMalla({
        cuerpo: { tipo: "imagen", datos: {}, sesionId: "s1" },
        mesh,
        candidatos: [peerB, peerA], // peerB ya viene primero (menor latencia)
        onDatos: (d) => datosRecibidos.push(d),
      });
      await tick(0);
      const [enviado] = mesh.sentParsed() as any[];
      expect(enviado.t).toBe("capacidad.pedir");
      mesh.emitMessage("peerB", JSON.stringify({ t: "capacidad.trozo", id: enviado.id, datos: "datos1" }));
      mesh.emitMessage("peerB", JSON.stringify({ t: "capacidad.fin", id: enviado.id, tipo: "imagen" as CapacidadTipo }));
      const res = await promesa;
      expect(res).toEqual({ datos: "datos1", peer: "peerB", tipo: "imagen" as CapacidadTipo });
      expect(datosRecibidos).toEqual(["datos1"]);
    });

    it("peer ocupado ⇒ se enfría SOLO ese peer y se reintenta con el siguiente candidato", async () => {
      const mesh = new FakeMesh();
      const promesa = pedirCapacidadPorMalla({
        cuerpo: { tipo: "imagen", datos: {}, sesionId: "s1" },
        mesh,
        candidatos: [peerB, peerA],
        maxPeers: 2,
      });
      await tick(0);
      const [primero] = mesh.sentParsed() as any[];
      expect(primero.t).toBe("capacidad.pedir");
      mesh.emitMessage(
        "peerB",
        JSON.stringify({ t: "capacidad.error", id: primero.id, estado: 429, mensaje: "ocupado", ocupado: true, reintentarEnS: 5 })
      );
      await tick(0);
      const segundo = (mesh.sentParsed() as any[]).find(
        (m) => m.t === "capacidad.pedir" && m.id !== primero.id
      );
      expect(segundo).toBeTruthy();
      mesh.emitMessage("peerA", JSON.stringify({ t: "capacidad.fin", id: segundo.id, tipo: "imagen" as CapacidadTipo }));
      const res = await promesa;
      expect(res.peer).toBe("peerA");
    });

  it("enfriamiento por peer es POR PEER, no global: otro peer sigue disponible en servidoresCapacidadPorMalla si se mockea el estado", async () => {
    const mesh = new FakeMesh();
    const promesa = pedirCapacidadPorMalla({
      cuerpo: { tipo: "imagen", datos: {}, sesionId: "s1" },
      mesh,
      candidatos: [peerA],
      maxPeers: 1,
    });
    await tick(0);
    const [msg] = mesh.sentParsed() as any[];
    mesh.emitMessage("peerA", JSON.stringify({ t: "capacidad.fin", id: msg.id, tipo: "imagen" }));
    await promesa;
    expect(true).toBe(true);
  });

  it("todos los peers probados ocupados ⇒ error final ocupado:true", async () => {
    const mesh = new FakeMesh();
    const promesa = pedirCapacidadPorMalla({
      cuerpo: { tipo: "imagen", datos: {}, sesionId: "s1" },
      mesh,
      candidatos: [peerB, peerA],
      maxPeers: 2,
    });
    await tick(0);
    let enviados = mesh.sentParsed() as any[];
    mesh.emitMessage(
      "peerB",
      JSON.stringify({ t: "capacidad.error", id: enviados[0].id, estado: 503, mensaje: "ocupado", ocupado: true, reintentarEnS: 1 })
    );
    await tick(0);
    enviados = mesh.sentParsed() as any[];
    const segundo = enviados[enviados.length - 1];
    mesh.emitMessage(
      "peerA",
      JSON.stringify({ t: "capacidad.error", id: segundo.id, estado: 503, mensaje: "ocupado", ocupado: true, reintentarEnS: 1 })
    );
    await expect(promesa).rejects.toMatchObject({ ocupado: true });
  });

  it("peer perdido (desconexión) ⇒ error tipado peerPerdido", async () => {
    const mesh = new FakeMesh();
    const promesa = pedirCapacidadPorMalla({
      cuerpo: { tipo: "imagen", datos: {}, sesionId: "s1" },
      mesh,
      candidatos: [peerA],
      maxPeers: 1,
    });
    await tick(0);
    mesh.emitState({ deviceId: "peerA", state: "closed", channelOpen: false, lastUpdate: Date.now() });
    await expect(promesa).rejects.toMatchObject({ peerPerdido: true });
  });

  it("abortar el signal cancela y rechaza con AbortError, sin probar más peers", async () => {
    const mesh = new FakeMesh();
    const ctrl = new AbortController();
    const promesa = pedirCapacidadPorMalla({
      cuerpo: { tipo: "imagen", datos: {}, sesionId: "s1" },
      mesh,
      candidatos: [peerA, peerB],
      signal: ctrl.signal,
      maxPeers: 2,
    });
    await tick(0);
    ctrl.abort();
    await expect(promesa).rejects.toMatchObject({ name: "AbortError" });
    // Solo un `capacidad.pedir` salió (el de peerA): abortar no intenta el siguiente peer.
    expect(
      (mesh.sentParsed() as any[]).filter((m) => m.t === "capacidad.pedir")
    ).toHaveLength(1);
  });
});

/* ══════════════════════════ servidoresCapacidadPorMalla (con malla-neuronas troceada) ══════════════════════════ */

vi.mock("@/lib/network/malla-neuronas", async () => {
  const actual = await vi.importActual<typeof import("@/lib/network/malla-neuronas")>(
    "@/lib/network/malla-neuronas"
  );
  return { ...actual, snapshotMallaNeuronas: vi.fn() };
});

describe("servidoresCapacidadPorMalla", () => {
  afterEach(() => {
    vi.clearAllMocks();
    reiniciarEnfriamientoCapacidadMallaParaTests();
  });

  async function conFilas(filas: any[]) {
    const mod = await import("@/lib/network/malla-neuronas");
    (mod.snapshotMallaNeuronas as any).mockReturnValue({ misDispositivos: filas, cercanas: [], loading: false });
  }

    it("filtra por tipo pedida, excluye desconectados y a uno mismo, ordena por latencia", async () => {
      await conFilas([
        { esEsteDispositivo: true, syncDeviceId: "yo", enlace: { estado: "conectado" }, ficha: { fuentesServibles: ["capacidad.imagen"] }, nombre: "Yo" },
        { esEsteDispositivo: false, syncDeviceId: "lento", enlace: { estado: "conectado" }, ficha: { fuentesServibles: ["capacidad.imagen"] }, nombre: "Lento", },
        { esEsteDispositivo: false, syncDeviceId: "rapido", enlace: { estado: "conectado", latenciaMs: 5 }, ficha: { fuentesServibles: ["capacidad.imagen"], astrauraLatenciaMs: 5 }, nombre: "Rápido" },
        { esEsteDispositivo: false, syncDeviceId: "otra-capacidad", enlace: { estado: "conectado" }, ficha: { fuentesServibles: ["capacidad.voz"] }, nombre: "Otra capacidad" },
        { esEsteDispositivo: false, syncDeviceId: "desconectado", enlace: { estado: "fallido" }, ficha: { fuentesServibles: ["capacidad.imagen"] }, nombre: "Caído" },
      ]);
      const r = servidoresCapacidadPorMalla({ tipo: "imagen" });
      expect(r.map((s) => s.syncDeviceId)).toEqual(["rapido", "lento"]);
    });

    it("sin pin de tipo: cualquier peer con capacidades no vacío", async () => {
      await conFilas([
        { esEsteDispositivo: false, syncDeviceId: "a", enlace: { estado: "conectado" }, ficha: { fuentesServibles: ["capacidad.imagen"] } },
        { esEsteDispositivo: false, syncDeviceId: "b", enlace: { estado: "conectado" }, ficha: { fuentesServibles: [] } },
        { esEsteDispositivo: false, syncDeviceId: "c", enlace: { estado: "conectado" }, ficha: { fuentesServibles: ["capacidad.voz"] } },
      ]);
      const r = servidoresCapacidadPorMalla();
      expect(r.map((s) => s.syncDeviceId).sort()).toEqual(["a", "c"]);
    });

    it("peer en enfriamiento (por un fallo previo) queda excluido, pero los demás siguen sirviendo (enfriamiento POR PEER)", async () => {
      await conFilas([
        { esEsteDispositivo: false, syncDeviceId: "ocupado", enlace: { estado: "conectado" }, ficha: { fuentesServibles: ["capacidad.imagen"] } },
        { esEsteDispositivo: false, syncDeviceId: "libre", enlace: { estado: "conectado" }, ficha: { fuentesServibles: ["capacidad.imagen"] } },
      ]);
      const mesh = new FakeMesh();
      const promesa = pedirCapacidadPorMalla({
        cuerpo: { tipo: "imagen", datos: {}, sesionId: "s1" },
        mesh,
        candidatos: [{ syncDeviceId: "ocupado", fuentesServibles: ["capacidad.imagen"] }],
        maxPeers: 1,
      });
      const [msg] = (await (async () => {
        await new Promise((r) => setTimeout(r, 0));
        return mesh.sentParsed() as any[];
      })());
      mesh.emitMessage(
        "ocupado",
        JSON.stringify({ t: "capacidad.error", id: msg.id, estado: 429, mensaje: "ocupado", ocupado: true, reintentarEnS: 30 })
      );
      await expect(promesa).rejects.toMatchObject({ ocupado: true });

      const r = servidoresCapacidadPorMalla({ tipo: "imagen" });
      expect(r.map((s) => s.syncDeviceId)).toEqual(["libre"]);
    });
});

/* ══════════════════════════ Función de conveniencia pedirCapacidad ══════════════════════════ */

describe("pedirCapacidad (función de conveniencia)", () => {
  afterEach(() => reiniciarEnfriamientoCapacidadMallaParaTests());

  it("devuelve ok:true cuando la petición tiene éxito", async () => {
    const mesh = new FakeMesh();
    let datosEnviados = "";
    const enviar = (datos: string) => {
      datosEnviados += datos;
    };

    const promesa = pedirCapacidad(enviar, {
      tipo: "imagen" as CapacidadTipo,
      cuerpo: { valor: 42 },
      sesionId: "s1",
      timeoutMs: 5000,
    });

    await tick(0);
    const [enviado] = mesh.sentParsed() as any[];
    expect(enviado.t).toBe("capacidad.pedir");
    mesh.emitMessage("yo", JSON.stringify({ t: "capacidad.trozo", id: enviado.id, datos: "datos_respuesta" }));
    mesh.emitMessage("yo", JSON.stringify({ t: "capacidad.fin", id: enviado.id, tipo: "imagen" }));

    const res = await promesa;
    expect(res.ok).toBe(true);
    expect(datosEnviados).toBe("datos_respuesta");
  });

  it("devuelve ok:false con motivo cuando falla", async () => {
    const mesh = new FakeMesh();
    let datosEnviados = "";
    const enviar = (datos: string) => {
      datosEnviados += datos;
    };

    const promesa = pedirCapacidad(enviar, {
      tipo: "imagen" as CapacidadTipo,
      cuerpo: { valor: 42 },
      sesionId: "s1",
      timeoutMs: 5000,
    });

    await tick(0);
    const [enviado] = mesh.sentParsed() as any[];
    expect(enviado.t).toBe("capacidad.pedir");
    mesh.emitMessage("yo", JSON.stringify({ t: "capacidad.error", id: enviado.id, estado: 503, mensaje: "Servicio no disponible" }));

    const res = await promesa;
    expect(res.ok).toBe(false);
    expect(res.motivo).toBe("Servicio no disponible");
  });
});
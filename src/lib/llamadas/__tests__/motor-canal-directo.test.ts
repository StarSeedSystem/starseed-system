import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MetaPresencia, SenalLlamada } from "@/lib/llamadas/tipos";

/* ─────────────────────── Canal de señalización falso para pruebas ─────────────────────── */

type FalsoCanal = {
  sesion: string;
  tema: string;
  clave: string;
  meta: MetaPresencia | null;
  suscrito: boolean;
  estado: "conectando" | "dentro" | "reconectando" | "denegado";
  presencia: MetaPresencia[];
  enviadas: SenalLlamada[];
  suelta: boolean;
  denegado: boolean;
  oyP: Set<(p: MetaPresencia[]) => void>;
  oyS: Set<(s: SenalLlamada) => void>;
  oyE: Set<(e: boolean) => void>; // Nota: en el motor, onSuscrito recibe un boolean
};

const falsos = vi.hoisted(() => ({ canales: [] as FalsoCanal[] }));

function canales(): FalsoCanal[] {
  return falsos.canales;
}

function crearConexionFalsa(temaOverride?: string) {
  const sesion = "test-sesion";
  const tema = temaOverride ?? sesion;
  const clave = `clave-${Math.random().toString(36).slice(2, 8)}`;
  const c: FalsoCanal = {
    sesion,
    tema,
    clave,
    meta: null,
    suscrito: true,
    estado: "dentro",
    presencia: [],
    enviadas: [],
    suelta: false,
    denegado: false,
    oyP: new Set(),
    oyS: new Set(),
    oyE: new Set(),
  };
  (canales() as FalsoCanal[]).push(c);
  return {
    sesionId: sesion,
    tema: c.tema,
    clave: () => c.clave,
    suscrito: () => c.suscrito,
    estado: () => c.estado,
    presencia: () => c.presencia,
    onPresencia: (cb: (p: MetaPresencia[]) => void) => {
      c.oyP.add(cb);
      return () => c.oyP.delete(cb);
    },
    onSenal: (cb: (s: SenalLlamada) => void) => {
      c.oyS.add(cb);
      return () => c.oyS.delete(cb);
    },
    onSuscrito: (cb: (ok: boolean) => void) => {
      c.oyE.add(cb);
      return () => c.oyE.delete(cb);
    },
    onEstado: (cb: (e: string) => void) => {
      // Nota: en el motor, onEstado recibe un EstadoCanal (string)
      // Pero en nuestro falso, estamos guardando el estado como string en c.estado
      // Así que lo convertimos a string (aunque ya es string)
      c.oyE.add((ok: boolean) => cb(ok ? "dentro" : "denegado"));
      return () => c.oyE.delete(cb);
    },
    enviar: (s: SenalLlamada) => {
      if (c.denegado || c.suelta) return;
      c.enviadas.push(s);
    },
    publicar: (meta: MetaPresencia) => {
      c.meta = meta;
      // Actualizamos la presencia en el canal falso
      c.presencia = meta ? [meta] : [];
      c.oyP.forEach((cb) => cb(c.presencia));
    },
    retirar: () => {
      c.meta = null;
      c.presencia = [];
      c.oyP.forEach((cb) => cb(c.presencia));
    },
    soltar: () => {
      c.suelta = true;
      c.oyP.forEach((cb) => c.oyP.delete(cb));
      c.oyS.forEach((cb) => c.oyS.delete(cb));
      c.oyE.forEach((cb) => c.oyE.delete(cb));
    },
  };
}

/* ─────────────────────── Medios falsos ─────────────────────── */

class PistaFalsa {
  enabled = true;
  readyState = "live";
  muted = false;
  stop = vi.fn(() => {
    this.readyState = "ended";
  });
  onended: (() => void) | null = null;
  onmute: (() => void) | null = null;
  onunmute: (() => void) | null = null;
  constructor(public kind: "audio" | "video") {}
  getSettings() {
    return { deviceId: `${this.kind}-1` };
  }
}

class StreamFalso {
  id = `s-${Math.random().toString(36).slice(2, 8)}`;
  constructor(public pistas: PistaFalsa[] = []) {}
  getTracks() {
    return this.pistas;
  }
  getAudioTracks() {
    return this.pistas.filter((p) => p.kind === "audio");
  }
  getVideoTracks() {
    return this.pistas.filter((p) => p.kind === "video");
  }
  addTrack(p: PistaFalsa) {
    if (!this.pistas.includes(p)) this.pistas.push(p);
  }
  removeTrack(p: PistaFalsa) {
    this.pistas = this.pistas.filter((x) => x !== p);
  }
}

/* ─────────────────────── Mocks ─────────────────────── */

vi.mock("@/lib/llamadas/senalizacion", () => ({
  abrirCanalLlamada: (sesionId: string, opciones: { clave?: string | null; tema?: string | null } = {}) => {
    // Vamos a devolver un canal falso genérico por defecto, pero los tests pueden sobrescribir este mock
    const tema = opciones.tema ?? sesionId;
    const c: FalsoCanal = {
      sesion: sesionId,
      tema,
      clave: `clave-${Math.random().toString(36).slice(2, 8)}`,
      meta: null,
      suscrito: true,
      estado: "dentro",
      presencia: [],
      enviadas: [],
      suelta: false,
      denegado: false,
      oyP: new Set(),
      oyS: new Set(),
      oyE: new Set(),
    };
    (canales() as FalsoCanal[]).push(c);
    return {
      sesionId,
      tema: c.tema,
      clave: () => c.clave,
      suscrito: () => c.suscrito,
      estado: () => c.estado,
      presencia: () => c.presencia,
      onPresencia: (cb: (p: MetaPresencia[]) => void) => {
        c.oyP.add(cb);
        return () => c.oyP.delete(cb);
      },
      onSenal: (cb: (s: SenalLlamada) => void) => {
        c.oyS.add(cb);
        return () => c.oyS.delete(cb);
      },
      onSuscrito: (cb: (ok: boolean) => void) => {
        c.oyE.add(cb);
        return () => c.oyE.delete(cb);
      },
      onEstado: (cb: (e: string) => void) => {
        c.oyE.add((ok: boolean) => cb(ok ? "dentro" : "denegado"));
        return () => c.oyE.delete(cb);
      },
      enviar: (s: SenalLlamada) => {
        if (c.denegado || c.suelta) return;
        c.enviadas.push(s);
      },
      publicar: (meta: MetaPresencia) => {
        c.meta = meta;
        c.presencia = meta ? [meta] : [];
        c.oyP.forEach((cb) => cb(c.presencia));
      },
      retirar: () => {
        c.meta = null;
        c.presencia = [];
        c.oyP.forEach((cb) => cb(c.presencia));
      },
      soltar: () => {
        c.suelta = true;
        c.oyP.forEach((cb) => c.oyP.delete(cb));
        c.oyS.forEach((cb) => c.oyS.delete(cb));
        c.oyE.forEach((cb) => c.oyE.delete(cb));
      },
    };
  },
}));

vi.mock("@/lib/llamadas/medios", () => ({
  obtenerMedios: vi.fn(async (p: { audio: boolean; video: boolean }) => ({
    stream: new StreamFalso([...(p.audio ? [new PistaFalsa("audio")] : []), ...(p.video ? [new PistaFalsa("video")] : [])]),
    error: null,
    aviso: null,
  })),
  obtenerPista: vi.fn(async (tipo: "audio" | "video") => ({ pista: new PistaFalsa(tipo), error: null })),
  obtenerPantalla: vi.fn(async () => ({ pista: new PistaFalsa("video"), error: null })),
  listarDispositivos: vi.fn(async () => ({ microfonos: [{ id: "audio-1", nombre: "Micro" }], camaras: [], altavoces: [] })),
  pararStream: vi.fn((s: StreamFalso | null) => s?.getTracks().forEach((t) => t.stop())),
}));

vi.mock("@/lib/llamadas/identidad", () => ({
  clavePestana: (base: string) => `${base}:t`,
}));

vi.mock("@/lib/llamadas/ice", async (original) => ({
  ...(await original<typeof import("@/lib/llamadas/ice")>()),
  servidoresIce: () => [{ urls: "stun:x" }],
}));

/* ─────────────────────── RTCPeerConnection de mentira ─────────────────────── */

let pcs: PCFalsa[] = [];

class Emisor {
  replaceTrack = vi.fn(async (p: PistaFalsa | null) => {
    this.track = p;
  });
  constructor(public track: PistaFalsa | null) {}
}

class PCFalsa {
  signalingState: RTCSignalingState = "stable";
  iceConnectionState: RTCIceConnectionState = "new";
  connectionState: RTCPeerConnectionState = "new";
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  emisores: Emisor[] = [];
  candidatos: RTCIceCandidateInit[] = [];
  rollbacks = 0;
  reinicios = 0;
  cerrada = false;
  private n = 0;
  private negociando = false;
  onicecandidate: ((ev: unknown) => void) | null = null;
  ontrack: ((ev: unknown) => void) | null = null;
  onnegotiationneeded: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  constructor(public config: RTCConfiguration) {
    pcs.push(this);
  }
  private necesitaNegociar() {
    if (this.negociando) return;
    this.negociando = true;
    queueMicrotask(() => {
      this.negociando = false;
      if (this.signalingState === "stable") this.onnegotiationneeded?.();
    });
  }
  addTrack(p: PistaFalsa) {
    const e = new Emisor(p);
    this.emisores.push(e);
    this.necesitaNegociar();
    return e;
  }
  async setLocalDescription(d?: RTCSessionDescriptionInit) {
    await Promise.resolve();
    if (d?.type === "rollback") {
      this.rollbacks += 1;
      this.signalingState = "stable";
      this.localDescription = null;
      return;
    }
    if (this.signalingState === "have-remote-offer") {
      this.localDescription = { type: "answer", sdp: `answer-${++this.n}` };
      this.signalingState = "stable";
    } else {
      this.localDescription = { type: "offer", sdp: `offer-${++this.n}${this.emisores.some((e) => e.track?.kind === "video") ? "-video" : ""}` };
      this.signalingState = "have-local-offer";
    }
  }
  async setRemoteDescription(d: RTCSessionDescriptionInit) {
    await Promise.resolve();
    if (d.type === "offer") {
      if (this.signalingState === "have-local-offer") throw new Error("glare sin rollback");
      this.signalingState = "have-remote-offer";
    } else {
      this.signalingState = "stable";
    }
    this.remoteDescription = d;
    const pista = new PistaFalsa("audio");
    this.ontrack?.({ track: pista, streams: [new StreamFalso([pista])] });
  }
  async addIceCandidate(c: RTCIceCandidateInit) {
    if (!this.remoteDescription) throw new Error("sin descripción remota");
    this.candidatos.push(c);
  }
  restartIce() {
    this.reinicios += 1;
  }
  async getStats() {
    return new Map();
  }
  close() {
    this.cerrada = true;
  }
  fijarIce(estado: RTCIceConnectionState) {
    this.iceConnectionState = estado;
    this.oniceconnectionstatechange?.();
  }
}

/* ─────────────────────── Espera ─────────────────────── */

async function esperar(vueltas = 30) {
  for (let i = 0; i < vueltas; i++) await new Promise((r) => setTimeout(r, 0));
}

/* ─────────────────────── Importar el motor ─────────────────────── */

const { MotorLlamada } = await import("@/lib/llamadas/motor");

/* ─────────────────────── Helpers ─────────────────────── */

function yo(base: string) {
  return { base, uid: base, nombre: base.toUpperCase(), avatar: null, invitado: false };
}

/* ─────────────────────── Opciones base ─────────────────────── */

const OPCIONES_BASE = {
  sesionId: "test-sesion",
  yo: yo("usuario"),
  intervaloNivelMs: 60_000,
  intervaloStatsMs: 60_000,
};

/* ─────────────────────── Limpieza ─────────────────────── */

beforeEach(() => {
  pcs = [];
  canales().length = 0;
  (globalThis as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection = PCFalsa;
});

afterEach(() => {
  delete (globalThis as unknown as { RTCPeerConnection?: unknown }).RTCPeerConnection;
});

/* ─────────────────────── Casos de prueba ─────────────────────── */

describe("MotorLlamada - canales directos", () => {
  it("devuelve true cuando entrar() usa canales directos", async () => {
    const canalDirecto = crearConexionFalsa();

    const opciones: typeof OPCIONES_BASE & { canalesDirectos: () => FalsoCanal[] } = {
      ...OPCIONES_BASE,
      canalesDirectos: () => [canalDirecto],
    };

    const motor = new MotorLlamada(opciones as any);
    const resultado = motor.entrar();

    await esperar();

    expect(resultado).toBe(true);
    expect(motor.estado().fase).toBe("esperando");
    expect((motor as any).canales.length).toBe(1);
    expect(((motor as any).canales[0] as any).directo).toBe(true);
  });

  it("cuando un canal directo publica presencia, el motor crea su par", () => {
    const canalDirecto = crearConexionFalsa();

    const opciones: typeof OPCIONES_BASE & { canalesDirectos: () => FalsoCanal[] } = {
      ...OPCIONES_BASE,
      canalesDirectos: () => [canalDirecto],
    };

    const motor = new MotorLlamada(opciones as any);
    motor.entrar();

    canalDirecto.publicar({
      id: "person-2",
      uid: "person-2-uid",
      nombre: "Person 2",
      avatar: null,
      invitado: false,
      micro: true,
      camara: false,
      pantalla: false,
      unido: 123,
    });

    const participantes = motor.estado().participantes;
    expect(participantes.some((p) => p.id === "person-2")).toBe(true);
    expect((motor as any).pares.has("person-2")).toBe(true);
    expect(globalThis.RTCPeerConnection).toHaveBeenCalledWith(
      expect.objectContaining({ iceServers: expect.any(Array) })
    );
  });

  it("revisarCanal nunca suelta el canal directo", () => {
    const canalSupabase = crearConexionFalsa("llamada:test-sesion-supabase");

    // Vamos a mockear la función abrirCanalLlamada para que cuando se invoque con la clave específica
    // devuelva nuestro canal Supabase falso.
    const { abrirCanalLlamada } = require("@/lib/llamadas/senalizacion");
    (abrirCanalLlamada as any).mockImplementation((sesionId: string, opciones: { clave?: string | null; tema?: string | null } = {}) => {
      if (opciones.clave === "test-clave-supabase") {
        return canalSupabase;
      }
      return null;
    });

    const opciones: typeof OPCIONES_BASE & { canalesDirectos: () => FalsoCanal[] } = {
      ...OPCIONES_BASE,
      canalesDirectos: () => [crearConexionFalsa("llamada:test-sesion-directo")],
    };

    const motor = new MotorLlamada(opciones as any);
    motor.entrar();

    const antes = (motor as any).canales.length;
    expect((motor as any).canales.some((c: any) => c.directo)).toBe(true);
    expect((motor as any).canales.some((c: any) => !c.directo)).toBe(true);

    motor.revisarCanal(false);

    const despues = (motor as any).canales.length;
    expect(despues).toBe(antes);
    expect((motor as any).canales.some((c: any) => c.directo)).toBe(true);
  });
});
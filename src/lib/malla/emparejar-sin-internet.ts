"use client";

/**
 * emparejar-sin-internet — dos aparatos se enlazan por WebRTC SIN servidores ni internet (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Contrato: `architecture/transporte-universal-sin-internet.md`.
 *
 *   1. Quien INICIA crea una RTCPeerConnection con `iceServers: []` (solo candidatos de su red
 *      local: IP del Wi-Fi o nombre mDNS `.local`), espera a reunirlos y convierte la oferta en un
 *      código (`codigo-emparejado.ts`): se enseña como QR y como texto.
 *   2. Quien RESPONDE lo lee (cámara o texto pegado), crea la respuesta igual y enseña SU código.
 *   3. Quien inició lee la respuesta: se abre un canal de datos DIRECTO por el Wi-Fi o el punto de
 *      acceso de un móvil (aunque no tenga datos). Ni internet, ni STUN, ni TURN, ni Supabase.
 *   4. Al abrirse, los dos se presentan (`enl.hola`: nombre e ids, solo para enrutar) y el enlace
 *      queda en el registro (`registro-enlaces-locales.ts`) que usa el transporte universal.
 *
 * Llamadas directas: el mismo enlace renegocia audio/vídeo por SU PROPIO canal de datos («perfect
 * negotiation»: quien respondió es el cortés), así que una llamada tampoco necesita internet.
 *
 * Límite honesto: un navegador no puede descubrir solo a otro aparato sin internet; hace falta
 * este gesto (o la app nativa, o una radio). Si el punto de acceso aísla a sus clientes o bloquea
 * mDNS, no habrá ruta y se dice («no se alcanzaron»), sin fingir.
 */

import { codificarCodigo, contarCandidatos, decodificarCodigo } from "@/lib/malla/codigo-emparejado";
import {
  avisarCambioEnlaceLocal,
  quitarEnlaceLocal,
  registrarEnlaceLocal,
  type EnlaceLocalVivo,
  type InfoParLocal,
} from "@/lib/malla/registro-enlaces-locales";
import { resumirRuta, type ClaseRuta } from "@/lib/network/estadisticas-enlace";
import { identidadDispositivo } from "@/lib/network/identidad-dispositivo";

export type EstadoEmparejado = "preparando" | "esperando-respuesta" | "conectando" | "abierto" | "fallido" | "cerrado";

export interface Emparejamiento {
  readonly rol: "inicia" | "responde";
  readonly sesion: string;
  /** Código a enseñar al otro aparato (QR o texto). */
  readonly codigo: string;
  estado(): EstadoEmparejado;
  motivo(): string | null;
  enlace(): EnlaceLocalVivo | null;
  alCambiar(cb: () => void): () => void;
  /** Solo quien inicia: lee el código de respuesta del otro aparato. */
  completar(texto: string): Promise<{ ok: boolean; motivo?: string }>;
  cancelar(): void;
}

export type ResultadoEmparejar = { ok: true; emp: Emparejamiento } | { ok: false; motivo: string };

const ETIQUETA_CANAL = "starseed-local";
const ESPERA_CANDIDATOS_MS = 4000;
/** Quien inicia, tras leer la respuesta: si en esto no se abre, no hay ruta. */
const ESPERA_APERTURA_INICIA_MS = 25_000;
/** Quien responde espera a que el otro lea su código (es un gesto humano: más margen). */
const ESPERA_APERTURA_RESPONDE_MS = 3 * 60_000;
const LATIDO_MS = 10_000;

const MOTIVO_SIN_RED =
  "Este aparato no está en ninguna red local. Conéctalo al mismo Wi-Fi que el otro, o al punto de acceso de un móvil (no hace falta que tenga datos).";
const MOTIVO_NO_ALCANZA =
  "Los dos aparatos no se alcanzaron. Comprobad que estáis en el mismo Wi-Fi o punto de acceso; algunas redes de invitados aíslan a los aparatos entre sí.";

/** ¿Puede este navegador emparejar? Dice por qué no, si no. */
export function soportaEmparejado(): { ok: boolean; motivo?: string } {
  if (typeof window === "undefined") return { ok: false, motivo: "Solo funciona en el navegador o la app." };
  if (typeof (window as unknown as { RTCPeerConnection?: unknown }).RTCPeerConnection !== "function") {
    return { ok: false, motivo: "Este navegador no tiene WebRTC: no puede abrir enlaces directos." };
  }
  return { ok: true };
}

function nuevaSesion(): string {
  try {
    const a = crypto.getRandomValues(new Uint8Array(9));
    return Array.from(a, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 16);
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }
}

function esperarCandidatos(pc: RTCPeerConnection, ms: number): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolver) => {
    const fin = () => {
      clearTimeout(t);
      pc.removeEventListener("icegatheringstatechange", alCambiar);
      resolver();
    };
    const alCambiar = () => {
      if (pc.iceGatheringState === "complete") fin();
    };
    const t = setTimeout(fin, ms);
    pc.addEventListener("icegatheringstatechange", alCambiar);
  });
}

function texto80(x: unknown): string | undefined {
  return typeof x === "string" && x.trim() ? x.trim().slice(0, 80) : undefined;
}

/** Capacidad de salida que estima el navegador para el par elegido (kbps), si la da. */
export function capacidadDeStats(stats: RTCStatsReport | null | undefined): number | null {
  if (!stats) return null;
  let mejor: number | null = null;
  try {
    stats.forEach((v: unknown) => {
      const s = v as Record<string, unknown>;
      if (s?.type !== "candidate-pair" || s.state !== "succeeded") return;
      const bps = s.availableOutgoingBitrate;
      if (typeof bps === "number" && Number.isFinite(bps) && bps > 0) mejor = Math.max(mejor ?? 0, Math.round(bps / 1000));
    });
  } catch {
    return null;
  }
  return mejor;
}

async function uidLocal(): Promise<string | undefined> {
  try {
    const m = await import("@/lib/consumo/usuario");
    return (await m.uidActual()) ?? undefined;
  } catch {
    return undefined;
  }
}

/* ══════════════════════════ Conexión (una por emparejamiento) ══════════════════════════ */

interface Conexion {
  pc: RTCPeerConnection;
  emp: Emparejamiento;
  engancharCanal(dc: RTCDataChannel): void;
  ponerEstado(e: EstadoEmparejado, motivo?: string | null): void;
  armarEspera(ms: number): void;
}

function crearConexion(rol: "inicia" | "responde", sesion: string, nombre: string, codigoRef: { valor: string }, nombreRemoto?: string): Conexion {
  const pc = new RTCPeerConnection({ iceServers: [] });
  const cortes = rol === "responde";
  let estado: EstadoEmparejado = "preparando";
  let motivo: string | null = null;
  let dc: RTCDataChannel | null = null;
  let enlace: EnlaceLocalVivo | null = null;
  let haciendoOferta = false;
  let ignorandoOferta = false;
  let rtt: number | null = null;
  let ruta: ClaseRuta | null = null;
  let capacidad: number | null = null;
  let pingEnviado = 0;
  let latido: ReturnType<typeof setInterval> | null = null;
  let espera: ReturnType<typeof setTimeout> | null = null;
  let remoto: MediaStream | null = null;
  const emisores: RTCRtpSender[] = [];
  const oyentesEstado = new Set<() => void>();
  const oyentesMsg = new Set<(d: string | ArrayBuffer) => void>();
  const oyentesFlujo = new Set<(s: MediaStream | null) => void>();
  const par: InfoParLocal = { nombre: nombreRemoto || "Aparato vinculado" };

  const avisar = () => {
    for (const f of Array.from(oyentesEstado)) {
      try {
        f();
      } catch {
        /* noop */
      }
    }
  };
  const ponerEstado = (e: EstadoEmparejado, m: string | null = null) => {
    if (estado === e && motivo === m) return;
    estado = e;
    motivo = m;
    avisar();
  };
  const emitirFlujo = (s: MediaStream | null) => {
    remoto = s;
    for (const f of Array.from(oyentesFlujo)) {
      try {
        f(s);
      } catch {
        /* noop */
      }
    }
  };
  const enviarInterno = (o: Record<string, unknown>): boolean => {
    if (!dc || dc.readyState !== "open") return false;
    try {
      dc.send(JSON.stringify(o));
      return true;
    } catch {
      return false;
    }
  };

  const cerrar = (final: EstadoEmparejado = "cerrado", m: string | null = null) => {
    if (latido) clearInterval(latido);
    latido = null;
    if (espera) clearTimeout(espera);
    espera = null;
    if (enlace) quitarEnlaceLocal(enlace.id);
    try {
      dc?.close();
    } catch {
      /* noop */
    }
    try {
      pc.close();
    } catch {
      /* noop */
    }
    if (remoto) emitirFlujo(null);
    if (estado !== "fallido" || final === "fallido") ponerEstado(final, m ?? motivo);
  };

  const medir = async () => {
    pingEnviado = Date.now();
    enviarInterno({ t: "enl.ping", at: pingEnviado });
    try {
      const st = await pc.getStats();
      const r = resumirRuta(st, Date.now());
      ruta = r.clase === "desconocida" ? ruta : r.clase;
      if (r.rttMs !== null && rtt === null) rtt = r.rttMs;
      capacidad = capacidadDeStats(st) ?? capacidad;
      avisarCambioEnlaceLocal();
    } catch {
      /* se conserva la última medida */
    }
  };

  const alInterno = async (o: Record<string, unknown>) => {
    switch (o.t) {
      case "enl.hola": {
        par.nombre = texto80(o.nombre) ?? par.nombre;
        par.syncDeviceId = texto80(o.syncDeviceId);
        par.neuronDeviceId = texto80(o.neuronDeviceId);
        par.uid = texto80(o.uid);
        par.plataforma = texto80(o.plataforma);
        avisarCambioEnlaceLocal();
        avisar();
        return;
      }
      case "enl.ping":
        enviarInterno({ t: "enl.pong", at: o.at });
        return;
      case "enl.pong":
        if (typeof o.at === "number" && o.at === pingEnviado) {
          rtt = Math.max(0, Date.now() - pingEnviado);
          avisarCambioEnlaceLocal();
        }
        return;
      case "enl.neg": {
        const desc = o.desc as RTCSessionDescriptionInit | undefined;
        if (!desc || (desc.type !== "offer" && desc.type !== "answer")) return;
        const colision = desc.type === "offer" && (haciendoOferta || pc.signalingState !== "stable");
        ignorandoOferta = !cortes && colision;
        if (ignorandoOferta) return;
        try {
          await pc.setRemoteDescription(desc);
          if (desc.type === "offer") {
            await pc.setLocalDescription();
            enviarInterno({ t: "enl.neg", desc: pc.localDescription?.toJSON?.() ?? pc.localDescription });
          }
        } catch {
          /* la siguiente renegociación lo corrige */
        }
        return;
      }
      case "enl.ice": {
        const c = o.c as RTCIceCandidateInit | undefined;
        if (!c) return;
        try {
          await pc.addIceCandidate(c);
        } catch {
          /* si estábamos ignorando su oferta, es normal */
        }
        return;
      }
      case "enl.adios":
        cerrar("cerrado", "El otro aparato cerró el enlace.");
        return;
      default:
        return;
    }
  };

  pc.onnegotiationneeded = async () => {
    if (!dc || dc.readyState !== "open") return; // la negociación inicial va por el código
    try {
      haciendoOferta = true;
      await pc.setLocalDescription();
      enviarInterno({ t: "enl.neg", desc: pc.localDescription?.toJSON?.() ?? pc.localDescription });
    } catch {
      /* noop */
    } finally {
      haciendoOferta = false;
    }
  };
  pc.onicecandidate = (ev) => {
    if (ev.candidate && dc?.readyState === "open") enviarInterno({ t: "enl.ice", c: ev.candidate.toJSON() });
  };
  pc.ontrack = (ev) => {
    const s = ev.streams[0] ?? new MediaStream([ev.track]);
    s.onremovetrack = () => {
      if (!s.getTracks().length) emitirFlujo(null);
    };
    emitirFlujo(s);
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed" && estado === "abierto") cerrar("fallido", "Se perdió la ruta directa con el otro aparato.");
    if (pc.connectionState === "closed" && estado === "abierto") cerrar();
  };

  const crearEnlace = (): EnlaceLocalVivo => ({
    id: `local:${sesion}`,
    par,
    desde: Date.now(),
    abierto: () => !!dc && dc.readyState === "open",
    rttMs: () => rtt,
    ruta: () => ruta,
    capacidadKbps: () => capacidad,
    enviar: (t) => {
      if (!dc || dc.readyState !== "open") return false;
      try {
        dc.send(t);
        return true;
      } catch {
        return false;
      }
    },
    enviarBinario: (b) => {
      if (!dc || dc.readyState !== "open") return false;
      try {
        dc.send(b);
        return true;
      } catch {
        return false;
      }
    },
    bufferedAmount: () => dc?.bufferedAmount ?? 0,
    alMensaje: (cb) => {
      oyentesMsg.add(cb);
      return () => {
        oyentesMsg.delete(cb);
      };
    },
    ponerPistas: async (stream) => {
      try {
        for (const s of emisores.splice(0)) pc.removeTrack(s);
        if (stream) for (const t of stream.getTracks()) emisores.push(pc.addTrack(t, stream));
        return true;
      } catch {
        return false;
      }
    },
    alFlujoRemoto: (cb) => {
      oyentesFlujo.add(cb);
      if (remoto) cb(remoto);
      return () => {
        oyentesFlujo.delete(cb);
      };
    },
    cerrar: () => {
      enviarInterno({ t: "enl.adios" });
      cerrar();
    },
  });

  const engancharCanal = (canal: RTCDataChannel) => {
    dc = canal;
    canal.binaryType = "arraybuffer";
    canal.onopen = async () => {
      if (espera) clearTimeout(espera);
      espera = null;
      // Primero al registro (para no perder lo que el otro mande en cuanto abre), luego la presentación.
      enlace = crearEnlace();
      registrarEnlaceLocal(enlace);
      ponerEstado("abierto");
      latido = setInterval(() => void medir(), LATIDO_MS);
      const ids = (() => {
        try {
          return identidadDispositivo();
        } catch {
          return null;
        }
      })();
      enviarInterno({
        t: "enl.hola",
        nombre,
        syncDeviceId: ids?.syncDeviceId,
        neuronDeviceId: ids?.neuronDeviceId,
        uid: await uidLocal(),
        plataforma: typeof navigator !== "undefined" ? (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform : undefined,
      });
      void medir();
    };
    canal.onmessage = (ev) => {
      const d = ev.data as string | ArrayBuffer;
      if (typeof d === "string" && d.startsWith('{"t":"enl.')) {
        try {
          void alInterno(JSON.parse(d) as Record<string, unknown>);
        } catch {
          /* basura: se ignora */
        }
        return;
      }
      for (const f of Array.from(oyentesMsg)) {
        try {
          f(d);
        } catch {
          /* noop */
        }
      }
    };
    canal.onclose = () => {
      if (estado === "abierto") cerrar("cerrado", "El enlace se cerró.");
    };
  };

  const emp: Emparejamiento = {
    rol,
    sesion,
    get codigo() {
      return codigoRef.valor;
    },
    estado: () => estado,
    motivo: () => motivo,
    enlace: () => enlace,
    alCambiar: (cb) => {
      oyentesEstado.add(cb);
      return () => {
        oyentesEstado.delete(cb);
      };
    },
    completar: async () => ({ ok: false, motivo: "Quien responde no necesita leer otro código." }),
    cancelar: () => cerrar("cerrado", null),
  };

  return {
    pc,
    emp,
    engancharCanal,
    ponerEstado,
    armarEspera: (ms) => {
      if (espera) clearTimeout(espera);
      espera = setTimeout(() => {
        if (estado !== "abierto") cerrar("fallido", MOTIVO_NO_ALCANZA);
      }, ms);
    },
  };
}

/** Lo que este aparato pone en su código: nombre legible (el que elija la interfaz). */
function nombreDeEsteAparato(nombre?: string): string {
  return texto80(nombre) ?? "Aparato StarSeed";
}

/** Paso 1: crea la oferta y su código. */
export async function iniciarEmparejamiento(opts: { nombre?: string } = {}): Promise<ResultadoEmparejar> {
  const sop = soportaEmparejado();
  if (!sop.ok) return { ok: false, motivo: sop.motivo ?? "No disponible." };
  const nombre = nombreDeEsteAparato(opts.nombre);
  const sesion = nuevaSesion();
  const codigoRef = { valor: "" };
  let conx: Conexion;
  try {
    conx = crearConexion("inicia", sesion, nombre, codigoRef);
  } catch {
    return { ok: false, motivo: "El navegador no dejó crear la conexión." };
  }
  const { pc, emp } = conx;
  try {
    conx.engancharCanal(pc.createDataChannel(ETIQUETA_CANAL, { ordered: true }));
    await pc.setLocalDescription(await pc.createOffer());
    await esperarCandidatos(pc, ESPERA_CANDIDATOS_MS);
    const sdp = pc.localDescription?.sdp ?? "";
    if (contarCandidatos(sdp) === 0) {
      emp.cancelar();
      return { ok: false, motivo: MOTIVO_SIN_RED };
    }
    codigoRef.valor = await codificarCodigo({ r: "o", s: sesion, sdp, n: nombre });
  } catch {
    emp.cancelar();
    return { ok: false, motivo: "No se pudo preparar el código de este aparato." };
  }
  conx.ponerEstado("esperando-respuesta");
  (emp as { completar: Emparejamiento["completar"] }).completar = async (texto: string) => {
    const r = await decodificarCodigo(texto);
    if (!r.ok) return { ok: false, motivo: r.motivo };
    if (r.datos.r !== "a") return { ok: false, motivo: "Ese es un código para EMPEZAR; lee el código de RESPUESTA del otro aparato." };
    if (r.datos.s !== sesion) return { ok: false, motivo: "Esa respuesta es de otro emparejamiento. Pide al otro aparato que lea tu código actual." };
    if (emp.estado() !== "esperando-respuesta") return { ok: false, motivo: "Este emparejamiento ya no espera respuesta." };
    try {
      conx.ponerEstado("conectando");
      conx.armarEspera(ESPERA_APERTURA_INICIA_MS);
      await pc.setRemoteDescription({ type: "answer", sdp: r.datos.sdp });
      return { ok: true };
    } catch {
      conx.ponerEstado("fallido", "La respuesta no encaja con este código (¿se generó otro después?).");
      return { ok: false, motivo: "La respuesta no encaja con este código." };
    }
  };
  return { ok: true, emp };
}

/** Paso 2: lee el código de quien inicia y crea la respuesta (su código). */
export async function responderEmparejamiento(texto: string, opts: { nombre?: string } = {}): Promise<ResultadoEmparejar> {
  const sop = soportaEmparejado();
  if (!sop.ok) return { ok: false, motivo: sop.motivo ?? "No disponible." };
  const r = await decodificarCodigo(texto);
  if (!r.ok) return { ok: false, motivo: r.motivo };
  if (r.datos.r !== "o") return { ok: false, motivo: "Ese es un código de RESPUESTA; aquí va el código que enseña quien empieza." };
  const nombre = nombreDeEsteAparato(opts.nombre);
  const codigoRef = { valor: "" };
  let conx: Conexion;
  try {
    conx = crearConexion("responde", r.datos.s, nombre, codigoRef, r.datos.n);
  } catch {
    return { ok: false, motivo: "El navegador no dejó crear la conexión." };
  }
  const { pc, emp } = conx;
  pc.ondatachannel = (ev) => conx.engancharCanal(ev.channel);
  try {
    await pc.setRemoteDescription({ type: "offer", sdp: r.datos.sdp });
    await pc.setLocalDescription(await pc.createAnswer());
    await esperarCandidatos(pc, ESPERA_CANDIDATOS_MS);
    const sdp = pc.localDescription?.sdp ?? "";
    if (contarCandidatos(sdp) === 0) {
      emp.cancelar();
      return { ok: false, motivo: MOTIVO_SIN_RED };
    }
    codigoRef.valor = await codificarCodigo({ r: "a", s: r.datos.s, sdp, n: nombre });
  } catch {
    emp.cancelar();
    return { ok: false, motivo: "Ese código no se pudo usar (¿está completo?)." };
  }
  conx.ponerEstado("conectando");
  conx.armarEspera(ESPERA_APERTURA_RESPONDE_MS);
  return { ok: true, emp };
}

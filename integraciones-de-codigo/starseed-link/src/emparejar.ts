/**
 * emparejar — enlace DIRECTO entre dos aparatos SIN internet, compatible con StarSeed OS (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════
 * Mismo protocolo que `src/lib/malla/emparejar-sin-internet.ts` del OS: un aparato crea una oferta
 * WebRTC sin servidores (solo candidatos de su red local: mismo Wi-Fi o punto de acceso de un móvil,
 * aunque no tenga datos), la enseña como código `SSL1…` (texto o QR) y el otro la lee y devuelve el
 * suyo. Canal de datos «starseed-local»; los mensajes internos empiezan por `{"t":"enl.` (hola,
 * ping/pong para medir la ida y vuelta, adiós). Así una app con el kit se empareja con una neurona
 * del OS, o con otra app, y por ese enlace viajan las estaciones (`{"t":"est"…}`) y el transporte
 * (`{"t":"tu.…}`) con la ida y vuelta de la red local: el reloj común baja a ±1 ms.
 *
 * Límite honesto: un navegador no descubre solo a otro aparato sin internet; hace falta el gesto de
 * pasarse el código (ese gesto es el consentimiento). Si la red aísla a sus clientes, no habrá ruta
 * y se dice. Nunca lanza.
 */

import { codificarCodigo, contarCandidatos, decodificarCodigo } from "./codigo-emparejado";

export const ETIQUETA_CANAL_LOCAL = "starseed-local";
const ESPERA_CANDIDATOS_MS = 4000;
const ESPERA_APERTURA_INICIA_MS = 25_000;
const ESPERA_APERTURA_RESPONDE_MS = 3 * 60_000;
const LATIDO_MS = 10_000;

export const MOTIVO_SIN_RED =
  "Este aparato no está en ninguna red local. Conéctalo al mismo Wi-Fi que el otro, o al punto de acceso de un móvil (no hace falta que tenga datos).";
export const MOTIVO_NO_ALCANZA =
  "Los dos aparatos no se alcanzaron. Comprobad que estáis en el mismo Wi-Fi o punto de acceso; algunas redes de invitados aíslan a los aparatos entre sí.";

export interface ParLocal {
  nombre?: string;
  syncDeviceId?: string;
  neuronDeviceId?: string;
  uid?: string;
  plataforma?: string;
}

/** Un enlace local abierto (lo que usan las estaciones y el transporte). */
export interface EnlaceLocal {
  id: string;
  par: ParLocal;
  abierto(): boolean;
  enviar(texto: string): void;
  /** Mensajes de texto NO internos (los `enl.*` se quedan aquí). */
  alMensaje(cb: (texto: string) => void): () => void;
  /** Ida y vuelta medida (ms) o null si aún no hay medida. */
  rttMs(): number | null;
  cerrar(): void;
}

/* ─────────────── registro de enlaces vivos (por pestaña) ─────────────── */

const vivos = new Map<string, EnlaceLocal>();
const oyentesRegistro = new Set<() => void>();

function avisarRegistro(): void {
  for (const f of Array.from(oyentesRegistro)) {
    try {
      f();
    } catch {
      /* nada */
    }
  }
}

export function enlacesLocales(): EnlaceLocal[] {
  return [...vivos.values()].filter((e) => {
    try {
      return e.abierto();
    } catch {
      return false;
    }
  });
}

export function alCambiarEnlacesLocales(cb: () => void): () => void {
  oyentesRegistro.add(cb);
  return () => {
    oyentesRegistro.delete(cb);
  };
}

/** Para pruebas o para enlaces que la app abra por otro medio (p. ej. un puerto serie). */
export function registrarEnlaceLocal(e: EnlaceLocal): () => void {
  vivos.set(e.id, e);
  avisarRegistro();
  return () => {
    if (vivos.get(e.id) === e) vivos.delete(e.id);
    avisarRegistro();
  };
}

/* ─────────────── emparejado ─────────────── */

export type EstadoEmparejado = "preparando" | "esperando-respuesta" | "conectando" | "abierto" | "fallido" | "cerrado";

export interface Emparejamiento {
  readonly rol: "inicia" | "responde";
  readonly sesion: string;
  /** Código a enseñar al otro aparato (QR o texto). */
  codigo(): string;
  estado(): EstadoEmparejado;
  motivo(): string | null;
  enlace(): EnlaceLocal | null;
  alCambiar(cb: () => void): () => void;
  /** Solo quien inicia: lee el código de respuesta del otro aparato. */
  completar(texto: string): Promise<{ ok: boolean; motivo?: string }>;
  cancelar(): void;
}

export type ResultadoEmparejar = { ok: true; emp: Emparejamiento } | { ok: false; motivo: string };

export interface OpcionesEmparejar {
  /** Nombre legible de este aparato («Omnifrecuencias · Android»). */
  nombre?: string;
  /** Lo que este medio cuenta de sí en el saludo (ids públicos, nunca credenciales). */
  identidad?: Omit<ParLocal, "nombre">;
  /** Para pruebas: crea la conexión. */
  crearConexion?: () => RTCPeerConnection;
}

export function soportaEmparejado(): { ok: boolean; motivo?: string } {
  if (typeof RTCPeerConnection !== "function") return { ok: false, motivo: "Este medio no tiene WebRTC: no puede enlazarse sin internet." };
  return { ok: true };
}

function nuevaSesion(): string {
  try {
    const b = new Uint8Array(9);
    globalThis.crypto.getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  } catch {
    return Math.random().toString(36).slice(2, 14);
  }
}

const texto80 = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : undefined);

function esperarCandidatos(pc: RTCPeerConnection, ms: number): Promise<void> {
  return new Promise((ok) => {
    if (pc.iceGatheringState === "complete") return ok();
    const fin = setTimeout(ok, ms);
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(fin);
        ok();
      }
    });
  });
}

interface Conexion {
  pc: RTCPeerConnection;
  emp: Emparejamiento;
  codigoRef: { valor: string };
  engancharCanal(dc: RTCDataChannel): void;
  ponerEstado(e: EstadoEmparejado, motivo?: string | null): void;
  armarEspera(ms: number): void;
}

function crearConexion(rol: "inicia" | "responde", sesion: string, op: OpcionesEmparejar, nombrePar?: string): Conexion {
  const pc = op.crearConexion ? op.crearConexion() : new RTCPeerConnection({ iceServers: [] });
  const codigoRef = { valor: "" };
  const oyentesEstado = new Set<() => void>();
  const oyentesMsg = new Set<(t: string) => void>();
  const par: ParLocal = { nombre: nombrePar };
  let estado: EstadoEmparejado = "preparando";
  let motivo: string | null = null;
  let dc: RTCDataChannel | null = null;
  let enlace: EnlaceLocal | null = null;
  let bajaRegistro: (() => void) | null = null;
  let latido: ReturnType<typeof setInterval> | null = null;
  let espera: ReturnType<typeof setTimeout> | null = null;
  let pingEnviado = 0;
  let rtt: number | null = null;

  const avisar = () => {
    for (const f of Array.from(oyentesEstado)) {
      try {
        f();
      } catch {
        /* nada */
      }
    }
  };
  const ponerEstado = (e: EstadoEmparejado, m: string | null = null) => {
    estado = e;
    motivo = m;
    avisar();
  };
  const enviarInterno = (o: Record<string, unknown>) => {
    try {
      if (dc?.readyState === "open") dc.send(JSON.stringify(o));
    } catch {
      /* nada */
    }
  };
  const cerrar = (final: EstadoEmparejado, m: string | null) => {
    if (estado === "cerrado" || estado === "fallido") return;
    if (dc?.readyState === "open" && final === "cerrado") enviarInterno({ t: "enl.adios" });
    if (latido) clearInterval(latido);
    if (espera) clearTimeout(espera);
    latido = null;
    espera = null;
    bajaRegistro?.();
    bajaRegistro = null;
    try {
      dc?.close();
    } catch {
      /* nada */
    }
    try {
      pc.close();
    } catch {
      /* nada */
    }
    ponerEstado(final, m);
  };
  const alInterno = (o: Record<string, unknown>) => {
    switch (o.t) {
      case "enl.hola":
        par.nombre = texto80(o.nombre) ?? par.nombre;
        par.syncDeviceId = texto80(o.syncDeviceId);
        par.neuronDeviceId = texto80(o.neuronDeviceId);
        par.uid = texto80(o.uid);
        par.plataforma = texto80(o.plataforma);
        avisarRegistro();
        avisar();
        return;
      case "enl.ping":
        enviarInterno({ t: "enl.pong", at: o.at });
        return;
      case "enl.pong":
        if (typeof o.at === "number" && o.at === pingEnviado) {
          rtt = Math.max(0, Date.now() - pingEnviado);
          avisarRegistro();
        }
        return;
      case "enl.adios":
        cerrar("cerrado", "El otro aparato cerró el enlace.");
        return;
      default:
        return; // enl.neg / enl.ice: renegociar flujos de audio/vídeo no es cosa del kit
    }
  };
  const engancharCanal = (canal: RTCDataChannel) => {
    dc = canal;
    canal.onopen = () => {
      if (espera) clearTimeout(espera);
      espera = null;
      enlace = {
        id: sesion,
        par,
        abierto: () => dc?.readyState === "open",
        enviar: (t) => {
          if (dc?.readyState === "open") dc.send(t);
        },
        alMensaje: (cb) => {
          oyentesMsg.add(cb);
          return () => {
            oyentesMsg.delete(cb);
          };
        },
        rttMs: () => rtt,
        cerrar: () => cerrar("cerrado", null),
      };
      bajaRegistro = registrarEnlaceLocal(enlace);
      ponerEstado("abierto");
      enviarInterno({ t: "enl.hola", nombre: op.nombre, ...(op.identidad ?? {}) });
      const medir = () => {
        pingEnviado = Date.now();
        enviarInterno({ t: "enl.ping", at: pingEnviado });
      };
      medir();
      latido = setInterval(medir, LATIDO_MS);
    };
    canal.onmessage = (ev: MessageEvent) => {
      const d = ev.data;
      if (typeof d !== "string") return;
      if (d.startsWith('{"t":"enl.')) {
        try {
          alInterno(JSON.parse(d) as Record<string, unknown>);
        } catch {
          /* basura */
        }
        return;
      }
      for (const f of Array.from(oyentesMsg)) {
        try {
          f(d);
        } catch {
          /* nada */
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
    codigo: () => codigoRef.valor,
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
    codigoRef,
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

/** Paso 1 (quien empieza): crea la oferta y su código. */
export async function iniciarEmparejamiento(op: OpcionesEmparejar = {}): Promise<ResultadoEmparejar> {
  if (!op.crearConexion) {
    const s = soportaEmparejado();
    if (!s.ok) return { ok: false, motivo: s.motivo ?? "No disponible." };
  }
  const sesion = nuevaSesion();
  let c: Conexion;
  try {
    c = crearConexion("inicia", sesion, op);
  } catch {
    return { ok: false, motivo: "El navegador no dejó crear la conexión." };
  }
  try {
    c.engancharCanal(c.pc.createDataChannel(ETIQUETA_CANAL_LOCAL, { ordered: true }));
    await c.pc.setLocalDescription(await c.pc.createOffer());
    await esperarCandidatos(c.pc, ESPERA_CANDIDATOS_MS);
    const sdp = c.pc.localDescription?.sdp ?? "";
    if (contarCandidatos(sdp) === 0) {
      c.emp.cancelar();
      return { ok: false, motivo: MOTIVO_SIN_RED };
    }
    c.codigoRef.valor = await codificarCodigo({ r: "o", s: sesion, sdp, n: op.nombre });
  } catch {
    c.emp.cancelar();
    return { ok: false, motivo: "No se pudo preparar el código de este aparato." };
  }
  c.ponerEstado("esperando-respuesta");
  (c.emp as { completar: Emparejamiento["completar"] }).completar = async (texto: string) => {
    const r = await decodificarCodigo(texto);
    if ("motivo" in r) return { ok: false, motivo: r.motivo };
    if (r.datos.r !== "a") return { ok: false, motivo: "Ese es un código para EMPEZAR; lee el código de RESPUESTA del otro aparato." };
    if (r.datos.s !== sesion) return { ok: false, motivo: "Esa respuesta es de otro emparejamiento." };
    if (c.emp.estado() !== "esperando-respuesta") return { ok: false, motivo: "Este emparejamiento ya no espera respuesta." };
    try {
      c.ponerEstado("conectando");
      c.armarEspera(ESPERA_APERTURA_INICIA_MS);
      await c.pc.setRemoteDescription({ type: "answer", sdp: r.datos.sdp });
      return { ok: true };
    } catch {
      c.ponerEstado("fallido", "La respuesta no encaja con este código.");
      return { ok: false, motivo: "La respuesta no encaja con este código." };
    }
  };
  return { ok: true, emp: c.emp };
}

/** Paso 2 (quien responde): lee el código del otro y crea el suyo. */
export async function responderEmparejamiento(texto: string, op: OpcionesEmparejar = {}): Promise<ResultadoEmparejar> {
  if (!op.crearConexion) {
    const s = soportaEmparejado();
    if (!s.ok) return { ok: false, motivo: s.motivo ?? "No disponible." };
  }
  const r = await decodificarCodigo(texto);
  if ("motivo" in r) return { ok: false, motivo: r.motivo };
  if (r.datos.r !== "o") return { ok: false, motivo: "Ese es un código de RESPUESTA; aquí va el código de quien empieza." };
  let c: Conexion;
  try {
    c = crearConexion("responde", r.datos.s, op, r.datos.n);
  } catch {
    return { ok: false, motivo: "El navegador no dejó crear la conexión." };
  }
  c.pc.ondatachannel = (ev) => c.engancharCanal(ev.channel);
  try {
    await c.pc.setRemoteDescription({ type: "offer", sdp: r.datos.sdp });
    await c.pc.setLocalDescription(await c.pc.createAnswer());
    await esperarCandidatos(c.pc, ESPERA_CANDIDATOS_MS);
    const sdp = c.pc.localDescription?.sdp ?? "";
    if (contarCandidatos(sdp) === 0) {
      c.emp.cancelar();
      return { ok: false, motivo: MOTIVO_SIN_RED };
    }
    c.codigoRef.valor = await codificarCodigo({ r: "a", s: r.datos.s, sdp, n: op.nombre });
  } catch {
    c.emp.cancelar();
    return { ok: false, motivo: "Ese código no se pudo usar (¿está completo?)." };
  }
  c.ponerEstado("conectando");
  c.armarEspera(ESPERA_APERTURA_RESPONDE_MS);
  return { ok: true, emp: c.emp };
}

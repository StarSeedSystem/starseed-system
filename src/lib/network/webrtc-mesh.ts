"use client";

/*
 * webrtc-mesh — Conexión P2P REAL entre dispositivos de la MISMA cuenta.
 * ---------------------------------------------------------------------------
 * QUÉ ES:
 *   Un mini "mesh" de RTCPeerConnection + RTCDataChannel('starseed') que conecta
 *   dispositivos del mismo usuario. La negociación (oferta/respuesta SDP + ICE
 *   trickle) viaja por la CUENTA soberana vía `signaling.ts` (Realtime o
 *   fallback). El transporte de datos es DIRECTO (P2P), no pasa por el servidor.
 *
 * CÓMO NEGOCIA:
 *   - STUN público (stun:stun.l.google.com:19302) para descubrir la ruta.
 *   - "Polite peer" determinista por comparación de ids para evitar colisiones
 *     de glare (ofertas cruzadas simultáneas).
 *   - ICE trickle: los candidatos se envían en cuanto aparecen (kind:'ice').
 *
 * LÍMITE HONESTO (NAT/TURN):
 *   Sin servidor TURN, si ambos dispositivos están tras NAT simétrico la ruta
 *   directa puede no establecerse. En LAN / NAT normal suele bastar STUN. El
 *   estado se reporta con honestidad ('failed' incluido) — no simulamos éxito.
 *
 * Alineado con CLAUDE.md:
 *   - Descentralización: datos P2P directos, señalización por tu cuenta.
 *   - Defensivo / SSR-safe: sin RTCPeerConnection → degrada; nunca lanza.
 *
 * API pública:
 *   initMesh(myDeviceId, userId)  → MeshHandle | null
 *   connectToDevice(id)           (en el handle)
 *   onPeer(cb), sendToPeer(id,d), broadcast(d), getPeers(), closeMesh()
 */

import { subscribeSignals, sendSignal, type Signal, type SignalSubscription } from "@/lib/network/signaling";

/* ------------------------------------------------------------------ */
/* Tipos del contrato                                                */
/* ------------------------------------------------------------------ */

/** Estado de un peer dentro del mesh. */
export type PeerState = "connecting" | "connected" | "failed" | "closed";

/** Instantánea de un peer (para la UI). */
export interface PeerSnapshot {
  /** Id del dispositivo remoto. */
  deviceId: string;
  state: PeerState;
  /** ¿El data channel está abierto y listo para enviar? */
  channelOpen: boolean;
  /** Última actividad conocida (epoch ms). */
  lastUpdate: number;
}

/** Callback de cambios de peer (alta, cambio de estado, mensajes). */
export interface PeerEvents {
  /** Cambió el estado de un peer (o apareció). */
  onState?: (peer: PeerSnapshot) => void;
  /** Llegó un mensaje por el data channel de `deviceId`. */
  onMessage?: (deviceId: string, data: string) => void;
}

/** Handle del mesh activo (todo lo que la UI/lan-sync necesita). */
export interface MeshHandle {
  /** Id de ESTE dispositivo. */
  readonly myDeviceId: string;
  /** Id del usuario (cuenta) dueño del mesh. */
  readonly userId: string;
  /** ¿WebRTC disponible en este entorno? */
  readonly supported: boolean;
  /** Transporte de señalización efectivo (realtime|polling|none). */
  readonly signalingTransport: "realtime" | "polling" | "none";
  /** Inicia (o reintenta) conexión con un dispositivo destino. */
  connectToDevice: (targetDeviceId: string) => Promise<PeerSnapshot>;
  /** Suscribe eventos del mesh (estado + mensajes). Devuelve unsubscribe. */
  onPeer: (events: PeerEvents) => () => void;
  /** Envía datos por el data channel a un peer. true si se pudo. */
  sendToPeer: (deviceId: string, data: string) => boolean;
  /** Envía a todos los peers con canal abierto. Nº de envíos exitosos. */
  broadcast: (data: string) => number;
  /** Instantánea de todos los peers conocidos. */
  getPeers: () => PeerSnapshot[];
  /** Cierra el mesh, todas las conexiones y la señalización. */
  closeMesh: () => void;
}

/* ------------------------------------------------------------------ */
/* Config                                                            */
/* ------------------------------------------------------------------ */

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

/** Nombre del data channel P2P. */
const DATA_CHANNEL_LABEL = "starseed";

/* ------------------------------------------------------------------ */
/* Soporte de entorno (real)                                         */
/* ------------------------------------------------------------------ */

/** ¿El navegador expone RTCPeerConnection? (comprobación real, SSR-safe). */
export function isWebRtcSupported(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return typeof (window as unknown as { RTCPeerConnection?: unknown }).RTCPeerConnection === "function";
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Estructura interna de un peer                                     */
/* ------------------------------------------------------------------ */

interface PeerRecord {
  deviceId: string;
  pc: RTCPeerConnection;
  channel: RTCDataChannel | null;
  state: PeerState;
  channelOpen: boolean;
  lastUpdate: number;
  /** true si NOSOTROS iniciamos la oferta (rol de caller). */
  isCaller: boolean;
  /** Buffer de candidatos ICE remotos recibidos antes de setRemoteDescription. */
  pendingRemoteCandidates: RTCIceCandidateInit[];
  /** ¿Ya se aplicó una descripción remota? (para vaciar el buffer ICE). */
  hasRemoteDescription: boolean;
}

/* ------------------------------------------------------------------ */
/* initMesh — crea el mesh (o null si no hay soporte)                */
/* ------------------------------------------------------------------ */

/**
 * initMesh — inicializa el mesh para (myDeviceId, userId). Se suscribe a la
 * señalización de la cuenta y queda listo para `connectToDevice` y para RESPONDER
 * ofertas entrantes (acceptIncoming implícito). Devuelve null si no hay WebRTC.
 *
 * NUNCA lanza. Si la señalización no arranca, el mesh existe pero no podrá
 * negociar (los intentos devolverán estado 'failed' con honestidad).
 */
export function initMesh(myDeviceId: string, userId: string): MeshHandle | null {
  if (!isWebRtcSupported()) return null;
  if (!myDeviceId || !userId) return null;

  const peers = new Map<string, PeerRecord>();
  const listeners = new Set<PeerEvents>();
  let signalingSub: SignalSubscription | null = null;
  let closed = false;

  /* ---------------- utilidades internas ---------------- */

  const snapshot = (p: PeerRecord): PeerSnapshot => ({
    deviceId: p.deviceId,
    state: p.state,
    channelOpen: p.channelOpen,
    lastUpdate: p.lastUpdate,
  });

  const emitState = (p: PeerRecord) => {
    const snap = snapshot(p);
    for (const l of listeners) {
      try {
        l.onState?.(snap);
      } catch {
        /* un listener no debe tumbar a los demás */
      }
    }
  };

  const emitMessage = (deviceId: string, data: string) => {
    for (const l of listeners) {
      try {
        l.onMessage?.(deviceId, data);
      } catch {
        /* noop */
      }
    }
  };

  const setState = (p: PeerRecord, state: PeerState) => {
    if (p.state === state) return;
    p.state = state;
    p.lastUpdate = Date.now();
    emitState(p);
  };

  /** ¿Somos el "polite peer" frente a `remoteId`? Determinista por id. */
  const amPolite = (remoteId: string): boolean => myDeviceId < remoteId;

  /* ---------------- construcción de un peer ---------------- */

  const wireDataChannel = (p: PeerRecord, ch: RTCDataChannel) => {
    p.channel = ch;
    try {
      ch.onopen = () => {
        p.channelOpen = true;
        p.lastUpdate = Date.now();
        setState(p, "connected");
        emitState(p);
      };
      ch.onclose = () => {
        p.channelOpen = false;
        p.lastUpdate = Date.now();
        if (p.state !== "failed") setState(p, "closed");
        emitState(p);
      };
      ch.onerror = () => {
        p.channelOpen = false;
        p.lastUpdate = Date.now();
      };
      ch.onmessage = (ev: MessageEvent) => {
        p.lastUpdate = Date.now();
        const data = typeof ev.data === "string" ? ev.data : "";
        if (data) emitMessage(p.deviceId, data);
      };
    } catch {
      /* si el navegador no permite algún handler, seguimos defensivos */
    }
  };

  const createPeer = (deviceId: string, isCaller: boolean): PeerRecord | null => {
    try {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const p: PeerRecord = {
        deviceId,
        pc,
        channel: null,
        state: "connecting",
        channelOpen: false,
        lastUpdate: Date.now(),
        isCaller,
        pendingRemoteCandidates: [],
        hasRemoteDescription: false,
      };

      // ICE trickle: enviamos cada candidato por la cuenta.
      pc.onicecandidate = (ev: RTCPeerConnectionIceEvent) => {
        if (!ev.candidate) return; // fin de candidatos
        void sendSignal({
          from: myDeviceId,
          to: deviceId,
          kind: "ice",
          candidate: ev.candidate.toJSON ? ev.candidate.toJSON() : (ev.candidate as unknown as RTCIceCandidateInit),
          at: Date.now(),
          nonce: "",
        });
      };

      pc.onconnectionstatechange = () => {
        const cs = pc.connectionState;
        if (cs === "connected") {
          // El data channel confirma el "connected" final; aquí sólo tocamos
          // si aún no lo hizo.
          if (!p.channelOpen) setState(p, "connecting");
        } else if (cs === "failed") {
          setState(p, "failed");
        } else if (cs === "disconnected") {
          if (p.state !== "failed") setState(p, "connecting");
        } else if (cs === "closed") {
          setState(p, "closed");
        }
      };

      pc.oniceconnectionstatechange = () => {
        const is = pc.iceConnectionState;
        if (is === "failed") setState(p, "failed");
      };

      // El callee recibe el data channel creado por el caller.
      pc.ondatachannel = (ev: RTCDataChannelEvent) => {
        wireDataChannel(p, ev.channel);
      };

      if (isCaller) {
        // El caller crea el data channel (negociación estándar).
        const ch = pc.createDataChannel(DATA_CHANNEL_LABEL, { ordered: true });
        wireDataChannel(p, ch);
      }

      return p;
    } catch {
      return null;
    }
  };

  /** Vacía el buffer de candidatos ICE remotos una vez hay descripción remota. */
  const flushPendingCandidates = async (p: PeerRecord) => {
    if (!p.hasRemoteDescription) return;
    const pending = p.pendingRemoteCandidates.splice(0);
    for (const c of pending) {
      try {
        await p.pc.addIceCandidate(c);
      } catch {
        /* candidato inválido/duplicado: ignorar */
      }
    }
  };

  /* ---------------- negociación: iniciar (caller) ---------------- */

  const startOffer = async (deviceId: string): Promise<PeerRecord | null> => {
    let p = peers.get(deviceId);
    // Reintento sobre un peer fallido/cerrado: recrear limpio.
    if (p && (p.state === "failed" || p.state === "closed")) {
      try {
        p.pc.close();
      } catch {
        /* noop */
      }
      peers.delete(deviceId);
      p = undefined;
    }
    if (!p) {
      const created = createPeer(deviceId, true);
      if (!created) return null;
      p = created;
      peers.set(deviceId, p);
      emitState(p);
    }

    try {
      const offer = await p.pc.createOffer();
      await p.pc.setLocalDescription(offer);
      const ok = await sendSignal({
        from: myDeviceId,
        to: deviceId,
        kind: "offer",
        sdp: JSON.stringify(p.pc.localDescription),
        at: Date.now(),
        nonce: "",
      });
      if (!ok) setState(p, "failed");
      return p;
    } catch {
      setState(p, "failed");
      return p;
    }
  };

  /* ---------------- negociación: responder (callee) ---------------- */

  const handleOffer = async (sig: Signal) => {
    if (!sig.sdp) return;
    let desc: RTCSessionDescriptionInit | null = null;
    try {
      desc = JSON.parse(sig.sdp) as RTCSessionDescriptionInit;
    } catch {
      return;
    }
    if (!desc) return;

    let p = peers.get(sig.from);

    // Glare: si ya somos caller y llega una oferta, el "impolite" la ignora.
    if (p && p.isCaller && !amPolite(sig.from)) {
      return; // mantenemos NUESTRA oferta; el otro (polite) cederá
    }
    // Si somos polite y teníamos oferta propia, cedemos y recreamos como callee.
    if (p && p.isCaller && amPolite(sig.from)) {
      try {
        p.pc.close();
      } catch {
        /* noop */
      }
      peers.delete(sig.from);
      p = undefined;
    }

    if (!p) {
      const created = createPeer(sig.from, false);
      if (!created) return;
      p = created;
      peers.set(sig.from, p);
      emitState(p);
    }

    try {
      await p.pc.setRemoteDescription(desc);
      p.hasRemoteDescription = true;
      await flushPendingCandidates(p);

      const answer = await p.pc.createAnswer();
      await p.pc.setLocalDescription(answer);
      const ok = await sendSignal({
        from: myDeviceId,
        to: sig.from,
        kind: "answer",
        sdp: JSON.stringify(p.pc.localDescription),
        at: Date.now(),
        nonce: "",
      });
      if (!ok) setState(p, "failed");
    } catch {
      setState(p, "failed");
    }
  };

  const handleAnswer = async (sig: Signal) => {
    if (!sig.sdp) return;
    const p = peers.get(sig.from);
    if (!p) return;
    let desc: RTCSessionDescriptionInit | null = null;
    try {
      desc = JSON.parse(sig.sdp) as RTCSessionDescriptionInit;
    } catch {
      return;
    }
    if (!desc) return;
    try {
      await p.pc.setRemoteDescription(desc);
      p.hasRemoteDescription = true;
      await flushPendingCandidates(p);
    } catch {
      setState(p, "failed");
    }
  };

  const handleIce = async (sig: Signal) => {
    if (!sig.candidate) return;
    const p = peers.get(sig.from);
    if (!p) return;
    // Si aún no tenemos descripción remota, bufferizamos el candidato.
    if (!p.hasRemoteDescription) {
      p.pendingRemoteCandidates.push(sig.candidate);
      return;
    }
    try {
      await p.pc.addIceCandidate(sig.candidate);
    } catch {
      /* candidato inválido/duplicado: ignorar */
    }
  };

  const handleBye = (sig: Signal) => {
    const p = peers.get(sig.from);
    if (!p) return;
    try {
      p.pc.close();
    } catch {
      /* noop */
    }
    p.channelOpen = false;
    setState(p, "closed");
  };

  /* ---------------- despacho de señales entrantes ---------------- */

  const onSignal = (sig: Signal) => {
    if (closed) return;
    switch (sig.kind) {
      case "offer":
        void handleOffer(sig);
        break;
      case "answer":
        void handleAnswer(sig);
        break;
      case "ice":
        void handleIce(sig);
        break;
      case "bye":
        handleBye(sig);
        break;
      default:
        break;
    }
  };

  /* ---------------- arranque de la señalización ---------------- */

  let signalingTransport: "realtime" | "polling" | "none" = "none";
  void (async () => {
    try {
      const sub = await subscribeSignals(userId, myDeviceId, onSignal);
      if (closed) {
        sub.unsubscribe();
        return;
      }
      signalingSub = sub;
      // El getter `signalingTransport` del handle refleja esta variable.
      signalingTransport = sub.transport;
    } catch {
      signalingTransport = "none";
    }
  })();

  /* ---------------- API pública del handle ---------------- */

  const connectToDevice = async (targetDeviceId: string): Promise<PeerSnapshot> => {
    if (closed || !targetDeviceId || targetDeviceId === myDeviceId) {
      return {
        deviceId: targetDeviceId,
        state: "failed",
        channelOpen: false,
        lastUpdate: Date.now(),
      };
    }
    const existing = peers.get(targetDeviceId);
    if (existing && (existing.state === "connected" || existing.state === "connecting")) {
      return snapshot(existing);
    }
    const p = await startOffer(targetDeviceId);
    if (!p) {
      return {
        deviceId: targetDeviceId,
        state: "failed",
        channelOpen: false,
        lastUpdate: Date.now(),
      };
    }
    return snapshot(p);
  };

  const onPeer = (events: PeerEvents): (() => void) => {
    listeners.add(events);
    // Entrega inmediata del estado actual (para pintar sin esperar cambios).
    for (const p of peers.values()) {
      try {
        events.onState?.(snapshot(p));
      } catch {
        /* noop */
      }
    }
    return () => {
      listeners.delete(events);
    };
  };

  const sendToPeer = (deviceId: string, data: string): boolean => {
    const p = peers.get(deviceId);
    if (!p || !p.channel || !p.channelOpen) return false;
    try {
      p.channel.send(data);
      p.lastUpdate = Date.now();
      return true;
    } catch {
      return false;
    }
  };

  const broadcast = (data: string): number => {
    let n = 0;
    for (const p of peers.values()) {
      if (sendToPeer(p.deviceId, data)) n++;
    }
    return n;
  };

  const getPeers = (): PeerSnapshot[] => Array.from(peers.values()).map(snapshot);

  const closeMesh = () => {
    if (closed) return;
    closed = true;
    // Avisar a los peers (best-effort) y cerrar conexiones.
    for (const p of peers.values()) {
      try {
        void sendSignal({ from: myDeviceId, to: p.deviceId, kind: "bye", at: Date.now(), nonce: "" });
      } catch {
        /* noop */
      }
      try {
        p.channel?.close();
      } catch {
        /* noop */
      }
      try {
        p.pc.close();
      } catch {
        /* noop */
      }
    }
    peers.clear();
    listeners.clear();
    try {
      signalingSub?.unsubscribe();
    } catch {
      /* noop */
    }
    signalingSub = null;
  };

  const handle: MeshHandle = {
    myDeviceId,
    userId,
    supported: true,
    get signalingTransport() {
      return signalingTransport;
    },
    connectToDevice,
    onPeer,
    sendToPeer,
    broadcast,
    getPeers,
    closeMesh,
  };

  return handle;
}

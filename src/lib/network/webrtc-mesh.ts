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
 *
 * (Ola 370) `initMesh` es ahora un envoltorio fino sobre `createMesh`, el
 * NÚCLEO de negociación (glare/ICE-buffer/backoff) hecho independiente del
 * TRANSPORTE de señalización (`SignalTransport`): `vinculos-entre-cuentas.ts`
 * lo reutiliza con `par-signaling.ts` para el vínculo ENTRE cuentas, sin
 * duplicar esta lógica ni tocar el comportamiento de `initMesh`. Ver
 * `architecture/vinculos-entre-cuentas.md` §3.
 */

import { subscribeSignals, sendSignal, type Signal, type SignalSubscription } from "@/lib/network/signaling";

/**
 * SignalTransport — el contrato mínimo que el núcleo de conexión (`createMesh`,
 * Ola 370) necesita de un transporte de señalización: enviar una señal y
 * suscribirse a las dirigidas a `self`. `initMesh` (intra-cuenta, sin cambios
 * de comportamiento) lo satisface con `sendSignal`/`subscribeSignals` de
 * `signaling.ts`; el vínculo ENTRE CUENTAS (`vinculos-entre-cuentas.ts`) lo
 * satisface con `par-signaling.ts` (canal por topic derivado + HMAC) — misma
 * lógica de negociación (glare, buffer de ICE, reintento con backoff) para
 * los dos casos, sin duplicarla.
 */
export interface SignalTransport {
  send: (sig: Signal) => Promise<boolean>;
  subscribe: (self: string, cb: (sig: Signal) => void) => Promise<SignalSubscription>;
}

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
  /** Motivo honesto de un estado 'failed' (Ola 366), para mostrar en la UI. */
  reason?: string;
  /** Nº de intentos de oferta ya hechos (retry con backoff). */
  attempts?: number;
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
  /**
   * Bytes en cola sin enviar todavía en el data channel de `deviceId`
   * (`RTCDataChannel.bufferedAmount`). 0 si no hay canal/peer (nunca lanza).
   * Aditivo (Ola 369) y OPCIONAL a propósito: los `MeshHandle` de mentira que
   * ya construían otras pruebas (`capas-efectos.test.ts`,
   * `conciencia-colectiva.test.ts`) no lo implementan y no deben romperse.
   * Permite backpressure real a quien envíe mensajes grandes (p. ej.
   * `archivos-malla.ts`) sin tener que tocar el envío en sí.
  */
  bufferedAmount?: (deviceId: string) => number;
  /**
   * Estadísticas WebRTC reales del enlace con `deviceId`. Devuelve null si no
   * existe el peer o el navegador falla al medirlo; nunca lanza. Es OPCIONAL
   * para conservar compatibles los `MeshHandle` falsos de otras pruebas.
   */
  getStats?: (deviceId: string) => Promise<RTCStatsReport | null>;
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

/** Sin respuesta (ni canal abierto) pasado esto tras una oferta ⇒ reintento. */
const OFFER_TIMEOUT_MS = 15_000;
/** Backoff entre reintentos (ms), uno por intento adicional (índice = intento-1). */
const RETRY_BACKOFF_MS = [3_000, 6_000, 12_000];
/** Máximo de intentos de oferta (el primero + reintentos) antes de 'fallida'. */
const MAX_OFFER_ATTEMPTS = RETRY_BACKOFF_MS.length + 1;

/**
 * ¿Soy el peer "cortés" frente a `remoteId`? Determinista por comparación
 * lexicográfica de ids (el de id MENOR cede en un glare de ofertas cruzadas).
 * Exportada (Ola 366) para poder probarla sin montar RTCPeerConnection.
 */
export function esCortes(miId: string, remoteId: string): boolean {
  return miId < remoteId;
}

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
  /** Motivo honesto del último 'failed' (timeout, ICE, señalización…). */
  reason?: string;
  /** Nº de ofertas ya enviadas a este peer (para el backoff). */
  attempts: number;
  /** Temporizador de "sin respuesta a los OFFER_TIMEOUT_MS" en vuelo. */
  offerTimer: ReturnType<typeof setTimeout> | null;
  /** Temporizador de reintento con backoff en vuelo. */
  retryTimer: ReturnType<typeof setTimeout> | null;
}

/* ------------------------------------------------------------------ */
/* initMesh — crea el mesh (o null si no hay soporte)                */
/* ------------------------------------------------------------------ */

/**
 * createMesh — NÚCLEO de conexión P2P (Ola 370), independiente de CÓMO viajan
 * las señales: recibe un `SignalTransport` ya resuelto en vez de asumir la
 * cuenta soberana. Contiene TODA la lógica ganada a pulso de esta capa (glare
 * determinista, buffer de ICE que adelanta a la oferta, reintento con
 * backoff — ver `architecture/malla-neuronas-autovinculo.md` §4) — un único
 * sitio que arreglar, nunca dos copias divergiendo. `initMesh` (abajo) es un
 * envoltorio fino sobre esto con el transporte de SIEMPRE (sin cambio de
 * comportamiento); `vinculos-entre-cuentas.ts` lo reutiliza con
 * `par-signaling.ts` para el vínculo ENTRE cuentas.
 *
 * `contextId` es un identificador de diagnóstico (aparece en `MeshHandle.
 * userId`) — para `initMesh` es el uid de la cuenta; para un mesh de par es
 * el id del vínculo. No participa en la negociación.
 *
 * NUNCA lanza. Si la señalización no arranca, el mesh existe pero no podrá
 * negociar (los intentos devolverán estado 'failed' con honestidad).
 */
export function createMesh(myDeviceId: string, contextId: string, transport: SignalTransport): MeshHandle | null {
  if (!isWebRtcSupported()) return null;
  if (!myDeviceId || !contextId) return null;

  const peers = new Map<string, PeerRecord>();
  const listeners = new Set<PeerEvents>();
  let signalingSub: SignalSubscription | null = null;
  let closed = false;
  /**
   * Candidatos ICE de un `deviceId` que llegaron ANTES de que existiera
   * cualquier PeerRecord para él (p. ej. reordenado del transporte de
   * señalización: el ICE adelanta a la oferta). Antes `handleIce` los
   * descartaba sin más (`if (!p) return`) — ahora se guardan aquí y se drenan
   * en cuanto se crea el peer (que los mueve a `pendingRemoteCandidates`, el
   * buffer que ya existía para "peer sí pero sin descripción remota aún").
   */
  const pendingIceBeforePeer = new Map<string, RTCIceCandidateInit[]>();
  /**
   * Intentos de oferta por `deviceId`, FUERA del PeerRecord (Ola 366): un
   * reintento recrea el `RTCPeerConnection` (necesario: un `pc` fallido no se
   * reutiliza), pero el CONTADOR debe sobrevivir a esa recreación para que el
   * backoff y el tope de `MAX_OFFER_ATTEMPTS` cuenten intentos de verdad, no
   * "intentos por objeto". Un `connectToDevice` MANUAL sobre un peer ya
   * agotado (sin reintento en vuelo) lo resetea — es un intento nuevo, no una
   * continuación del backoff.
   */
  const attemptsByDevice = new Map<string, number>();

  /* ---------------- utilidades internas ---------------- */

  const snapshot = (p: PeerRecord): PeerSnapshot => ({
    deviceId: p.deviceId,
    state: p.state,
    channelOpen: p.channelOpen,
    lastUpdate: p.lastUpdate,
    ...(p.reason ? { reason: p.reason } : {}),
    attempts: p.attempts,
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

  const clearPeerTimers = (p: PeerRecord) => {
    if (p.offerTimer) {
      clearTimeout(p.offerTimer);
      p.offerTimer = null;
    }
    if (p.retryTimer) {
      clearTimeout(p.retryTimer);
      p.retryTimer = null;
    }
  };

  const setState = (p: PeerRecord, state: PeerState, reason?: string) => {
    if (state === "connected" || state === "closed") clearPeerTimers(p);
    if (p.state === state && reason === p.reason) return;
    p.state = state;
    p.lastUpdate = Date.now();
    if (reason !== undefined) p.reason = reason;
    else if (state === "connected") p.reason = undefined; // éxito: limpia el motivo del intento anterior
    emitState(p);
  };

  /** ¿Somos el "polite peer" frente a `remoteId`? Determinista por id. */
  const amPolite = (remoteId: string): boolean => esCortes(myDeviceId, remoteId);

  /**
   * scheduleRetryOrFail — un intento (oferta enviada pero sin respuesta a los
   * OFFER_TIMEOUT_MS, o el `pc`/ICE reportó 'failed') se marca 'failed' con un
   * motivo HONESTO. Si somos el caller y aún quedan intentos, se reintenta con
   * backoff creciente (RETRY_BACKOFF_MS); agotados los intentos (o si no somos
   * el caller: solo el caller reintenta, el callee simplemente espera la
   * próxima oferta), se queda 'failed' con el motivo y el nº de intentos.
   */
  const scheduleRetryOrFail = (p: PeerRecord, reason: string) => {
    if (closed || p.state === "connected") return;
    clearPeerTimers(p);
    const attempts = attemptsByDevice.get(p.deviceId) ?? p.attempts;
    p.attempts = attempts;
    if (!p.isCaller || attempts >= MAX_OFFER_ATTEMPTS) {
      const suffix = attempts > 0 ? ` (tras ${attempts} intento${attempts === 1 ? "" : "s"})` : "";
      setState(p, "failed", `${reason}${suffix}`);
      return;
    }
    setState(p, "failed", reason);
    const delay = RETRY_BACKOFF_MS[Math.min(attempts - 1, RETRY_BACKOFF_MS.length - 1)];
    p.retryTimer = setTimeout(() => {
      if (closed) return;
      void startOffer(p.deviceId);
    }, delay);
  };

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
        attempts: 0,
        offerTimer: null,
        retryTimer: null,
      };

      // Drena los candidatos ICE que llegaron para este `deviceId` ANTES de que
      // existiera este PeerRecord (ver `pendingIceBeforePeer`): antes se
      // perdían para siempre; ahora entran al buffer normal y se aplican en
      // cuanto haya descripción remota, igual que cualquier otro candidato.
      const early = pendingIceBeforePeer.get(deviceId);
      if (early?.length) {
        p.pendingRemoteCandidates.push(...early);
        pendingIceBeforePeer.delete(deviceId);
      }

      // ICE trickle: enviamos cada candidato por el transporte de señalización.
      pc.onicecandidate = (ev: RTCPeerConnectionIceEvent) => {
        if (!ev.candidate) return; // fin de candidatos
        void transport.send({
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
          scheduleRetryOrFail(p, "La conexión ICE falló (posible NAT simétrico sin TURN)");
        } else if (cs === "disconnected") {
          if (p.state !== "failed") setState(p, "connecting");
        } else if (cs === "closed") {
          setState(p, "closed");
        }
      };

      pc.oniceconnectionstatechange = () => {
        const is = pc.iceConnectionState;
        if (is === "failed") scheduleRetryOrFail(p, "La conexión ICE falló (posible NAT simétrico sin TURN)");
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

    clearPeerTimers(p);
    const attempts = (attemptsByDevice.get(deviceId) ?? 0) + 1;
    attemptsByDevice.set(deviceId, attempts);
    p.attempts = attempts;

    try {
      const offer = await p.pc.createOffer();
      await p.pc.setLocalDescription(offer);
      const ok = await transport.send({
        from: myDeviceId,
        to: deviceId,
        kind: "offer",
        sdp: JSON.stringify(p.pc.localDescription),
        at: Date.now(),
        nonce: "",
      });
      if (!ok) {
        scheduleRetryOrFail(p, "No se pudo enviar la oferta por la señalización de la cuenta");
        return p;
      }
      // Sin respuesta (ni ICE ni canal abierto) a los OFFER_TIMEOUT_MS ⇒ se
      // trata como una oferta perdida y se reintenta con backoff (antes se
      // quedaba "connecting" para siempre, sin ningún reintento).
      p.offerTimer = setTimeout(() => {
        if (p!.state !== "connected") scheduleRetryOrFail(p!, "Sin respuesta a la oferta (offer timeout)");
      }, OFFER_TIMEOUT_MS);
      return p;
    } catch {
      scheduleRetryOrFail(p, "Error local al crear la oferta (createOffer/setLocalDescription)");
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
      const ok = await transport.send({
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
      scheduleRetryOrFail(p, "No se pudo aplicar la respuesta (setRemoteDescription)");
    }
  };

  const handleIce = async (sig: Signal) => {
    if (!sig.candidate) return;
    const p = peers.get(sig.from);
    if (!p) {
      // Fix Ola 366: el ICE puede adelantar a la oferta (reordenado del
      // transporte de señalización — más probable en el fallback de polling).
      // ANTES: `if (!p) return` lo descartaba para siempre; el peer se creaba
      // luego (al procesar la oferta) SIN ese candidato, perdiendo una ruta
      // válida y a veces la ÚNICA con NAT difícil. Ahora se guarda aquí y
      // `createPeer` lo drena en cuanto exista el PeerRecord.
      const buf = pendingIceBeforePeer.get(sig.from) ?? [];
      buf.push(sig.candidate);
      pendingIceBeforePeer.set(sig.from, buf);
      return;
    }
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
    pendingIceBeforePeer.delete(sig.from);
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
      const sub = await transport.subscribe(myDeviceId, onSignal);
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
    // Ya hay un reintento con backoff EN VUELO para este peer: no dupliques la
    // oferta, solo devuelve el estado actual (la UI lo verá progresar solo).
    if (existing?.retryTimer) {
      return snapshot(existing);
    }
    // Petición MANUAL sobre un peer agotado (failed/closed, sin backoff en
    // vuelo): es un intento NUEVO, no la continuación del automático → resetea
    // el contador de intentos para que tenga sus MAX_OFFER_ATTEMPTS completos.
    if (existing && (existing.state === "failed" || existing.state === "closed")) {
      attemptsByDevice.delete(targetDeviceId);
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

  const bufferedAmount = (deviceId: string): number => {
    try {
      return peers.get(deviceId)?.channel?.bufferedAmount ?? 0;
    } catch {
      return 0;
    }
  };

  const getStats = async (deviceId: string): Promise<RTCStatsReport | null> => {
    try {
      const peer = peers.get(deviceId);
      return peer ? await peer.pc.getStats() : null;
    } catch {
      return null;
    }
  };

  const getPeers = (): PeerSnapshot[] => Array.from(peers.values()).map(snapshot);

  const closeMesh = () => {
    if (closed) return;
    closed = true;
    // Avisar a los peers (best-effort) y cerrar conexiones.
    for (const p of peers.values()) {
      clearPeerTimers(p);
      try {
        void transport.send({ from: myDeviceId, to: p.deviceId, kind: "bye", at: Date.now(), nonce: "" });
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
    pendingIceBeforePeer.clear();
    attemptsByDevice.clear();
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
    userId: contextId,
    supported: true,
    get signalingTransport() {
      return signalingTransport;
    },
    connectToDevice,
    onPeer,
    sendToPeer,
    broadcast,
    bufferedAmount,
    getStats,
    getPeers,
    closeMesh,
  };

  return handle;
}

/**
 * initMesh — inicializa el mesh para (myDeviceId, userId): envoltorio fino
 * sobre `createMesh` con el transporte de SIEMPRE (`sendSignal`/
 * `subscribeSignals` de `signaling.ts`, la cuenta como buzón). Sin cambio de
 * comportamiento respecto a antes de la Ola 370 — es la MISMA función que ya
 * usaban `lan-sync.ts`/`malla-neuronas.ts`, ahora construida sobre el núcleo
 * compartido en vez de duplicar su lógica de negociación.
 */
export function initMesh(myDeviceId: string, userId: string): MeshHandle | null {
  if (!myDeviceId || !userId) return null;
  return createMesh(myDeviceId, userId, {
    send: sendSignal,
    subscribe: (self, cb) => subscribeSignals(userId, self, cb),
  });
}

"use client";

/*
 * cultural/audio-rooms — SALAS DE VOZ P2P REALES por biorregión / tema.
 * ---------------------------------------------------------------------------
 * VOZ REAL entre ciudadanos con WebRTC nativo (getUserMedia + RTCPeerConnection)
 * en MALLA COMPLETA (full-mesh). La señalización viaja por un canal broadcast de
 * Supabase `audio:sala:<id>` y la lista de participantes por PRESENCE del mismo
 * canal. Sin servidor de señalización de terceros, sin DDL, sin dependencias
 * nuevas (WebRTC y Web Audio son APIs nativas del navegador).
 *
 * LÍMITE HONESTO (beta comunitaria): la malla full-mesh escala bien hasta ~6
 * participantes (N·(N-1)/2 conexiones). Por encima, se rechazan nuevas
 * conexiones con honestidad. Sin TURN, tras NAT simétrico la ruta directa puede
 * no establecerse (STUN público). El estado se reporta tal cual ('failed').
 *
 * Degradación:
 *   · Permiso de micro denegado → te unes en modo SOLO ESCUCHA (recibes voz,
 *     no envías). Se indica claramente en la UI.
 *   · Sin WebRTC/Realtime → no-op honesto (handle inerte, error legible).
 *
 * Catálogo de salas: lista curada por biorregión/tema (compartida por toda la
 * red) + salas propias persistidas en `entity_state` clave "audio-rooms".
 */

import { createClient } from "@/utils/supabase/client";
import { getEntityState, setEntityState, currentUserRef } from "@/lib/sync/entity-state";
import { systemColor } from "@/lib/cultural/systems";

/* ------------------------------------------------------------------ */
/* Catálogo de salas                                                  */
/* ------------------------------------------------------------------ */

export interface AudioRoomDef {
    id: string;
    name: string;
    /** Biorregión o tema. */
    topic: string;
    systemId: string;
    description: string;
    /** true si es una sala propia (persistida en entity_state). */
    custom?: boolean;
}

/** Salas curadas por biorregión y tema (compartidas por toda la red). */
export const AUDIO_ROOM_CATALOG: AudioRoomDef[] = [
    { id: "abya-yala", name: "Ronda de Abya Yala", topic: "Biorregión andino-amazónica", systemId: "originarios", description: "Voces de los pueblos y bioregiones de América." },
    { id: "mediterraneo", name: "Ágora del Mediterráneo", topic: "Biorregión mediterránea", systemId: "europa", description: "Conversación entre orillas del mar de en medio." },
    { id: "sahel", name: "Círculo del Sahel", topic: "Biorregión saheliana", systemId: "africa", description: "Ritmo, oralidad y comunidad africana." },
    { id: "monzon", name: "Sala del Monzón", topic: "Biorregión del monzón", systemId: "asia-sur", description: "Del Índico al Himalaya: culturas del sur de Asia." },
    { id: "pacifico", name: "Voz del Pacífico", topic: "Biorregión oceánica", systemId: "oceania", description: "Navegantes y saberes de las islas del Pacífico." },
    { id: "boreal", name: "Fogata Boreal", topic: "Biorregión boreal", systemId: "eslavo", description: "Bosques del norte y estepas eurasiáticas." },
    { id: "puente-lenguas", name: "Puente de Lenguas", topic: "Tema · Intercambio de idiomas", systemId: "global", description: "Practica idiomas en vivo con hablantes nativos." },
    { id: "musica-mundo", name: "Tambores del Mundo", topic: "Tema · Música y ritmo", systemId: "global", description: "Comparte músicas y tradiciones sonoras." },
];

/** Color de una sala (por su sistema cultural). */
export function roomColor(room: AudioRoomDef): string {
    return systemColor(room.systemId);
}

/** Ref de entity_state donde el usuario guarda sus salas propias. */
async function myRoomsRef() {
    return currentUserRef();
}

/** Lista las salas propias del usuario (persistidas en entity_state). Nunca lanza. */
export async function listCustomAudioRooms(): Promise<AudioRoomDef[]> {
    try {
        const ref = await myRoomsRef();
        if (!ref) return [];
        const row = await getEntityState<AudioRoomDef[]>(ref, "audio-rooms");
        const list = Array.isArray(row?.value) ? (row!.value as AudioRoomDef[]) : [];
        return list.map((r) => ({ ...r, custom: true }));
    } catch {
        return [];
    }
}

/** Crea (persiste) una sala propia. Devuelve la sala o null. Nunca lanza. */
export async function createCustomAudioRoom(input: { name: string; topic: string; systemId: string; description?: string }): Promise<AudioRoomDef | null> {
    try {
        const ref = await myRoomsRef();
        if (!ref) return null;
        const room: AudioRoomDef = {
            id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            name: input.name.trim() || "Sala sin nombre",
            topic: input.topic.trim() || "Tema libre",
            systemId: input.systemId || "global",
            description: (input.description ?? "").trim(),
            custom: true,
        };
        const current = await listCustomAudioRooms();
        await setEntityState(ref, "audio-rooms", [...current, room]);
        return room;
    } catch {
        return null;
    }
}

/* ------------------------------------------------------------------ */
/* Estado de una sala en vivo                                          */
/* ------------------------------------------------------------------ */

export type PeerConnState = "presence" | "connecting" | "connected" | "failed";

export interface RoomParticipant {
    peerId: string;
    name: string;
    avatarUrl?: string | null;
    muted: boolean;
    /** true si está hablando ahora (analizador de nivel). */
    speaking: boolean;
    isSelf: boolean;
    connection: PeerConnState;
}

export interface AudioRoomState {
    roomId: string;
    myPeerId: string;
    participants: RoomParticipant[];
    /** ¿Se concedió el micrófono? */
    micGranted: boolean;
    /** Estás en modo solo-escucha (sin micro). */
    listenOnly: boolean;
    muted: boolean;
    /** Transporte de señalización efectivo. */
    transport: "realtime" | "none";
    /** true si la sala alcanzó el tope de malla (~6). */
    full: boolean;
    /** Mensaje de error/aviso honesto (permiso denegado, sin realtime…). */
    notice?: string;
    joined: boolean;
}

export interface AudioRoomHandle {
    getState: () => AudioRoomState;
    onUpdate: (cb: (state: AudioRoomState) => void) => () => void;
    /** Silencia/activa el micro. Devuelve el nuevo estado `muted`. */
    toggleMute: () => boolean;
    /** Sale de la sala limpiamente (cierra pcs, corta micro, untrack presence). */
    leave: () => void;
}

/** Tope honesto de la malla full-mesh. */
export const MESH_MAX_PARTICIPANTS = 6;

const ICE_SERVERS: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
];

interface PeerRec {
    peerId: string;
    pc: RTCPeerConnection;
    audioEl: HTMLAudioElement | null;
    analyser: AnalyserNode | null;
    state: PeerConnState;
    speaking: boolean;
    isCaller: boolean;
    pendingIce: RTCIceCandidateInit[];
    hasRemote: boolean;
}

interface JoinOptions {
    room: AudioRoomDef;
    /** Nombre visible del participante. */
    name: string;
    avatarUrl?: string | null;
}

/** ¿WebRTC disponible? (SSR-safe). */
export function isAudioSupported(): boolean {
    if (typeof window === "undefined") return false;
    try {
        return (
            typeof (window as unknown as { RTCPeerConnection?: unknown }).RTCPeerConnection === "function" &&
            !!navigator.mediaDevices &&
            typeof navigator.mediaDevices.getUserMedia === "function"
        );
    } catch {
        return false;
    }
}

/* ------------------------------------------------------------------ */
/* joinAudioRoom — abre la sala real                                  */
/* ------------------------------------------------------------------ */

/**
 * Se une a una sala de voz REAL. Nunca lanza: si algo no está disponible,
 * devuelve un handle con estado honesto (notice + joined:false donde aplique).
 */
export async function joinAudioRoom(opts: JoinOptions): Promise<AudioRoomHandle> {
    const myPeerId = `peer-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
    const listeners = new Set<(s: AudioRoomState) => void>();
    const peers = new Map<string, PeerRec>();
    let presenceRoster: Record<string, { name: string; avatarUrl?: string | null; muted: boolean }> = {};

    const state: AudioRoomState = {
        roomId: opts.room.id,
        myPeerId,
        participants: [],
        micGranted: false,
        listenOnly: false,
        muted: false,
        transport: "none",
        full: false,
        joined: false,
    };

    // ── Handle inerte si no hay soporte ──
    if (!isAudioSupported()) {
        state.notice = "Tu navegador no soporta voz P2P (WebRTC).";
        return inertHandle(state, listeners);
    }

    let localStream: MediaStream | null = null;
    let audioCtx: AudioContext | null = null;
    let selfAnalyser: AnalyserNode | null = null;
    let levelTimer: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    const supabase = createClient();
    const channel = supabase.channel(`audio:sala:${opts.room.id}`, {
        config: { presence: { key: myPeerId }, broadcast: { self: false } },
    });

    /* ---------------- emisión de estado ---------------- */

    const rebuildParticipants = () => {
        const list: RoomParticipant[] = [];
        // Yo primero.
        list.push({
            peerId: myPeerId,
            name: opts.name || "Tú",
            avatarUrl: opts.avatarUrl ?? null,
            muted: state.muted,
            speaking: !state.muted && !!selfSpeaking,
            isSelf: true,
            connection: "connected",
        });
        for (const [peerId, meta] of Object.entries(presenceRoster)) {
            if (peerId === myPeerId) continue;
            const rec = peers.get(peerId);
            list.push({
                peerId,
                name: meta.name || "Ciudadano",
                avatarUrl: meta.avatarUrl ?? null,
                muted: meta.muted,
                speaking: !!rec?.speaking && !meta.muted,
                isSelf: false,
                connection: rec?.state ?? "presence",
            });
        }
        state.participants = list;
        state.full = list.length >= MESH_MAX_PARTICIPANTS;
    };

    const emit = () => {
        rebuildParticipants();
        const snapshot: AudioRoomState = { ...state, participants: state.participants.slice() };
        for (const l of listeners) {
            try {
                l(snapshot);
            } catch {
                /* un listener no tumba a los demás */
            }
        }
    };

    let selfSpeaking = false;

    /* ---------------- Web Audio: nivel de voz ---------------- */

    const ensureAudioCtx = (): AudioContext | null => {
        if (audioCtx) return audioCtx;
        try {
            const Ctor = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext });
            const AC = Ctor.AudioContext || Ctor.webkitAudioContext;
            if (!AC) return null;
            audioCtx = new AC();
            return audioCtx;
        } catch {
            return null;
        }
    };

    const analyserFromStream = (stream: MediaStream): AnalyserNode | null => {
        const ctx = ensureAudioCtx();
        if (!ctx) return null;
        try {
            const src = ctx.createMediaStreamSource(stream);
            const an = ctx.createAnalyser();
            an.fftSize = 512;
            an.smoothingTimeConstant = 0.6;
            src.connect(an);
            return an;
        } catch {
            return null;
        }
    };

    const rms = (an: AnalyserNode): number => {
        try {
            const buf = new Uint8Array(an.frequencyBinCount);
            an.getByteTimeDomainData(buf);
            let sum = 0;
            for (let i = 0; i < buf.length; i++) {
                const v = (buf[i] - 128) / 128;
                sum += v * v;
            }
            return Math.sqrt(sum / buf.length);
        } catch {
            return 0;
        }
    };

    const SPEAK_THRESHOLD = 0.045;

    const startLevelLoop = () => {
        if (levelTimer) return;
        levelTimer = setInterval(() => {
            if (closed) return;
            let changed = false;
            // Yo.
            if (selfAnalyser && !state.muted) {
                const sp = rms(selfAnalyser) > SPEAK_THRESHOLD;
                if (sp !== selfSpeaking) {
                    selfSpeaking = sp;
                    changed = true;
                }
            } else if (selfSpeaking) {
                selfSpeaking = false;
                changed = true;
            }
            // Remotos.
            for (const rec of peers.values()) {
                if (!rec.analyser) continue;
                const sp = rms(rec.analyser) > SPEAK_THRESHOLD;
                if (sp !== rec.speaking) {
                    rec.speaking = sp;
                    changed = true;
                }
            }
            if (changed) emit();
        }, 120);
    };

    /* ---------------- micrófono ---------------- */

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        state.micGranted = true;
        selfAnalyser = analyserFromStream(localStream);
    } catch {
        // Permiso denegado / sin dispositivo → modo solo escucha.
        state.micGranted = false;
        state.listenOnly = true;
        state.notice = "Micrófono no disponible: entras en modo solo escucha.";
    }

    /* ---------------- construcción de peers ---------------- */

    const amCaller = (remoteId: string): boolean => myPeerId < remoteId;

    const attachRemote = (rec: PeerRec, stream: MediaStream) => {
        try {
            let el = rec.audioEl;
            if (!el) {
                el = document.createElement("audio");
                el.autoplay = true;
                (el as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
                el.style.display = "none";
                document.body.appendChild(el);
                rec.audioEl = el;
            }
            el.srcObject = stream;
            void el.play().catch(() => {});
            rec.analyser = analyserFromStream(stream);
        } catch {
            /* noop */
        }
    };

    const setPeerState = (rec: PeerRec, s: PeerConnState) => {
        if (rec.state === s) return;
        rec.state = s;
        emit();
    };

    const createPeer = (peerId: string, isCaller: boolean): PeerRec | null => {
        try {
            const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
            const rec: PeerRec = {
                peerId,
                pc,
                audioEl: null,
                analyser: null,
                state: "connecting",
                speaking: false,
                isCaller,
                pendingIce: [],
                hasRemote: false,
            };

            // Enviar mi audio (o recvonly si no hay micro).
            if (localStream) {
                for (const track of localStream.getAudioTracks()) {
                    pc.addTrack(track, localStream);
                }
            } else {
                try {
                    pc.addTransceiver("audio", { direction: "recvonly" });
                } catch {
                    /* noop */
                }
            }

            pc.onicecandidate = (ev) => {
                if (!ev.candidate) return;
                void channel.send({
                    type: "broadcast",
                    event: "rtc",
                    payload: { kind: "ice", from: myPeerId, to: peerId, candidate: ev.candidate.toJSON ? ev.candidate.toJSON() : ev.candidate },
                });
            };
            pc.ontrack = (ev) => {
                const stream = ev.streams[0] ?? new MediaStream([ev.track]);
                attachRemote(rec, stream);
            };
            pc.onconnectionstatechange = () => {
                const cs = pc.connectionState;
                if (cs === "connected") setPeerState(rec, "connected");
                else if (cs === "failed") setPeerState(rec, "failed");
                else if (cs === "closed") setPeerState(rec, "failed");
            };

            return rec;
        } catch {
            return null;
        }
    };

    const flushIce = async (rec: PeerRec) => {
        if (!rec.hasRemote) return;
        const pending = rec.pendingIce.splice(0);
        for (const c of pending) {
            try {
                await rec.pc.addIceCandidate(c);
            } catch {
                /* candidato inválido: ignorar */
            }
        }
    };

    const startOffer = async (peerId: string) => {
        if (peers.size >= MESH_MAX_PARTICIPANTS) return; // malla llena
        if (peers.has(peerId)) return;
        const rec = createPeer(peerId, true);
        if (!rec) return;
        peers.set(peerId, rec);
        emit();
        try {
            const offer = await rec.pc.createOffer();
            await rec.pc.setLocalDescription(offer);
            await channel.send({
                type: "broadcast",
                event: "rtc",
                payload: { kind: "offer", from: myPeerId, to: peerId, sdp: JSON.stringify(rec.pc.localDescription) },
            });
        } catch {
            setPeerState(rec, "failed");
        }
    };

    const handleOffer = async (from: string, sdp: string) => {
        if (peers.size >= MESH_MAX_PARTICIPANTS && !peers.has(from)) return;
        let desc: RTCSessionDescriptionInit | null = null;
        try {
            desc = JSON.parse(sdp) as RTCSessionDescriptionInit;
        } catch {
            return;
        }
        let rec = peers.get(from);
        // Glare: si ya soy caller y no soy el "polite", ignoro su oferta.
        if (rec && rec.isCaller && !amCaller(from)) return;
        if (!rec) {
            const created = createPeer(from, false);
            if (!created) return;
            rec = created;
            peers.set(from, rec);
            emit();
        }
        try {
            await rec.pc.setRemoteDescription(desc);
            rec.hasRemote = true;
            await flushIce(rec);
            const answer = await rec.pc.createAnswer();
            await rec.pc.setLocalDescription(answer);
            await channel.send({
                type: "broadcast",
                event: "rtc",
                payload: { kind: "answer", from: myPeerId, to: from, sdp: JSON.stringify(rec.pc.localDescription) },
            });
        } catch {
            setPeerState(rec, "failed");
        }
    };

    const handleAnswer = async (from: string, sdp: string) => {
        const rec = peers.get(from);
        if (!rec) return;
        try {
            const desc = JSON.parse(sdp) as RTCSessionDescriptionInit;
            await rec.pc.setRemoteDescription(desc);
            rec.hasRemote = true;
            await flushIce(rec);
        } catch {
            setPeerState(rec, "failed");
        }
    };

    const handleIce = async (from: string, candidate: RTCIceCandidateInit) => {
        const rec = peers.get(from);
        if (!rec) return;
        if (!rec.hasRemote) {
            rec.pendingIce.push(candidate);
            return;
        }
        try {
            await rec.pc.addIceCandidate(candidate);
        } catch {
            /* noop */
        }
    };

    const dropPeer = (peerId: string) => {
        const rec = peers.get(peerId);
        if (!rec) return;
        try {
            rec.pc.close();
        } catch {
            /* noop */
        }
        try {
            if (rec.audioEl) {
                rec.audioEl.srcObject = null;
                rec.audioEl.remove();
            }
        } catch {
            /* noop */
        }
        peers.delete(peerId);
    };

    /* ---------------- presence + broadcast ---------------- */

    const recomputeRoster = () => {
        try {
            const raw = channel.presenceState() as Record<string, Array<Record<string, unknown>>>;
            const next: typeof presenceRoster = {};
            for (const [key, metas] of Object.entries(raw)) {
                const meta = (metas && metas[0]) || {};
                next[key] = {
                    name: String(meta.name ?? "Ciudadano"),
                    avatarUrl: (meta.avatarUrl as string) ?? null,
                    muted: !!meta.muted,
                };
            }
            presenceRoster = next;

            // Conectar con peers nuevos si soy el "caller" y hay hueco.
            for (const peerId of Object.keys(next)) {
                if (peerId === myPeerId) continue;
                if (!peers.has(peerId) && amCaller(peerId) && peers.size < MESH_MAX_PARTICIPANTS) {
                    void startOffer(peerId);
                }
            }
            // Limpiar peers que se fueron.
            for (const peerId of Array.from(peers.keys())) {
                if (!next[peerId]) dropPeer(peerId);
            }
            emit();
        } catch {
            emit();
        }
    };

    channel.on("presence", { event: "sync" }, recomputeRoster);
    channel.on("presence", { event: "join" }, recomputeRoster);
    channel.on("presence", { event: "leave" }, recomputeRoster);
    channel.on("broadcast", { event: "rtc" }, (msg: { payload?: Record<string, unknown> }) => {
        const p = msg?.payload;
        if (!p || typeof p !== "object") return;
        const to = String(p.to ?? "");
        const from = String(p.from ?? "");
        if (to !== myPeerId || from === myPeerId) return;
        const kind = String(p.kind ?? "");
        if (kind === "offer" && typeof p.sdp === "string") void handleOffer(from, p.sdp);
        else if (kind === "answer" && typeof p.sdp === "string") void handleAnswer(from, p.sdp);
        else if (kind === "ice" && p.candidate) void handleIce(from, p.candidate as RTCIceCandidateInit);
    });

    // Suscripción + track de presence.
    try {
        const ok = await new Promise<boolean>((resolve) => {
            let settled = false;
            const done = (v: boolean) => {
                if (settled) return;
                settled = true;
                resolve(v);
            };
            const timer = setTimeout(() => done(false), 5000);
            try {
                channel.subscribe((status) => {
                    const s = String(status);
                    if (s === "SUBSCRIBED") {
                        clearTimeout(timer);
                        done(true);
                    } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
                        clearTimeout(timer);
                        done(false);
                    }
                });
            } catch {
                clearTimeout(timer);
                done(false);
            }
        });

        if (ok) {
            state.transport = "realtime";
            state.joined = true;
            await channel.track({ name: opts.name || "Ciudadano", avatarUrl: opts.avatarUrl ?? null, muted: state.muted });
            startLevelLoop();
        } else {
            state.transport = "none";
            state.notice = state.notice ?? "No se pudo abrir el canal de la sala (Realtime no disponible aquí).";
            try {
                supabase.removeChannel(channel);
            } catch {
                /* noop */
            }
        }
    } catch {
        state.transport = "none";
        state.notice = state.notice ?? "No se pudo unir a la sala.";
    }

    emit();

    /* ---------------- API pública ---------------- */

    const toggleMute = (): boolean => {
        state.muted = !state.muted;
        if (localStream) {
            for (const track of localStream.getAudioTracks()) track.enabled = !state.muted;
        }
        void channel.track({ name: opts.name || "Ciudadano", avatarUrl: opts.avatarUrl ?? null, muted: state.muted }).catch(() => {});
        emit();
        return state.muted;
    };

    const leave = () => {
        if (closed) return;
        closed = true;
        if (levelTimer) {
            clearInterval(levelTimer);
            levelTimer = null;
        }
        for (const peerId of Array.from(peers.keys())) dropPeer(peerId);
        try {
            void channel.untrack();
        } catch {
            /* noop */
        }
        try {
            supabase.removeChannel(channel);
        } catch {
            /* noop */
        }
        if (localStream) {
            for (const track of localStream.getTracks()) {
                try {
                    track.stop();
                } catch {
                    /* noop */
                }
            }
            localStream = null;
        }
        try {
            void audioCtx?.close();
        } catch {
            /* noop */
        }
        state.joined = false;
        emit();
        listeners.clear();
    };

    return {
        getState: () => ({ ...state, participants: state.participants.slice() }),
        onUpdate: (cb) => {
            listeners.add(cb);
            try {
                cb({ ...state, participants: state.participants.slice() });
            } catch {
                /* noop */
            }
            return () => listeners.delete(cb);
        },
        toggleMute,
        leave,
    };
}

/** Handle inerte (sin soporte): expone el estado con el aviso, no hace nada. */
function inertHandle(state: AudioRoomState, listeners: Set<(s: AudioRoomState) => void>): AudioRoomHandle {
    return {
        getState: () => ({ ...state, participants: [] }),
        onUpdate: (cb) => {
            listeners.add(cb);
            try {
                cb({ ...state, participants: [] });
            } catch {
                /* noop */
            }
            return () => listeners.delete(cb);
        },
        toggleMute: () => state.muted,
        leave: () => listeners.clear(),
    };
}

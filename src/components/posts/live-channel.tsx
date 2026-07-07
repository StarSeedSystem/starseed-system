"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * LiveChannel — CANAL EN VIVO de un adjunto de publicación
 * ---------------------------------------------------------------------------
 * El autor "transmite" actualizaciones de un contenido a quien mire la
 * publicación:
 *
 *   · Estado compartido (texto/imagen/"en vivo") — `useServerChannel` ya
 *     existente: persistido en `entity_state` + baja latencia por broadcast.
 *   · Espectadores — contador en vivo vía Presence de Supabase Realtime
 *     (canal aparte `presence:srv:<id>`, no interfiere con el de estado).
 *   · Chat ligero — EFÍMERO (broadcast puro, sin historial ni tabla nueva):
 *     honesto por diseño, no promete persistencia que no existe.
 *   · Audio/pantalla compartida — toggle EXPERIMENTAL: WebRTC simple (mesh
 *     1 emisor → pocos espectadores), señalización por un canal de broadcast
 *     dedicado (`rtc:srv:<id>`). Puede no funcionar en redes con NAT estricto;
 *     se marca claramente como experimental y nunca bloquea el resto del canal
 *     (estado/chat siguen funcionando aunque el audio/pantalla falle).
 *
 * Compartir por mensaje: reutiliza el MISMO flujo que `ServerCard`
 * (`/messages?attachServer=<slug>`), ya leído por el módulo de Mensajes — no
 * se toca ese módulo.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
    Radio, Eye, MessageCircle, SendHorizontal, Mic, MicOff, ScreenShare, ScreenShareOff,
    Crown, Wifi, WifiOff, PlayCircle, StopCircle, AlertTriangle, Share2,
    Image as ImageIcon,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { useServerChannel } from "@/lib/servers/server-channel";
import { fetchServerById, type AppServerSummary } from "@/lib/servers/app-servers";
import { getCurrentUserId } from "@/lib/os-social";

// ───────────────────────────── Estado compartido del canal ─────────────────

export interface LiveChannelState {
    /** Texto de estado que el autor transmite (título del momento, aviso…). */
    text: string;
    /** Imagen "refrescada" opcional (URL). */
    imageUrl?: string;
    /** ¿Está transmitiendo activamente ahora mismo? */
    live: boolean;
    updatedAt: string;
}

const DEFAULT_STATE: LiveChannelState = { text: "", imageUrl: undefined, live: false, updatedAt: "" };

interface ChatMsg {
    id: string;
    from: string;
    name: string;
    text: string;
    at: number;
}

export interface LiveChannelProps {
    serverId: string;
    serverSlug?: string;
    title?: string;
    description?: string;
    className?: string;
}

// ───────────────────────────── Hooks internos ───────────────────────────────

function useMe(): string | null {
    const [uid, setUid] = useState<string | null>(null);
    useEffect(() => {
        let alive = true;
        void getCurrentUserId().then((id) => {
            if (alive) setUid(id);
        });
        return () => {
            alive = false;
        };
    }, []);
    return uid;
}

/** Contador de espectadores vía Presence (canal aparte, no interfiere con el estado). */
function useChannelPresence(serverId: string | null, meId: string | null): number {
    const [count, setCount] = useState(0);
    useEffect(() => {
        if (!serverId || typeof window === "undefined") {
            setCount(0);
            return;
        }
        let removed = false;
        let supabase: ReturnType<typeof createClient> | null = null;
        let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;
        try {
            supabase = createClient();
            const key = meId || `anon-${Math.random().toString(36).slice(2, 10)}`;
            channel = supabase.channel(`presence:srv:${serverId}`, { config: { presence: { key } } });
            channel.on("presence", { event: "sync" }, () => {
                if (removed || !channel) return;
                try {
                    const state = channel.presenceState();
                    setCount(Object.keys(state).length);
                } catch {
                    /* degrada sin contador */
                }
            });
            channel.subscribe((status: string) => {
                if (!removed && status === "SUBSCRIBED" && channel) {
                    void channel.track({ at: Date.now() });
                }
            });
        } catch {
            setCount(0);
        }
        return () => {
            removed = true;
            try {
                if (supabase && channel) supabase.removeChannel(channel);
            } catch {
                /* limpieza best-effort */
            }
        };
    }, [serverId, meId]);
    return count;
}

/** Chat ligero EFÍMERO (broadcast puro, sin historial — honesto: no hay tabla nueva). */
function useLightChat(serverId: string | null) {
    const [messages, setMessages] = useState<ChatMsg[]>([]);
    const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
    const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

    useEffect(() => {
        setMessages([]);
        if (!serverId || typeof window === "undefined") return;
        let removed = false;
        try {
            const supabase = createClient();
            supabaseRef.current = supabase;
            const channel = supabase.channel(`chat:srv:${serverId}`, { config: { broadcast: { self: true } } });
            channel.on<ChatMsg>("broadcast", { event: "msg" }, (msg) => {
                if (removed || !msg.payload) return;
                setMessages((prev) => [...prev.slice(-49), msg.payload]);
            });
            channel.subscribe();
            channelRef.current = channel;
        } catch {
            /* chat efímero: si falla, sencillamente no hay chat esta sesión */
        }
        return () => {
            removed = true;
            try {
                if (supabaseRef.current && channelRef.current) supabaseRef.current.removeChannel(channelRef.current);
            } catch {
                /* noop */
            }
        };
    }, [serverId]);

    const send = useCallback(async (msg: ChatMsg) => {
        try {
            await channelRef.current?.send({ type: "broadcast", event: "msg", payload: msg });
        } catch {
            /* mensaje efímero perdido: no es crítico */
        }
    }, []);

    return { messages, send };
}

// ── EXPERIMENTAL · audio/pantalla compartida (WebRTC simple, señalización por broadcast) ──

interface RtcSignal {
    type: "join" | "leave" | "offer" | "answer" | "ice";
    from: string;
    to?: string;
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
}

function useExperimentalMediaShare(serverId: string | null, isBroadcaster: boolean, meId: string) {
    const [active, setActive] = useState(false);
    const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
    const [error, setError] = useState<string | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const peersRef = useRef<Record<string, RTCPeerConnection>>({});
    const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);

    const send = useCallback((sig: RtcSignal) => {
        try {
            void channelRef.current?.send({ type: "broadcast", event: "rtc", payload: sig });
        } catch {
            /* señalización perdida: experimental, no crítico */
        }
    }, []);

    const makePeer = useCallback(
        (peerId: string) => {
            const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
            peersRef.current[peerId] = pc;
            pc.onicecandidate = (ev) => {
                if (ev.candidate) send({ type: "ice", from: meId, to: peerId, candidate: ev.candidate.toJSON() });
            };
            pc.ontrack = (ev) => {
                setRemoteStreams((prev) => ({ ...prev, [peerId]: ev.streams[0] }));
            };
            if (isBroadcaster && localStreamRef.current) {
                for (const track of localStreamRef.current.getTracks()) {
                    pc.addTrack(track, localStreamRef.current);
                }
            }
            return pc;
        },
        [isBroadcaster, meId, send],
    );

    useEffect(() => {
        if (!serverId || typeof window === "undefined") return;
        let removed = false;
        let supabase: ReturnType<typeof createClient> | null = null;
        try {
            supabase = createClient();
            const channel = supabase.channel(`rtc:srv:${serverId}`, { config: { broadcast: { self: false } } });
            channel.on<RtcSignal>("broadcast", { event: "rtc" }, (msg) => {
                const sig = msg?.payload;
                if (removed || !sig || sig.from === meId) return;
                if (sig.to && sig.to !== meId) return;
                void (async () => {
                    try {
                        if (sig.type === "join" && isBroadcaster && localStreamRef.current) {
                            const pc = makePeer(sig.from);
                            const offer = await pc.createOffer();
                            await pc.setLocalDescription(offer);
                            send({ type: "offer", from: meId, to: sig.from, sdp: offer });
                        } else if (sig.type === "offer" && sig.sdp) {
                            const pc = peersRef.current[sig.from] ?? makePeer(sig.from);
                            await pc.setRemoteDescription(new RTCSessionDescription(sig.sdp));
                            const answer = await pc.createAnswer();
                            await pc.setLocalDescription(answer);
                            send({ type: "answer", from: meId, to: sig.from, sdp: answer });
                        } else if (sig.type === "answer" && sig.sdp) {
                            const pc = peersRef.current[sig.from];
                            if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sig.sdp));
                        } else if (sig.type === "ice" && sig.candidate) {
                            const pc = peersRef.current[sig.from];
                            if (pc) await pc.addIceCandidate(new RTCIceCandidate(sig.candidate));
                        } else if (sig.type === "leave") {
                            peersRef.current[sig.from]?.close();
                            delete peersRef.current[sig.from];
                            setRemoteStreams((prev) => {
                                const next = { ...prev };
                                delete next[sig.from];
                                return next;
                            });
                        }
                    } catch {
                        setError("Fallo de señalización experimental (red/NAT). El canal de estado/chat sigue funcionando normalmente.");
                    }
                })();
            });
            channel.subscribe();
            channelRef.current = channel;
        } catch {
            setError("Audio/pantalla compartida no disponible en este navegador.");
        }
        return () => {
            removed = true;
            try {
                if (supabase && channelRef.current) supabase.removeChannel(channelRef.current);
            } catch {
                /* noop */
            }
            channelRef.current = null;
            for (const pc of Object.values(peersRef.current)) pc.close();
            peersRef.current = {};
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serverId, isBroadcaster, meId]);

    const startBroadcast = useCallback(
        async (opts: { audio: boolean; screen: boolean }) => {
            setError(null);
            if (typeof window === "undefined" || !navigator.mediaDevices) {
                setError("Este navegador no soporta compartir audio/pantalla.");
                return;
            }
            try {
                let stream: MediaStream | null = null;
                if (opts.screen) {
                    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: opts.audio });
                    if (opts.audio && stream.getAudioTracks().length === 0) {
                        try {
                            const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
                            mic.getAudioTracks().forEach((t) => stream!.addTrack(t));
                        } catch {
                            /* pantalla sin audio de micro: sigue solo con pantalla */
                        }
                    }
                } else if (opts.audio) {
                    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                }
                if (!stream) return;
                localStreamRef.current = stream;
                setActive(true);
                send({ type: "join", from: meId }); // avisa a espectadores ya conectados
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : "";
                setError(msg.toLowerCase().includes("permission") ? "Permiso denegado para cámara/pantalla/micrófono." : "No se pudo iniciar la transmisión experimental.");
            }
        },
        [meId, send],
    );

    const stopBroadcast = useCallback(() => {
        localStreamRef.current?.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
        setActive(false);
        send({ type: "leave", from: meId });
        for (const pc of Object.values(peersRef.current)) pc.close();
        peersRef.current = {};
        setRemoteStreams({});
    }, [meId, send]);

    const joinAsViewer = useCallback(() => {
        send({ type: "join", from: meId });
    }, [meId, send]);

    return { active, remoteStreams, error, startBroadcast, stopBroadcast, joinAsViewer, localStream: localStreamRef };
}

// ───────────────────────────── UI: chat ligero ──────────────────────────────

function ChatPanel({ serverId, meId, myName }: { serverId: string; meId: string | null; myName: string }) {
    const { messages, send } = useLightChat(serverId);
    const [draft, setDraft] = useState("");
    const listRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }, [messages.length]);

    const handleSend = () => {
        const text = draft.trim();
        if (!text) return;
        void send({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, from: meId || "anon", name: myName, text, at: Date.now() });
        setDraft("");
    };

    return (
        <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/20 p-2.5">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-white/40">
                <MessageCircle className="h-3 w-3" /> Chat en vivo (efímero, sin historial)
            </div>
            <div ref={listRef} className="max-h-32 min-h-[3rem] space-y-1 overflow-y-auto pr-1">
                {messages.length === 0 ? (
                    <p className="text-[11px] italic text-white/30">Aún no hay mensajes. Sé el primero en saludar.</p>
                ) : (
                    messages.map((m) => (
                        <div key={m.id} className="text-[11px] text-white/70">
                            <span className="font-semibold text-cyan-200">{m.name}: </span>
                            <span className="break-words">{m.text}</span>
                        </div>
                    ))
                )}
            </div>
            <div className="flex items-center gap-1.5">
                <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                    placeholder="Escribe un mensaje…"
                    className="h-8 flex-1 rounded-md border border-white/15 bg-white/[0.03] px-2 text-xs text-amber-50 placeholder:text-white/30"
                />
                <button
                    type="button"
                    onClick={handleSend}
                    disabled={!draft.trim()}
                    className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-md border border-cyan-400/30 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    <SendHorizontal className="h-3.5 w-3.5" />
                </button>
            </div>
        </div>
    );
}

// ───────────────────────────── UI: media experimental ───────────────────────

function RemoteMediaTiles({ streams }: { streams: Record<string, MediaStream> }) {
    const entries = Object.entries(streams);
    if (entries.length === 0) return null;
    return (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {entries.map(([peerId, stream]) => (
                <RemoteVideo key={peerId} stream={stream} />
            ))}
        </div>
    );
}

function RemoteVideo({ stream }: { stream: MediaStream }) {
    const ref = useRef<HTMLVideoElement | null>(null);
    useEffect(() => {
        if (ref.current) ref.current.srcObject = stream;
    }, [stream]);
    return <video ref={ref} autoPlay playsInline controls className="w-full rounded-lg border border-white/10 bg-black" />;
}

function LocalPreview({ streamRef, active }: { streamRef: { current: MediaStream | null }; active: boolean }) {
    const ref = useRef<HTMLVideoElement | null>(null);
    useEffect(() => {
        if (ref.current) ref.current.srcObject = active ? streamRef.current : null;
    }, [active, streamRef]);
    if (!active) return null;
    return <video ref={ref} autoPlay muted playsInline className="w-full rounded-lg border border-emerald-400/30 bg-black" />;
}

// ───────────────────────────── Componente raíz ──────────────────────────────

export function LiveChannel({ serverId, serverSlug, title, description, className }: LiveChannelProps) {
    const meId = useMe();
    const [server, setServer] = useState<AppServerSummary | null>(null);
    const [serverLoading, setServerLoading] = useState(true);
    const { state, setState, loaded, connected } = useServerChannel<LiveChannelState>(serverId, DEFAULT_STATE);
    const viewerCount = useChannelPresence(serverId, meId);

    const [statusDraft, setStatusDraft] = useState("");
    const [imageDraft, setImageDraft] = useState("");
    const [expOpen, setExpOpen] = useState(false);
    const [wantAudio, setWantAudio] = useState(true);
    const [wantScreen, setWantScreen] = useState(false);

    useEffect(() => {
        let alive = true;
        setServerLoading(true);
        void fetchServerById(serverId).then((s) => {
            if (alive) {
                setServer(s);
                setServerLoading(false);
            }
        });
        return () => {
            alive = false;
        };
    }, [serverId]);

    const isOwner = Boolean(server?.isOwner);
    const media = useExperimentalMediaShare(serverId, isOwner, meId || `anon-${serverId}`);

    const publishStatus = async () => {
        const text = statusDraft.trim();
        if (!text) return;
        await setState({ ...state, text, live: true, updatedAt: new Date().toISOString() });
        setStatusDraft("");
        toast.success("Estado transmitido.");
    };

    const publishImage = async () => {
        const url = imageDraft.trim();
        if (!url) return;
        await setState({ ...state, imageUrl: url, live: true, updatedAt: new Date().toISOString() });
        setImageDraft("");
        toast.success("Imagen actualizada.");
    };

    const toggleLive = async () => {
        await setState({ ...state, live: !state.live, updatedAt: new Date().toISOString() });
    };

    if (serverLoading) {
        return <div className={cn("h-40 animate-pulse rounded-xl border border-white/10 bg-white/[0.02]", className)} />;
    }
    if (!server) {
        return (
            <div className={cn("rounded-xl border border-white/10 bg-white/[0.02] p-4 text-center text-xs text-white/40", className)}>
                Este canal en vivo ya no está disponible.
            </div>
        );
    }

    return (
        <div className={cn("space-y-3 rounded-2xl border border-rose-400/20 bg-gradient-to-br from-rose-500/[0.06] to-transparent p-3.5", className)}>
            {/* Cabecera */}
            <div className="flex flex-wrap items-center gap-2">
                <span
                    className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                        state.live
                            ? "border-rose-400/40 bg-rose-500/10 text-rose-200"
                            : "border-white/15 bg-white/[0.03] text-white/40",
                    )}
                >
                    {state.live ? (
                        <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inset-0 animate-ping rounded-full bg-rose-400 opacity-70" aria-hidden />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-300" aria-hidden />
                        </span>
                    ) : (
                        <Radio className="h-3 w-3" />
                    )}
                    {state.live ? "En vivo" : "En pausa"}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-amber-50">{title || server.name}</span>
                {isOwner && (
                    <span title="Tu canal">
                        <Crown className="h-3.5 w-3.5 shrink-0 text-amber-300" />
                    </span>
                )}
                <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-white/45" title="Personas en la sala ahora">
                    <Eye className="h-3.5 w-3.5" /> {viewerCount}
                </span>
                <span title={connected ? "Baja latencia activa" : "Reconectando…"}>
                    {connected ? <Wifi className="h-3.5 w-3.5 text-emerald-300/70" /> : <WifiOff className="h-3.5 w-3.5 text-white/25" />}
                </span>
                {serverSlug && (
                    <Link
                        href={`/messages?attachServer=${encodeURIComponent(serverSlug)}`}
                        title="Compartir por mensaje"
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
                    >
                        <Share2 className="h-3.5 w-3.5" />
                    </Link>
                )}
            </div>

            {description && <p className="text-xs text-white/45">{description}</p>}

            {/* Estado transmitido */}
            {!loaded ? (
                <div className="h-20 animate-pulse rounded-lg bg-white/5" />
            ) : (
                <div className="space-y-2 rounded-xl border border-white/10 bg-black/25 p-3">
                    {state.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={state.imageUrl} alt="Estado transmitido" className="max-h-64 w-full rounded-lg object-cover" />
                    )}
                    <p className={cn("text-sm", state.text ? "text-white/85" : "italic text-white/35")}>
                        {state.text || "El autor todavía no ha transmitido ninguna actualización."}
                    </p>
                    {state.updatedAt && (
                        <p className="text-[10px] text-white/30">
                            Actualizado {new Date(state.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                    )}
                </div>
            )}

            {/* Controles del autor */}
            {isOwner && (
                <div className="space-y-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3">
                    <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-200/80">
                        <Crown className="h-3 w-3" /> Panel del emisor
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                        <input
                            value={statusDraft}
                            onChange={(e) => setStatusDraft(e.target.value)}
                            placeholder="Nuevo estado / actualización…"
                            className="h-8 min-w-[160px] flex-1 rounded-md border border-white/15 bg-white/[0.03] px-2 text-xs text-amber-50 placeholder:text-white/30"
                        />
                        <button
                            type="button"
                            onClick={() => void publishStatus()}
                            disabled={!statusDraft.trim()}
                            className="h-8 shrink-0 cursor-pointer rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            Transmitir
                        </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                        <ImageIcon className="h-3.5 w-3.5 shrink-0 text-white/40" />
                        <input
                            value={imageDraft}
                            onChange={(e) => setImageDraft(e.target.value)}
                            placeholder="URL de imagen a refrescar (opcional)…"
                            className="h-8 min-w-[160px] flex-1 rounded-md border border-white/15 bg-white/[0.03] px-2 text-xs text-amber-50 placeholder:text-white/30"
                        />
                        <button
                            type="button"
                            onClick={() => void publishImage()}
                            disabled={!imageDraft.trim()}
                            className="h-8 shrink-0 cursor-pointer rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            Actualizar imagen
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={() => void toggleLive()}
                        className={cn(
                            "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition-colors",
                            state.live
                                ? "border-white/15 text-white/60 hover:bg-white/5"
                                : "border-rose-400/40 bg-rose-400/10 text-rose-100 hover:bg-rose-400/20",
                        )}
                    >
                        {state.live ? <StopCircle className="h-3.5 w-3.5" /> : <PlayCircle className="h-3.5 w-3.5" />}
                        {state.live ? "Pausar transmisión" : "Iniciar transmisión"}
                    </button>

                    {/* Experimental: audio/pantalla compartida */}
                    <div className="rounded-lg border border-dashed border-white/15 p-2">
                        <button
                            type="button"
                            onClick={() => setExpOpen((v) => !v)}
                            className="flex w-full cursor-pointer items-center justify-between text-[11px] font-semibold text-white/50 hover:text-white/75"
                        >
                            <span className="flex items-center gap-1.5">
                                <AlertTriangle className="h-3 w-3 text-amber-300/70" /> Audio/pantalla compartida (experimental)
                            </span>
                            <span className="text-[10px] text-white/30">{expOpen ? "ocultar" : "mostrar"}</span>
                        </button>
                        {expOpen && (
                            <div className="mt-2 space-y-2">
                                <p className="text-[10px] leading-relaxed text-white/35">
                                    Señalización simple 1→pocos por el canal de la red. Puede no funcionar en redes con NAT
                                    estricto/simétrico; si falla, el estado y el chat siguen funcionando con normalidad.
                                </p>
                                <div className="flex flex-wrap items-center gap-3 text-[11px] text-white/60">
                                    <label className="flex cursor-pointer items-center gap-1.5">
                                        <input type="checkbox" checked={wantAudio} onChange={(e) => setWantAudio(e.target.checked)} />
                                        <Mic className="h-3.5 w-3.5" /> Audio
                                    </label>
                                    <label className="flex cursor-pointer items-center gap-1.5">
                                        <input type="checkbox" checked={wantScreen} onChange={(e) => setWantScreen(e.target.checked)} />
                                        <ScreenShare className="h-3.5 w-3.5" /> Pantalla
                                    </label>
                                    {!media.active ? (
                                        <button
                                            type="button"
                                            onClick={() => void media.startBroadcast({ audio: wantAudio, screen: wantScreen })}
                                            disabled={!wantAudio && !wantScreen}
                                            className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            <Mic className="h-3 w-3" /> Empezar
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={media.stopBroadcast}
                                            className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-white/15 px-2 text-[11px] font-semibold text-white/60 hover:bg-white/5"
                                        >
                                            <MicOff className="h-3 w-3" /> Detener
                                        </button>
                                    )}
                                </div>
                                {media.error && <p className="text-[10px] text-rose-300">{media.error}</p>}
                                <LocalPreview streamRef={media.localStream} active={media.active} />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Vista de espectador: unirse a audio/pantalla si el emisor está transmitiendo (experimental) */}
            {!isOwner && (
                <ExperimentalViewerJoin serverId={serverId} meId={meId} />
            )}

            {/* Chat ligero */}
            <ChatPanel serverId={serverId} meId={meId} myName={isOwner ? `${server.name} (autor)` : "Espectador"} />
        </div>
    );
}

/** Botón "Ver audio/pantalla en vivo" para espectadores (experimental, honesto). */
function ExperimentalViewerJoin({ serverId, meId }: { serverId: string; meId: string | null }) {
    const media = useExperimentalMediaShare(serverId, false, meId || `anon-${serverId}`);
    const [tried, setTried] = useState(false);
    const streams = Object.values(media.remoteStreams);

    return (
        <div className="rounded-lg border border-dashed border-white/15 p-2">
            <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-white/50">
                    <ScreenShareOff className="h-3.5 w-3.5 text-white/30" /> Audio/pantalla compartida (experimental)
                </span>
                <button
                    type="button"
                    onClick={() => {
                        setTried(true);
                        media.joinAsViewer();
                    }}
                    className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2 text-[11px] font-semibold text-cyan-100 hover:bg-cyan-400/20"
                >
                    <ScreenShare className="h-3 w-3" /> Conectar
                </button>
            </div>
            {tried && streams.length === 0 && (
                <p className="mt-1.5 text-[10px] text-white/30">
                    Esperando al emisor… si no llega nada, puede que ahora mismo no esté compartiendo audio/pantalla.
                </p>
            )}
            {media.error && <p className="mt-1.5 text-[10px] text-rose-300">{media.error}</p>}
            <div className="mt-2">
                <RemoteMediaTiles streams={media.remoteStreams} />
            </div>
        </div>
    );
}

export default LiveChannel;

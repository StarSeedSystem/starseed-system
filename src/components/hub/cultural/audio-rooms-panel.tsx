"use client";

/*
 * AudioRoomsPanel — Salas de audio cultural por biorregión (Adenda 77 · pto 7).
 * VOZ REAL P2P (WebRTC malla + señalización broadcast/presence de Supabase).
 * Lista de salas (catálogo + propias en entity_state) y sala en vivo con
 * avatares (anillo al hablar), silenciar y salir. Beta comunitaria honesta.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Radio, Mic, MicOff, PhoneOff, Users, Loader2, Plus, AudioLines, Info, Signal, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { fetchMyProfile } from "@/lib/social/os-profiles";
import { systemById, CULTURAL_SYSTEMS } from "@/lib/cultural/systems";
import {
    AUDIO_ROOM_CATALOG, listCustomAudioRooms, createCustomAudioRoom, joinAudioRoom, roomColor,
    isAudioSupported, MESH_MAX_PARTICIPANTS,
    type AudioRoomDef, type AudioRoomState, type AudioRoomHandle, type RoomParticipant,
} from "@/lib/cultural/audio-rooms";

function ParticipantAvatar({ p }: { p: RoomParticipant }) {
    const initials = (p.name || "?").slice(0, 2).toUpperCase();
    const ringColor = p.speaking ? "#34d399" : "transparent";
    return (
        <div className="flex flex-col items-center gap-1.5">
            <div
                className="relative rounded-full transition-all duration-150"
                style={{ boxShadow: p.speaking ? `0 0 0 3px ${ringColor}, 0 0 16px ${ringColor}aa` : "none" }}
            >
                <Avatar className={cn("size-14 border-2", p.isSelf ? "border-primary/60" : "border-white/15")}>
                    <AvatarImage src={p.avatarUrl || undefined} alt={p.name} />
                    <AvatarFallback className="bg-primary/15 text-sm font-bold text-primary">{initials}</AvatarFallback>
                </Avatar>
                {p.muted && (
                    <span className="absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full border border-background bg-red-500/90 text-white">
                        <MicOff className="size-3" />
                    </span>
                )}
                {!p.muted && p.speaking && (
                    <span className="absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full border border-background bg-emerald-500/90 text-white">
                        <AudioLines className="size-3" />
                    </span>
                )}
            </div>
            <p className="max-w-[5.5rem] truncate text-[11px] font-semibold text-foreground/85">{p.isSelf ? "Tú" : p.name}</p>
            <span
                className={cn(
                    "text-[9px] font-bold uppercase tracking-wider",
                    p.connection === "connected" ? "text-emerald-400" : p.connection === "failed" ? "text-red-400" : "text-muted-foreground",
                )}
            >
                {p.isSelf ? "" : p.connection === "connected" ? "conectado" : p.connection === "connecting" ? "conectando" : p.connection === "failed" ? "sin ruta" : "presente"}
            </span>
        </div>
    );
}

function LiveRoom({ room, state, onToggleMute, onLeave }: { room: AudioRoomDef; state: AudioRoomState; onToggleMute: () => void; onLeave: () => void }) {
    const sys = systemById(room.systemId);
    return (
        <div className="space-y-4 rounded-2xl border p-5 backdrop-blur" style={{ borderColor: `${sys.color}40`, background: `${sys.color}0d` }}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest" style={{ color: sys.color }}>
                        <Radio className="size-3.5" /> En directo · {room.topic}
                    </p>
                    <h4 className="text-lg font-black text-foreground">{room.name}</h4>
                </div>
                <button type="button" onClick={onLeave} className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-full bg-red-500/90 px-3.5 py-2 text-sm font-bold text-white hover:bg-red-500">
                    <PhoneOff className="size-4" /> Salir
                </button>
            </div>

            {/* Aviso honesto (beta / permiso / transporte) */}
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 font-bold text-white/70">
                    <Info className="size-3" /> Beta comunitaria · malla P2P máx {MESH_MAX_PARTICIPANTS}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 font-bold text-white/70">
                    <Signal className="size-3" /> {state.transport === "realtime" ? "Señalización en vivo" : "Sin señalización"}
                </span>
                {state.listenOnly && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 font-bold text-amber-300">
                        <MicOff className="size-3" /> Solo escucha
                    </span>
                )}
                {state.full && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 font-bold text-amber-300">Sala llena</span>
                )}
            </div>
            {state.notice && <p className="text-[11px] text-amber-200/80">{state.notice}</p>}

            {/* Participantes */}
            <div className="flex flex-wrap gap-4 rounded-xl border border-white/10 bg-black/20 p-4">
                {state.participants.length === 0 ? (
                    <p className="w-full text-center text-sm text-muted-foreground">Esperando participantes…</p>
                ) : (
                    state.participants.map((p) => <ParticipantAvatar key={p.peerId} p={p} />)
                )}
            </div>

            {/* Controles */}
            <div className="flex items-center justify-center gap-3">
                <button
                    type="button"
                    onClick={onToggleMute}
                    disabled={state.listenOnly}
                    className={cn(
                        "inline-flex min-h-[48px] cursor-pointer items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-colors disabled:opacity-50",
                        state.muted ? "bg-red-500/90 text-white hover:bg-red-500" : "bg-emerald-500/90 text-white hover:bg-emerald-500",
                    )}
                    title={state.listenOnly ? "Sin micrófono disponible" : state.muted ? "Activar micrófono" : "Silenciar"}
                >
                    {state.muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                    {state.muted ? "Micrófono silenciado" : "Micrófono activo"}
                </button>
            </div>
        </div>
    );
}

export function AudioRoomsPanel() {
    const [rooms, setRooms] = useState<AudioRoomDef[]>(AUDIO_ROOM_CATALOG);
    const [activeRoom, setActiveRoom] = useState<AudioRoomDef | null>(null);
    const [state, setState] = useState<AudioRoomState | null>(null);
    const [joining, setJoining] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm] = useState({ name: "", topic: "", systemId: "global" });

    const handleRef = useRef<AudioRoomHandle | null>(null);
    const unsubRef = useRef<(() => void) | null>(null);

    const supported = isAudioSupported();

    const refreshRooms = useCallback(async () => {
        const custom = await listCustomAudioRooms();
        setRooms([...AUDIO_ROOM_CATALOG, ...custom]);
    }, []);

    useEffect(() => {
        void refreshRooms();
    }, [refreshRooms]);

    const leaveRoom = useCallback(() => {
        try {
            unsubRef.current?.();
        } catch {
            /* noop */
        }
        try {
            handleRef.current?.leave();
        } catch {
            /* noop */
        }
        unsubRef.current = null;
        handleRef.current = null;
        setActiveRoom(null);
        setState(null);
    }, []);

    // Limpieza al desmontar.
    useEffect(() => {
        return () => {
            try {
                handleRef.current?.leave();
            } catch {
                /* noop */
            }
        };
    }, []);

    const enterRoom = async (room: AudioRoomDef) => {
        if (joining || activeRoom) return;
        setJoining(true);
        try {
            const profile = await fetchMyProfile();
            const handle = await joinAudioRoom({
                room,
                name: profile?.displayName || "Ciudadano StarSeed",
                avatarUrl: profile?.avatarUrl ?? null,
            });
            handleRef.current = handle;
            unsubRef.current = handle.onUpdate(setState);
            setActiveRoom(room);
            const st = handle.getState();
            if (st.notice && !st.joined) {
                toast.message(st.notice);
            }
        } catch {
            toast.error("No se pudo abrir la sala.");
        } finally {
            setJoining(false);
        }
    };

    const createRoom = async () => {
        if (!form.name.trim()) {
            toast.error("Ponle un nombre a la sala.");
            return;
        }
        const room = await createCustomAudioRoom(form);
        if (!room) {
            toast.error("Inicia sesión para crear salas propias.");
            return;
        }
        toast.success("Sala creada.");
        setShowCreate(false);
        setForm({ name: "", topic: "", systemId: "global" });
        void refreshRooms();
    };

    const toggleMute = () => {
        handleRef.current?.toggleMute();
    };

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-1">
                <h3 className="flex items-center gap-2 text-lg font-black tracking-tight text-foreground/90">
                    <Radio className="size-5 text-primary" /> Salas de voz por biorregión
                </h3>
                <p className="max-w-2xl text-sm text-muted-foreground">
                    Voz en directo P2P entre ciudadanos, organizada por biorregión y tema. Malla comunitaria (beta):
                    conexión directa entre navegadores, hasta {MESH_MAX_PARTICIPANTS} personas por sala.
                </p>
            </div>

            {!supported && (
                <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-4 text-sm text-amber-200/90">
                    Tu navegador no soporta voz P2P (WebRTC/getUserMedia). Prueba con un navegador moderno con permisos de
                    micrófono.
                </div>
            )}

            {activeRoom && state ? (
                <LiveRoom room={activeRoom} state={state} onToggleMute={toggleMute} onLeave={leaveRoom} />
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {rooms.map((room) => {
                            const sys = systemById(room.systemId);
                            return (
                                <div key={room.id} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur transition-colors hover:border-primary/25">
                                    <div className="flex items-start gap-3">
                                        <span className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: `${roomColor(room)}20` }}>
                                            <Radio className="size-5" style={{ color: roomColor(room) }} />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate font-bold text-foreground">{room.name}</p>
                                            <p className="text-[11px]" style={{ color: sys.color }}>{room.topic}</p>
                                        </div>
                                        {room.custom && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-black uppercase text-muted-foreground">propia</span>}
                                    </div>
                                    <p className="text-[11px] text-muted-foreground">{room.description}</p>
                                    <button
                                        type="button"
                                        onClick={() => enterRoom(room)}
                                        disabled={!supported || joining}
                                        className="inline-flex min-h-[40px] cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold text-black transition-colors disabled:opacity-50"
                                        style={{ background: roomColor(room) }}
                                    >
                                        {joining ? <Loader2 className="size-4 animate-spin" /> : <Users className="size-4" />} Entrar a la sala
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    <div>
                        {showCreate ? (
                            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Nueva sala propia</p>
                                    <button type="button" onClick={() => setShowCreate(false)} className="cursor-pointer rounded-full p-1 text-muted-foreground hover:text-white" aria-label="Cerrar">
                                        <X className="size-4" />
                                    </button>
                                </div>
                                <div className="flex flex-col gap-2 sm:flex-row">
                                    <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nombre" className="min-h-[42px] flex-1 rounded-xl border border-white/12 bg-background/50 px-3 py-2 text-sm text-foreground/90 focus:outline-none focus:ring-1 focus:ring-primary/40" />
                                    <input value={form.topic} onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))} placeholder="Biorregión o tema" className="min-h-[42px] flex-1 rounded-xl border border-white/12 bg-background/50 px-3 py-2 text-sm text-foreground/90 focus:outline-none focus:ring-1 focus:ring-primary/40" />
                                    <select value={form.systemId} onChange={(e) => setForm((f) => ({ ...f, systemId: e.target.value }))} className="min-h-[42px] cursor-pointer rounded-xl border border-white/12 bg-background/50 px-3 py-2 text-sm font-semibold text-foreground/80 focus:outline-none focus:ring-1 focus:ring-primary/40">
                                        {CULTURAL_SYSTEMS.map((s) => (
                                            <option key={s.id} value={s.id}>{s.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <button type="button" onClick={createRoom} className="inline-flex min-h-[42px] cursor-pointer items-center gap-1.5 rounded-full bg-primary/90 px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary">
                                    <Plus className="size-4" /> Crear sala
                                </button>
                            </div>
                        ) : (
                            <button type="button" onClick={() => setShowCreate(true)} className="inline-flex min-h-[42px] cursor-pointer items-center gap-1.5 rounded-full border border-white/12 px-4 py-2 text-sm font-semibold text-foreground/80 hover:border-primary/30">
                                <Plus className="size-4" /> Crear una sala propia
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

export default AudioRoomsPanel;

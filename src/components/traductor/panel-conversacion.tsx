"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Mic, MicOff, Clock, Users, MessageSquare, Radio, Volume2, VolumeX } from "lucide-react";
import type { ParIdiomas } from "@/lib/traductor/tipos";
import type { ResultadoServicioTraductor } from "@/lib/traductor/servicio";

export interface PanelConversacionProps {
    servicio: { traducir: (texto: string, par: ParIdiomas) => Promise<ResultadoServicioTraductor> };
    voz: { hablar: (texto: string, idioma: string) => { ok: boolean; motivo?: string } } | null;
    par: ParIdiomas;
}

export interface Turno {
    id: string;
    texto: string;
    traduccion: string | null;
    idioma: string;
    lado: "izquierdo" | "derecho";
    timestamp: number;
    latencia: number | null;
    hablando: boolean;
    recibido: boolean;
}

export interface EstadoAudio {
    activo: boolean;
    grabando: boolean;
    conectado: boolean;
    nivelSeñal: number;
    idioma: string;
}

export function PanelConversacion({ servicio, voz, par }: PanelConversacionProps) {
    const [turnos, setTurnos] = useState<Turno[]>([]);
    const [ladoActivo, setLadoActivo] = useState<"izquierdo" | "derecho">("izquierdo");
    const [estadoAudio, setEstadoAudio] = useState<{ izquierdo: EstadoAudio; derecho: EstadoAudio }>({
        izquierdo: { activo: false, grabando: false, conectado: false, nivelSeñal: 0, idioma: par.origen },
        derecho: { activo: false, grabando: false, conectado: false, nivelSeñal: 0, idioma: par.destino },
    });
    const [turnoEnCurso, setTurnoEnCurso] = useState<string | null>(null);
    const [translating, setTranslating] = useState(false);

    const socketRef = useRef<WebSocket | null>(null);
    const micRef = useRef<{ start: () => Promise<void>; stop: () => void; } | null>(null);
    const recordingRef = useRef<{ start: () => Promise<void>; stop: () => void } | null>(null);

    const agregarTurno = useCallback((texto: string, lado: "izquierdo" | "derecho", idioma: string) => {
        const nuevoTurno: Turno = {
            id: `turno-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            texto,
            traduccion: null,
            idioma,
            lado,
            timestamp: Date.now(),
            latencia: null,
            hablando: true,
            recibido: false,
        };
        setTurnos((prev) => [...prev, nuevoTurno]);
        setTurnoEnCurso(nuevoTurno.id);
        return nuevoTurno.id;
    }, []);

    const completarTurno = useCallback(async (id: string, texto: string) => {
        setTurnos((prev) =>
            prev.map((t) => {
                if (t.id === id) {
                    const inicioTraduccion = performance.now();
                    setTranslating(true);
                    const resultado = servicio.traducir(texto, par);
                    setTimeout(() => {
                        setTurnos((prev) =>
                            prev.map((t) =>
                                t.id === id
                                    ? { ...t, traducido: true, timestampFinal: performance.now() }
                                    : t
                            )
                        );
                        setTranslating(false);
                    }, 500);
                    return { ...t, hablando: false, recibido: true };
                }
                return t;
            })
        );
    }, [servicio, par]);

    const alternarLado = useCallback(() => {
        setLadoActivo((prev) => (prev === "izquierdo" ? "derecho" : "izquierdo"));
    }, []);

    const iniciarGrabacion = useCallback(async (lado: "izquierdo" | "derecho") => {
        try {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                setEstadoAudio((prev) => ({
                    ...prev,
                    [lado]: { ...prev[lado], grabando: true, conectado: true },
                }));
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                if (micRef.current) {
                    await micRef.current.start();
                }
                setTimeout(() => {
                    setEstadoAudio((prev) => ({
                        ...prev,
                        [lado]: { ...prev[lado], nivelSeñal: Math.random() * 100 },
                    }));
                }, 500);
            }
        } catch (error) {
            console.error(`Error al acceder al micrófono del lado ${lado}:`, error);
            setEstadoAudio((prev) => ({
                ...prev,
                [lado]: { ...prev[lado], grabando: false, conectado: false },
            }));
        }
    }, []);

    const detenerGrabacion = useCallback((lado: "izquierdo" | "derecho") => {
        if (micRef.current) {
            micRef.current.stop();
        }
        setEstadoAudio((prev) => ({
            ...prev,
            [lado]: { ...prev[lado], grabando: false, activo: false },
        }));
    }, []);

    const calcularLatencia = useCallback((timestampInicio: number) => {
        return performance.now() - timestampInicio;
    }, []);

    return (
        <section
            aria-label="Panel de conversación con dos mitades de pantalla"
            className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full"
        >
            <div
                className={`flex flex-col gap-4 p-4 rounded-xl border transition-all ${ladoActivo === "izquierdo"
                        ? "bg-white/10 border-cyan-400/50 shadow-lg shadow-cyan-500/20"
                        : "bg-white/5 border-white/10 hover:bg-white/10"
                    }`}
                onClick={() => setLadoActivo("izquierdo")}
            >
                <header className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-full bg-cyan-500/20">
                            <Mic className="h-5 w-5 text-cyan-400" />
                        </div>
                        <h2 className="text-lg font-semibold text-white">Persona 1</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        {estadoAudio.izquierdo.grabando && (
                            <div className="flex items-center gap-1">
                                <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                                <span className="text-xs text-red-400">Grabando</span>
                            </div>
                        )}
                        {estadoAudio.izquierdo.nivelSeñal > 0 && (
                            <div className="h-1 w-16 bg-cyan-500/30 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-cyan-400 transition-all"
                                    style={{ width: `${estadoAudio.izquierdo.nivelSeñal}%` }}
                                />
                            </div>
                        )}
                    </div>
                </header>

                <div className="flex-1 bg-black/30 rounded-lg p-4 min-h-[200px] flex items-center justify-center">
                    {turnos.filter((t) => t.lado === "izquierdo").length === 0 ? (
                        <div className="text-center">
                            <MessageSquare className="h-12 w-12 text-white/30 mx-auto mb-2" />
                            <p className="text-white/60">Sin turnos del lado izquierdo</p>
                        </div>
                    ) : (
                        <ul className="flex flex-col gap-3 max-h-[400px] overflow-y-auto">
                            {turnos
                                .filter((t) => t.lado === "izquierdo")
                                .slice()
                                .reverse()
                                .map((turno) => (
                                    <li
                                        key={turno.id}
                                        className={`p-3 rounded-lg border transition-all ${turno.hablando
                                                ? "bg-cyan-500/20 border-cyan-400/50"
                                                : turno.recibido
                                                    ? "bg-green-500/10 border-green-400/30"
                                                    : "bg-white/5 border-white/10"
                                            }`}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs text-white/60">
                                                {new Date(turno.timestamp).toLocaleTimeString()}
                                            </span>
                                            {turno.latencia && (
                                                <span className="text-xs text-cyan-400 flex items-center gap-1">
                                                    <Clock className="h-3 w-3" />
                                                    {Math.round(turno.latencia)}ms
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-white">{(turno.texto || "(sin texto)")}</p>
                                        {turno.traduccion && (
                                            <div className="mt-2 pt-2 border-t border-white/10">
                                                <span className="text-xs text-green-400">Traducción: </span>
                                                <p className="text-sm text-white/80">{(turno.traduccion || "(sin traducción)")}</p>
                                            </div>
                                        )}
                                        {turno.hablando && (
                                            <div className="mt-2">
                                                <div className="h-1 w-full bg-cyan-500/30 rounded-full overflow-hidden">
                                                    <div className="h-full bg-cyan-400 animate-pulse" style={{ width: "60%" }} />
                                                </div>
                                            </div>
                                        )}
                                    </li>
                                ))}
                        </ul>
                    )}
                </div>

                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => iniciarGrabacion("izquierdo")}
                        disabled={estadoAudio.izquierdo.grabando || estadoAudio.izquierdo.activo}
                        className="flex-1 flex items-center justify-center gap-2 min-h-[44px] cursor-pointer rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Mic className="h-4 w-4" />
                        {estadoAudio.izquierdo.grabando ? "Grabando..." : "Iniciar"}
                    </button>
                    <button
                        type="button"
                        onClick={() => detenerGrabacion("izquierdo")}
                        disabled={!estadoAudio.izquierdo.grabando}
                        className="flex items-center justify-center gap-2 min-h-[44px] cursor-pointer rounded-xl bg-white/10 border border-white/20 px-4 py-2 text-sm text-white/80 transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <MicOff className="h-4 w-4" />
                        Detener
                    </button>
                </div>
            </div>

            <div
                className={`flex flex-col gap-4 p-4 rounded-xl border transition-all ${ladoActivo === "derecho"
                        ? "bg-white/10 border-purple-400/50 shadow-lg shadow-purple-500/20"
                        : "bg-white/5 border-white/10 hover:bg-white/10"
                    }`}
                onClick={() => setLadoActivo("derecho")}
            >
                <header className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-full bg-purple-500/20">
                            <Volume2 className="h-5 w-5 text-purple-400" />
                        </div>
                        <h2 className="text-lg font-semibold text-white">Persona 2</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        {estadoAudio.derecho.grabando && (
                            <div className="flex items-center gap-1">
                                <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                                <span className="text-xs text-red-400">Grabando</span>
                            </div>
                        )}
                        {estadoAudio.derecho.nivelSeñal > 0 && (
                            <div className="h-1 w-16 bg-purple-500/30 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-purple-400 transition-all"
                                    style={{ width: `${estadoAudio.derecho.nivelSeñal}%` }}
                                />
                            </div>
                        )}
                    </div>
                </header>

                <div className="flex-1 bg-black/30 rounded-lg p-4 min-h-[200px] flex items-center justify-center">
                    {turnos.filter((t) => t.lado === "derecho").length === 0 ? (
                        <div className="text-center">
                            <MessageSquare className="h-12 w-12 text-white/30 mx-auto mb-2" />
                            <p className="text-white/60">Sin turnos del lado derecho</p>
                        </div>
                    ) : (
                        <ul className="flex flex-col gap-3 max-h-[400px] overflow-y-auto">
                            {turnos
                                .filter((t) => t.lado === "derecho")
                                .slice()
                                .reverse()
                                .map((turno) => (
                                    <li
                                        key={turno.id}
                                        className={`p-3 rounded-lg border transition-all ${turno.hablando
                                                ? "bg-purple-500/20 border-purple-400/50"
                                                : turno.recibido
                                                    ? "bg-green-500/10 border-green-400/30"
                                                    : "bg-white/5 border-white/10"
                                            }`}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs text-white/60">
                                                {new Date(turno.timestamp).toLocaleTimeString()}
                                            </span>
                                            {turno.latencia && (
                                                <span className="text-xs text-purple-400 flex items-center gap-1">
                                                    <Clock className="h-3 w-3" />
                                                    {Math.round(turno.latencia)}ms
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-white">{(turno.texto || "(sin texto)")}</p>
                                        {turno.traduccion && (
                                            <div className="mt-2 pt-2 border-t border-white/10">
                                                <span className="text-xs text-green-400">Traducción: </span>
                                                <p className="text-sm text-white/80">{(turno.traduccion || "(sin traducción)")}</p>
                                            </div>
                                        )}
                                        {turno.hablando && (
                                            <div className="mt-2">
                                                <div className="h-1 w-full bg-purple-500/30 rounded-full overflow-hidden">
                                                    <div className="h-full bg-purple-400 animate-pulse" style={{ width: "60%" }} />
                                                </div>
                                            </div>
                                        )}
                                    </li>
                                ))}
                        </ul>
                    )}
                </div>

                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => iniciarGrabacion("derecho")}
                        disabled={estadoAudio.derecho.grabando || estadoAudio.derecho.activo}
                        className="flex-1 flex items-center justify-center gap-2 min-h-[44px] cursor-pointer rounded-xl bg-purple-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-purple-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Volume2 className="h-4 w-4" />
                        {estadoAudio.derecho.grabando ? "Grabando..." : "Iniciar"}
                    </button>
                    <button
                        type="button"
                        onClick={() => detenerGrabacion("derecho")}
                        disabled={!estadoAudio.derecho.grabando}
                        className="flex items-center justify-center gap-2 min-h-[44px] cursor-pointer rounded-xl bg-white/10 border border-white/20 px-4 py-2 text-sm text-white/80 transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <VolumeX className="h-4 w-4" />
                        Detener
                    </button>
                </div>
            </div>

            <div className="col-span-1 md:col-span-2 bg-white/5 rounded-xl p-4 border border-white/10">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-medium flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Estado de la conversación
                    </h3>
                    <span className="text-xs text-white/60">
                        Lado activo: <span className="font-semibold">{ladoActivo === "izquierdo" ? "Persona 1" : "Persona 2"}</span>
                    </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="bg-cyan-500/10 border border-cyan-400/30 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                            <Mic className="h-4 w-4 text-cyan-400" />
                            <span className="text-sm font-medium text-cyan-400">Persona 1</span>
                        </div>
                        <p className="text-xs text-white/70">
                            {estadoAudio.izquierdo.conectado ? "Conectado" : "Desconectado"}
                        </p>
                        <p className="text-xs text-white/50">
                            Idioma: {estadoAudio.izquierdo.idioma}
                        </p>
                    </div>

                    <div className="bg-purple-500/10 border border-purple-400/30 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                            <Volume2 className="h-4 w-4 text-purple-400" />
                            <span className="text-sm font-medium text-purple-400">Persona 2</span>
                        </div>
                        <p className="text-xs text-white/70">
                            {estadoAudio.derecho.conectado ? "Conectado" : "Desconectado"}
                        </p>
                        <p className="text-xs text-white/50">
                            Idioma: {estadoAudio.derecho.idioma}
                        </p>
                    </div>

                    <div className="bg-white/10 border border-white/20 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                            <MessageSquare className="h-4 w-4 text-white/60" />
                            <span className="text-sm font-medium text-white/80">Total turnos</span>
                        </div>
                        <p className="text-lg font-bold text-white">{turnos.length}</p>
                        <p className="text-xs text-white/50">
                            {turnos.filter((t) => t.hablando).length} hablando actualmente
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}
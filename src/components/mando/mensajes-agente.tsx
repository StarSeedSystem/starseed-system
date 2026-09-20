"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquare, Send, Clock, Check, CheckCheck, Loader2 } from "lucide-react";
import { formatearEstadoMensaje, type MensajeAgente } from "@/lib/mando/mensajes-agente";

interface Props {
    agenteId: string;
}

export function MensajesAgente({ agenteId }: Props) {
    const [mensajes, setMensajes] = useState<MensajeAgente[]>([]);
    const [texto, setTexto] = useState("");
    const [enviando, setEnviando] = useState(false);
    const [cargando, setCargando] = useState(true);

    const cargarMensajes = useCallback(async () => {
        try {
            const res = await fetch(`/api/mando/agentes/${encodeURIComponent(agenteId)}/mensajes`);
            if (res.ok) {
                const data = (await res.json()) as { mensajes?: MensajeAgente[] };
                setMensajes(data.mensajes ?? []);
            }
        } catch {
        } finally {
            setCargando(false);
        }
    }, [agenteId]);

    useEffect(() => {
        void cargarMensajes();
        const timer = setInterval(() => void cargarMensajes(), 10000);
        return () => clearInterval(timer);
    }, [cargarMensajes]);

    const enviarMensaje = async (e: React.FormEvent) => {
        e.preventDefault();
        const t = texto.trim();
        if (!t || enviando) return;
        setEnviando(true);
        try {
            const res = await fetch(`/api/mando/agentes/${encodeURIComponent(agenteId)}/mensajes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ texto: t }),
            });
            if (res.ok) {
                setTexto("");
                await cargarMensajes();
            }
        } catch {
        } finally {
            setEnviando(false);
        }
    };

    return (
        <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-black/20 p-3 text-xs" data-testid="mensajes-agente">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-foreground/90">
                    <MessageSquare className="size-4 text-emerald-400" aria-hidden />
                    <span>Mensajes al agente</span>
                </div>
                <span className="text-[10px] text-muted-foreground/70">
                    Auto-refresco 10s
                </span>
            </div>

            <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
                El agente lo lee al empezar el siguiente archivo o antes de terminar; no se interrumpe nada.
            </p>

            <form onSubmit={(e) => void enviarMensaje(e)} className="flex gap-2">
                <input
                    type="text"
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder="Escribe una instrucción o aclaración para el agente..."
                    className="flex-1 rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-emerald-500/50 focus:outline-none"
                    disabled={enviando}
                />
                <button
                    type="submit"
                    disabled={enviando || !texto.trim()}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                    <span>Enviar al agente</span>
                </button>
            </form>

            {cargando && mensajes.length === 0 ? (
                <p className="text-[11px] text-muted-foreground/60 italic">Cargando mensajes...</p>
            ) : mensajes.length === 0 ? (
                <p className="text-[11px] text-muted-foreground/60 italic">Sin mensajes enviados a esta tarea.</p>
            ) : (
                <ul className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
                    {mensajes.map((m, idx) => (
                        <li key={`${m.t}-${idx}`} className="flex flex-col gap-0.5 rounded border border-white/5 bg-white/[0.02] p-2">
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground/70">
                                <span className="font-semibold text-emerald-400">{m.de}</span>
                                <div className="flex items-center gap-1 text-[10px]">
                                    {m.leido ? (
                                        <CheckCheck className="size-3 text-emerald-400" aria-hidden />
                                    ) : m.entregado ? (
                                        <Check className="size-3 text-sky-400" aria-hidden />
                                    ) : (
                                        <Clock className="size-3 text-amber-400" aria-hidden />
                                    )}
                                    <span>{formatearEstadoMensaje(m)}</span>
                                </div>
                            </div>
                            <p className="text-foreground/90 whitespace-pre-wrap">{m.texto}</p>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

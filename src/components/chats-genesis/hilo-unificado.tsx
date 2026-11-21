"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import type { ClienteChatsGenesis } from "@/lib/chats-genesis/puerta-chats";
import { fusionarMensajes, type FuenteCrossMedia, type MensajeUnificado } from "@/lib/chats-genesis/hilo-unificado";
import { cn } from "@/lib/utils";

const FUENTES: { id: FuenteCrossMedia; etiqueta: string; color: string }[] = [
    { id: "direccion", etiqueta: "Dirección", color: "border-violet-400/30 bg-violet-500/10" },
    { id: "hermes-avisos", etiqueta: "Hermes y avisos", color: "border-sky-400/30 bg-sky-500/10" },
    { id: "peticiones", etiqueta: "Peticiones", color: "border-emerald-400/30 bg-emerald-500/10" },
    { id: "avisos-directores", etiqueta: "Avisos directores", color: "border-amber-400/30 bg-amber-500/10" },
];

const FILTRO_TODOS = "todas";

function horaRelativa(t: string): string {
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) return "";
    const min = Math.floor((Date.now() - d.getTime()) / 60_000);
    if (min < 1) return "ahora";
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    return h < 24 ? `hace ${h} h` : d.toLocaleDateString("es-ES");
}

export interface HiloUnificadoProps {
    cliente: ClienteChatsGenesis;
    esDueno: boolean;
}

export function HiloUnificado({ cliente, esDueno }: HiloUnificadoProps) {
    const [mensajes, setMensajes] = useState<MensajeUnificado[]>([]);
    const [cargando, setCargando] = useState(true);
    const [filtroFuente, setFiltroFuente] = useState<FuenteCrossMedia | "todas">(FILTRO_TODOS);

    useEffect(() => {
        let cancelado = false;
        setCargando(true);
        Promise.all([
            cliente.feed("direccion"),
            cliente.feed("puente:hermes-avisos"),
            cliente.feed("puente:peticiones"),
            cliente.feed("puente:avisos-directores"),
        ]).then(([dir, hermes, pet, avisos]) => {
            if (cancelado) return;
            setMensajes(fusionarMensajes(
                dir.ok ? dir.registros : [],
                hermes.ok ? hermes.registros : [],
                pet.ok ? pet.registros : [],
                avisos.ok ? avisos.registros : [],
            ));
            setCargando(false);
        }).catch(() => { if (!cancelado) setCargando(false); });
        return () => { cancelado = true; };
    }, [cliente]);

    const mensajesFiltrados = useMemo(() =>
        filtroFuente === FILTRO_TODOS ? mensajes : mensajes.filter((m) => m.fuente === filtroFuente),
        [mensajes, filtroFuente]
    );

    if (cargando) return (
        <div className="flex items-center justify-center p-8" role="status">
            <Loader2 className="size-6 animate-spin text-violet-400" aria-hidden />
            <span className="sr-only">Cargando hilo unificado…</span>
        </div>
    );

    return (
        <section aria-label="Hilo único cross-media" data-testid="hilo-unificado" className="flex flex-col gap-3 h-full">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px]">
                <label htmlFor="filtro-fuente" className="text-white/60">Fuente:</label>
                <select id="filtro-fuente" value={filtroFuente} onChange={(e) => setFiltroFuente(e.target.value as FuenteCrossMedia | "todas")}
                    className="cursor-pointer rounded bg-zinc-900 px-2 py-1 text-xs text-white border border-white/10 focus:ring-2 focus:ring-violet-500/30" aria-label="Filtrar por fuente">
                    <option value={FILTRO_TODOS}>Todas las fuentes</option>
                    {FUENTES.map((f) => <option key={f.id} value={f.id}>{f.etiqueta}</option>)}
                </select>
                <span className="ml-auto text-white/40">{mensajesFiltrados.length} mensaje{mensajesFiltrados.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-white/5 bg-black/20 p-3">
                {mensajesFiltrados.length === 0 ? (
                    <p className="text-center text-white/50 py-8" data-testid="hilo-vacio">Sin mensajes unificados</p>
                ) : (
                    <div className="flex flex-col gap-2" role="log" aria-live="polite">
                        {mensajesFiltrados.map((m) => (
                            <article key={m.id} data-testid="mensaje-unificado" data-tiempo={m.t}
                                className={cn("rounded-xl border p-3 text-xs", m.esDeAlex ? "ml-auto max-w-[85%] border-cyan-400/30 bg-cyan-500/10" : "mr-auto max-w-[85%]")}>
                                <header className="flex flex-wrap items-center gap-2 mb-1">
                                    <span className={cn("font-semibold", m.esDeAlex ? "text-cyan-200" : "text-white/80")}>{m.esDeAlex ? "Tú" : m.origen}</span>
                                    <span data-testid="fuente-badge" className={cn("rounded border px-1.5 py-0.5 text-[10px] text-white/80", FUENTES.find((f) => f.id === m.fuente)?.color)}>
                                        {FUENTES.find((f) => f.id === m.fuente)?.etiqueta ?? m.fuente}
                                    </span>
                                    <span className="ml-auto text-[10px] text-white/50">{horaRelativa(m.t)}</span>
                                </header>
                                <p className="whitespace-pre-line break-words [overflow-wrap:anywhere] text-white/90">{m.texto}</p>
                                {m.tipoUnificado !== "mensaje" && <span className="mt-1 inline-block rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-white/60">{m.tipoUnificado}</span>}
                            </article>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}
"use client";

import { useEffect, useState } from "react";
import { X, Bot, Activity, Terminal, Monitor, MessageSquare, ListTree } from "lucide-react";
import { MensajesAgente } from "@/components/mando/mensajes-agente";
import {
    SeccionProceso,
    SeccionEventos,
    SeccionIdeRelevo,
    SeccionLogEnVivo,
    type PasoRama,
    type EventoRama,
} from "@/components/mando/ficha-secciones";

export interface DatosAgenteFicha {
    id: string; tarea?: string; titulo?: string; etapa?: string; fase?: string;
    modelo?: string; proveedor?: string; medio?: string; minutos?: number;
    intento?: number; pasos?: PasoRama[]; eventos?: EventoRama[]; ide?: string;
    alternativas?: string; logUrl?: string; codexUrl?: string;
}

export interface FichaAgenteProps {
    agente: DatosAgenteFicha; onCerrar: () => void;
}

type Pestana = "proceso" | "eventos" | "ide" | "log" | "mensajes";

export function FichaAgente({ agente, onCerrar }: FichaAgenteProps) {
    const [pestana, setPestana] = useState<Pestana>("proceso");

    useEffect(() => {
        const manejarTecla = (e: KeyboardEvent) => {
            if (e.key === "Escape") onCerrar();
        };
        window.addEventListener("keydown", manejarTecla);
        return () => window.removeEventListener("keydown", manejarTecla);
    }, [onCerrar]);

    const tareaId = agente.tarea || agente.id;
    const etapaActual = agente.etapa || agente.fase || "escribiendo";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" data-testid="ficha-agente-modal">
            <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col gap-4 overflow-hidden rounded-xl border border-white/10 bg-slate-950/95 p-5 shadow-2xl backdrop-blur-md text-xs">
                {/* Cabecera */}
                <div className="flex items-start justify-between pr-8">
                    <div className="flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm font-bold text-emerald-400">{tareaId}</span>
                            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300 border border-emerald-500/20">
                                {etapaActual}
                            </span>
                        </div>
                        <h3 className="text-sm font-semibold text-foreground">{agente.titulo || `Tarea ${tareaId}`}</h3>
                        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground/80">
                            {agente.modelo && <span>{agente.modelo}</span>}
                            {agente.proveedor && <span>· {agente.proveedor}</span>}
                            {agente.medio && <span>· {agente.medio}</span>}
                            {agente.minutos !== undefined && <span>· {agente.minutos} min</span>}
                            {agente.intento !== undefined && <span>· intento {agente.intento}</span>}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onCerrar}
                        className="absolute right-4 top-4 cursor-pointer rounded-full p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                        aria-label="Cerrar ficha"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                {/* Mini barra de etapa */}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                        className="h-full bg-emerald-400 transition-all duration-300"
                        style={{
                            width: etapaActual === "hecho" ? "100%" : etapaActual === "revision" ? "75%" : etapaActual === "verificando" ? "50%" : "25%",
                        }}
                    />
                </div>

                {/* Pestañas de navegación */}
                <div className="flex flex-wrap gap-1 border-b border-white/10 pb-2">
                    {[
                        { id: "proceso", label: "Proceso", icon: ListTree },
                        { id: "eventos", label: "Eventos", icon: Activity },
                        { id: "ide", label: "IDE y relevo", icon: Monitor },
                        { id: "log", label: "Log en vivo", icon: Terminal },
                        { id: "mensajes", label: "Mensajes", icon: MessageSquare },
                    ].map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setPestana(id as Pestana)}
                            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                pestana === id ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                            }`}
                        >
                            <Icon className="size-3.5" />
                            <span>{label}</span>
                        </button>
                    ))}
                </div>

                {/* Contenido de la pestaña */}
                <div className="flex-1 overflow-y-auto pr-1">
                    {pestana === "proceso" && <SeccionProceso pasos={agente.pasos ?? []} />}
                    {pestana === "eventos" && <SeccionEventos eventos={agente.eventos ?? []} />}
                    {pestana === "ide" && <SeccionIdeRelevo ide={agente.ide} alternativas={agente.alternativas} logUrl={agente.logUrl} codexUrl={agente.codexUrl} />}
                    {pestana === "log" && <SeccionLogEnVivo agenteId={tareaId} logUrl={agente.logUrl} />}
                    {pestana === "mensajes" && <MensajesAgente agenteId={tareaId} />}
                </div>
            </div>
        </div>
    );
}

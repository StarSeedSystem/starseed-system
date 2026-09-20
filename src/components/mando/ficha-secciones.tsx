"use client";

import { useEffect, useState } from "react";
import { Terminal, Activity, Monitor, ExternalLink, Pause, Play } from "lucide-react";

export interface PasoRama {
    t: string;
    paso: string;
    donde: string;
    datos: Record<string, string | number | boolean>;
}

export interface EventoRama {
    t: string;
    tipo: string;
    texto: string;
    donde: string;
}

export function SeccionProceso({ pasos }: { pasos: PasoRama[] }) {
    if (!pasos?.length) return <p className="text-[11px] text-muted-foreground/60 italic">Sin pasos registrados aún.</p>;
    return (
        <ul className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
            {pasos.map((p, idx) => (
                <li key={`${p.t}-${idx}`} className="flex flex-col gap-0.5 rounded border border-white/5 bg-white/[0.02] p-2 text-xs">
                    <div className="flex items-center justify-between font-mono text-[10px] text-emerald-400">
                        <span>{p.paso} · {p.donde}</span>
                        <span className="text-muted-foreground">{p.t.slice(11, 19)}</span>
                    </div>
                    {Object.keys(p.datos).length > 0 && <div className="text-[10px] text-muted-foreground/80 font-mono">{JSON.stringify(p.datos)}</div>}
                </li>
            ))}
        </ul>
    );
}

export function SeccionEventos({ eventos }: { eventos: EventoRama[] }) {
    if (!eventos || eventos.length === 0) {
        return <p className="text-[11px] text-muted-foreground/60 italic">Sin eventos recientes en el bus.</p>;
    }
    const ultimos = eventos.slice(-20);
    return (
        <ul className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1">
            {ultimos.map((e, idx) => (
                <li key={`${e.t}-${idx}`} className="flex items-start justify-between gap-2 rounded border border-white/5 bg-white/[0.02] p-1.5 text-[11px]">
                    <div className="flex flex-col">
                        <span className="font-semibold text-amber-300">{e.tipo}</span>
                        <span className="text-foreground/90">{e.texto}</span>
                    </div>
                    <span className="font-mono text-[9px] text-muted-foreground/60">{e.t.slice(11, 19)}</span>
                </li>
            ))}
        </ul>
    );
}

export function SeccionIdeRelevo({ ide, alternativas, logUrl, codexUrl }: { ide?: string; alternativas?: string; logUrl?: string; codexUrl?: string }) {
    return (
        <div className="flex flex-col gap-2 rounded border border-white/5 bg-white/[0.02] p-2.5 text-xs">
            <div className="flex items-center gap-2 font-medium text-foreground">
                <Monitor className="size-4 text-sky-400" aria-hidden />
                <span>IDE: {ide || "Entorno no especificado"}</span>
            </div>
            {alternativas && <p className="text-[11px] text-muted-foreground/80">{alternativas}</p>}
            <div className="flex flex-wrap gap-2 pt-1">
                {logUrl && (
                    <a href={logUrl} target="_blank" rel="noreferrer" className="inline-flex cursor-pointer items-center gap-1 rounded border border-sky-400/30 bg-sky-500/10 px-2 py-1 text-[10px] text-sky-300 hover:bg-sky-500/20">
                        <Terminal className="size-3" aria-hidden /> Log en vivo <ExternalLink className="size-2.5" aria-hidden />
                    </a>
                )}
                {codexUrl && (
                    <a href={codexUrl} target="_blank" rel="noreferrer" className="inline-flex cursor-pointer items-center gap-1 rounded border border-violet-400/30 bg-violet-500/10 px-2 py-1 text-[10px] text-violet-300 hover:bg-violet-500/20">
                        <Monitor className="size-3" aria-hidden /> Abrir en Codex <ExternalLink className="size-2.5" aria-hidden />
                    </a>
                )}
            </div>
        </div>
    );
}

export function SeccionLogEnVivo({ agenteId, logUrl }: { agenteId: string; logUrl?: string }) {
    const [lineas, setLineas] = useState<string[]>([]);
    const [pausado, setPausado] = useState(false);

    useEffect(() => {
        let activo = true;
        const url = logUrl || `/api/mando/agentes/${encodeURIComponent(agenteId)}/log`;
        const cargar = async () => {
            if (pausado || document.visibilityState !== "visible") return;
            try {
                const res = await fetch(url);
                if (res.ok && activo) {
                    const d = (await res.json()) as { log?: string[]; lineas?: string[] };
                    setLineas((d.log || d.lineas || []).slice(-60));
                }
            } catch {}
        };
        void cargar();
        const interval = setInterval(() => void cargar(), 5000);
        return () => { activo = false; clearInterval(interval); };
    }, [agenteId, logUrl, pausado]);

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-foreground/80">Log en vivo (últimas 60 líneas)</span>
                <button type="button" onClick={() => setPausado(!pausado)} className="inline-flex cursor-pointer items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
                    {pausado ? <Play className="size-3 text-emerald-400" /> : <Pause className="size-3 text-amber-400" />}
                    <span>{pausado ? "Reanudar" : "Pausar"}</span>
                </button>
            </div>
            <div className="max-h-48 overflow-y-auto rounded border border-white/10 bg-black/60 p-2 font-mono text-[10px] text-emerald-300/90 leading-relaxed whitespace-pre-wrap">
                {lineas.length === 0 ? "Sin salida de log disponible." : lineas.join("\n")}
            </div>
        </div>
    );
}
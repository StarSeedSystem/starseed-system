"use client";

/**
 * Panel «Núcleo Astraura» para el Centro de Mando.
 * Muestra el estado de BitNet 1.58, Needle 3 y Needle 2/ESP32.
 */

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, RefreshCw, Sparkles } from "lucide-react";
import {
    avisoVersionMayor,
    resumenNucleo,
    type BitnetStatus,
    type EstadoRenovacion,
    type NeedleStatus,
} from "@/lib/mando/nucleo-astraura";

const COMANDO = "bash scripts/renovar-needle.sh";

export function PanelNucleoAstraura() {
    const [renovacion, setRenovacion] = useState<EstadoRenovacion | null>(null);
    const [bitnet, setBitnet] = useState<BitnetStatus | null>(null);
    const [needle, setNeedle] = useState<NeedleStatus | null>(null);
    const [cargando, setCargando] = useState(false);
    const [copiado, setCopiado] = useState(false);
    const [mensaje, setMensaje] = useState<string | null>(null);

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            const [rN, rB] = await Promise.all([
                fetch("/api/ai/astraura-158/api/needle/status").then((r) => (r.ok ? r.json() : null)).catch(() => null),
                fetch("/api/ai/astraura-158/api/bitnet/status").then((r) => (r.ok ? r.json() : null)).catch(() => null),
            ]);
            if (rN) setNeedle(rN as NeedleStatus);
            if (rB) setBitnet(rB as BitnetStatus);
        } catch {
            setMensaje("No se pudieron cargar todos los estados.");
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => { void cargar(); }, [cargar]);

    const renovarAhora = async () => {
        setMensaje(null);
        try {
            const r = await fetch("/api/mando/comprobar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ medidor: "needle" }),
            });
            setMensaje(r.ok ? "Renovación de Needle iniciada." : `HTTP ${r.status}`);
            if (r.ok) void cargar();
        } catch {
            setMensaje("Error de red.");
        }
    };

    const copiarComando = async () => {
        await navigator.clipboard.writeText(COMANDO);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
    };

    const tarjetas = resumenNucleo({ bitnet, needle, renovacion });
    const avisoMayor = avisoVersionMayor(renovacion);

    return (
        <section data-testid="panel-nucleo-astraura" className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-semibold text-white">Núcleo Astraura</h3>
                    <p className="text-[11px] text-white/45">BitNet 1.58, Needle 3 y Needle 2/ESP32</p>
                </div>
                <button type="button" onClick={() => void cargar()} disabled={cargando} className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/10 disabled:opacity-50">
                    <RefreshCw className={`h-3.5 w-3.5 ${cargando ? "animate-spin" : ""}`} /> Actualizar
                </button>
            </div>
            {avisoMayor ? (
                <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs font-semibold text-amber-200">{avisoMayor}</div>
            ) : null}
            {mensaje ? <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">{mensaje}</p> : null}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {tarjetas.map((t) => (
                    <div key={t.nombre} className="rounded-xl border border-white/10 bg-black/30 p-3.5 backdrop-blur">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-medium text-white/90">{t.nombre}</h4>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${t.tono}`}>{t.estado}</span>
                        </div>
                        <p className="mt-2 text-[11px] text-white/60">{t.detalle}</p>
                    </div>
                ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="flex items-center gap-2">
                    <code className="rounded bg-black/40 px-2 py-1 font-mono text-[11px] text-amber-200">{COMANDO}</code>
                    <button type="button" onClick={() => void copiarComando()} className="inline-flex cursor-pointer items-center gap-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10">
                        {copiado ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />} {copiado ? "Copiado" : "Copiar"}
                    </button>
                </div>
                <button type="button" onClick={() => void renovarAhora()} className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20">
                    <Sparkles className="h-3.5 w-3.5" /> Renovar ahora
                </button>
            </div>
        </section>
    );
}

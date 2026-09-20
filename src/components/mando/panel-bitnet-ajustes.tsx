"use client";

import { useCallback, useEffect, useState } from "react";
import { Cpu, Save, Sparkles, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AJUSTES_BITNET_DEFECTO, recomendarPorHardware, validar, type AjustesBitnet } from "@/lib/mando/bitnet-ajustes";

export function PanelBitnetAjustes() {
    const [ajustes, setAjustes] = useState<AjustesBitnet>(AJUSTES_BITNET_DEFECTO);
    const [guardando, setGuardando] = useState(false);
    const [mensaje, setMensaje] = useState<string | null>(null);
    const [copiado, setCopiado] = useState(false);
    const CMD = "launchctl kickstart -k gui/$UID/com.starseed.astraura";

    const cargar = useCallback(async () => {
        try {
            const r = await fetch("/api/mando/ajustes/astraura");
            if (r.ok) { const d = await r.json(); if (d.config) setAjustes(validar(d.config)); }
        } catch { /* usar defectos */ }
    }, []);

    useEffect(() => { void cargar(); }, [cargar]);

    const aplicarRecomendacion = useCallback(async () => {
        try {
            const r = await fetch("/api/ai/astraura-158/api/bitnet/estado").catch(() => null);
            const d = r && r.ok ? await r.json() : null;
            setAjustes(recomendarPorHardware({ ramGb: d?.ram_gb ?? 8, cpu: d?.cpu_cores ?? 4, esNube: d?.nodo === "nube" }));
            setMensaje("Recomendación ajustada para la máquina actual.");
        } catch { setAjustes(recomendarPorHardware({ ramGb: 8, cpu: 4 })); }
    }, []);

    const guardar = useCallback(async () => {
        setGuardando(true);
        try {
            const r = await fetch("/api/mando/ajustes/astraura", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ajustes) });
            const d = await r.json();
            if (d.ok) setMensaje("el backend de Astraura toma los ajustes al reiniciar (launchctl kickstart -k gui/$UID/com.starseed.astraura)");
            else setMensaje(d.error ?? "Error al guardar los ajustes.");
        } catch { setMensaje("Error de red al guardar los ajustes."); }
        finally { setGuardando(false); }
    }, [ajustes]);

    const copiarCmd = () => { void navigator.clipboard.writeText(CMD); setCopiado(true); setTimeout(() => setCopiado(false), 2000); };

    return (
        <article className="space-y-4 rounded-xl border border-white/10 bg-black/30 p-4">
            <header className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Cpu className="h-4 w-4 text-violet-400" /> Ajustes del motor BitNet (Astraura)
                </h3>
                <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={aplicarRecomendacion} className="cursor-pointer text-xs">
                        <Sparkles className="mr-1 h-3.5 w-3.5 text-amber-300" /> Recomendar
                    </Button>
                    <Button type="button" size="sm" onClick={guardar} disabled={guardando} className="cursor-pointer text-xs">
                        <Save className="mr-1 h-3.5 w-3.5" /> Guardar
                    </Button>
                </div>
            </header>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 text-xs">
                <div>
                    <label className="text-white/80">Contexto (tokens)</label>
                    <select value={ajustes.ctx} onChange={(e) => setAjustes({ ...ajustes, ctx: Number(e.target.value) as AjustesBitnet["ctx"] })} className="mt-1 w-full cursor-pointer rounded border border-white/10 bg-black/50 p-1.5 text-white">
                        <option value={1024}>1024 (ligero)</option><option value={2048}>2048 (estándar 8 GB)</option><option value={4096}>4096 (amplio 16+ GB)</option>
                    </select>
                    <p className="mt-0.5 text-[10px] text-white/50">Subir contexto consume más memoria RAM por slot.</p>
                </div>
                <div>
                    <label className="text-white/80">Slots en paralelo</label>
                    <select value={ajustes.paralelo} onChange={(e) => setAjustes({ ...ajustes, paralelo: Number(e.target.value) as AjustesBitnet["paralelo"] })} className="mt-1 w-full cursor-pointer rounded border border-white/10 bg-black/50 p-1.5 text-white">
                        {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} slot{n > 1 ? "s" : ""}</option>)}
                    </select>
                    <p className="mt-0.5 text-[10px] text-white/50">Atiende más peticiones a costa de duplicar memoria RAM.</p>
                </div>
                <div>
                    <label className="text-white/80">Servidores</label>
                    <select value={ajustes.servidores} onChange={(e) => setAjustes({ ...ajustes, servidores: e.target.value as AjustesBitnet["servidores"] })} className="mt-1 w-full cursor-pointer rounded border border-white/10 bg-black/50 p-1.5 text-white">
                        <option value="shared">shared (1 servidor interactivo+fondo)</option><option value="dual">dual (2 servidores aislados)</option>
                    </select>
                    <p className="mt-0.5 text-[10px] text-white/50">'shared' ahorra RAM por mmap; 'dual' aísla cargas pesadas.</p>
                </div>
                <div>
                    <label className="text-white/80">Sueño automático (minutos)</label>
                    <input type="number" min={0} max={1440} value={ajustes.suenoMin} onChange={(e) => setAjustes({ ...ajustes, suenoMin: Number(e.target.value) })} className="mt-1 w-full cursor-text rounded border border-white/10 bg-black/50 p-1.5 text-white" />
                    <p className="mt-0.5 text-[10px] text-white/50">Inactividad antes de suspender proceso y liberar RAM.</p>
                </div>
                <div>
                    <label className="text-white/80">Hilos CPU</label>
                    <input type="number" min={1} max={64} value={ajustes.hilos} onChange={(e) => setAjustes({ ...ajustes, hilos: Number(e.target.value) })} className="mt-1 w-full cursor-text rounded border border-white/10 bg-black/50 p-1.5 text-white" />
                    <p className="mt-0.5 text-[10px] text-white/50">Más hilos aceleran inferencia pero elevan uso de CPU.</p>
                </div>
                <div>
                    <label className="text-white/80">Nodo predeterminado</label>
                    <select value={ajustes.nodo} onChange={(e) => setAjustes({ ...ajustes, nodo: e.target.value as AjustesBitnet["nodo"] })} className="mt-1 w-full cursor-pointer rounded border border-white/10 bg-black/50 p-1.5 text-white">
                        <option value="auto">auto (autodetección)</option><option value="local">local</option><option value="nube">nube</option><option value="vecino">vecino</option>
                    </select>
                    <p className="mt-0.5 text-[10px] text-white/50">Ubicación preferida para enrutar la inferencia.</p>
                </div>
                <div className="md:col-span-2">
                    <label className="text-white/80">Límite de SWAP para auto-dormir (GB)</label>
                    <input type="number" min={0} max={128} value={ajustes.dormirSiSwapGb} onChange={(e) => setAjustes({ ...ajustes, dormirSiSwapGb: Number(e.target.value) })} className="mt-1 w-full cursor-text rounded border border-white/10 bg-black/50 p-1.5 text-white" />
                    <p className="mt-0.5 text-[10px] text-white/50">Si el archivo swap supera este límite, duerme el motor.</p>
                </div>
            </div>
            {mensaje && (
                <div className="space-y-2 rounded-lg border border-violet-500/30 bg-violet-500/10 p-2.5 text-xs text-violet-200">
                    <p>{mensaje}</p>
                    <div className="flex items-center gap-2 rounded bg-black/40 p-1.5 font-mono text-[11px] text-white/90">
                        <span className="flex-1 truncate">{CMD}</span>
                        <Button type="button" variant="ghost" size="sm" onClick={copiarCmd} className="h-6 cursor-pointer px-2 text-xs">
                            {copiado ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                        </Button>
                    </div>
                </div>
            )}
        </article>
    );
}

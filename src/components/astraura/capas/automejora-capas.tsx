"use client";

/**
 * AutomejoraCapas — Ajustes · Capas · «Automejora» (MTN1027K · contrato §5).
 * Lee `/api/astraura/automejora` (solo local), guarda en `directivas-almacen` lo más
 * nuevo (así llega a las demás neuronas) y enseña por capa el interruptor, el acierto
 * de la activa frente a la anterior, el historial y la última noche.
 */

import { useCallback, useEffect, useState } from "react";
import { RotateCcw, Sparkles } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import {
    capasVisibles,
    compararVersiones,
    normalizarEstado,
    porcentaje,
    textoNoche,
    vacioAutomejora,
    type EstadoAutomejora,
} from "@/lib/astraura/capas/automejora";
import { guardarDirectivas } from "@/lib/astraura/capas/directivas-almacen";
import { cn } from "@/lib/utils";

export const RUTA_AUTOMEJORA = "/api/astraura/automejora";

export function AutomejoraCapas({ compacto = false }: { compacto?: boolean }) {
    const [estado, setEstado] = useState<EstadoAutomejora>(vacioAutomejora);
    const [cargando, setCargando] = useState(true);
    const [aviso, setAviso] = useState("");
    const aplicar = useCallback((crudo: unknown) => {
        const nuevo = normalizarEstado(crudo);
        setEstado(nuevo);
        for (const [capa, archivo] of Object.entries(nuevo.directivas)) void guardarDirectivas(capa, archivo);
    }, []);
    useEffect(() => {
        let vivo = true;
        fetch(RUTA_AUTOMEJORA, { cache: "no-store" }).then((r) => r.json()).then((d) => { if (vivo) aplicar(d); })
            .catch(() => { if (vivo) setEstado(vacioAutomejora()); }).finally(() => { if (vivo) setCargando(false); });
        return () => { vivo = false; };
    }, [aplicar]);
    const enviar = useCallback(async (capa: string, accion: string, valor?: boolean) => {
        try {
            const r = await fetch(RUTA_AUTOMEJORA, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ capa, accion, ...(valor === undefined ? {} : { valor }) }),
            });
            if (!r.ok) throw new Error("sin guardar");
            aplicar(await r.json());
            setAviso("Guardado.");
        } catch { setAviso("No se pudo guardar."); }
    }, [aplicar]);
    const noche = estado.ultimaNoche;
    return (
        <section data-testid="automejora-capas" className={cn("flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-white", compacto && "gap-2 p-2")}>
            <header className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-medium"><Sparkles className="h-3.5 w-3.5 text-[#39FF14]" />Automejora (Meta^n)</span>
                <span className="text-[10px] text-white/45">{cargando ? "Leyendo…" : estado.vacio ? "Sin datos en esta máquina" : "Local"}</span>
            </header>
            <ul className="flex flex-col gap-2">
                {capasVisibles(estado).map((capa) => {
                    const archivo = estado.directivas[capa];
                    const { activa, anterior } = compararVersiones(archivo);
                    return (
                        <li key={capa} className="rounded-md border border-white/10 bg-black/20 px-2 py-1.5">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium capitalize">{capa}</span>
                                <Switch aria-label={`Automejora de la capa ${capa}`} className="scale-90" checked={estado.config.capas[capa] === true} onCheckedChange={(v) => void enviar(capa, v ? "encender" : "apagar")} />
                            </div>
                            <p className="text-[11px] text-white/55">{activa ? `Versión ${activa.version}: ${porcentaje(activa.acierto)} · anterior ${porcentaje(anterior?.acierto)}` : "Sin pauta activa todavía."}</p>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="flex items-center gap-1 text-[10px] text-white/55">
                                    <Switch aria-label={`Aportar experiencias de ${capa}`} className="scale-75" checked={estado.config.aportar[capa] !== false} onCheckedChange={(v) => void enviar(capa, "aportar", v)} />
                                    Aportar mis experiencias
                                </span>
                                <button type="button" aria-label={`Volver a la anterior de ${capa}`} disabled={!anterior} onClick={() => void enviar(capa, "volver")}
                                    className="flex cursor-pointer items-center gap-1 rounded border border-white/15 px-2 py-1 text-[10px] text-white/70 transition-colors duration-200 hover:border-[#007FFF]/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
                                    <RotateCcw className="h-3 w-3" />Volver a la anterior
                                </button>
                            </div>
                            {archivo?.historial?.length ? (
                                <ul className="mt-1 flex flex-col gap-0.5 text-[10px] text-white/40">
                                    {[...archivo.historial].sort((a, b) => b.version - a.version).map((d) => (
                                        <li key={d.version}>{`v${d.version} · ${porcentaje(d.acierto)} · ${d.estado} · ${d.fecha}`}</li>
                                    ))}
                                </ul>
                            ) : null}
                        </li>
                    );
                })}
            </ul>
            <label className="flex cursor-pointer items-center gap-2 text-[11px] text-white/70">
                <Switch aria-label="Preguntarme antes de activar" className="scale-90" checked={estado.config.preguntar} onCheckedChange={(v) => void enviar("todas", "preguntar", v)} />
                Preguntarme antes de activar
            </label>
            <div className="rounded-md border border-white/10 bg-black/20 px-2 py-1.5">
                <p className="text-[11px] font-medium text-white/70">{cargando ? "Leyendo la última noche…" : textoNoche(noche)}</p>
                {noche ? (
                    <ul className="mt-1 flex flex-col gap-0.5 text-[10px] text-white/50">
                        <li>{`Dónde: ${noche.donde ?? "no consta"}`}</li>
                        <li>{`Llamadas: ${noche.llamadas ?? "no consta"}`}</li>
                        <li>{`Propuso: ${noche.propuestas.length ? noche.propuestas.map((p) => p.titulo || p.task_id || p.capa).join(" · ") : "nada"}`}</li>
                        <li>{`Aprobó el juez: ${noche.aprobadas.length ? noche.aprobadas.map((d) => `${d.capa}${d.version ? ` v${d.version}` : ""} (${porcentaje(d.acierto)})`).join(" · ") : "nada"}`}</li>
                        {noche.motivo ? <li>{`Motivo: ${noche.motivo}`}</li> : null}
                    </ul>
                ) : null}
            </div>
            {aviso ? <p role="status" className="text-[10px] text-[#39FF14]">{aviso}</p> : null}
        </section>
    );
}

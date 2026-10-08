"use client";

/**
 * Interruptor «Autopublicación» (2026-10-07)
 * ─────────────────────────────────────────────────────────────────────────────
 * Alex: «añade un ajuste de un switch de autopublicación que sea realizado por un director
 * especializado de producción y publicación que realice todas las pruebas, análisis y
 * verificaciones a profundidad». Encendido, `scripts/puente/autopublicar.py` (servicio
 * `com.starseed.produccion`, cada 5 min) lleva main a producción tras: análisis del lote
 * (secretos, migraciones destructivas, Jev) → pruebas del puente en la Mac → CI en GitHub
 * (tsc, vitest, núcleo mesh, next build) → push sin force → Vercel listo y humo en producción.
 * Aquí se enciende/apaga y se ve en qué paso va. Vive en Ajustes, en Publicación y (2026-10-08) dentro
 * del medidor «Sin publicar» del pulso, con «Revisar ahora» y, si Jev frenó el lote, «Publicar sin Jev
 * esta vez» (solo salta a Jev: las pruebas, el CI, Vercel y el humo siguen).
 */

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, Rocket } from "lucide-react";

import { Switch } from "@/components/ui/switch";

export interface EstadoAutopublicacion {
    fase?: string;
    detalle?: string;
    sha?: string | null;
    url?: string | null;
    actualizado?: string;
    pendientes?: number;
    jev?: { decision?: string; confianza?: number; sha?: string };
    historial?: { sha: string; resultado: string; dia: string; url?: string | null; motivo?: string }[];
}

const FASES: Record<string, { texto: string; tono: string }> = {
    apagado: { texto: "Apagada", tono: "text-white/50" },
    "al-dia": { texto: "Producción al día", tono: "text-emerald-300" },
    esperando: { texto: "Esperando", tono: "text-sky-300" },
    ci: { texto: "CI en GitHub", tono: "text-amber-300" },
    verificando: { texto: "Verificando en Vercel", tono: "text-amber-300" },
    publicado: { texto: "Publicado y verificado", tono: "text-emerald-300" },
    bloqueado: { texto: "Frenada", tono: "text-red-300" },
};

/** Etiqueta y color de una fase del director (desconocida → «Sin datos»). */
export function faseVisible(fase: string | undefined): { texto: string; tono: string } {
    return (fase && FASES[fase]) || { texto: "Sin datos aún", tono: "text-white/50" };
}

/** Lo que opinó Jev del último lote, en una línea (o null si no hay nada que decir). */
export function lineaJev(e: EstadoAutopublicacion | null | undefined): string | null {
    const j = e?.jev;
    if (!j?.decision) return null;
    const p = typeof j.confianza === "number" ? j.confianza.toFixed(2).replace(".", ",") : "?";
    if (j.decision === "frena") return `Jev frenó el lote (seguro al ${p}).`;
    if (j.decision === "duda") return `Jev dudaba (${p}), pero no frena por debajo de 0,95: deciden las puertas.`;
    if (j.decision === "saltado") return "Jev saltado desde Genesis para este lote.";
    return null;
}

export function InterruptorAutopublicacion({ compacto = false }: { compacto?: boolean }) {
    const [activo, setActivo] = useState(false);
    const [estado, setEstado] = useState<EstadoAutopublicacion | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const [aviso, setAviso] = useState<string | null>(null);

    const cargar = useCallback(async () => {
        try {
            const r = await fetch("/api/mando/produccion", { cache: "no-store" });
            if (!r.ok) return;
            const cuerpo = (await r.json()) as { autopublicar?: { activo?: boolean }; autopublicarEstado?: EstadoAutopublicacion };
            setActivo(cuerpo.autopublicar?.activo === true);
            setEstado(cuerpo.autopublicarEstado ?? null);
        } catch {
            /* la próxima vuelta */
        }
    }, []);

    useEffect(() => {
        void cargar();
        const id = window.setInterval(() => {
            if (document.visibilityState === "visible") void cargar();
        }, 15_000);
        return () => window.clearInterval(id);
    }, [cargar]);

    const alCambiar = useCallback(
        async (valor: boolean) => {
            setOcupado(true);
            setAviso(null);
            try {
                const r = await fetch("/api/mando/produccion", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ accion: "autopublicar", activo: valor }),
                });
                if (!r.ok) throw new Error(String(r.status));
                setActivo(valor);
                await cargar();
            } catch {
                setAviso("No se pudo guardar el interruptor (la consola local no respondió).");
            } finally {
                setOcupado(false);
            }
        },
        [cargar],
    );

    const pedir = useCallback(
        async (accion: "autopublicar-revisar" | "autopublicar-saltar-jev") => {
            setOcupado(true);
            setAviso(null);
            try {
                const r = await fetch("/api/mando/produccion", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ accion }),
                });
                if (!r.ok) throw new Error(String(r.status));
                setAviso(
                    accion === "autopublicar-revisar"
                        ? "Pedido: el director revisa el lote ahora (tarda unos segundos)."
                        : "Pedido: este lote sigue sin Jev; las demás puertas se pasan igual.",
                );
                window.setTimeout(() => void cargar(), 4000);
            } catch {
                setAviso("No se pudo pedir (la consola local no respondió).");
            } finally {
                setOcupado(false);
            }
        },
        [cargar],
    );

    const fase = faseVisible(activo ? estado?.fase : "apagado");
    const frenadaPorJev = activo && estado?.fase === "bloqueado" && (estado?.detalle ?? "").startsWith("Jev");
    const jev = activo ? lineaJev(estado) : null;
    const ultimas = (estado?.historial ?? []).slice(-3).reverse();

    return (
        <article data-testid="interruptor-autopublicacion" className="rounded-xl border border-white/10 bg-black/30 p-4">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                        <Rocket className="h-4 w-4 text-fuchsia-300" aria-hidden />
                        Autopublicación
                    </h3>
                    <p className="mt-0.5 text-xs text-white/50">
                        El director de producción publica solo lo que pasa análisis, pruebas, CI y verificación en producción.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {ocupado && <Loader2 className="h-4 w-4 animate-spin text-white/50" aria-hidden />}
                    <Switch
                        id="switch-autopublicacion"
                        checked={activo}
                        onCheckedChange={(v) => void alCambiar(v)}
                        disabled={ocupado}
                        aria-label="Autopublicación"
                    />
                </div>
            </header>
            <div className="mt-3 space-y-1.5 text-xs text-white/60">
                <p>
                    <span className={fase.tono}>{fase.texto}</span>
                    {activo && estado?.detalle ? <> · {estado.detalle}</> : null}
                </p>
                {activo && estado?.sha && (
                    <p className="text-white/50">
                        Commit <code>{estado.sha.slice(0, 8)}</code>
                        {typeof estado.pendientes === "number" ? ` · ${estado.pendientes} commit(s) en el lote` : ""}
                        {estado.url && (
                            <a href={estado.url} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 text-sky-300 underline">
                                ver <ExternalLink className="h-3 w-3" aria-hidden />
                            </a>
                        )}
                    </p>
                )}
                {jev && <p className="text-white/50">{jev}</p>}
                {activo && (
                    <div className="flex flex-wrap gap-2 pt-1">
                        <button
                            type="button"
                            onClick={() => void pedir("autopublicar-revisar")}
                            disabled={ocupado}
                            className="rounded-md border border-white/15 px-2 py-1 text-[11px] text-white/80 hover:bg-white/10 disabled:opacity-50"
                        >
                            Revisar ahora
                        </button>
                        {frenadaPorJev && (
                            <button
                                type="button"
                                onClick={() => void pedir("autopublicar-saltar-jev")}
                                disabled={ocupado}
                                className="rounded-md border border-amber-300/40 px-2 py-1 text-[11px] text-amber-200 hover:bg-amber-400/10 disabled:opacity-50"
                            >
                                Publicar sin Jev esta vez
                            </button>
                        )}
                    </div>
                )}
                {!compacto && (
                    <p className="text-white/40">
                        Puertas: secretos y migraciones · Jev · pruebas del puente · CI (tsc, vitest, next build) · push sin force · Vercel y humo.
                    </p>
                )}
                {!compacto && ultimas.length > 0 && (
                    <ul className="space-y-0.5 text-white/50" aria-label="Últimas publicaciones">
                        {ultimas.map((h) => (
                            <li key={`${h.sha}-${h.resultado}`}>
                                {h.dia} · <code>{h.sha.slice(0, 8)}</code> · {h.resultado}
                                {h.motivo ? ` (${h.motivo})` : ""}
                            </li>
                        ))}
                    </ul>
                )}
                {aviso && (
                    <p role="alert" className="text-red-300">
                        {aviso}
                    </p>
                )}
            </div>
        </article>
    );
}

"use client";

import { useState } from "react";
import {
    Check,
    ChevronDown,
    ChevronRight,
    Copy,
    ExternalLink,
    Film,
    Loader2,
    Sparkles,
    X,
} from "lucide-react";
import { ordenarYFiltrarAcciones, type AccionAlex } from "@/lib/mando/acciones-alex";

export interface PanelTeTocaProps {
    acciones: AccionAlex[];
    alCerrar: () => void;
    alCambiar: () => void;
}

interface ResultadoAccion {
    hecha: boolean;
    detalle: string;
    comprobado: string;
}

/**
 * Panel «Te toca a ti» rediseñado para MetaGenesis:
 *   - Muestra contexto completo (por qué se pide, cómo hacerlo paso a paso, proyecto y coste).
 *   - Expande el prompt exacto (Higgsfield u otros generadores) cuando existe.
 *   - Permite **Aprobar** y **Rechazar** directamente en el navegador mediante `POST /api/mando/acciones`,
 *     además de recomprobar acciones externas (check-ins, secretos).
 */
export function PanelTeToca({ acciones, alCerrar, alCambiar }: PanelTeTocaProps) {
    const { acciones: ordenadas, descartadas } = ordenarYFiltrarAcciones({
        generado: "",
        acciones,
    });
    const [ocupadoId, setOcupadoId] = useState<string | null>(null);
    const [confirmandoRechazo, setConfirmandoRechazo] = useState<string | null>(null);
    const [promptsAbiertos, setPromptsAbiertos] = useState<Record<string, boolean>>({});
    const [copiadoId, setCopiadoId] = useState<string | null>(null);
    const [resultados, setResultados] = useState<Record<string, ResultadoAccion>>({});

    const ejecutarAccion = async (id: string, accion: "verificar" | "aprobar" | "rechazar") => {
        setOcupadoId(`${accion}:${id}`);
        try {
            const res = await fetch("/api/mando/acciones", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, accion }),
            });
            const datos = (await res.json()) as ResultadoAccion & { error?: string; ok?: boolean };
            const hecha = Boolean(datos.hecha ?? (res.ok && datos.ok));
            const detalle =
                datos.detalle ||
                datos.error ||
                (accion === "aprobar"
                    ? "Propuesta aprobada."
                    : accion === "rechazar"
                      ? "Propuesta rechazada."
                      : "No se pudo comprobar.");
            setResultados((prev) => ({
                ...prev,
                [id]: {
                    hecha,
                    detalle,
                    comprobado: datos.comprobado ?? "",
                },
            }));
            setConfirmandoRechazo(null);
            if (hecha) alCambiar();
        } catch {
            setResultados((prev) => ({
                ...prev,
                [id]: {
                    hecha: false,
                    detalle: "Sin respuesta de la API al aplicar la decisión.",
                    comprobado: "",
                },
            }));
        } finally {
            setOcupadoId(null);
        }
    };

    const copiar = async (id: string, texto: string) => {
        try {
            await navigator.clipboard.writeText(texto);
            setCopiadoId(id);
            window.setTimeout(() => setCopiadoId((prev) => (prev === id ? null : prev)), 2000);
        } catch {
            const area = document.createElement("textarea");
            area.value = texto;
            area.style.position = "fixed";
            area.style.opacity = "0";
            document.body.appendChild(area);
            area.select();
            document.execCommand("copy");
            document.body.removeChild(area);
            setCopiadoId(id);
        }
    };

    const tonoUrgencia: Record<string, string> = {
        alta: "border-rose-400/40 bg-rose-500/15 text-rose-200",
        media: "border-amber-400/40 bg-amber-500/15 text-amber-200",
        baja: "border-white/15 bg-white/5 text-slate-300",
    };

    return (
        <section
            role="region"
            aria-label="Acciones que esperan a Alex"
            data-testid="panel-te-toca"
            className="mc-cristal mc-desplegar mt-2 w-full border-amber-400/25 p-4 text-left"
        >
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
                <div className="flex flex-wrap items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-300" aria-hidden />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-100">
                        Te toca a ti
                    </h3>
                    <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
                        {ordenadas.length} pendiente{ordenadas.length === 1 ? "" : "s"}
                    </span>
                    {descartadas > 0 ? (
                        <span className="text-[10px] text-slate-400">
                            ({descartadas} sin comando ni enlace)
                        </span>
                    ) : null}
                </div>
                <button
                    type="button"
                    onClick={alCerrar}
                    className="cursor-pointer rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300 hover:border-white/30 hover:text-white"
                >
                    Cerrar
                </button>
            </header>

            {ordenadas.length === 0 ? (
                <p className="mc-centrado mt-3 text-xs text-slate-400">
                    Nada que necesite tu intervención ahora mismo. La dirección autónoma sigue trabajando.
                </p>
            ) : (
                <ul className="mt-3 grid gap-3 lg:grid-cols-2">
                    {ordenadas.map((a) => {
                        const res = resultados[a.id];
                        const abiertoPrompt = Boolean(promptsAbiertos[a.id]);
                        const esHiggsfield = a.categoria === "higgsfield" || a.id.startsWith("higgsfield-");
                        return (
                            <li
                                key={a.id}
                                data-testid={`accion-alex-${a.id}`}
                                className="flex flex-col gap-2 rounded-xl border border-white/10 bg-[#0A0F1D]/90 p-3"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="font-mono text-[11px] font-semibold text-sky-300">
                                            {a.id}
                                        </span>
                                        <span
                                            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                                                tonoUrgencia[a.urgencia] ?? tonoUrgencia.baja
                                            }`}
                                        >
                                            {a.urgencia}
                                        </span>
                                        {esHiggsfield ? (
                                            <span className="inline-flex items-center gap-1 rounded-full border border-violet-400/35 bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-200">
                                                <Film className="h-2.5 w-2.5" aria-hidden />
                                                Higgsfield
                                            </span>
                                        ) : null}
                                    </div>
                                    {typeof a.creditos_estimados === "number" ? (
                                        <span className="rounded-full border border-amber-400/35 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-200">
                                            ~{a.creditos_estimados} créditos
                                        </span>
                                    ) : null}
                                </div>

                                <div>
                                    <h4 className="text-xs font-semibold leading-snug text-white">
                                        {a.titulo}
                                    </h4>
                                    <p className="mt-1 text-[11px] leading-relaxed text-amber-100/85">
                                        {a.por_que}
                                    </p>
                                    {a.motivo && a.motivo !== a.por_que ? (
                                        <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
                                            <span className="text-slate-400">Motivo de producción: </span>
                                            {a.motivo}
                                        </p>
                                    ) : null}
                                    {a.como_hacerlo ? (
                                        <p className="mt-1.5 rounded-lg border border-sky-400/20 bg-sky-500/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-sky-100">
                                            <strong className="font-semibold">Cómo resolverlo: </strong>
                                            {a.como_hacerlo}
                                        </p>
                                    ) : null}
                                </div>

                                {(a.modelo || typeof a.tomas === "number" || a.proyecto) ? (
                                    <dl className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5 text-[10px] text-slate-300">
                                        {a.proyecto ? (
                                            <div>
                                                <dt className="inline text-slate-500">Proyecto: </dt>
                                                <dd className="inline font-medium text-slate-100">{a.proyecto}</dd>
                                            </div>
                                        ) : null}
                                        {a.modelo ? (
                                            <div>
                                                <dt className="inline text-slate-500">Modelo: </dt>
                                                <dd className="inline font-mono text-sky-200">{a.modelo}</dd>
                                            </div>
                                        ) : null}
                                        {typeof a.tomas === "number" ? (
                                            <div>
                                                <dt className="inline text-slate-500">Tomas: </dt>
                                                <dd className="inline text-slate-100">{a.tomas}</dd>
                                            </div>
                                        ) : null}
                                    </dl>
                                ) : null}

                                {a.prompt ? (
                                    <div className="rounded-lg border border-white/10 bg-black/30">
                                        <button
                                            type="button"
                                            aria-expanded={abiertoPrompt}
                                            onClick={() =>
                                                setPromptsAbiertos((prev) => ({
                                                    ...prev,
                                                    [a.id]: !prev[a.id],
                                                }))
                                            }
                                            className="flex w-full cursor-pointer items-center justify-between px-2.5 py-1.5 text-[11px] font-medium text-slate-200 hover:text-white"
                                        >
                                            <span className="inline-flex items-center gap-1.5">
                                                {abiertoPrompt ? (
                                                    <ChevronDown className="h-3.5 w-3.5 text-sky-300" aria-hidden />
                                                ) : (
                                                    <ChevronRight className="h-3.5 w-3.5 text-sky-300" aria-hidden />
                                                )}
                                                Ver prompt completo de generación
                                            </span>
                                            <span className="text-[10px] text-slate-400">
                                                {abiertoPrompt ? "Ocultar" : "Desplegar"}
                                            </span>
                                        </button>
                                        {abiertoPrompt ? (
                                            <pre className="whitespace-pre-wrap border-t border-white/10 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-slate-200 select-text">
                                                {a.prompt}
                                            </pre>
                                        ) : null}
                                    </div>
                                ) : null}

                                {a.enlace ? (
                                    <p className="flex items-center gap-1.5 text-[11px]">
                                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-sky-300" aria-hidden />
                                        <a
                                            href={a.enlace}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="cursor-pointer truncate text-sky-300 underline underline-offset-2 hover:text-sky-200"
                                        >
                                            {a.enlace}
                                        </a>
                                    </p>
                                ) : null}

                                {a.comando ? (
                                    <div className="flex items-center gap-1.5">
                                        <code className="min-w-0 flex-1 truncate rounded-md border border-white/10 bg-black/50 px-2 py-1 font-mono text-[10px] text-slate-200 select-all">
                                            {a.comando}
                                        </code>
                                        <button
                                            type="button"
                                            onClick={() => void copiar(a.id, a.comando!)}
                                            aria-label="Copiar comando"
                                            className="cursor-pointer rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[10px] text-slate-200 hover:border-white/30"
                                        >
                                            {copiadoId === a.id ? (
                                                <Check className="h-3 w-3 text-emerald-300" aria-hidden />
                                            ) : (
                                                <Copy className="h-3 w-3" aria-hidden />
                                            )}
                                        </button>
                                    </div>
                                ) : null}

                                <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-white/10 pt-2">
                                    {a.aprobable ? (
                                        <button
                                            type="button"
                                            disabled={ocupadoId !== null}
                                            onClick={() => void ejecutarAccion(a.id, "aprobar")}
                                            data-testid={`aprobar-${a.id}`}
                                            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-emerald-400/50 bg-emerald-500/20 px-3 py-1 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-50"
                                        >
                                            {ocupadoId === `aprobar:${a.id}` ? (
                                                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                                            ) : (
                                                <Check className="h-3 w-3" aria-hidden />
                                            )}
                                            Aprobar
                                        </button>
                                    ) : null}

                                    {a.rechazable ? (
                                        confirmandoRechazo === a.id ? (
                                            <div className="inline-flex items-center gap-1.5">
                                                <button
                                                    type="button"
                                                    disabled={ocupadoId !== null}
                                                    onClick={() => void ejecutarAccion(a.id, "rechazar")}
                                                    data-testid={`confirmar-rechazar-${a.id}`}
                                                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-rose-400/60 bg-rose-600/80 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
                                                >
                                                    {ocupadoId === `rechazar:${a.id}` ? (
                                                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                                                    ) : (
                                                        <X className="h-3 w-3" aria-hidden />
                                                    )}
                                                    Confirmar rechazo
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setConfirmandoRechazo(null)}
                                                    className="cursor-pointer rounded-lg border border-white/15 px-2 py-1 text-[10px] text-slate-300 hover:text-white"
                                                >
                                                    Cancelar
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                disabled={ocupadoId !== null}
                                                onClick={() => setConfirmandoRechazo(a.id)}
                                                data-testid={`rechazar-${a.id}`}
                                                className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-rose-400/40 bg-rose-500/15 px-3 py-1 text-[11px] font-medium text-rose-100 hover:bg-rose-500/25 disabled:opacity-50"
                                            >
                                                <X className="h-3 w-3" aria-hidden />
                                                Rechazar
                                            </button>
                                        )
                                    ) : null}

                                    <button
                                        type="button"
                                        disabled={ocupadoId !== null}
                                        onClick={() => void ejecutarAccion(a.id, "verificar")}
                                        data-testid={`recomprobar-${a.id}`}
                                        className="mc-alzar inline-flex cursor-pointer items-center gap-1 rounded-lg border border-sky-400/40 bg-sky-500/15 px-2.5 py-1 text-[11px] text-sky-100 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        {ocupadoId === `verificar:${a.id}` ? (
                                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                                        ) : null}
                                        Ya lo hice · recomprobar
                                    </button>
                                </div>

                                {res ? (
                                    <p
                                        role="status"
                                        className={`rounded-md border px-2 py-1 text-[10px] ${
                                            res.hecha
                                                ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-200"
                                                : "border-amber-400/35 bg-amber-500/10 text-amber-200"
                                        }`}
                                    >
                                        {res.hecha ? "✓ " : "· "}
                                        {res.detalle}
                                        {res.comprobado ? ` (${res.comprobado})` : ""}
                                    </p>
                                ) : null}

                                <p className="text-[10px] text-slate-500">
                                    Por qué te toca: {a.por_que_no_lo_hago_yo}
                                </p>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}

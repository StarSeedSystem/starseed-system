"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Send, ShieldAlert, Sparkles } from "lucide-react";
import type { IdCanalEspecializado, PerfilCanalEspecializado } from "@/lib/mando/canales-especializados";
import { nombreDeCanal } from "@/lib/mando/canales-nombres";

interface MensajeHilo {
    id: string;
    t?: number;
    de: string;
    rol: string;
    tipo?: string;
    canal?: string;
    texto: string;
}

interface ResumenAlcance {
    pendientes: number;
    aprobadosSinEnviar: number;
    contactosListas: number;
    contactosTotal: number;
    ultimoObjetivo?: string;
    ultimoEstado?: string;
}

interface EstadoCanalRespuesta {
    generadoEn: string;
    canal: IdCanalEspecializado;
    perfil: PerfilCanalEspecializado;
    vinculo: {
        hermesSesion: string | null;
        hermesTitulo: string;
        telegramBot: string;
        astrauraPuente: string;
        gatewayEstado: string;
        telegramGateway: string;
        sincronizado: boolean;
    };
    mensajes: MensajeHilo[];
    produccion?: {
        encargoActivo: Record<string, unknown> | null;
        ultimasPeticiones: string[];
        alcance: ResumenAlcance;
    };
}

interface Props {
    canal: Exclude<IdCanalEspecializado, "principal">;
    modo?: "integrado" | "completo";
}

function claseAcento(tono: PerfilCanalEspecializado["tono"]): string {
    if (tono === "emerald") {
        return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
    }
    if (tono === "sky") {
        return "border-sky-400/30 bg-sky-500/10 text-sky-100";
    }
    return "border-violet-400/30 bg-violet-500/10 text-violet-100";
}

export function PanelChatEspecializado({ canal, modo = "integrado" }: Props) {
    const [datos, setDatos] = useState<EstadoCanalRespuesta | null>(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [texto, setTexto] = useState("");
    const [enviando, setEnviando] = useState(false);
    const [aviso, setAviso] = useState<string | null>(null);

    const cargar = useCallback(async () => {
        try {
            const resp = await fetch(`/api/mando/canales-direccion?canal=${encodeURIComponent(canal)}`, {
                cache: "no-store",
            });
            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }
            const json = (await resp.json()) as EstadoCanalRespuesta;
            setDatos(json);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "No se pudo leer el canal");
        } finally {
            setCargando(false);
        }
    }, [canal]);

    useEffect(() => {
        setCargando(true);
        void cargar();
        const id = window.setInterval(() => void cargar(), 12_000);
        return () => window.clearInterval(id);
    }, [cargar]);

    const enviar = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const limpio = texto.trim();
        if (!limpio || enviando) return;
        setEnviando(true);
        setAviso(null);
        try {
            const resp = await fetch("/api/mando/canales-direccion", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ canal, texto: limpio, origen: "metagenesis" }),
            });
            const json = (await resp.json()) as {
                ok?: boolean;
                telegram_ok?: boolean;
                detalle?: string;
                error?: string;
            };
            if (!resp.ok || !json.ok) {
                throw new Error(json.error || json.detalle || `HTTP ${resp.status}`);
            }
            setTexto("");
            setAviso(
                json.telegram_ok
                    ? "Publicación sincronizada con Telegram y el hilo local."
                    : `Guardado en hilo local (${json.detalle || "Telegram pendiente"}).`,
            );
            await cargar();
        } catch (err) {
            setAviso(err instanceof Error ? err.message : "No se pudo enviar el mensaje.");
        } finally {
            setEnviando(false);
        }
    };

    const perfil = datos?.perfil;
    const nombre = perfil?.nombre ?? nombreDeCanal(canal);

    return (
        <div
            data-testid={`panel-canal-${canal}`}
            className={`flex flex-col gap-3 rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/85 ${
                modo === "completo" ? "min-h-[540px]" : ""
            }`}
        >
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/10 pb-2.5">
                <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-white">
                            {nombre}
                        </span>
                        {datos?.vinculo ? (
                            <span
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${claseAcento(
                                    perfil?.tono ?? "sky",
                                )}`}
                            >
                                {datos.vinculo.telegramBot}
                            </span>
                        ) : null}
                        <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] ${
                                datos?.vinculo.sincronizado
                                    ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-200"
                                    : "border-amber-400/30 bg-amber-500/15 text-amber-200"
                            }`}
                        >
                            {datos?.vinculo.sincronizado
                                ? `Hermes sincronizado (${datos.vinculo.hermesSesion?.slice(0, 12)}…)`
                                : "Sesión Hermes enlazándose"}
                        </span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-white/65">
                        {perfil?.descripcion ?? "Cargando capacidades especializadas…"}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => void cargar()}
                    className="cursor-pointer inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-white/80 hover:bg-white/10"
                >
                    <RefreshCw className="h-3 w-3" />
                    Actualizar
                </button>
            </div>

            {perfil ? (
                <div className="grid gap-2 md:grid-cols-2">
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[11px] font-medium text-white/90">
                            <Sparkles className="h-3.5 w-3.5 text-violet-300" />
                            <span>Capacidades y herramientas autoadaptativas</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {perfil.herramientas.map((h) => (
                                <span
                                    key={h.id}
                                    title={h.regla ?? h.nombre}
                                    className="rounded-md border border-white/10 bg-black/30 px-2 py-0.5 text-[10px] text-white/80"
                                >
                                    {h.nombre}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[11px] font-medium text-white/90">
                            <ShieldAlert className="h-3.5 w-3.5 text-amber-300" />
                            <span>Reglas operativas y estado en vivo</span>
                        </div>
                        <ul className="space-y-1 text-[10px] text-white/70">
                            {perfil.reglasClave.map((regla) => (
                                <li key={regla}>• {regla}</li>
                            ))}
                        </ul>
                        {datos?.produccion ? (
                            <div className="mt-1 flex flex-wrap gap-2 border-t border-white/10 pt-1.5 text-[10px] text-emerald-200/90">
                                <span>Alcance pendiente: {datos.produccion.alcance.pendientes}</span>
                                <span>Listas contactos: {datos.produccion.alcance.contactosListas} ({datos.produccion.alcance.contactosTotal})</span>
                                {datos.produccion.alcance.ultimoObjetivo ? (
                                    <span>Objetivo: {datos.produccion.alcance.ultimoObjetivo}</span>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {perfil?.accionesRapidas.length ? (
                <div className="flex flex-wrap gap-1.5">
                    {perfil.accionesRapidas.map((atajo) => (
                        <button
                            key={atajo.id}
                            type="button"
                            onClick={() => setTexto(atajo.plantilla)}
                            title={atajo.descripcion}
                            className="cursor-pointer rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-white/85 hover:bg-white/10"
                        >
                            {atajo.etiqueta}
                        </button>
                    ))}
                </div>
            ) : null}

            {error ? (
                <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-2 text-[11px] text-rose-200">
                    {error}
                </p>
            ) : null}

            <div className="max-h-72 overflow-y-auto rounded-lg border border-white/10 bg-black/40 p-2.5 space-y-2">
                {cargando && !datos ? (
                    <p className="text-[11px] text-white/55">Cargando historial sincronizado…</p>
                ) : datos?.mensajes.length ? (
                    datos.mensajes.map((m) => (
                        <div
                            key={m.id}
                            className={`rounded-lg border px-2.5 py-2 text-[11px] ${
                                m.rol === "alex"
                                    ? "border-violet-400/30 bg-violet-500/10 text-violet-50"
                                    : "border-white/10 bg-white/[0.04] text-white/85"
                            }`}
                        >
                            <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-[10px] text-white/55">
                                <span className="font-medium text-white/75">
                                    {m.de} {m.canal ? `· ${m.canal}` : ""}
                                </span>
                                {m.t ? (
                                    <span>
                                        {new Date(m.t * 1000).toLocaleTimeString("es-MX", {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                    </span>
                                ) : null}
                            </div>
                            <p className="whitespace-pre-wrap leading-relaxed">{m.texto}</p>
                        </div>
                    ))
                ) : (
                    <p className="text-[11px] text-white/55">
                        Canal listo y enlazado. Escribe aquí o usa un atajo para iniciar una orden en este hilo sincronizado.
                    </p>
                )}

                {datos?.produccion?.ultimasPeticiones.length ? (
                    <div className="mt-2 rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-2 text-[10px] text-emerald-100/80">
                        <div className="mb-1 font-medium text-emerald-200">
                            Últimos eventos recibidos en @StarSeed_Design_bot
                        </div>
                        {datos.produccion.ultimasPeticiones.slice(-4).map((linea, idx) => (
                            <div key={`${idx}-${linea.slice(0, 20)}`} className="truncate">
                                {linea}
                            </div>
                        ))}
                    </div>
                ) : null}
            </div>

            {aviso ? (
                <p role="status" className="text-[11px] text-emerald-200/90">
                    {aviso}
                </p>
            ) : null}

            <form onSubmit={(e) => void enviar(e)} className="flex flex-col gap-2 sm:flex-row">
                <textarea
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    rows={2}
                    placeholder={
                        canal === "audiovisual"
                            ? `Encarga a ${nombre}: diseño (Stitch/DESIGN.md), vídeo/motion, síntesis NotebookLM o borrador de promoción/contactos…`
                            : `Escribe una orden operativa para ${nombre} (Hermes y @starseed_puente_bot)…`
                    }
                    aria-label={`Mensaje para ${nombre}`}
                    className="min-h-[54px] flex-1 rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-xs text-white placeholder:text-white/40 focus:border-violet-400/60 focus:outline-none"
                />
                <button
                    type="submit"
                    disabled={enviando || !texto.trim()}
                    className="cursor-pointer inline-flex items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-45"
                >
                    <Send className="h-3.5 w-3.5" />
                    {enviando ? "Enviando…" : "Enviar"}
                </button>
            </form>
        </div>
    );
}

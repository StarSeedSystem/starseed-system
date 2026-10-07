"use client";

/**
 * Tarjeta «Producción» del panel de Publicación (Ola 1005R · PRD1005I)
 * ─────────────────────────────────────────────────────────────────────────────
 * Contrato `architecture/director-produccion.md` §7: el lote en curso puerta a
 * puerta (verde · ámbar · rojo · omitida), los medios con el `sha` que sirven,
 * las últimas 10 publicaciones y reversiones, el modo y los botones
 * Pausar/Reanudar y Vetar. Sondea `/api/mando/produccion` cada 5 s, pero solo
 * con la pestaña visible.
 */

import { InterruptorAutopublicacion } from "@/components/mando/interruptor-autopublicacion";
import { useCallback, useEffect, useState } from "react";
import { CircleSlash, Factory, Pause, Play } from "lucide-react";

import type { ProduccionConfig } from "@/lib/mando/director-config";

export type EstadoPuerta = "ok" | "falla" | "corriendo" | "omitida";

export interface PuertaVista {
    nombre: string;
    estado: EstadoPuerta;
    detalle: string;
}

export interface CandidataVista {
    tid: string;
    sha: string;
    titulo: string;
    puertas: PuertaVista[];
}

export interface MedioVista {
    nombre: string;
    sha: string;
}

export interface PublicacionVista {
    sha: string;
    cuando: string;
    revertida: boolean;
}

export interface EstadoProduccionVista {
    actualizadoEn: string | null;
    candidatos: CandidataVista[];
    medios: MedioVista[];
    publicaciones: PublicacionVista[];
}

interface DatosProduccion {
    estado: EstadoProduccionVista;
    config: ProduccionConfig;
    pausada: boolean;
    vetos: number;
}

const CLASE_PUERTA: Record<EstadoPuerta, string> = {
    ok: "bg-emerald-400",
    falla: "bg-red-400",
    corriendo: "bg-amber-400",
    omitida: "bg-zinc-600",
};

const TEXTO_PUERTA: Record<EstadoPuerta, string> = {
    ok: "en verde",
    falla: "en rojo",
    corriendo: "en marcha",
    omitida: "omitida",
};

function SemaforoPuerta({ puerta }: { puerta: PuertaVista }) {
    return (
        <li className="flex items-center gap-2 text-[11px]">
            <span className={`h-2 w-2 shrink-0 rounded-full ${CLASE_PUERTA[puerta.estado]}`} aria-hidden />
            <span className="text-white/75">{puerta.nombre}</span>
            <span className="ml-auto text-white/45">
                {puerta.detalle || TEXTO_PUERTA[puerta.estado]}
            </span>
        </li>
    );
}

export function PanelProduccion() {
    const [datos, setDatos] = useState<DatosProduccion | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [vetando, setVetando] = useState(false);
    const [claveVeto, setClaveVeto] = useState("");
    const [motivoVeto, setMotivoVeto] = useState("");
    const [ocupado, setOcupado] = useState(false);

    const cargar = useCallback(async () => {
        try {
            const respuesta = await fetch("/api/mando/produccion", { cache: "no-store" });
            if (!respuesta.ok) {
                setError(respuesta.status === 404 ? "El director de producción solo existe en local." : `No se pudo leer la producción (HTTP ${respuesta.status}).`);
                return;
            }
            const cuerpo = (await respuesta.json()) as {
                estado?: unknown;
                config?: ProduccionConfig;
                pausada?: boolean;
                vetos?: number;
            };
            setDatos({
                estado: normalizarEstado(cuerpo.estado),
                config: cuerpo.config ?? ({} as ProduccionConfig),
                pausada: cuerpo.pausada === true,
                vetos: typeof cuerpo.vetos === "number" ? cuerpo.vetos : 0,
            });
            setError(null);
        } catch {
            setError("No se pudo leer la producción.");
        }
    }, []);

    useEffect(() => {
        void cargar();
        let intervalo: number | null = null;
        const empezar = () => {
            if (intervalo === null) intervalo = window.setInterval(() => void cargar(), 5_000);
        };
        const parar = () => {
            if (intervalo !== null) window.clearInterval(intervalo);
            intervalo = null;
        };
        const alCambiarVisibilidad = () => (document.visibilityState === "visible" ? empezar() : parar());
        if (document.visibilityState === "visible") empezar();
        document.addEventListener("visibilitychange", alCambiarVisibilidad);
        return () => {
            parar();
            document.removeEventListener("visibilitychange", alCambiarVisibilidad);
        };
    }, [cargar]);

    const actuar = useCallback(
        async (cuerpo: Record<string, string>) => {
            setOcupado(true);
            setError(null);
            try {
                const respuesta = await fetch("/api/mando/produccion", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(cuerpo),
                });
                const salida = (await respuesta.json().catch(() => ({}))) as { error?: string };
                if (!respuesta.ok) {
                    setError(salida.error ?? `No se pudo completar la acción (HTTP ${respuesta.status}).`);
                    return false;
                }
                await cargar();
                return true;
            } catch {
                setError("No se pudo completar la acción.");
                return false;
            } finally {
                setOcupado(false);
            }
        },
        [cargar],
    );

    const vetar = useCallback(async () => {
        if (await actuar({ accion: "vetar", clave: claveVeto, motivo: motivoVeto })) {
            setVetando(false);
            setClaveVeto("");
            setMotivoVeto("");
        }
    }, [actuar, claveVeto, motivoVeto]);

    const estado = datos?.estado ?? null;
    const modo = datos?.config.modo ?? "seco";
    const pausada = datos?.pausada === true;

    return (
        <section
            data-testid="panel-produccion"
            aria-label="Producción"
            className="mc-cristal mc-entrar rounded-xl p-4"
        >
            <header className="flex flex-wrap items-center gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Factory className="h-4 w-4" aria-hidden />
                    Producción
                </h3>
                <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/60">
                    modo {modo}
                </span>
                {pausada ? (
                    <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-200">
                        pausada
                    </span>
                ) : null}
                <div className="ml-auto flex items-center gap-2">
                    <button
                        type="button"
                        aria-pressed={pausada}
                        disabled={ocupado || !datos}
                        onClick={() => void actuar({ accion: pausada ? "reanudar" : "pausar" })}
                        className="mc-alzar inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/15 bg-white/[0.05] px-2.5 py-1.5 text-xs text-white/85 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {pausada ? <Play className="h-3.5 w-3.5" aria-hidden /> : <Pause className="h-3.5 w-3.5" aria-hidden />}
                        {pausada ? "Reanudar" : "Pausar"}
                    </button>
                    <button
                        type="button"
                        aria-expanded={vetando}
                        disabled={ocupado || !datos}
                        onClick={() => setVetando((v) => !v)}
                        className="mc-alzar inline-flex cursor-pointer items-center gap-1 rounded-md border border-rose-400/40 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-200 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <CircleSlash className="h-3.5 w-3.5" aria-hidden />
                        Vetar
                    </button>
                </div>
            </header>
            <div className="mt-3">
                <InterruptorAutopublicacion compacto />
            </div>

            {error ? <p className="mt-2 text-xs text-rose-200" role="alert">{error}</p> : null}
            {!datos && !error ? <p className="mt-3 text-xs text-white/50">Leyendo el estado del director…</p> : null}

            {vetando ? (
                <form
                    className="mc-desplegar mt-3 space-y-2 rounded-lg border border-white/10 bg-black/30 p-3"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void vetar();
                    }}
                >
                    <label className="block text-[11px] text-white/55">
                        Sha o tarea a vetar
                        <input
                            value={claveVeto}
                            onChange={(e) => setClaveVeto(e.target.value)}
                            required
                            className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 font-mono text-xs text-white/90 focus:border-cyan-400/60 focus:outline-none"
                        />
                    </label>
                    <label className="block text-[11px] text-white/55">
                        Motivo
                        <input
                            value={motivoVeto}
                            onChange={(e) => setMotivoVeto(e.target.value)}
                            className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white/90 focus:border-cyan-400/60 focus:outline-none"
                        />
                    </label>
                    <button
                        type="submit"
                        disabled={ocupado || !claveVeto.trim()}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-rose-400/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        Confirmar veto
                    </button>
                    {datos && datos.vetos > 0 ? (
                        <span className="ml-2 text-[11px] text-white/45">{datos.vetos} vetos activos</span>
                    ) : null}
                </form>
            ) : null}

            {estado ? (
                <div className="mt-3 space-y-3">
                    <div>
                        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-white/50">Lote en curso</h4>
                        {estado.candidatos.length === 0 ? (
                            <p className="mt-1 text-xs text-white/45">Sin candidatas a la espera de puertas.</p>
                        ) : (
                            <ul className="mt-1 space-y-2">
                                {estado.candidatos.map((c, i) => (
                                    <li key={c.tid || c.sha || i} className="rounded-lg border border-white/10 bg-black/30 p-2.5">
                                        <p className="flex min-w-0 items-baseline gap-2 text-xs">
                                            <span className="font-mono text-white/50">{c.tid || "—"}</span>
                                            <span className="font-mono text-white/40">{c.sha}</span>
                                            <span className="truncate text-white/80">{c.titulo}</span>
                                        </p>
                                        {c.puertas.length > 0 ? (
                                            <ul className="mt-1.5 space-y-1">
                                                {c.puertas.map((p) => (
                                                    <SemaforoPuerta key={p.nombre} puerta={p} />
                                                ))}
                                            </ul>
                                        ) : null}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div>
                        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-white/50">Medios</h4>
                        {estado.medios.length === 0 ? (
                            <p className="mt-1 text-xs text-white/45">Todavía no hay ningún medio confirmado.</p>
                        ) : (
                            <ul className="mt-1 flex flex-wrap gap-1.5">
                                {estado.medios.map((m) => (
                                    <li
                                        key={m.nombre}
                                        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/75"
                                    >
                                        {m.nombre}
                                        <span className="font-mono text-white/45">{m.sha}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div>
                        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-white/50">
                            Últimas publicaciones y reversiones
                        </h4>
                        {estado.publicaciones.length === 0 ? (
                            <p className="mt-1 text-xs text-white/45">Nada publicado aún por este director.</p>
                        ) : (
                            <ul className="mt-1 space-y-1">
                                {estado.publicaciones.map((p, i) => (
                                    <li key={`${p.sha}-${i}`} className="flex items-center gap-2 font-mono text-[11px] text-white/65">
                                        <span
                                            className={`h-2 w-2 shrink-0 rounded-full ${p.revertida ? "bg-red-400" : "bg-emerald-400"}`}
                                            aria-hidden
                                        />
                                        <span>{p.sha}</span>
                                        <span className="truncate text-white/40">{p.cuando}</span>
                                        {p.revertida ? <span className="text-red-300">revertida</span> : null}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            ) : null}
        </section>
    );
}

function esObjeto(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function texto(v: unknown): string {
    return typeof v === "string" ? v : "";
}

function estadoPuerta(v: unknown): EstadoPuerta {
    const bruto = esObjeto(v) ? texto(v.estado) : texto(v);
    if (["ok", "verde", "hecho"].includes(bruto)) return "ok";
    if (["falla", "rojo", "error"].includes(bruto)) return "falla";
    if (["omitida", "omitido"].includes(bruto)) return "omitida";
    return "corriendo";
}

function normalizarPuertas(crudo: unknown): PuertaVista[] {
    if (Array.isArray(crudo)) {
        return crudo.filter(esObjeto).map((p) => ({
            nombre: texto(p.nombre) || "puerta",
            estado: estadoPuerta(p.estado),
            detalle: texto(p.detalle),
        }));
    }
    if (esObjeto(crudo)) {
        return Object.entries(crudo).map(([nombre, valor]) => ({
            nombre,
            estado: estadoPuerta(valor),
            detalle: esObjeto(valor) ? texto(valor.detalle) : "",
        }));
    }
    return [];
}

function normalizarCandidatos(crudo: unknown): CandidataVista[] {
    const lista = Array.isArray(crudo) ? crudo : esObjeto(crudo) ? Object.values(crudo) : [];
    return lista.filter(esObjeto).map((c) => ({
        tid: texto(c.tid) || texto(c.tarea),
        sha: texto(c.sha).slice(0, 8),
        titulo: texto(c.titulo),
        puertas: normalizarPuertas(c.puertas),
    }));
}

function normalizarMedios(crudo: unknown): MedioVista[] {
    if (Array.isArray(crudo)) {
        return crudo.filter(esObjeto).map((m) => ({
            nombre: texto(m.nombre) || texto(m.medio) || "medio",
            sha: texto(m.sha).slice(0, 8) || "—",
        }));
    }
    if (esObjeto(crudo)) {
        return Object.entries(crudo).map(([nombre, valor]) => ({
            nombre,
            sha: (esObjeto(valor) ? texto(valor.sha) : texto(valor)).slice(0, 8) || "—",
        }));
    }
    return [];
}

export function normalizarEstado(crudo: unknown): EstadoProduccionVista {
    const obj = esObjeto(crudo) ? crudo : {};
    const cuando = (v: unknown) => (esObjeto(v) ? texto(v.cuando) || texto(v.fecha) || texto(v.hora) : "");
    const historial = obj.ultimas ?? obj.publicaciones ?? obj.historial ?? [];
    const publicaciones = (Array.isArray(historial) ? historial : []).filter(esObjeto).map((p) => ({
        sha: texto(p.sha).slice(0, 8) || "—",
        cuando: cuando(p),
        revertida: p.revertida === true || texto(p.resultado) === "revertida",
    }));
    return {
        actualizadoEn: texto(obj.actualizadoEn) || null,
        candidatos: normalizarCandidatos(obj.candidatos),
        medios: normalizarMedios(obj.medios),
        publicaciones: publicaciones.slice(-10).reverse(),
    };
}

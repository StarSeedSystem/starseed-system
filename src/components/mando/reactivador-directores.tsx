"use client";

/**
 * Botón «Reactivar directores», arriba del todo de Genesis (2026-10-06).
 *
 * Alex: «debería de haber un botón hasta arriba para lanzar un reactivador de todos los
 * directores que verifique y repare cualquier error o situación para mejorar». Lanza
 * `scripts/puente/reactivar_mando.py` (vía `/api/mando/reactivar`) y enseña su parte paso a
 * paso mientras avanza: servicios, autocuración (Genesis, disco, huecos, nube, enjambre
 * atascado), orquestador y medidores. Lo mismo hacen los directores solos cada pocos minutos;
 * el botón es para «ahora mismo».
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { CircleDashed, RefreshCw } from "lucide-react";
import {
    haceCuanto,
    tonoDelInforme,
    type EstadoPaso,
    type InformeReactivador,
} from "@/lib/mando/reactivador-tipos";

const ESTILO: Record<EstadoPaso | "nada", string> = {
    ok: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
    reparado: "border-cyan-400/30 bg-cyan-500/10 text-cyan-100",
    aviso: "border-amber-400/30 bg-amber-500/10 text-amber-100",
    fallo: "border-rose-400/30 bg-rose-500/10 text-rose-100",
    nada: "border-white/10 bg-white/5 text-white/70",
};

const NOMBRE: Record<EstadoPaso, string> = {
    ok: "bien",
    reparado: "reparado",
    aviso: "aviso",
    fallo: "fallo",
};

const CADA_MS = 2500;
const TOPE_MS = 6 * 60_000;

export function ReactivadorDirectores() {
    const [informe, setInforme] = useState<InformeReactivador | null>(null);
    const [lanzando, setLanzando] = useState(false);
    const [abierto, setAbierto] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [ahora, setAhora] = useState(() => Date.now());
    const sondeo = useRef<number | null>(null);
    const inicio = useRef(0);

    const leer = useCallback(async (): Promise<InformeReactivador | null> => {
        try {
            const r = await fetch("/api/mando/reactivar", { cache: "no-store" });
            if (!r.ok) return null;
            const d = (await r.json()) as { informe?: InformeReactivador | null };
            setInforme(d.informe ?? null);
            setAhora(Date.now());
            return d.informe ?? null;
        } catch {
            return null;
        }
    }, []);

    const parar = useCallback(() => {
        if (sondeo.current !== null) window.clearInterval(sondeo.current);
        sondeo.current = null;
    }, []);

    const seguir = useCallback(() => {
        parar();
        inicio.current = Date.now();
        sondeo.current = window.setInterval(async () => {
            const i = await leer();
            if ((i && !i.enMarcha) || Date.now() - inicio.current > TOPE_MS) {
                parar();
                setLanzando(false);
            }
        }, CADA_MS);
    }, [leer, parar]);

    useEffect(() => {
        void leer().then((i) => {
            if (i?.enMarcha) {
                setLanzando(true);
                setAbierto(true);
                seguir();
            }
        });
        return parar;
    }, [leer, seguir, parar]);

    const lanzar = async () => {
        setError(null);
        setLanzando(true);
        setAbierto(true);
        try {
            const r = await fetch("/api/mando/reactivar", { method: "POST" });
            if (!r.ok && r.status !== 202) {
                const d = (await r.json().catch(() => ({}))) as { error?: string };
                throw new Error(d.error || `respuesta ${r.status}`);
            }
            seguir();
        } catch (e) {
            setLanzando(false);
            setError(e instanceof Error ? e.message : String(e));
        }
    };

    const tono = lanzando ? "nada" : tonoDelInforme(informe);
    const enMarcha = lanzando || Boolean(informe?.enMarcha);

    return (
        <section aria-label="Reactivador de directores" className={`rounded-xl border p-3 ${ESTILO[tono]}`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 text-sm">
                    <p className="font-semibold">Reactivar directores</p>
                    <p className="truncate text-xs opacity-80" aria-live="polite">
                        {enMarcha
                            ? "Verificando y reparando: servicios, Genesis, disco, enjambre, nube y medidores…"
                            : informe
                              ? `Último: ${haceCuanto(informe.t, ahora)} · ${informe.resumen}`
                              : "Verifica y repara todo Genesis ahora, sin esperar a los directores."}
                    </p>
                </div>
                <div className="flex shrink-0 gap-2">
                    {informe && informe.pasos.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setAbierto((a) => !a)}
                            aria-expanded={abierto}
                            className="cursor-pointer rounded-lg border border-white/15 px-3 py-2 text-xs transition-colors duration-200 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
                        >
                            {abierto ? "Ocultar parte" : "Ver parte"}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={lanzar}
                        disabled={enMarcha}
                        aria-busy={enMarcha}
                        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-cyan-500/80 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors duration-200 hover:bg-cyan-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 disabled:cursor-wait disabled:opacity-70 sm:w-auto"
                    >
                        {enMarcha ? (
                            <CircleDashed className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                            <RefreshCw className="h-4 w-4" aria-hidden />
                        )}
                        {enMarcha ? "Reactivando…" : "Reactivar"}
                    </button>
                </div>
            </div>
            {error && (
                <p role="alert" className="mt-2 text-xs text-rose-200">
                    No pude lanzarlo: {error}
                </p>
            )}
            {abierto && informe && informe.pasos.length > 0 && (
                <ol className="mt-3 space-y-1.5 text-xs" aria-label="Parte del reactivador">
                    {informe.pasos.map((p, i) => (
                        <li key={`${p.paso}-${i}`} className={`rounded-lg border px-2.5 py-1.5 ${ESTILO[p.estado] ?? ESTILO.nada}`}>
                            <span className="font-semibold">{p.paso}</span>
                            <span className="ml-2 rounded px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide opacity-80">
                                {NOMBRE[p.estado] ?? p.estado}
                            </span>
                            {p.detalle && <p className="mt-0.5 break-words opacity-80">{p.detalle}</p>}
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}

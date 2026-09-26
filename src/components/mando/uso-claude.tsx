"use client";

/**
 * Tarjeta «Sesiones de Claude en esta Mac» (Ola 352 · MU2 · Puente de Mando)
 * ─────────────────────────────────────────────────────────────────────────────
 * Cuánto gastan las sesiones de Claude Code locales: tokens totales por tipo
 * (formato k/M), % de relectura de caché (verde ≥70, ámbar 40-70, rojo <40) y
 * las 5 sesiones más recientes. Se relee `GET /api/mando/uso-claude` cada 60 s.
 */

import { useCallback, useEffect, useState } from "react";
import { Bot } from "lucide-react";

interface TotalesUso {
    input: number;
    output: number;
    cache_read: number;
    cache_creation: number;
    turnos: number;
    relectura_pct: number;
}

interface SesionUso extends TotalesUso {
    archivo: string;
    cuando: string;
    proyecto: string;
}

interface ResumenUsoClaude {
    disponible: boolean;
    total: TotalesUso & { total: number };
    sesiones: SesionUso[];
}

/** 12 345 678 → «12,3 M», 9 876 → «9,9 k», 42 → «42» (es-ES, sin decimales < 1000). */
function compacto(n: number): string {
    const corto = (v: number) => v.toLocaleString("es-ES", { maximumFractionDigits: 1 });
    if (n >= 1_000_000) return `${corto(n / 1_000_000)} M`;
    if (n >= 1000) return `${corto(n / 1000)} k`;
    return String(Math.round(n));
}

/** Tono del % de relectura: verde ≥70, ámbar 40-70, rojo <40. */
export function tonoRelectura(pct: number): string {
    if (pct >= 70) return "border-emerald-400/40 bg-emerald-500/10 text-emerald-300";
    if (pct >= 40) return "border-amber-400/40 bg-amber-500/10 text-amber-200";
    return "border-red-400/40 bg-red-500/10 text-red-300";
}

function horaLocal(iso: string): string {
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return "—";
    return new Date(ms).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

export function TarjetaSesionesClaude() {
    const [resumen, setResumen] = useState<ResumenUsoClaude | null>(null);

    const cargar = useCallback(async () => {
        try {
            const r = await fetch("/api/mando/uso-claude", { cache: "no-store" });
            setResumen(r.ok ? ((await r.json()) as ResumenUsoClaude) : null);
        } catch {
            setResumen(null);
        }
    }, []);

    useEffect(() => {
        void cargar();
        const reloj = setInterval(() => void cargar(), 60_000);
        return () => clearInterval(reloj);
    }, [cargar]);

    if (!resumen) {
        return (
            <article data-testid="uso-claude" className="rounded-xl border border-white/10 bg-black/30 p-4">
                <p className="flex items-center gap-2 text-sm text-white/50">
                    <Bot className="h-4 w-4" />
                    Leyendo el uso de Claude…
                </p>
            </article>
        );
    }

    if (!resumen.disponible) {
        return (
            <article data-testid="uso-claude" className="rounded-xl border border-white/10 bg-black/30 p-4">
                <p className="flex items-center gap-2 text-sm text-white/60">
                    <Bot className="h-4 w-4" />
                    Sin sesiones de Claude Code en esta Mac.
                </p>
            </article>
        );
    }

    const { total } = resumen;
    const recientes = resumen.sesiones.slice(0, 5);

    return (
        <article data-testid="uso-claude" className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
            <header className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Bot className="h-4 w-4" />
                    Sesiones de Claude en esta Mac
                </h3>
                <span
                    data-testid="uso-claude-relectura"
                    title="Cuánto del contexto se recuperó de caché en vez de reprocesarse."
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${tonoRelectura(total.relectura_pct)}`}
                >
                    caché reutilizada {total.relectura_pct} %
                </span>
            </header>

            <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                <div>
                    <dt className="text-white/50">Total</dt>
                    <dd className="font-mono text-white">{compacto(total.total)} tok</dd>
                </div>
                <div>
                    <dt className="text-white/50">Entrada</dt>
                    <dd className="font-mono text-white/80">{compacto(total.input)}</dd>
                </div>
                <div>
                    <dt className="text-white/50">Salida</dt>
                    <dd className="font-mono text-white/80">{compacto(total.output)}</dd>
                </div>
                <div>
                    <dt className="text-white/50">Caché (leída · creada)</dt>
                    <dd className="font-mono text-white/80">
                        {compacto(total.cache_read)} · {compacto(total.cache_creation)}
                    </dd>
                </div>
            </dl>

            <ul className="mt-3 space-y-1 border-t border-white/10 pt-2">
                {recientes.map((s) => {
                    const totalSesion = s.input + s.output + s.cache_read + s.cache_creation;
                    return (
                        <li
                            key={s.archivo}
                            className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-white/60"
                        >
                            <span className="text-white/50">{horaLocal(s.cuando)}</span>
                            <span className="min-w-0 max-w-[10rem] truncate" title={s.proyecto}>
                                {s.proyecto}
                            </span>
                            <span className="ml-auto">{s.turnos} turnos</span>
                            <span>{compacto(totalSesion)}</span>
                            <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${tonoRelectura(s.relectura_pct)}`}>
                                {s.relectura_pct} %
                            </span>
                        </li>
                    );
                })}
            </ul>
        </article>
    );
}

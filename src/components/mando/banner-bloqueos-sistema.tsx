"use client";

import { AlertTriangle, CheckCircle2, HardDrive, Sparkles } from "lucide-react";

export interface BannerBloqueosSistemaProps {
    discoLibreMb?: number | null;
    accionesPendientes: number;
    claudeAgotado?: boolean;
    onAbrirTeToca?: () => void;
    onAbrirAjustes?: () => void;
}

/**
 * Resumen inteligente de bloqueos críticos del sistema: solo se muestra cuando algo
 * requiere atención real (disco bajo, acciones pendientes de Alex o cuota principal agotada).
 */
export function BannerBloqueosSistema({
    discoLibreMb,
    accionesPendientes,
    claudeAgotado = false,
    onAbrirTeToca,
    onAbrirAjustes,
}: BannerBloqueosSistemaProps) {
    const discoBajo = typeof discoLibreMb === "number" && discoLibreMb < 6_000;
    if (!discoBajo && accionesPendientes === 0 && !claudeAgotado) {
        return null;
    }

    return (
        <aside
            aria-label="Avisos prioritarios del sistema"
            data-testid="banner-bloqueos-sistema"
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400/30 bg-[#0A0F1D]/90 px-3 py-2 text-xs text-amber-100"
        >
            <div className="flex flex-wrap items-center gap-3">
                {accionesPendientes > 0 ? (
                    <span className="inline-flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-amber-300" aria-hidden />
                        <span>
                            <strong>{accionesPendientes}</strong> {accionesPendientes === 1 ? "decisión espera" : "decisiones esperan"} tu visto bueno en «Te toca a ti».
                        </span>
                    </span>
                ) : null}
                {discoBajo ? (
                    <span className="inline-flex items-center gap-1.5 text-rose-200">
                        <HardDrive className="h-3.5 w-3.5 text-rose-300" aria-hidden />
                        Disco ajustado ({(discoLibreMb! / 1024).toFixed(1)} GB libres).
                    </span>
                ) : null}
                {claudeAgotado ? (
                    <span className="inline-flex items-center gap-1.5 text-sky-200">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" aria-hidden />
                        Claude semanal agotado: operando en automático con Hermes, Antigravity y flota HTTP gratuita.
                    </span>
                ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
                {accionesPendientes > 0 && onAbrirTeToca ? (
                    <button
                        type="button"
                        onClick={onAbrirTeToca}
                        className="cursor-pointer inline-flex items-center gap-1 rounded-lg border border-amber-400/40 bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-100 hover:bg-amber-500/25"
                    >
                        <AlertTriangle className="h-3 w-3" aria-hidden />
                        Revisar «Te toca a ti»
                    </button>
                ) : null}
                {onAbrirAjustes ? (
                    <button
                        type="button"
                        onClick={onAbrirAjustes}
                        className="cursor-pointer rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-slate-200 hover:border-white/30"
                    >
                        Abrir ajustes
                    </button>
                ) : null}
            </div>
        </aside>
    );
}

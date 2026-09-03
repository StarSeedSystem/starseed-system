"use client";

/**
 * BIENVENIDA UNIFICADA de perfil · página · grupo (Adenda 220 · 2026-09-03)
 * ─────────────────────────────────────────────────────────────────────────────
 * Un mismo bloque de bienvenida para los tres tipos de entidad, con datos
 * REALES (nombre, descripción, recuentos) en vez del texto fijo que mostraba el
 * antiguo `ProfileWelcomeWidget` a todo el mundo.
 *
 *   · Dueño/a  → saludo + «Primeros pasos»: lista con progreso (foto, portada,
 *                descripción, primera publicación…). Cada paso lleva a su
 *                acción. Cuando todo está hecho —o si lo pliega— queda una
 *                línea discreta (persistido por entidad en localStorage).
 *   · Visita   → saludo al espacio, descripción honesta, recuentos reales y
 *                las acciones que se le pasen (publicar aquí, mensaje…).
 *
 * Estética Crystal Liquid Glass + degradado StarSeed (fucsia → violeta → cian)
 * y el dorado del OS para los acentos. Sin datos inventados: un recuento que no
 * se conoce no se pinta.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronUp, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type EntityWelcomeKind = "profile" | "page" | "group";

export interface WelcomeStep {
    id: string;
    label: string;
    done: boolean;
    /** Ruta a la que lleva el paso (o `onClick`). */
    href?: string;
    onClick?: () => void;
    hint?: string;
}

export interface WelcomeStat {
    label: string;
    value: number | null | undefined;
    icon?: LucideIcon;
}

export interface EntityWelcomeProps {
    kind: EntityWelcomeKind;
    name: string;
    handle?: string;
    description?: string | null;
    accent?: string;
    isOwner: boolean;
    stats?: WelcomeStat[];
    steps?: WelcomeStep[];
    /** Acciones para la visita (botones ya construidos). */
    actions?: React.ReactNode;
    /** Clave de persistencia del plegado (p. ej. `profile:@handle`). */
    storageKey: string;
    className?: string;
}

const KIND_LABEL: Record<EntityWelcomeKind, { visita: (n: string) => string; dueno: string; vacio: string }> = {
    profile: {
        visita: (n) => `Bienvenid@ al espacio de ${n}`,
        dueno: "Tu espacio soberano en la red",
        vacio: "Esta persona todavía no ha escrito su biografía.",
    },
    page: {
        visita: (n) => `Bienvenid@ a ${n}`,
        dueno: "Tu página en la red",
        vacio: "Esta página todavía no tiene descripción.",
    },
    group: {
        visita: (n) => `Bienvenid@ al grupo ${n}`,
        dueno: "Tu grupo en la red",
        vacio: "Este grupo todavía no ha añadido una descripción.",
    },
};

function leerPlegado(key: string): boolean {
    try { return window.localStorage.getItem(`starseed.bienvenida.plegada:${key}`) === "1"; } catch { return false; }
}
function guardarPlegado(key: string, v: boolean): void {
    try { window.localStorage.setItem(`starseed.bienvenida.plegada:${key}`, v ? "1" : "0"); } catch { /* sin storage */ }
}

export function EntityWelcome({
    kind, name, handle, description, accent = "#E9C46A", isOwner, stats = [], steps = [], actions, storageKey, className,
}: EntityWelcomeProps) {
    const textos = KIND_LABEL[kind];
    const hechos = steps.filter((s) => s.done).length;
    const total = steps.length;
    const completo = total > 0 && hechos === total;
    const [plegada, setPlegada] = useState(false);
    useEffect(() => { setPlegada(leerPlegado(storageKey)); }, [storageKey]);

    const statsReales = useMemo(
        () => stats.filter((s) => typeof s.value === "number" && Number.isFinite(s.value as number)),
        [stats],
    );
    const desc = (description || "").trim();

    // Dueño con todo hecho y bloque plegado → una línea discreta.
    if (isOwner && plegada) {
        return (
            <div className={cn("flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm backdrop-blur", className)}>
                <span className="flex items-center gap-2 text-white/70">
                    <Sparkles className="h-4 w-4" style={{ color: accent }} />
                    {completo ? "Tu espacio está listo." : `Primeros pasos: ${hechos} de ${total} hechos.`}
                </span>
                <button type="button" onClick={() => { guardarPlegado(storageKey, false); setPlegada(false); }} className="inline-flex cursor-pointer items-center gap-1 text-xs text-white/55 hover:text-white/85">
                    <ChevronDown className="h-3.5 w-3.5" /> Ver bienvenida
                </button>
            </div>
        );
    }

    return (
        <section
            aria-label="Bienvenida"
            className={cn(
                "relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-[clamp(1rem,3vw,1.75rem)] shadow-xl backdrop-blur-md",
                className,
            )}
        >
            {/* Aura StarSeed: degradado fucsia → violeta → cian, muy suave. */}
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-fuchsia-400/70 via-violet-400/70 to-cyan-300/70" />
            <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(168,85,247,0.16),transparent_65%)]" />
            <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-16 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.12),transparent_65%)]" />

            <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                    <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: accent }}>
                        <Sparkles className="h-3.5 w-3.5" />
                        {isOwner ? textos.dueno : "Bienvenida"}
                    </p>
                    <h2 className="font-headline text-[clamp(1.25rem,3.5vw,1.75rem)] font-bold leading-tight text-foreground [overflow-wrap:anywhere]">
                        {isOwner ? `Bienvenid@ de vuelta, ${name}` : textos.visita(name)}
                    </h2>
                    {handle && <p className="mt-0.5 font-mono text-xs text-muted-foreground">{handle.startsWith("@") ? handle : `@${handle}`}</p>}
                    <p className={cn("mt-3 max-w-2xl text-[clamp(0.85rem,2.4vw,0.95rem)] leading-relaxed", desc ? "text-foreground/85" : "text-muted-foreground italic")}>
                        {desc || (isOwner ? "Cuenta a la red quién eres: la descripción es lo primero que ve una visita." : textos.vacio)}
                    </p>

                    {statsReales.length > 0 && (
                        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Recuentos">
                            {statsReales.map((s) => {
                                const Icon = s.icon;
                                return (
                                    <li key={s.label} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-white/80">
                                        {Icon && <Icon className="h-3.5 w-3.5" style={{ color: accent }} />}
                                        <span className="font-semibold text-white/95">{(s.value as number).toLocaleString("es-ES")}</span>
                                        <span className="text-white/60">{s.label}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}

                    {!isOwner && actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
                </div>

                {isOwner && total > 0 && (
                    <div className="w-full shrink-0 rounded-2xl border border-white/10 bg-black/25 p-4 lg:w-[19rem]">
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-white/90">Primeros pasos</p>
                            <span className="text-xs text-white/55">{hechos}/{total}</span>
                        </div>
                        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={hechos} aria-label="Progreso de primeros pasos">
                            <div className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 via-violet-400 to-cyan-300 transition-[width] duration-500" style={{ width: `${total ? (hechos / total) * 100 : 0}%` }} />
                        </div>
                        <ul className="space-y-1.5">
                            {steps.map((s) => {
                                const inner = (
                                    <>
                                        <span
                                            className={cn(
                                                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]",
                                                s.done ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-200" : "border-white/20 text-transparent",
                                            )}
                                            aria-hidden
                                        >
                                            <Check className="h-3 w-3" />
                                        </span>
                                        <span className={cn("min-w-0 flex-1 text-left text-[13px]", s.done ? "text-white/45 line-through" : "text-white/85")}>{s.label}</span>
                                        {!s.done && s.hint && <span className="text-[10.5px] text-white/40">{s.hint}</span>}
                                    </>
                                );
                                const cls = "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.05]";
                                return (
                                    <li key={s.id}>
                                        {s.href && !s.done ? (
                                            <Link href={s.href} className={cls}>{inner}</Link>
                                        ) : (
                                            <button type="button" onClick={s.done ? undefined : s.onClick} className={cn(cls, s.done && "cursor-default")} disabled={s.done && !s.onClick}>{inner}</button>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                        <button
                            type="button"
                            onClick={() => { guardarPlegado(storageKey, true); setPlegada(true); }}
                            className="mt-3 inline-flex cursor-pointer items-center gap-1 text-xs text-white/50 hover:text-white/80"
                        >
                            <ChevronUp className="h-3.5 w-3.5" /> {completo ? "Plegar" : "Ocultar por ahora"}
                        </button>
                    </div>
                )}
            </div>
        </section>
    );
}

"use client";

/**
 * Piezas COMUNES de la guía completa (Ola 1025U · GUIA1025U).
 * ═══════════════════════════════════════════════════════════════════════════
 * La introducción de la ventana de acceso (`auth/ventana-acceso.tsx`) y el recorrido de Aurora
 * (`onboarding/aurora-guide.tsx`) recorren el MISMO catálogo (`lib/onboarding/guia-completa.ts`) y enseñan lo
 * mismo con las mismas piezas:
 *
 *   · `BarraCapitulos` — una barra con un tramo por capítulo (el que toca, lleno hasta donde vas);
 *   · `IndiceGuia`     — el índice de capítulos, siempre a un botón (y los pasos del capítulo en curso);
 *   · `PuntosPaso`     — las ideas clave del paso en lista corta;
 *   · `TarjetasPaso`   — las tarjetas de «Qué es StarSeed OS»;
 *   · `RazonesCuenta`  — las tres razones para tener cuenta.
 *
 * Todo con dianas de 44 px, `cursor-pointer`, foco visible, iconos de Lucide y sin animar nada que no sea
 * `transform` u `opacity` (con `prefers-reduced-motion` no se anima).
 */

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AtSign, BookOpen, KeyRound, LayoutGrid, ListTree, Sparkles, Users, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
    CAPITULOS_GUIA,
    PASOS_GUIA,
    RAZONES_CUENTA,
    TOTAL_CAPITULOS,
    avanceDeCapitulo,
    capituloDeIndice,
    pasosDelCapitulo,
    primerPasoDelCapitulo,
    type PasoGuia,
} from "@/lib/onboarding/guia-completa";

/* ─────────────────────────────── Barra de capítulos ─────────────────────────────── */

export interface BarraCapitulosProps {
    /** Paso actual (posición en el catálogo). */
    indice: number;
    /** Salta al primer paso de ese capítulo. */
    onIr: (indice: number) => void;
    className?: string;
}

export function BarraCapitulos({ indice, onIr, className }: BarraCapitulosProps) {
    const actual = capituloDeIndice(indice).id;
    return (
        <div role="group" aria-label="Capítulos de la guía" className={cn("flex w-full items-center", className)}>
            {CAPITULOS_GUIA.map((c, n) => (
                <button
                    key={c.id}
                    type="button"
                    onClick={() => onIr(primerPasoDelCapitulo(c.id))}
                    aria-label={`Ir al capítulo ${n + 1} de ${TOTAL_CAPITULOS}: ${c.titulo}`}
                    aria-current={c.id === actual ? "step" : undefined}
                    title={c.titulo}
                    data-capitulo={c.id}
                    className="group flex h-11 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-md px-[2px] outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                >
                    <span className="relative block h-1.5 w-full overflow-hidden rounded-full bg-white/20 transition-colors duration-200 group-hover:bg-white/35 motion-reduce:transition-none">
                        <span
                            aria-hidden
                            className="absolute inset-0 origin-left rounded-full bg-gradient-to-r from-[#7c5cff] to-[#23d5ab] transition-transform duration-200 motion-reduce:transition-none"
                            style={{ transform: `scaleX(${avanceDeCapitulo(c.id, indice)})` }}
                        />
                    </span>
                </button>
            ))}
        </div>
    );
}

/* ─────────────────────────────────── Índice ─────────────────────────────────── */

export interface IndiceGuiaProps {
    indice: number;
    onIr: (indice: number) => void;
    className?: string;
    /** Algo a la derecha del botón, en la misma línea (p. ej. «Paso 7 de 24»). */
    extra?: ReactNode;
}

/**
 * El índice de capítulos. Un botón «Índice» abre la lista (en línea, no flotante: nunca se sale de la
 * tarjeta); cada capítulo lleva a su primer paso y el capítulo en curso enseña además sus pasos.
 * Escape lo cierra y devuelve el foco al botón.
 */
export function IndiceGuia({ indice, onIr, className, extra }: IndiceGuiaProps) {
    const [abierto, setAbierto] = useState(false);
    const id = useId();
    const botonRef = useRef<HTMLButtonElement>(null);
    const actual = capituloDeIndice(indice);

    const ir = (i: number) => {
        onIr(i);
        setAbierto(false);
    };
    const alTeclear = (e: KeyboardEvent<HTMLElement>) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        setAbierto(false);
        botonRef.current?.focus();
    };

    return (
        <div className={cn("w-full", className)} onKeyDown={abierto ? alTeclear : undefined} data-indice-guia="">
            <div className="flex flex-wrap items-center justify-between gap-x-3">
                <button
                    ref={botonRef}
                    type="button"
                    onClick={() => setAbierto((a) => !a)}
                    aria-expanded={abierto}
                    aria-controls={`${id}-indice`}
                    data-testid="indice-guia-boton"
                    className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-md px-1 text-xs text-white/70 underline-offset-2 outline-none hover:text-white/95 hover:underline focus-visible:ring-2 focus-visible:ring-cyan-300"
                >
                    <ListTree className="h-3.5 w-3.5" aria-hidden />
                    Índice · {actual.titulo}
                </button>
                {extra}
            </div>
            {abierto && (
                <nav
                    id={`${id}-indice`}
                    aria-label="Índice de capítulos"
                    data-testid="indice-guia"
                    className="mt-1 max-h-[42dvh] overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-black/30 p-1.5"
                >
                    <ol className="grid gap-0.5">
                        {CAPITULOS_GUIA.map((c, n) => {
                            const pasos = pasosDelCapitulo(c.id);
                            const esActual = c.id === actual.id;
                            return (
                                <li key={c.id}>
                                    <button
                                        type="button"
                                        onClick={() => ir(pasos[0])}
                                        aria-current={esActual ? "step" : undefined}
                                        aria-label={`Capítulo ${n + 1}: ${c.titulo} (${pasos.length} ${pasos.length === 1 ? "paso" : "pasos"})`}
                                        className={cn(
                                            "flex min-h-[44px] w-full cursor-pointer items-start gap-2 rounded-lg px-2.5 py-1.5 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-cyan-300 motion-reduce:transition-none",
                                            esActual ? "bg-white/10" : "hover:bg-white/[0.06]",
                                        )}
                                    >
                                        <span aria-hidden className="mt-0.5 w-4 shrink-0 text-[11px] font-semibold text-white/50">
                                            {n + 1}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-[13px] font-semibold leading-tight text-white">{c.titulo}</span>
                                            <span className="block text-[11.5px] leading-snug text-white/55">{c.resumen}</span>
                                        </span>
                                    </button>
                                    {esActual && pasos.length > 1 && (
                                        <ul className="mb-1 ml-8 grid gap-0.5 border-l border-white/10 pl-2">
                                            {pasos.map((i) => (
                                                <li key={PASOS_GUIA[i].id}>
                                                    <button
                                                        type="button"
                                                        onClick={() => ir(i)}
                                                        aria-current={i === indice ? "step" : undefined}
                                                        aria-label={`Ir al paso ${i + 1}: ${PASOS_GUIA[i].titulo}`}
                                                        className={cn(
                                                            "flex min-h-[44px] w-full cursor-pointer items-center rounded-md px-2 text-left text-[12px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-cyan-300 motion-reduce:transition-none",
                                                            i === indice ? "font-semibold text-white" : "text-white/65 hover:text-white",
                                                        )}
                                                    >
                                                        {PASOS_GUIA[i].titulo}
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </li>
                            );
                        })}
                    </ol>
                </nav>
            )}
        </div>
    );
}

/* ───────────────────────────── Contenido de un paso ───────────────────────────── */

const mayuscula = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Las ideas clave del paso, en lista corta (las del tema en la SOP). */
export function PuntosPaso({ puntos, color, className }: { puntos?: readonly string[]; color: string; className?: string }) {
    if (!puntos || puntos.length === 0) return null;
    return (
        <ul aria-label="Ideas clave" data-testid="puntos-paso" className={cn("grid gap-1.5", className)}>
            {puntos.map((p) => (
                <li key={p} className="flex items-start gap-2 text-[12.5px] leading-snug text-white/70">
                    <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
                    <span className="min-w-0">{mayuscula(p)}</span>
                </li>
            ))}
        </ul>
    );
}

const ICONO_TARJETA: Record<string, LucideIcon> = {
    escritorios: LayoutGrid,
    aurora: Sparkles,
    biblioteca: BookOpen,
    comunidad: Users,
};

/** Las tarjetas del paso «Qué es StarSeed OS». */
export function TarjetasPaso({ paso, className }: { paso: PasoGuia; className?: string }) {
    if (!paso.tarjetas || paso.tarjetas.length === 0) return null;
    return (
        <ul data-testid="tarjetas-paso" className={cn("grid gap-2 sm:grid-cols-2", className)}>
            {paso.tarjetas.map(({ id, titulo, texto }) => {
                const Icono = ICONO_TARJETA[id] ?? Sparkles;
                return (
                    <li key={id} className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <Icono className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" aria-hidden />
                        <span className="min-w-0">
                            <span className="block text-sm font-semibold text-white">{titulo}</span>
                            <span className="block text-xs leading-snug text-white/60">{texto}</span>
                        </span>
                    </li>
                );
            })}
        </ul>
    );
}

const ICONO_RAZON: Record<string, LucideIcon> = {
    "una-cuenta": KeyRound,
    direccion: AtSign,
    "aurora-guia": Sparkles,
};

/** Las tres razones breves para tener cuenta (bajo el formulario y en el último paso de la guía). */
export function RazonesCuenta({ className }: { className?: string }) {
    return (
        <ul className={cn("grid gap-2 border-t border-white/10 pt-3", className)} aria-label="Por qué crear una cuenta StarSeed">
            {RAZONES_CUENTA.map(({ id, titulo, texto }) => {
                const Icono = ICONO_RAZON[id] ?? Sparkles;
                return (
                    <li key={id} className="flex items-start gap-2.5">
                        <span
                            aria-hidden
                            className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-violet-400/25 bg-violet-500/15"
                        >
                            <Icono className="h-3.5 w-3.5 text-violet-200" />
                        </span>
                        <span className="min-w-0 text-[11.5px] leading-snug text-white/60">
                            <b className="font-semibold text-white/85">{titulo}</b> — {texto}
                        </span>
                    </li>
                );
            })}
        </ul>
    );
}

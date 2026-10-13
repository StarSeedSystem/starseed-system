"use client";

/**
 * Pilares del cerebro (CB1013A): los 7 botones principales de la sección.
 *
 * Contrato: architecture/cerebros-fusion-telepatia.md §3.
 * - Memorias, Habilidades, Contexto, Neuronas, Personalidades, Conectores y Procesos activos.
 * - El texto NUNCA se corta: rejilla que se adapta al ancho (cada botón ≥ 10,5 rem), el título
 *   en su propia línea a todo el ancho y partiendo solo entre palabras, la descripción entera.
 *   Nada de `truncate`, `line-clamp` ni `whitespace-nowrap` (lo vigila textos-no-cortados.test.ts).
 */

import type { ComponentType } from "react";
import { Activity, Check, Cpu, Drama, FileText, Plug, Sparkles, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type Pilar = "memoria" | "habilidades" | "contexto" | "neuronas" | "egos" | "conectores" | "procesos";

type Acento = "cyan" | "violet" | "amber" | "emerald" | "fuchsia" | "sky" | "rose";

export interface DefinicionPilar {
    id: Pilar;
    etiqueta: string;
    descripcion: string;
    icono: ComponentType<{ className?: string }>;
    acento: Acento;
    /** ¿Necesita un cerebro elegido? (Neuronas y Procesos son de la cuenta.) */
    pideCerebro: boolean;
}

export const PILARES: DefinicionPilar[] = [
    { id: "memoria", etiqueta: "Memorias", descripcion: "Archivos .md y sus fuentes: dónde se guardan y cómo se sincronizan.", icono: FileText, acento: "cyan", pideCerebro: true },
    { id: "habilidades", etiqueta: "Habilidades", descripcion: "El programa de soul.md: skills, plugins, claves, permisos y agentes.", icono: Wand2, acento: "violet", pideCerebro: true },
    { id: "contexto", etiqueta: "Contexto", descripcion: "Los sentidos: proveedor por sentido, fuentes externas y emociones.", icono: Sparkles, acento: "amber", pideCerebro: true },
    { id: "neuronas", etiqueta: "Neuronas", descripcion: "Tus aparatos como cerebro y servidor: presencia en vivo y permisos.", icono: Cpu, acento: "emerald", pideCerebro: false },
    { id: "egos", etiqueta: "Personalidades", descripcion: "Identidades ego.md que piensan con este cerebro.", icono: Drama, acento: "fuchsia", pideCerebro: true },
    { id: "conectores", etiqueta: "Conectores", descripcion: "Servicios, integraciones, MCP, canales y cuentas externas de este cerebro.", icono: Plug, acento: "sky", pideCerebro: true },
    { id: "procesos", etiqueta: "Procesos activos", descripcion: "Agentes, sueños, descargas, apps en segundo plano y el uso real de cada servidor.", icono: Activity, acento: "rose", pideCerebro: false },
];

export const IDS_PILARES: readonly Pilar[] = PILARES.map((p) => p.id);

/** El pilar pedido en la URL (`?tab=`), o null. Acepta los ids de siempre. */
export function pilarDesdeUrl(valor: string | null): Pilar | null {
    return valor && (IDS_PILARES as readonly string[]).includes(valor) ? (valor as Pilar) : null;
}

const ACENTO: Record<Acento, { caja: string; activo: string }> = {
    cyan: { caja: "bg-cyan-500/15 text-cyan-300", activo: "border-cyan-400/50 bg-cyan-500/[0.08] shadow-[0_0_14px_rgba(34,211,238,0.15)]" },
    violet: { caja: "bg-violet-500/15 text-violet-300", activo: "border-violet-400/50 bg-violet-500/[0.08] shadow-[0_0_14px_rgba(167,139,250,0.15)]" },
    amber: { caja: "bg-amber-500/15 text-amber-300", activo: "border-amber-400/50 bg-amber-500/[0.08] shadow-[0_0_14px_rgba(251,191,36,0.15)]" },
    emerald: { caja: "bg-emerald-500/15 text-emerald-300", activo: "border-emerald-400/50 bg-emerald-500/[0.08] shadow-[0_0_14px_rgba(52,211,153,0.15)]" },
    fuchsia: { caja: "bg-fuchsia-500/15 text-fuchsia-300", activo: "border-fuchsia-400/50 bg-fuchsia-500/[0.08] shadow-[0_0_14px_rgba(232,121,249,0.15)]" },
    sky: { caja: "bg-sky-500/15 text-sky-300", activo: "border-sky-400/50 bg-sky-500/[0.08] shadow-[0_0_14px_rgba(56,189,248,0.15)]" },
    rose: { caja: "bg-rose-500/15 text-rose-300", activo: "border-rose-400/50 bg-rose-500/[0.08] shadow-[0_0_14px_rgba(251,113,133,0.15)]" },
};

export interface RejillaPilaresProps {
    activo: Pilar;
    onElegir: (p: Pilar) => void;
    /** Sin cerebro elegido, los pilares que lo piden se ven atenuados (siguen pulsables). */
    hayCerebro: boolean;
    /** Contadores reales opcionales (nunca inventados): p. ej. { memoria: 2 }. */
    contadores?: Partial<Record<Pilar, number>>;
}

export function RejillaPilares({ activo, onElegir, hayCerebro, contadores }: RejillaPilaresProps) {
    return (
        <div
            role="group"
            aria-label="Secciones del cerebro"
            className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(10.5rem,1fr))]"
        >
            {PILARES.map((p) => {
                const Icono = p.icono;
                const esActivo = activo === p.id;
                const atenuado = p.pideCerebro && !hayCerebro;
                const cuenta = contadores?.[p.id];
                return (
                    <button
                        key={p.id}
                        type="button"
                        onClick={() => onElegir(p.id)}
                        aria-pressed={esActivo}
                        title={`${p.etiqueta}: ${p.descripcion}`}
                        className={cn(
                            "group flex min-w-0 flex-col gap-2 rounded-xl border p-4 text-left transition-all",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
                            esActivo ? ACENTO[p.acento].activo : "border-white/10 bg-black/20 hover:bg-white/[0.04]",
                            atenuado && "opacity-60",
                        )}
                    >
                        <span className="flex items-center gap-2">
                            <span className={cn("rounded-lg p-2", ACENTO[p.acento].caja)}>
                                <Icono className="h-5 w-5" />
                            </span>
                            {typeof cuenta === "number" && (
                                <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] tabular-nums text-white/70">{cuenta}</span>
                            )}
                            {esActivo && <Check className="ml-auto h-4 w-4 text-white/70" aria-hidden />}
                        </span>
                        <span className="break-normal text-sm font-semibold leading-snug text-white/90 [hyphens:none]">{p.etiqueta}</span>
                        <span className="text-xs leading-relaxed text-white/55">{p.descripcion}</span>
                    </button>
                );
            })}
        </div>
    );
}

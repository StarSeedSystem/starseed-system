// src/components/social/toolkits/shared/index.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Primitivas reutilizables para los "toolkits" de cada tipo de página StarSeed.
// Todas son client-side, aceptan un `accent` (color hex de la entidad) y siguen
// la estética Crystal Liquid Glass del sistema. Son la base común sobre la que
// se construyen PartidoToolkit, EntidadFederativaToolkit, AsambleaToolkit, etc.
// ─────────────────────────────────────────────────────────────────────────────
"use client";

import React from "react";
import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { useGovVote } from "@/hooks/use-gov-vote";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
    ArrowUpRight,
    Check,
    ChevronRight,
    Lock,
    type LucideIcon,
} from "lucide-react";

export const GOLD = "#E9C46A";

function hex(accent: string | undefined, alpha = ""): string {
    return `${accent || GOLD}${alpha}`;
}

// Acepta tanto un componente de icono (LucideIcon) como un elemento ya
// renderizado (<Icon/>), para tolerar ambos estilos de uso sin fricción.
export type IconLike = LucideIcon | React.ReactElement;

function renderIcon(
    icon: IconLike | undefined,
    className?: string,
    style?: React.CSSProperties,
): React.ReactNode {
    if (!icon) return null;
    if (React.isValidElement(icon)) return icon;
    const Icon = icon as LucideIcon;
    return <Icon className={className} style={style} />;
}

// ── ToolSection: tarjeta de sección con cabecera de icono + título + acción ──
export function ToolSection({
    icon,
    title,
    subtitle,
    accent,
    action,
    children,
    className,
}: {
    icon?: IconLike;
    title: string;
    subtitle?: string;
    accent?: string;
    action?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <GlassCard className={cn("p-[clamp(1rem,2.5vw,1.5rem)]", className)}>
            <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                    {icon && (
                        <span
                            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
                            style={{ borderColor: hex(accent, "44"), background: hex(accent, "14"), color: accent || GOLD }}
                        >
                            {renderIcon(icon, "h-[18px] w-[18px]")}
                        </span>
                    )}
                    <div className="min-w-0">
                        <h3 className="font-headline text-base font-semibold leading-tight">{title}</h3>
                        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
                    </div>
                </div>
                {action && <div className="shrink-0">{action}</div>}
            </div>
            {children}
        </GlassCard>
    );
}

// ── StatTile + StatGrid: métricas compactas ──
export function StatTile({
    icon,
    label,
    value,
    hint,
    accent,
}: {
    icon?: IconLike;
    label: string;
    value: React.ReactNode;
    hint?: string;
    accent?: string;
}) {
    return (
        <div
            className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 transition-colors hover:border-white/20"
        >
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                {icon && renderIcon(icon, "h-3.5 w-3.5", { color: accent || GOLD })}
                <span className="truncate">{label}</span>
            </div>
            <p className="mt-1.5 font-headline text-xl font-bold tabular-nums leading-none">{value}</p>
            {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
        </div>
    );
}

export function StatGrid({ children, cols = 3 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
    const colClass = cols === 2 ? "sm:grid-cols-2" : cols === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3";
    return <div className={cn("grid grid-cols-2 gap-3", colClass)}>{children}</div>;
}

// ── VoteBar: barras de proporción (a favor / en contra / abstención) ──
export interface VoteOption {
    name: string;
    votes: number;
    color?: string;
}
export function VoteBar({
    options,
    quorum,
    accent,
}: {
    options: VoteOption[];
    quorum?: { reached: number; total: number };
    accent?: string;
}) {
    const total = options.reduce((s, o) => s + o.votes, 0) || 1;
    return (
        <div className="space-y-2.5">
            {options.map((o) => {
                const pct = Math.round((o.votes / total) * 100);
                return (
                    <div key={o.name}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="font-medium">{o.name}</span>
                            <span className="tabular-nums text-muted-foreground">
                                {o.votes.toLocaleString("es-ES")} · {pct}%
                            </span>
                        </div>
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                            <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${pct}%`, background: o.color || accent || GOLD }}
                            />
                        </div>
                    </div>
                );
            })}
            {quorum && (
                <div className="mt-3 flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-[11px]">
                    <span className="text-muted-foreground">Quórum</span>
                    <span className="tabular-nums font-medium">
                        {quorum.reached.toLocaleString("es-ES")} / {quorum.total.toLocaleString("es-ES")}
                        {quorum.reached >= quorum.total * 0.5 ? (
                            <span className="ml-2 text-emerald-400">alcanzado</span>
                        ) : (
                            <span className="ml-2 text-amber-400">pendiente</span>
                        )}
                    </span>
                </div>
            )}
        </div>
    );
}

// Slug estable para derivar una papeleta de la pregunta cuando no se pasa ballotKey.
function mvSlug(s: string): string {
    return s
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64);
}

// ── MiniVote: votación INTERACTIVA con persistencia REAL (Supabase os_gov_votes) ──
// Si se pasa `ballotKey`, el voto se guarda y se agregan los recuentos reales de
// toda la red; sin sesión, el voto es optimista local + invitación a iniciar sesión.
export function MiniVote({
    question,
    options = ["A favor", "En contra", "Abstención"],
    baseCounts,
    accent,
    onVote,
    ballotKey,
    ballotType = "general",
}: {
    question: string;
    options?: string[];
    baseCounts?: number[];
    accent?: string;
    onVote?: (option: string) => void;
    ballotKey?: string;
    ballotType?: string;
}) {
    const key = ballotKey ?? `mv:${mvSlug(question)}`;
    const { tally, myChoice, total, needsAuth, vote } = useGovVote(key, { ballotType, options, baseCounts });
    const choice = myChoice;
    const denom = total || 1;

    return (
        <div className="space-y-3">
            <p className="text-sm font-medium">{question}</p>
            {choice === null ? (
                <div className="flex flex-wrap gap-2">
                    {options.map((o) => (
                        <Button
                            key={o}
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                vote(o);
                                onVote?.(o);
                            }}
                            className="cursor-pointer gap-1.5"
                            style={{ borderColor: hex(accent, "55"), color: accent || GOLD }}
                        >
                            {o}
                        </Button>
                    ))}
                </div>
            ) : (
                <div className="space-y-2">
                    {options.map((o) => {
                        const pct = Math.round(((tally[o] ?? 0) / denom) * 100);
                        const mine = choice === o;
                        return (
                            <button
                                key={o}
                                type="button"
                                onClick={() => {
                                    vote(o);
                                    onVote?.(o);
                                }}
                                className="block w-full cursor-pointer text-left"
                                title="Cambiar voto"
                            >
                                <div className="mb-1 flex items-center justify-between text-xs">
                                    <span className={cn("flex items-center gap-1", mine && "font-semibold")}>
                                        {mine && <Check className="h-3.5 w-3.5" style={{ color: accent || GOLD }} />}
                                        {o}
                                    </span>
                                    <span className="tabular-nums text-muted-foreground">{pct}%</span>
                                </div>
                                <Progress value={pct} indicatorClassName="transition-all" />
                            </button>
                        );
                    })}
                    {needsAuth ? (
                        <p className="flex items-center gap-1 pt-1 text-[11px] text-muted-foreground">
                            <Lock className="h-3 w-3" />
                            <Link href="/login" className="underline cursor-pointer" style={{ color: GOLD }}>
                                Inicia sesión para registrar tu voto en la red
                            </Link>
                        </p>
                    ) : (
                        <p className="pt-1 text-[11px] text-muted-foreground">
                            Voto registrado · {total.toLocaleString("es-ES")} participaciones · soberanía directa
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

// ── RosterStrip: pila de avatares + recuento ──
export function RosterStrip({
    seed = "starseed",
    count,
    accent,
    label = "miembros",
    max = 6,
}: {
    seed?: string;
    count: number;
    accent?: string;
    label?: string;
    max?: number;
}) {
    const shown = Math.min(max, count);
    return (
        <div className="flex items-center gap-3">
            <div className="flex -space-x-2.5">
                {Array.from({ length: shown }).map((_, i) => (
                    <span
                        key={i}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-background text-[10px] font-semibold"
                        style={{
                            background: `hsl(${(i * 67 + seed.length * 13) % 360} 60% 45%)`,
                            color: "#0b0b12",
                        }}
                        aria-hidden
                    >
                        {String.fromCharCode(65 + ((i + seed.charCodeAt(0)) % 26))}
                    </span>
                ))}
            </div>
            <span className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground tabular-nums">{count.toLocaleString("es-ES")}</span> {label}
            </span>
        </div>
    );
}

// ── ProgressRow: etiqueta + barra + valor ──
export function ProgressRow({
    label,
    value,
    detail,
    accent,
}: {
    label: string;
    value: number;
    detail?: string;
    accent?: string;
}) {
    const pct = Math.max(0, Math.min(100, value));
    return (
        <div>
            <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium">{label}</span>
                <span className="tabular-nums text-muted-foreground">{detail ?? `${value}%`}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
                <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, background: accent || GOLD }}
                />
            </div>
        </div>
    );
}

// ── PersonRow: avatar + nombre + rol + badge/acción ──
export function PersonRow({
    name,
    role,
    badge,
    accent,
    action,
    seed = 0,
}: {
    name: string;
    role?: string;
    badge?: string;
    accent?: string;
    action?: React.ReactNode;
    seed?: number;
}) {
    return (
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-2.5 transition-colors hover:border-white/20">
            <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
                style={{ background: `hsl(${(seed * 53) % 360} 55% 45%)`, color: "#0b0b12" }}
            >
                {name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium leading-tight">{name}</p>
                {role && <p className="truncate text-xs text-muted-foreground">{role}</p>}
            </div>
            {badge && (
                <Badge variant="outline" className="shrink-0 text-[10px]" style={{ borderColor: hex(accent, "55"), color: accent || GOLD }}>
                    {badge}
                </Badge>
            )}
            {action}
        </div>
    );
}

// ── LinkCard: tarjeta de navegación cruzada (interconexión de red) ──
export function LinkCard({
    href,
    icon,
    title,
    subtitle,
    accent,
    external,
}: {
    href: string;
    icon?: IconLike;
    title: string;
    subtitle?: string;
    accent?: string;
    external?: boolean;
}) {
    return (
        <Link href={href} className="group cursor-pointer">
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 transition-all hover:-translate-y-0.5 hover:border-white/25">
                {icon && (
                    <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                        style={{ background: hex(accent, "16"), color: accent || GOLD }}
                    >
                        {renderIcon(icon, "h-[18px] w-[18px]")}
                    </span>
                )}
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium leading-tight">{title}</p>
                    {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
                </div>
                {external ? (
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                )}
            </div>
        </Link>
    );
}

// ── TimelineItem / Timeline: agenda, actas, hitos ──
export interface TimelineEntry {
    time?: string;
    title: string;
    detail?: string;
    status?: "done" | "active" | "upcoming";
}
export function Timeline({ entries, accent }: { entries: TimelineEntry[]; accent?: string }) {
    return (
        <ol className="relative space-y-4 border-l border-white/10 pl-5">
            {entries.map((e, i) => {
                const color =
                    e.status === "done" ? "#34d399" : e.status === "active" ? accent || GOLD : "#64748b";
                return (
                    <li key={i} className="relative">
                        <span
                            className="absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-background"
                            style={{ background: color }}
                        />
                        <div className="flex flex-wrap items-baseline gap-x-2">
                            {e.time && <span className="text-[11px] tabular-nums text-muted-foreground">{e.time}</span>}
                            <span className="text-sm font-medium">{e.title}</span>
                            {e.status === "active" && (
                                <Badge variant="outline" className="text-[10px]" style={{ borderColor: hex(accent, "66"), color: accent || GOLD }}>
                                    en curso
                                </Badge>
                            )}
                        </div>
                        {e.detail && <p className="mt-0.5 text-xs text-muted-foreground">{e.detail}</p>}
                    </li>
                );
            })}
        </ol>
    );
}

// ── Chip: etiqueta pequeña con acento ──
export function Chip({ children, accent }: { children: React.ReactNode; accent?: string }) {
    return (
        <span
            className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium"
            style={{ borderColor: hex(accent, "44"), color: accent || GOLD, background: hex(accent, "0d") }}
        >
            {children}
        </span>
    );
}

// ── EmptyHint: estado vacío elegante ──
export function EmptyHint({ children }: { children: React.ReactNode }) {
    return (
        <div className="rounded-xl border border-dashed border-white/12 p-6 text-center text-sm text-muted-foreground">
            {children}
        </div>
    );
}

// ── EntityQuickActions: fila de acciones por defecto de TODA entidad ──
// (Adenda 63 §8 — Publicar aquí · Agenda · Biblioteca · Miembros · Compartir ·
// Ajustes). Vive en ./entity-quick-actions.tsx; se re-exporta aquí para que los
// toolkits la importen junto al resto de primitivas compartidas. El ciclo de
// módulos resultante es seguro: ambos lados solo usan funciones hoisted en
// tiempo de render, nunca en la evaluación del módulo.
export { EntityQuickActions, type EntityQuickActionsProps } from "./entity-quick-actions";

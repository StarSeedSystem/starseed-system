'use client';

import { useState, useMemo } from "react";
import Link from "next/link";
import {
    Thermometer, Search, Eye, EyeOff, TrendingUp, TrendingDown, Minus,
    Users, ChevronRight, type LucideIcon, Sparkle, Flame, Zap, HelpCircle, Handshake,
} from "lucide-react";
import { WidgetShell, MiniList, Chip } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { CivicEmotion } from "@/lib/widget-data";
import { cn } from "@/lib/utils";

// ════════════════════════════════════════════════════════════════
// SocialResonanceWidget — Termómetro de Resonancia Social.
// Heatmap semántico de los temas más debatidos por emoción. Modo
// "Burbuja Rota" muestra el argumento contrario para mitigar el sesgo.
// Datos "politics.resonance". Filtro por palabra clave.
// ════════════════════════════════════════════════════════════════
const EMOTION_META: Record<CivicEmotion, { label: string; color: string; icon: LucideIcon }> = {
    esperanza: { label: "Esperanza", color: "#10b981", icon: Sparkle },
    indignacion: { label: "Indignación", color: "#f43f5e", icon: Flame },
    urgencia: { label: "Urgencia", color: "#f59e0b", icon: Zap },
    curiosidad: { label: "Curiosidad", color: "#38bdf8", icon: HelpCircle },
    consenso: { label: "Consenso", color: "#a855f7", icon: Handshake },
};
const TrendIcon = ({ t }: { t: "up" | "down" | "flat" }) =>
    t === "up" ? <TrendingUp className="size-3 text-emerald-400" /> : t === "down" ? <TrendingDown className="size-3 text-rose-400" /> : <Minus className="size-3 text-muted-foreground/50" />;

export function SocialResonanceWidget() {
    const { data, loading } = useWidgetData("politics.resonance", { refreshMs: 8000 });
    const [query, setQuery] = useState("");
    const [broken, setBroken] = useState(false);

    const topics = useMemo(() => {
        if (!data) return [];
        const q = query.trim().toLowerCase();
        return q ? data.topics.filter((t) => t.label.toLowerCase().includes(q)) : data.topics;
    }, [data, query]);

    return (
        <WidgetShell
            title="Resonancia Social"
            subtitle={data ? data.window : "Pulso del debate"}
            icon={Thermometer}
            accent="#f43f5e"
            live
            actions={
                <Link href="/network/politics" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer">
                    Ágora <ChevronRight className="size-3" />
                </Link>
            }
        >
            {(size) => {
                if (loading || !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const compact = size.vTier === "compact";
                const maxList = size.vTier === "expanded" ? 5 : compact ? 2 : 4;
                const dom = EMOTION_META[data.dominantEmotion];

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        {/* Emoción dominante + Burbuja Rota */}
                        <div className="shrink-0 flex items-center gap-2">
                            <div className="inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide"
                                style={{ color: dom.color, borderColor: `${dom.color}40`, background: `${dom.color}14` }}>
                                <dom.icon className="size-3" /> {dom.label}
                            </div>
                            {!micro && (
                                <button
                                    onClick={() => setBroken((b) => !b)}
                                    title="Modo Burbuja Rota: muestra la postura contraria"
                                    className={cn(
                                        "ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wide transition-colors cursor-pointer",
                                        broken ? "bg-violet-500/15 border-violet-500/40 text-violet-300" : "border-border/40 text-muted-foreground/60 hover:text-foreground"
                                    )}
                                >
                                    {broken ? <EyeOff className="size-3" /> : <Eye className="size-3" />} Burbuja Rota
                                </button>
                            )}
                        </div>

                        {/* Buscador */}
                        {!micro && !compact && (
                            <div className="shrink-0 flex items-center gap-1.5 rounded-lg border border-border/40 bg-black/20 px-2 py-1">
                                <Search className="size-3 text-muted-foreground/50 shrink-0" />
                                <input
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Filtrar temas…"
                                    className="w-full bg-transparent text-[11px] outline-none placeholder:text-muted-foreground/40"
                                />
                            </div>
                        )}

                        {/* Heatmap de temas */}
                        <div className="flex-1 min-h-0">
                            <MiniList
                                items={topics}
                                max={maxList}
                                empty="Sin temas que coincidan"
                                render={(t) => {
                                    const meta = EMOTION_META[t.emotion];
                                    return (
                                        <Link href={t.threadHref} className="block rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 hover:border-primary/30 transition-colors cursor-pointer relative overflow-hidden">
                                            {/* franja de calor */}
                                            <div className="absolute inset-y-0 left-0 w-1" style={{ background: meta.color, opacity: 0.3 + t.heat * 0.7 }} />
                                            <div className="flex items-center justify-between gap-2 pl-1.5">
                                                <span className="text-[11px] @sm:text-xs font-bold truncate flex-1">{t.label}</span>
                                                {!micro && <Chip color={meta.color}>{meta.label}</Chip>}
                                            </div>
                                            {!micro && (
                                                <div className="mt-1 flex items-center gap-2 pl-1.5 text-[10px] text-muted-foreground/60">
                                                    {/* barra de calor */}
                                                    <div className="h-1 flex-1 rounded-full bg-white/5 overflow-hidden">
                                                        <div className="h-full rounded-full" style={{ width: `${t.heat * 100}%`, background: meta.color }} />
                                                    </div>
                                                    <span className="inline-flex items-center gap-0.5 shrink-0"><Users className="size-3" /> {t.participants > 999 ? `${(t.participants / 1000).toFixed(1)}k` : t.participants}</span>
                                                    <TrendIcon t={t.trend} />
                                                </div>
                                            )}
                                            {broken && !micro && (
                                                <div className="mt-1.5 ml-1.5 rounded-lg border border-violet-500/30 bg-violet-500/[0.06] px-2 py-1 text-[10px] leading-snug text-violet-200/90">
                                                    <span className="font-bold text-violet-300">Postura contraria: </span>{t.opposingView}
                                                </div>
                                            )}
                                        </Link>
                                    );
                                }}
                            />
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}

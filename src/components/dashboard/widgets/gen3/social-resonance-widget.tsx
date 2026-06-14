'use client';

import { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import {
    Thermometer, Search, Eye, EyeOff, TrendingUp, TrendingDown, Minus,
    Users, ChevronRight, type LucideIcon, Sparkle, Flame, Zap, HelpCircle, Handshake,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { WidgetShell, MiniList, Chip } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { CivicEmotion } from "@/lib/widget-data";
import { cn } from "@/lib/utils";

// ════════════════════════════════════════════════════════════════
// SocialResonanceWidget — Termómetro de Resonancia Social.
// Heatmap semántico de los temas más debatidos por emoción. Modo
// "Burbuja Rota" muestra el argumento contrario para mitigar el sesgo.
// ----------------------------------------------------------------
// Datos REALES (cuando hay): agrega las últimas filas de `cafe_posts`
// del proyecto Supabase compartido por `kind`/`branch` → conteos de
// participación + calor por recencia. Suscripción realtime a
// `cafe_posts` (postgres_changes) para refrescar en vivo. Sin
// red/datos → degrada con elegancia a "politics.resonance" simulado.
// ════════════════════════════════════════════════════════════════
const EMOTION_META: Record<CivicEmotion, { label: string; color: string; icon: LucideIcon }> = {
    esperanza: { label: "Esperanza", color: "#10b981", icon: Sparkle },
    indignacion: { label: "Indignación", color: "#f43f5e", icon: Flame },
    urgencia: { label: "Urgencia", color: "#f59e0b", icon: Zap },
    curiosidad: { label: "Curiosidad", color: "#38bdf8", icon: HelpCircle },
    consenso: { label: "Consenso", color: "#a855f7", icon: Handshake },
};
const EMOTION_KEYS: CivicEmotion[] = ["esperanza", "indignacion", "urgencia", "curiosidad", "consenso"];

const TrendIcon = ({ t }: { t: "up" | "down" | "flat" }) =>
    t === "up" ? <TrendingUp className="size-3 text-emerald-400" /> : t === "down" ? <TrendingDown className="size-3 text-rose-400" /> : <Minus className="size-3 text-muted-foreground/50" />;

// ── Forma de tema (compatible con el render simulado y el real) ──
interface ResonanceTopic {
    id: string;
    label: string;
    emotion: CivicEmotion;
    heat: number;        // 0..1
    participants: number;
    trend: "up" | "down" | "flat";
    threadHref: string;
    opposingView: string;
}

// Fila pública de cafe_posts (sólo lo que necesitamos).
interface CafePostRow {
    id: string;
    kind: string | null;
    branch: string | null;
    title: string | null;
    status: string | null;
    created_at: string | null;
}

const INT_ES = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });

// Asigna una emoción estable a partir del kind/etiqueta del tema.
function emotionForKind(kind: string): CivicEmotion {
    const k = kind.toLowerCase();
    if (k.includes("propuesta") || k.includes("proposal")) return "consenso";
    if (k.includes("alert") || k.includes("urg")) return "urgencia";
    if (k.includes("pregunta") || k.includes("duda") || k.includes("?")) return "curiosidad";
    if (k.includes("queja") || k.includes("issue")) return "indignacion";
    // hash determinista → reparto estable entre las 5 emociones
    let h = 0;
    for (let i = 0; i < kind.length; i++) h = (h * 31 + kind.charCodeAt(i)) >>> 0;
    return EMOTION_KEYS[h % EMOTION_KEYS.length];
}

const LABELS_ES: Record<string, string> = {
    elixir: "Elixires", recipe: "Recetas", proposal: "Propuestas",
    propuesta: "Propuestas", post: "Publicaciones", review: "Reseñas",
};
function labelForKind(kind: string): string {
    return LABELS_ES[kind.toLowerCase()] ?? (kind.charAt(0).toUpperCase() + kind.slice(1));
}

/** Agrega posts → temas (uno por kind/branch), calor por recencia. */
function buildTopics(rows: CafePostRow[]): ResonanceTopic[] {
    if (rows.length === 0) return [];
    const now = Date.now();
    const groups = new Map<string, { count: number; recent: number; titles: string[] }>();
    for (const r of rows) {
        const key = (r.branch?.trim() || r.kind?.trim() || "general").toLowerCase();
        const g = groups.get(key) ?? { count: 0, recent: 0, titles: [] };
        g.count += 1;
        const ts = r.created_at ? new Date(r.created_at).getTime() : now;
        // recencia 0..1 con vida media de ~3 días
        g.recent = Math.max(g.recent, Math.exp(-(now - ts) / (1000 * 60 * 60 * 72)));
        if (r.title) g.titles.push(r.title);
        groups.set(key, g);
    }
    const maxCount = Math.max(...[...groups.values()].map(g => g.count), 1);
    return [...groups.entries()]
        .map(([key, g]) => {
            const heat = Math.min(1, 0.25 + (g.count / maxCount) * 0.55 + g.recent * 0.2);
            return {
                id: key,
                label: labelForKind(key),
                emotion: emotionForKind(key),
                heat,
                participants: g.count,
                trend: (g.recent > 0.55 ? "up" : g.recent < 0.15 ? "down" : "flat") as "up" | "down" | "flat",
                threadHref: "/network/politics",
                opposingView: g.titles[0]
                    ? `Un tema reciente: "${g.titles[0]}". ¿Y si el marco fuese el contrario?`
                    : "Considera la perspectiva opuesta antes de posicionarte.",
            };
        })
        .sort((a, b) => b.heat - a.heat);
}

export function SocialResonanceWidget() {
    const supabase = useMemo(() => createClient(), []);
    const { data: sim, loading: simLoading } = useWidgetData("politics.resonance", { refreshMs: 8000 });

    const [query, setQuery] = useState("");
    const [broken, setBroken] = useState(false);

    // Datos reales (opcional): temas derivados de cafe_posts + total.
    const [realTopics, setRealTopics] = useState<ResonanceTopic[] | null>(null);
    const [totalPosts, setTotalPosts] = useState<number | null>(null);

    const reload = useCallback(async () => {
        try {
            const [postsRes, countRes] = await Promise.all([
                supabase.from("cafe_posts")
                    .select("id, kind, branch, title, status, created_at")
                    .order("created_at", { ascending: false }).limit(120),
                supabase.from("cafe_posts").select("id", { count: "exact", head: true }),
            ]);
            if (!postsRes.error && postsRes.data && postsRes.data.length > 0) {
                setRealTopics(buildTopics(postsRes.data as CafePostRow[]));
            } else {
                setRealTopics([]);
            }
            if (!countRes.error && typeof countRes.count === "number") setTotalPosts(countRes.count);
        } catch {
            setRealTopics([]); // fallback silencioso al modo simulado
        }
    }, [supabase]);

    useEffect(() => {
        let alive = true;
        void (async () => { if (alive) await reload(); })();
        // Realtime: cualquier cambio en cafe_posts → recarga la resonancia.
        const ch = supabase
            .channel("w-social-resonance")
            .on("postgres_changes", { event: "*", schema: "public", table: "cafe_posts" }, () => { void reload(); })
            .subscribe();
        return () => { alive = false; supabase.removeChannel(ch); };
    }, [supabase, reload]);

    // ¿Tenemos datos reales utilizables?
    const hasReal = realTopics !== null && realTopics.length > 0;
    const loading = hasReal ? false : (simLoading || !sim);

    // Emoción dominante: la del tema más caliente (real) o la simulada.
    const dominant: CivicEmotion = hasReal
        ? realTopics![0].emotion
        : (sim?.dominantEmotion ?? "curiosidad");

    const windowLabel = hasReal
        ? (totalPosts !== null ? `${INT_ES.format(totalPosts)} señales · en vivo` : "Señales en vivo")
        : (sim?.window ?? "Pulso del debate");

    const topics = useMemo(() => {
        const base: ResonanceTopic[] = hasReal
            ? realTopics!
            : (sim?.topics as ResonanceTopic[] | undefined) ?? [];
        const q = query.trim().toLowerCase();
        return q ? base.filter((t) => t.label.toLowerCase().includes(q)) : base;
    }, [hasReal, realTopics, sim, query]);

    return (
        <WidgetShell
            title="Resonancia Social"
            subtitle={windowLabel}
            icon={Thermometer}
            accent="#f43f5e"
            live
            actions={
                <Link href="/network/politics" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer">
                    Ágora <ChevronRight className="size-3" />
                </Link>
            }
            footer={
                <p className="text-[9px] uppercase tracking-[0.16em] font-bold text-muted-foreground/50 text-center">
                    {hasReal ? "Resonancia del Café · datos en vivo" : "Pulso del debate · modo simulado"}
                </p>
            }
        >
            {(size) => {
                if (loading) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const compact = size.vTier === "compact";
                const maxList = size.vTier === "expanded" ? 5 : compact ? 2 : 4;
                const dom = EMOTION_META[dominant];

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

'use client';

import { useState, useMemo, useCallback, useEffect } from "react";
import Link from "next/link";
import {
    Gift, MapPin, Check, Hand, ChevronRight, Apple, Wrench, Shirt,
    Palette, Clock, Lightbulb, type LucideIcon,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { WidgetShell, MiniList, Chip } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { GiftOffer } from "@/lib/widget-data";
import { cn } from "@/lib/utils";

// ════════════════════════════════════════════════════════════════
// GiftAgoraWidget — Ágora del Don (Red de Distribución Libre).
// Mapa de abundancia: bienes y servicios de acceso libre y gratuito.
// "Llamado al Enjambre" + filtros de proximidad/categoría.
// ----------------------------------------------------------------
// Datos REALES (cuando hay): combina `cafe_posts` (las creaciones de
// la comunidad → dones) con `cafe_locals` (los locales/zonas → quién
// ofrece) del proyecto Supabase compartido. Realtime: suscripción a
// `cafe_posts` y `cafe_locals` (postgres_changes). Sin red/datos →
// degrada a "oikos.gifts" simulado. Invariante: comunismo de
// abundancia, mérito ontológico.
// ════════════════════════════════════════════════════════════════
const CAT_ICON: Record<GiftOffer["category"], LucideIcon> = {
    alimentos: Apple, herramientas: Wrench, ropa: Shirt, arte: Palette, tiempo: Clock, asesoria: Lightbulb,
};
const URGENCY: Record<GiftOffer["urgency"], { label: string; color: string }> = {
    alta: { label: "Urgente", color: "#f43f5e" },
    media: { label: "Media", color: "#f59e0b" },
    baja: { label: "Tranquila", color: "#38bdf8" },
};
const CAT_ACCENT: Record<GiftOffer["category"], string> = {
    alimentos: "#10b981", herramientas: "#f59e0b", ropa: "#38bdf8",
    arte: "#ec4899", tiempo: "#a855f7", asesoria: "#22c55e",
};
const CAT_KEYS: GiftOffer["category"][] = ["alimentos", "herramientas", "ropa", "arte", "tiempo", "asesoria"];

const INT_ES = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });

// Filas públicas (sólo lo necesario).
interface CafePostRow {
    id: string;
    kind: string | null;
    branch: string | null;
    title: string | null;
    body: string | null;
    author_name: string | null;
    status: string | null;
    created_at: string | null;
}
interface CafeLocalRow { zone: string; name: string | null }

// Mapea un kind/branch del Café a una categoría del Ágora.
function categoryForPost(p: CafePostRow): GiftOffer["category"] {
    const k = `${p.kind ?? ""} ${p.branch ?? ""}`.toLowerCase();
    if (k.includes("elixir") || k.includes("recipe") || k.includes("receta") || k.includes("comida")) return "alimentos";
    if (k.includes("herram") || k.includes("tool")) return "herramientas";
    if (k.includes("ropa") || k.includes("textil")) return "ropa";
    if (k.includes("arte") || k.includes("mural") || k.includes("art")) return "arte";
    if (k.includes("tiempo") || k.includes("cuidado")) return "tiempo";
    if (k.includes("asesor") || k.includes("propuesta") || k.includes("proposal")) return "asesoria";
    // reparto determinista estable por id
    let h = 0; const s = p.id;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return CAT_KEYS[h % CAT_KEYS.length];
}

// Construye ofertas reales desde posts + locales (sin distancias falsas → 0).
function buildOffers(posts: CafePostRow[], locals: CafeLocalRow[]): GiftOffer[] {
    if (posts.length === 0) return [];
    const localNames = locals.map(l => l.name?.trim()).filter((n): n is string => !!n);
    const now = Date.now();
    return posts.map((p, i) => {
        const category = categoryForPost(p);
        const ts = p.created_at ? new Date(p.created_at).getTime() : now;
        const ageH = (now - ts) / (1000 * 60 * 60);
        const urgency: GiftOffer["urgency"] = ageH < 12 ? "alta" : ageH < 72 ? "media" : "baja";
        const giver = p.author_name?.trim()
            || (localNames.length ? localNames[i % localNames.length] : "Comunidad StarSeed");
        return {
            id: p.id,
            title: p.title?.trim() || p.body?.trim()?.slice(0, 48) || "Don de la comunidad",
            kind: (category === "tiempo" || category === "asesoria" || category === "arte" ? "servicio" : "bien") as GiftOffer["kind"],
            category,
            giver,
            distanceKm: 0, // sin geodatos reales por post → se oculta el km en UI
            urgency,
            available: (p.status ?? "open").toLowerCase() !== "closed",
            accent: CAT_ACCENT[category],
        };
    });
}

export function GiftAgoraWidget() {
    const supabase = useMemo(() => createClient(), []);
    const { data: sim, loading: simLoading } = useWidgetData("oikos.gifts", { refreshMs: 12000 });

    const [taken, setTaken] = useState<Record<string, boolean>>({});
    const [nearOnly, setNearOnly] = useState(false);

    // Datos reales (opcional).
    const [realOffers, setRealOffers] = useState<GiftOffer[] | null>(null);
    const [localCount, setLocalCount] = useState<number | null>(null);

    const reload = useCallback(async () => {
        try {
            const [postsRes, localsRes] = await Promise.all([
                supabase.from("cafe_posts")
                    .select("id, kind, branch, title, body, author_name, status, created_at")
                    .order("created_at", { ascending: false }).limit(40),
                supabase.from("cafe_locals").select("zone, name"),
            ]);
            const locals = (!localsRes.error && localsRes.data ? localsRes.data : []) as CafeLocalRow[];
            setLocalCount(locals.length || null);
            if (!postsRes.error && postsRes.data && postsRes.data.length > 0) {
                setRealOffers(buildOffers(postsRes.data as CafePostRow[], locals));
            } else {
                setRealOffers([]);
            }
        } catch {
            setRealOffers([]); // fallback silencioso a modo simulado
        }
    }, [supabase]);

    useEffect(() => {
        let alive = true;
        void (async () => { if (alive) await reload(); })();
        // Realtime: dones (cafe_posts) y locales (cafe_locals) en vivo.
        const ch = supabase
            .channel("w-gift-agora")
            .on("postgres_changes", { event: "*", schema: "public", table: "cafe_posts" }, () => { void reload(); })
            .on("postgres_changes", { event: "*", schema: "public", table: "cafe_locals" }, () => { void reload(); })
            .subscribe();
        return () => { alive = false; supabase.removeChannel(ch); };
    }, [supabase, reload]);

    const hasReal = realOffers !== null && realOffers.length > 0;
    const loading = hasReal ? false : (simLoading || !sim);
    const realMode = hasReal; // en datos reales no hay km, se desactiva el filtro de cercanía

    const items = useMemo(() => {
        const base: GiftOffer[] = hasReal ? realOffers! : (sim ?? []);
        const list = (!realMode && nearOnly) ? base.filter((g) => g.distanceKm <= 3) : base;
        return [...list].sort((a, b) => (a.available === b.available ? a.distanceKm - b.distanceKm : a.available ? -1 : 1));
    }, [hasReal, realOffers, sim, realMode, nearOnly]);

    const take = useCallback((id: string) => setTaken((p) => ({ ...p, [id]: !p[id] })), []);

    return (
        <WidgetShell
            title="Ágora del Don"
            subtitle={realMode ? "Dones de la comunidad · en vivo" : "Abundancia de libre acceso"}
            icon={Gift}
            accent="#10b981"
            live
            actions={
                <Link href="/hub" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer">
                    Red <ChevronRight className="size-3" />
                </Link>
            }
            footer={
                <p className="text-[9px] uppercase tracking-[0.16em] font-bold text-muted-foreground/50 text-center">
                    {realMode
                        ? `Ágora del Café · ${localCount !== null ? `${INT_ES.format(localCount)} locales` : "datos en vivo"}`
                        : "Red de distribución libre · modo simulado"}
                </p>
            }
        >
            {(size) => {
                if (loading) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const maxList = size.vTier === "expanded" ? 6 : size.vTier === "compact" ? 2 : 4;

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        {!micro && (
                            <div className="shrink-0 flex items-center gap-2">
                                {realMode ? (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide">
                                        <MapPin className="size-2.5" /> Café · en vivo
                                    </span>
                                ) : (
                                    <button
                                        onClick={() => setNearOnly((v) => !v)}
                                        className={cn(
                                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide transition-colors cursor-pointer",
                                            nearOnly ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : "border-border/40 text-muted-foreground/60 hover:text-foreground"
                                        )}
                                    >
                                        <MapPin className="size-2.5" /> {nearOnly ? "≤ 3 km" : "Todo el radio"}
                                    </button>
                                )}
                                <span className="ml-auto text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40">{items.length} ofertas</span>
                            </div>
                        )}
                        <div className="flex-1 min-h-0">
                            <MiniList
                                items={items}
                                max={maxList}
                                empty="Sin dones disponibles en el radio"
                                render={(g) => {
                                    const Icon = CAT_ICON[g.category];
                                    const u = URGENCY[g.urgency];
                                    const isTaken = taken[g.id];
                                    return (
                                        <div className={cn(
                                            "flex items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-colors",
                                            g.available ? "border-border/40 bg-white/[0.02] hover:border-emerald-500/30" : "border-border/20 bg-white/[0.01] opacity-60"
                                        )}>
                                            <span className="grid place-items-center size-9 rounded-xl border shrink-0"
                                                style={{ color: g.accent, borderColor: `${g.accent}40`, background: `${g.accent}14` }}>
                                                <Icon className="size-4" />
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[11px] @sm:text-xs font-bold truncate">{g.title}</span>
                                                    {!micro && g.urgency !== "baja" && <Chip color={u.color}>{u.label}</Chip>}
                                                </div>
                                                {!micro && (
                                                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground/60">
                                                        <span className="truncate">{g.giver}</span>
                                                        {g.distanceKm > 0 && (
                                                            <span className="inline-flex items-center gap-0.5 shrink-0 ml-auto"><MapPin className="size-3" /> {g.distanceKm} km</span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            {!micro && (
                                                <button
                                                    onClick={() => take(g.id)}
                                                    disabled={!g.available && !isTaken}
                                                    className={cn(
                                                        "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[9px] font-black uppercase tracking-wide transition-colors cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed",
                                                        isTaken ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : "border-border/40 text-muted-foreground/70 hover:text-foreground hover:border-emerald-500/40"
                                                    )}
                                                >
                                                    {isTaken ? <><Check className="size-2.5" /> Tomado</> : <><Hand className="size-2.5" /> {g.kind === "servicio" ? "Sumarme" : "Tomar"}</>}
                                                </button>
                                            )}
                                        </div>
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

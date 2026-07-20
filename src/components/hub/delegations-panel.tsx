"use client";

/**
 * ── DelegationsPanel — Delegación Líquida visible (Voto Delegado, §3) ─────────
 * Delega tu voz por tema (político/educativo/cultural/social) a un perfil o
 * entidad, con REVOCACIÓN EN UN TOQUE. Muestra también «quién delega en mí»
 * (honesto sin DDL: dentro de las entidades que administras).
 */

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
    Vote, Search, UserPlus, X, ShieldCheck, Inbox, ArrowUpRight, Users2, Info,
} from "lucide-react";
import { SYSTEM_KEYS, SYSTEM_META, TYPE_META, type SystemKey } from "@/lib/hub-social/meta";
import { searchAccountProfiles, type AccountProfile } from "@/lib/profiles/profiles";
import {
    useDelegations, loadInboundDelegations,
    type Delegation, type SetDelegationInput, type InboundDelegation,
} from "@/lib/hub-social/delegations";
import type { HubGraph, GraphNode } from "@/lib/hub-social/graph";

function initials(name: string): string {
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "S";
}

// ── Selector de delegado (perfil o entidad) ─────────────────────────────────

function DelegatePicker({
    topic, mine, onPick,
}: {
    topic: SystemKey; mine: GraphNode[]; onPick: (input: SetDelegationInput) => void;
}) {
    const [q, setQ] = useState("");
    const [profiles, setProfiles] = useState<AccountProfile[]>([]);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        const term = q.trim();
        if (term.length < 2) { setProfiles([]); return; }
        let alive = true;
        setSearching(true);
        const t = setTimeout(() => {
            void searchAccountProfiles(term, 6).then((res) => {
                if (alive) { setProfiles(res); setSearching(false); }
            });
        }, 220);
        return () => { alive = false; clearTimeout(t); };
    }, [q]);

    // Conexiones sugeridas: primero las del mismo sistema del tema.
    const suggested = useMemo(() => {
        const same = mine.filter((n) => n.system === topic);
        const rest = mine.filter((n) => n.system !== topic);
        return [...same, ...rest].slice(0, 20);
    }, [mine, topic]);

    return (
        <div className="w-[19rem] max-w-[90vw]">
            <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Busca un perfil por nombre…"
                    aria-label="Buscar perfil para delegar"
                    className="h-10 rounded-lg border-white/12 bg-background/40 pl-8 text-sm"
                />
            </div>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-0.5">
                {q.trim().length >= 2 && (
                    <div>
                        <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Perfiles</p>
                        {searching ? (
                            <p className="px-1 py-2 text-[11px] italic text-muted-foreground">Buscando…</p>
                        ) : profiles.length === 0 ? (
                            <p className="px-1 py-2 text-[11px] italic text-muted-foreground">Sin perfiles con ese nombre.</p>
                        ) : (
                            profiles.map((p) => (
                                <PickRow
                                    key={p.id}
                                    name={p.name}
                                    sub={p.handle ? `@${p.handle}` : "Perfil"}
                                    avatar={p.avatarUrl}
                                    onClick={() => onPick({
                                        topic, delegateKind: "profile", delegateId: p.id, delegateName: p.name,
                                        delegateAvatar: p.avatarUrl, delegateHref: `/profile/${p.handle ?? p.id}`,
                                    })}
                                />
                            ))
                        )}
                    </div>
                )}
                <div>
                    <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tus conexiones</p>
                    {suggested.length === 0 ? (
                        <p className="px-1 py-2 text-[11px] italic text-muted-foreground">Aún no tienes conexiones para delegar.</p>
                    ) : (
                        suggested.map((n) => (
                            <PickRow
                                key={n.slug}
                                name={n.name}
                                sub={`${TYPE_META[n.type].singular} · ${SYSTEM_META[n.system].label}`}
                                color={n.accent}
                                icon
                                node={n}
                                onClick={() => onPick({
                                    topic, delegateKind: "entity", delegateId: n.slug, delegateName: n.name,
                                    delegateHref: n.href, delegateSystem: n.system, delegateType: n.type,
                                })}
                            />
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

function PickRow({
    name, sub, avatar, color, icon, node, onClick,
}: {
    name: string; sub: string; avatar?: string | null; color?: string; icon?: boolean; node?: GraphNode; onClick: () => void;
}) {
    const TypeIcon = node ? TYPE_META[node.type].icon : Users2;
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex w-full min-h-[2.75rem] cursor-pointer items-center gap-2.5 rounded-lg border border-white/8 bg-white/[0.02] px-2.5 py-1.5 text-left transition-colors duration-200 hover:border-primary/30 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
            {icon ? (
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border" style={{ background: `${color}18`, borderColor: `${color}33`, color }}>
                    <TypeIcon className="h-4 w-4" />
                </span>
            ) : (
                <Avatar className="h-8 w-8">
                    {avatar ? <AvatarImage src={avatar} alt={name} /> : null}
                    <AvatarFallback className="bg-primary/20 text-[10px] font-bold text-primary">{initials(name)}</AvatarFallback>
                </Avatar>
            )}
            <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-foreground/90">{name}</span>
                <span className="block truncate text-[10px] text-muted-foreground">{sub}</span>
            </span>
            <UserPlus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
    );
}

// ── Tarjeta por tema ────────────────────────────────────────────────────────

function TopicCard({
    topic, delegation, mine, onDelegate, onRevoke,
}: {
    topic: SystemKey; delegation: Delegation | undefined; mine: GraphNode[];
    onDelegate: (input: SetDelegationInput) => void; onRevoke: (id: string) => void;
}) {
    const sys = SYSTEM_META[topic];
    const [open, setOpen] = useState(false);

    return (
        <Card className="liquid-glass-panel relative flex h-full flex-col overflow-hidden border transition-all duration-300" style={{ borderColor: `${sys.color}2e` }}>
            <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: `linear-gradient(90deg, ${sys.color}, transparent)` }} aria-hidden />
            <CardContent className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-center gap-2">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border" style={{ background: `${sys.color}18`, borderColor: `${sys.color}33`, color: sys.color }}>
                        <sys.icon className="h-4 w-4" />
                    </span>
                    <div>
                        <p className="text-sm font-black tracking-tight text-foreground/95">{sys.label}</p>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Tema de delegación</p>
                    </div>
                </div>

                {delegation ? (
                    <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                        {delegation.delegateKind === "entity" ? (
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border" style={{ background: `${sys.color}18`, borderColor: `${sys.color}33`, color: sys.color }}>
                                {delegation.delegateType ? React.createElement(TYPE_META[delegation.delegateType].icon, { className: "h-4 w-4" }) : <Users2 className="h-4 w-4" />}
                            </span>
                        ) : (
                            <Avatar className="h-9 w-9">
                                {delegation.delegateAvatar ? <AvatarImage src={delegation.delegateAvatar} alt={delegation.delegateName} /> : null}
                                <AvatarFallback className="bg-primary/20 text-[10px] font-bold text-primary">{initials(delegation.delegateName)}</AvatarFallback>
                            </Avatar>
                        )}
                        <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300/80">Tu voz está delegada en</p>
                            {delegation.delegateHref ? (
                                <Link href={delegation.delegateHref} className="block truncate text-sm font-bold text-foreground hover:text-primary">
                                    {delegation.delegateName}
                                </Link>
                            ) : (
                                <p className="truncate text-sm font-bold text-foreground">{delegation.delegateName}</p>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => onRevoke(delegation.id)}
                            aria-label={`Revocar delegación en ${delegation.delegateName}`}
                            title="Revocar (un toque)"
                            className="inline-flex min-h-[2.75rem] min-w-[2.75rem] shrink-0 cursor-pointer items-center justify-center rounded-lg border border-rose-400/30 bg-rose-400/10 text-rose-200 transition-colors duration-200 hover:bg-rose-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:min-h-[2.25rem] sm:min-w-[2.25rem]"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                ) : (
                    <Popover open={open} onOpenChange={setOpen}>
                        <PopoverTrigger asChild>
                            <button
                                type="button"
                                className="inline-flex min-h-[2.75rem] w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed px-3 text-xs font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                                style={{ borderColor: `${sys.color}44`, color: sys.color, background: `${sys.color}0d` }}
                            >
                                <UserPlus className="h-3.5 w-3.5" /> Delegar mi voz
                            </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="border-white/12 bg-background/95 p-3 backdrop-blur-xl">
                            <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
                                Delega tu voz en <span className="font-semibold" style={{ color: sys.color }}>{sys.label.toLowerCase()}</span> — revocable en todo momento.
                            </p>
                            <DelegatePicker topic={topic} mine={mine} onPick={(input) => { onDelegate(input); setOpen(false); }} />
                        </PopoverContent>
                    </Popover>
                )}
            </CardContent>
        </Card>
    );
}

// ── «Quién delega en mí» (entrante, honesto) ────────────────────────────────

function InboundSection({ graph }: { graph: HubGraph }) {
    const [inbound, setInbound] = useState<InboundDelegation[]>([]);
    const [loading, setLoading] = useState(true);

    const owned = useMemo(
        () => graph.mine.filter((n) => n.bonds.includes("admin")).map((n) => ({ type: n.type, slug: n.slug })),
        [graph.mine],
    );

    useEffect(() => {
        let alive = true;
        if (owned.length === 0) { setInbound([]); setLoading(false); return; }
        setLoading(true);
        void loadInboundDelegations(owned).then((res) => {
            if (alive) { setInbound(res); setLoading(false); }
        });
        return () => { alive = false; };
    }, [owned]);

    return (
        <Card className="liquid-glass-panel border-white/10">
            <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-2">
                    <Inbox className="h-4 w-4 text-amber-300" />
                    <h4 className="text-sm font-black tracking-tight text-foreground/95">Quién delega en mí</h4>
                    {inbound.length > 0 && (
                        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/5 text-[9px] text-amber-200">{inbound.length}</Badge>
                    )}
                </div>
                {loading ? (
                    <div className="h-14 animate-pulse rounded-xl border border-white/10 bg-white/[0.02]" />
                ) : inbound.length === 0 ? (
                    <p className="flex items-start gap-2 rounded-xl border border-dashed border-white/12 px-3 py-3 text-[11px] leading-relaxed text-muted-foreground">
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                        <span>
                            Aún nadie ha delegado su voz en ti dentro de las entidades que administras. La delegación
                            líquida es soberana y revocable; sin una tabla federada dedicada, su alcance entre cuentas se
                            limita a los espacios que compartís (así es de honesto el sistema hoy).
                        </span>
                    </p>
                ) : (
                    <div className="space-y-2">
                        {inbound.map((d, i) => {
                            const sys = SYSTEM_META[d.topic];
                            return (
                                <div key={`${d.delegatorUid}-${i}`} className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
                                    <Avatar className="h-8 w-8">
                                        {d.delegatorAvatar ? <AvatarImage src={d.delegatorAvatar} alt={d.delegatorName} /> : null}
                                        <AvatarFallback className="bg-amber-500/20 text-[10px] font-bold text-amber-200">{initials(d.delegatorName)}</AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-xs font-semibold text-foreground/90">{d.delegatorName}</p>
                                        <p className="truncate text-[10px] text-muted-foreground">
                                            en <span style={{ color: sys.color }}>{sys.label}</span> · vía {d.entityName}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

// ── Panel raíz ──────────────────────────────────────────────────────────────

export function DelegationsPanel({ graph }: { graph: HubGraph }) {
    const { delegations, loading, setOne, revoke } = useDelegations();

    const byTopic = useMemo(() => {
        const map = new Map<SystemKey, Delegation>();
        for (const d of delegations) if (!map.has(d.topic)) map.set(d.topic, d);
        return map;
    }, [delegations]);

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                    <Vote className="h-4 w-4 text-cyan-300" />
                    <h3 className="font-headline text-lg font-black tracking-tight text-foreground/95">Delegación Líquida</h3>
                    <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/5 text-[9px] uppercase tracking-widest text-cyan-200">
                        {byTopic.size} / {SYSTEM_KEYS.length} temas
                    </Badge>
                </div>
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground text-balance">
                    Delega tu voz en un tema a quien confíes su sabiduría — <span className="text-foreground/80">nunca de forma permanente</span>.
                    Revocable en un toque (Voto Delegado Líquido, Ontocracia §3).
                </p>
            </div>

            {graph.needsAuth ? (
                <Card className="liquid-glass-panel border-white/10">
                    <CardContent className="flex flex-col items-center gap-3 py-7 text-center">
                        <div className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-cyan-300">
                            <ShieldCheck className="h-5 w-5" />
                        </div>
                        <p className="max-w-sm text-sm text-muted-foreground">
                            Inicia sesión para delegar tu voz de forma soberana y revocable.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {SYSTEM_KEYS.map((topic) => (
                            <TopicCard
                                key={topic}
                                topic={topic}
                                delegation={loading ? undefined : byTopic.get(topic)}
                                mine={graph.mine}
                                onDelegate={(input) => void setOne(input)}
                                onRevoke={(id) => void revoke(id)}
                            />
                        ))}
                    </div>
                    <InboundSection graph={graph} />
                </>
            )}
        </div>
    );
}

export default DelegationsPanel;

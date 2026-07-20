"use client";

/*
 * TwinningPanel — Hermanamiento de Sanghas (Adenda 77 · PACK 2, punto 8).
 * El admin de una entidad propone hermanar con otra; invitación REAL vía espejo
 * os_spaces. Tarjetas con lazo visual entre ambas (colores de ambos sistemas) y
 * estado (propuesto/aceptado). Persistencia entity_state, sin DDL.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Link2, Handshake, Loader2, Plus, Search, Check, ArrowLeftRight, Inbox, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { fetchMyEntities, type OsPage, type OsGroup } from "@/lib/os-social";
import { searchGroups, type SocialGroupHit } from "@/lib/social/os-profiles";
import { prefsFromTags } from "@/lib/cultural/languages";
import { systemById } from "@/lib/cultural/systems";
import {
    proposeTwinning, acceptTwinning, listTwinnings, listIncomingTwinningInvites,
    type TwinEntity, type Twinning, type IncomingTwinningInvite,
} from "@/lib/cultural/twinning";

function pageToTwin(p: OsPage): TwinEntity {
    return { kind: "page", slug: p.slug, name: p.name, systemId: prefsFromTags(p.tags).region?.systemId, avatarUrl: p.avatarUrl ?? null };
}
function groupToTwin(g: OsGroup): TwinEntity {
    return { kind: "group", slug: g.slug, name: g.name, systemId: prefsFromTags(g.tags).region?.systemId, avatarUrl: g.avatarUrl ?? null };
}
function hitToTwin(h: SocialGroupHit): TwinEntity {
    return {
        kind: h.kind === "grupo" ? "group" : "page",
        slug: h.slug,
        name: h.name,
        systemId: prefsFromTags(h.tags).region?.systemId,
        avatarUrl: h.avatarUrl ?? null,
    };
}

/** Lazo visual entre dos entidades, con degradado de los dos sistemas. */
function TwinLazo({ a, b, status }: { a: TwinEntity; b: TwinEntity; status: string }) {
    const sa = systemById(a.systemId);
    const sb = systemById(b.systemId);
    return (
        <div className="flex items-center gap-2">
            <EntityChip entity={a} color={sa.color} />
            <div className="relative flex flex-1 items-center justify-center">
                <div className="h-0.5 w-full rounded-full" style={{ background: `linear-gradient(90deg, ${sa.color}, ${sb.color})` }} />
                <span
                    className="absolute grid size-7 place-items-center rounded-full border border-white/20 bg-background"
                    title={status}
                >
                    {status === "aceptado" ? <Handshake className="size-3.5 text-emerald-400" /> : <Link2 className="size-3.5 text-white/70" />}
                </span>
            </div>
            <EntityChip entity={b} color={sb.color} />
        </div>
    );
}

function EntityChip({ entity, color }: { entity: TwinEntity; color: string }) {
    const initials = (entity.name || "?").slice(0, 2).toUpperCase();
    return (
        <div className="flex min-w-0 flex-col items-center gap-1 text-center">
            <Avatar className="size-11 border-2" style={{ borderColor: color }}>
                <AvatarImage src={entity.avatarUrl || undefined} alt={entity.name} />
                <AvatarFallback className="bg-white/10 text-xs font-bold" style={{ color }}>{initials}</AvatarFallback>
            </Avatar>
            <Link href={`/pagina/${entity.slug}`} className="max-w-[7rem] truncate text-[11px] font-semibold text-foreground/85 hover:underline">
                {entity.name}
            </Link>
        </div>
    );
}

export function TwinningPanel() {
    const [myEntities, setMyEntities] = useState<TwinEntity[]>([]);
    const [twinnings, setTwinnings] = useState<Twinning[]>([]);
    const [incoming, setIncoming] = useState<IncomingTwinningInvite[]>([]);
    const [loading, setLoading] = useState(true);

    const [fromSlug, setFromSlug] = useState("");
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SocialGroupHit[]>([]);
    const [searching, setSearching] = useState(false);
    const [target, setTarget] = useState<TwinEntity | null>(null);
    const [proposing, setProposing] = useState(false);
    const [acceptingId, setAcceptingId] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const mine = await fetchMyEntities();
            const entities = [...mine.pages.map(pageToTwin), ...mine.groups.map(groupToTwin)];
            setMyEntities(entities);
            if (entities.length > 0 && !fromSlug) setFromSlug(entities[0].slug);

            const all: Twinning[] = [];
            for (const e of entities) {
                const list = await listTwinnings(e);
                all.push(...list);
            }
            // Deduplica por id.
            const seen = new Set<string>();
            setTwinnings(all.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true))));

            setIncoming(await listIncomingTwinningInvites());
        } finally {
            setLoading(false);
        }
    }, [fromSlug]);

    useEffect(() => {
        void refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Búsqueda de la entidad destino.
    useEffect(() => {
        const q = query.trim();
        if (q.length < 2) {
            setResults([]);
            return;
        }
        let alive = true;
        setSearching(true);
        const t = setTimeout(() => {
            searchGroups(q, 8)
                .then((r) => {
                    if (alive) setResults(r.filter((h) => h.slug !== fromSlug));
                })
                .finally(() => {
                    if (alive) setSearching(false);
                });
        }, 300);
        return () => {
            alive = false;
            clearTimeout(t);
        };
    }, [query, fromSlug]);

    const fromEntity = useMemo(() => myEntities.find((e) => e.slug === fromSlug) ?? null, [myEntities, fromSlug]);
    const mySlugs = useMemo(() => new Set(myEntities.map((e) => e.slug)), [myEntities]);

    const propose = async () => {
        if (!fromEntity || !target) return;
        setProposing(true);
        try {
            const res = await proposeTwinning(fromEntity, target);
            if (!res.ok) {
                toast.error(res.error || "No se pudo proponer el hermanamiento.");
                return;
            }
            toast.success(res.invited ? "Hermanamiento propuesto e invitación enviada a la otra entidad." : "Hermanamiento propuesto (la otra entidad aún no tiene cuenta enlazada).");
            setTarget(null);
            setQuery("");
            void refresh();
        } finally {
            setProposing(false);
        }
    };

    const accept = async (invite: IncomingTwinningInvite) => {
        // ¿Cuál de las dos entidades administro yo?
        const mineIsB = mySlugs.has(invite.b.slug);
        const accepter = mineIsB ? invite.b : invite.a;
        const other = mineIsB ? invite.a : invite.b;
        const record: Twinning = {
            id: invite.twinningId,
            self: accepter,
            other,
            status: "propuesto",
            spaceId: invite.space.id,
            proposedByMe: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        setAcceptingId(invite.twinningId);
        try {
            const res = await acceptTwinning(accepter, record);
            if (!res.ok) {
                toast.error(res.error || "No se pudo aceptar.");
                return;
            }
            toast.success("¡Hermanamiento aceptado!");
            void refresh();
        } finally {
            setAcceptingId(null);
        }
    };

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-1">
                <h3 className="flex items-center gap-2 text-lg font-black tracking-tight text-foreground/90">
                    <Handshake className="size-5 text-primary" /> Hermanamiento de Sanghas
                </h3>
                <p className="max-w-2xl text-sm text-muted-foreground">
                    Vincula tu comunidad, página o grupo con otra entidad de la red. Una invitación real teje el lazo entre
                    ambos sistemas culturales.
                </p>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Cargando tus entidades y hermanamientos…
                </div>
            ) : myEntities.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-muted-foreground">
                    No administras ninguna entidad todavía. Crea una página, comunidad o grupo para poder proponer
                    hermanamientos.
                </div>
            ) : (
                <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur">
                    <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-muted-foreground">
                        <Plus className="size-3.5 text-primary" /> Proponer hermanamiento
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <select
                            value={fromSlug}
                            onChange={(e) => setFromSlug(e.target.value)}
                            className="min-h-[42px] cursor-pointer rounded-xl border border-white/12 bg-background/50 px-3 py-2 text-sm font-semibold text-foreground/85 focus:outline-none focus:ring-1 focus:ring-primary/40"
                        >
                            {myEntities.map((e) => (
                                <option key={e.slug} value={e.slug}>
                                    {e.name} ({e.kind === "group" ? "grupo" : "página"})
                                </option>
                            ))}
                        </select>
                        <ArrowLeftRight className="mx-auto size-4 text-muted-foreground sm:mx-1" />
                        <div className="relative flex-1">
                            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                value={target ? target.name : query}
                                onChange={(e) => {
                                    setTarget(null);
                                    setQuery(e.target.value);
                                }}
                                placeholder="Buscar entidad a hermanar…"
                                className="min-h-[42px] w-full rounded-xl border border-white/12 bg-background/50 py-2 pl-9 pr-3 text-sm text-foreground/90 placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40"
                            />
                            {target && (
                                <button type="button" onClick={() => setTarget(null)} className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-full p-1 text-muted-foreground hover:text-white" aria-label="Quitar destino">
                                    <X className="size-3.5" />
                                </button>
                            )}
                            {!target && results.length > 0 && (
                                <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-white/12 bg-background/95 shadow-2xl backdrop-blur">
                                    {results.map((h) => {
                                        const sys = systemById(prefsFromTags(h.tags).region?.systemId);
                                        return (
                                            <button
                                                key={h.slug}
                                                type="button"
                                                onClick={() => {
                                                    setTarget(hitToTwin(h));
                                                    setResults([]);
                                                }}
                                                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/5"
                                            >
                                                <span className="size-2.5 rounded-full" style={{ background: sys.color }} />
                                                <span className="truncate font-semibold text-foreground/85">{h.name}</span>
                                                <span className="ml-auto text-[10px] uppercase text-muted-foreground">{h.kind}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={propose}
                            disabled={!fromEntity || !target || proposing}
                            className="inline-flex min-h-[42px] cursor-pointer items-center justify-center gap-1.5 rounded-full bg-primary/90 px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary disabled:opacity-50"
                        >
                            {proposing ? <Loader2 className="size-4 animate-spin" /> : <Handshake className="size-4" />} Proponer
                        </button>
                    </div>
                    {searching && <p className="text-[11px] text-muted-foreground">Buscando…</p>}
                </div>
            )}

            {/* Invitaciones entrantes */}
            {incoming.filter((i) => i.status === "propuesto").length > 0 && (
                <div className="space-y-3">
                    <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-muted-foreground">
                        <Inbox className="size-3.5 text-amber-400" /> Invitaciones de hermanamiento
                    </p>
                    {incoming
                        .filter((i) => i.status === "propuesto")
                        .map((i) => (
                            <div key={i.twinningId} className="space-y-3 rounded-2xl border border-amber-400/25 bg-amber-400/[0.05] p-4">
                                <TwinLazo a={i.a} b={i.b} status={i.status} />
                                <div className="flex justify-center">
                                    <button
                                        type="button"
                                        onClick={() => accept(i)}
                                        disabled={acceptingId === i.twinningId}
                                        className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-full bg-emerald-500/90 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-60"
                                    >
                                        {acceptingId === i.twinningId ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Aceptar hermanamiento
                                    </button>
                                </div>
                            </div>
                        ))}
                </div>
            )}

            {/* Hermanamientos existentes */}
            <div className="space-y-3">
                <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-muted-foreground">
                    <Link2 className="size-3.5 text-primary" /> Tus hermanamientos
                </p>
                {twinnings.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/12 p-6 text-center text-sm text-muted-foreground">
                        Aún no hay hermanamientos. Propón el primero para tejer la red de Sanghas.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {twinnings.map((t) => (
                            <div key={t.id} className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur">
                                <TwinLazo a={t.self} b={t.other} status={t.status} />
                                <div className="flex items-center justify-center">
                                    <span
                                        className={cn(
                                            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider",
                                            t.status === "aceptado" ? "bg-emerald-500/15 text-emerald-300" : "bg-white/10 text-muted-foreground",
                                        )}
                                    >
                                        {t.status === "aceptado" ? <Handshake className="size-2.5" /> : <Link2 className="size-2.5" />} {t.status}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default TwinningPanel;

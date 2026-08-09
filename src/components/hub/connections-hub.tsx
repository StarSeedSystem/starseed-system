"use client";

/**
 * ── ConnectionsHub — Explorador de CONEXIONES del Hub (Adenda 76 · G3) ────────
 *
 * Corazón social de la "sección principal de la Red". Reúne, sobre DATOS REALES
 * (con el fallback honesto de siempre — `useOsPages/Groups/Events` fusionan
 * Supabase + semillas), TODO tipo de conexiones de la cuenta y de los perfiles
 * en la red: páginas, grupos, eventos, Entidades Federativas y partidos.
 *
 * Qué aporta (todo aditivo, cero regresión sobre el resto del Hub):
 *   · Tarjetas de conexión ENRIQUECIDAS: tipo + sistema (político/educativo/
 *     cultural/social con su color), contadores reales, y acciones rápidas
 *     (Seguir/Unirse · Abrir · Compartir).
 *   · Filtros por SISTEMA y por TIPO + buscador en vivo.
 *   · "Mis conexiones" del perfil activo: Siguiendo · Miembro de · Administrando
 *     (os_follows / os_memberships / entidades propias). Estado vacío honesto +
 *     CTA de inicio de sesión cuando no hay cuenta.
 *   · Accesibilidad: objetivos táctiles ≥44px, roles y aria-labels, foco visible.
 *
 * Filosofía del repo: nunca lanza; degrada con honestidad; español; estética
 * "Crystal Liquid Glass". No usa datos inventados para "Mis conexiones" (solo
 * lo realmente seguido/unido/administrado por la sesión).
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
    Search, Users, Scale, School, Palette, Landmark, Flag, CalendarDays,
    Globe, Users2, Check, Plus, UserPlus, Share2, ArrowUpRight, Lock,
    Sparkles, Compass, LayoutGrid, Star, MapPin, X, MessageSquare, Loader2,
    ChevronDown, Globe2,
} from "lucide-react";
import { useOsPages, useOsGroups, useOsEvents } from "@/hooks/use-os-entities";
import { setFollow, setMembership, getCurrentUserId } from "@/lib/os-social";
import { createDm } from "@/lib/messages/dm";
import { createClient } from "@/utils/supabase/client";
import { listFederativeEntities, listPartidos } from "@/data/sample-governance";
import { entityKindMeta, type SystemKey } from "@/lib/entity-kinds";
import { pageHref, groupHref, eventHref, profileHref } from "@/lib/entity-links";
import {
    listNetworkProfiles, countNetworkProfiles, searchNetworkProfiles, suggestedProfiles,
    NETWORK_PAGE_SIZE,
    type NetworkProfile, type NetworkCursor, type SuggestedProfile,
} from "@/lib/social/network-directory";

const GOLD = "#E9C46A";

// ── Metadatos de los 4 sistemas cromáticos de StarSeed ──────────────────────
interface SystemMeta {
    label: string;
    color: string;
    icon: React.ReactNode;
}
const SYSTEM_META: Record<SystemKey, SystemMeta> = {
    politico: { label: "Político", color: "#3B9EFF", icon: <Scale className="h-3.5 w-3.5" /> },
    educativo: { label: "Educativo", color: "#22d3ee", icon: <School className="h-3.5 w-3.5" /> },
    cultural: { label: "Cultural", color: "#c084fc", icon: <Palette className="h-3.5 w-3.5" /> },
    social: { label: "Social", color: "#9b8cff", icon: <Users className="h-3.5 w-3.5" /> },
};

// ── Tipos de conexión ────────────────────────────────────────────────────────
type ConnType = "pagina" | "grupo" | "evento" | "entidad" | "partido";
interface TypeMeta {
    label: string;
    icon: React.ReactNode;
    /** Acción rápida por defecto de este tipo. */
    action: "follow" | "join" | "open";
}
const TYPE_META: Record<ConnType, TypeMeta> = {
    pagina: { label: "Páginas", icon: <Globe className="h-3.5 w-3.5" />, action: "follow" },
    grupo: { label: "Grupos", icon: <Users2 className="h-3.5 w-3.5" />, action: "join" },
    evento: { label: "Eventos", icon: <CalendarDays className="h-3.5 w-3.5" />, action: "open" },
    entidad: { label: "E. Federativas", icon: <Landmark className="h-3.5 w-3.5" />, action: "follow" },
    partido: { label: "Partidos", icon: <Flag className="h-3.5 w-3.5" />, action: "follow" },
};

// ── Modelo unificado de una conexión ─────────────────────────────────────────
interface ConnItem {
    key: string;
    type: ConnType;
    system: SystemKey;
    slug: string;
    name: string;
    href: string;
    accent: string;
    /** Contador principal (miembros/ciudadanos/asistentes). */
    count: number;
    countLabel: string;
    /** Etiqueta contextual secundaria (fecha del evento, lugar…). */
    meta?: string;
    /** Slug para seguir (páginas/EF/partido) — os_follows. */
    followSlug?: string;
    /** Slug para unirse (grupos) — os_memberships. */
    joinSlug?: string;
}

function num(v: unknown): number {
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

const dateFmt = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" });
function fmtEventDate(iso: string | null | undefined): string | undefined {
    if (!iso) return undefined;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return undefined;
    return dateFmt.format(d);
}

// ─────────────────────────────────────────────────────────────────────────────
// "Mis conexiones" reales del perfil activo (os_follows / os_memberships / owner)
// Self-contained (patrón countRows de red-section): nunca lanza; Sets vacíos si
// no hay sesión o Supabase falla.
// ─────────────────────────────────────────────────────────────────────────────
interface MyConnections {
    loading: boolean;
    needsAuth: boolean;
    followPageSlugs: Set<string>;
    memberGroupSlugs: Set<string>;
    adminSlugs: Set<string>;
    /** Recarga (tras seguir/unirse). */
    refresh: () => void;
}

function useMyConnections(): MyConnections {
    const [state, setState] = useState<Omit<MyConnections, "refresh">>({
        loading: true,
        needsAuth: false,
        followPageSlugs: new Set(),
        memberGroupSlugs: new Set(),
        adminSlugs: new Set(),
    });

    const load = useCallback(async () => {
        try {
            const uid = await getCurrentUserId();
            if (!uid) {
                setState({ loading: false, needsAuth: true, followPageSlugs: new Set(), memberGroupSlugs: new Set(), adminSlugs: new Set() });
                return;
            }
            const supabase = createClient();
            const [followRes, memberRes, ownedPagesRes, ownedGroupsRes] = await Promise.all([
                supabase.from("os_follows").select("page_slug").eq("follower_id", uid).limit(500),
                // Excluye solicitudes de ingreso sin resolver (role='pending' — adenda
                // "solicitud de ingreso + aprobación"): no son membresía todavía, así
                // que no deben marcar el badge/chip "Miembro" aquí (ver también
                // src/lib/governance/membership.ts, misma exclusión para el censo).
                supabase.from("os_memberships").select("group_slug, role").eq("user_id", uid).neq("role", "pending").limit(500),
                supabase.from("os_pages").select("slug").eq("owner_id", uid).limit(500),
                supabase.from("os_groups").select("slug").eq("owner_id", uid).limit(500),
            ]);
            const followPageSlugs = new Set<string>(
                ((followRes.data as { page_slug?: string }[] | null) ?? [])
                    .map((r) => r.page_slug).filter((s): s is string => !!s),
            );
            const memberGroupSlugs = new Set<string>();
            const adminSlugs = new Set<string>();
            for (const r of (memberRes.data as { group_slug?: string; role?: string }[] | null) ?? []) {
                if (!r.group_slug) continue;
                memberGroupSlugs.add(r.group_slug);
                if (r.role === "admin" || r.role === "owner") adminSlugs.add(r.group_slug);
            }
            for (const r of (ownedPagesRes.data as { slug?: string }[] | null) ?? []) if (r.slug) adminSlugs.add(r.slug);
            for (const r of (ownedGroupsRes.data as { slug?: string }[] | null) ?? []) if (r.slug) adminSlugs.add(r.slug);
            setState({ loading: false, needsAuth: false, followPageSlugs, memberGroupSlugs, adminSlugs });
        } catch {
            setState({ loading: false, needsAuth: false, followPageSlugs: new Set(), memberGroupSlugs: new Set(), adminSlugs: new Set() });
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    return useMemo(() => ({ ...state, refresh: load }), [state, load]);
}

// ── Chip de filtro reutilizable (táctil ≥44px en móvil) ─────────────────────
function FilterChip({
    active, onClick, children, color, ariaLabel,
}: {
    active: boolean; onClick: () => void; children: React.ReactNode; color?: string; ariaLabel?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            aria-label={ariaLabel}
            className={cn(
                "inline-flex min-h-[2.75rem] shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:min-h-[2.25rem]",
                active
                    ? "border-transparent text-[#0b0b12]"
                    : "border-white/12 bg-white/[0.04] text-muted-foreground hover:border-white/25 hover:text-foreground",
            )}
            style={active ? { background: color || "hsl(var(--primary))" } : undefined}
        >
            {children}
        </button>
    );
}

// ── Acción rápida Seguir/Unirse conectada a Supabase (optimista) ─────────────
// Recibe los datos primitivos (no un ConnItem) para que la MISMA acción sirva a
// las tarjetas de entidades y a las de PERSONAS de la red (seguir a alguien es
// `os_follows` con page_slug=username, la primitiva real del sistema).
function QuickJoinButton({
    slug, isJoin, accent, initialActive, onChanged,
}: {
    slug: string; isJoin: boolean; accent: string; initialActive: boolean; onChanged: () => void;
}) {
    const [active, setActive] = useState(initialActive);
    const [busy, setBusy] = useState(false);
    const [needsAuth, setNeedsAuth] = useState(false);
    useEffect(() => setActive(initialActive), [initialActive]);

    const label = active ? (isJoin ? "Miembro" : "Siguiendo") : isJoin ? "Unirse" : "Seguir";
    const Icon = active ? Check : isJoin ? Plus : UserPlus;

    const handle = async () => {
        setBusy(true);
        const next = !active;
        setActive(next); // optimista
        const res = isJoin ? await setMembership(slug, next) : await setFollow(slug, next);
        setBusy(false);
        if (res.needsAuth) {
            setActive(!next); // revertir
            setNeedsAuth(true);
            setTimeout(() => setNeedsAuth(false), 4000);
        } else if (res.ok) {
            onChanged();
        } else {
            setActive(!next); // revertir en error
        }
    };

    return (
        <div className="flex flex-col items-stretch gap-1">
            <button
                type="button"
                onClick={handle}
                disabled={busy}
                aria-pressed={active}
                aria-label={`${label} ${slug}`}
                className={cn(
                    "inline-flex min-h-[2.75rem] cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-60 sm:min-h-[2.5rem]",
                )}
                style={
                    active
                        ? { borderColor: `${accent}88`, color: accent, background: `${accent}14` }
                        : { borderColor: accent, background: accent, color: "#0b0b12" }
                }
            >
                <Icon className="h-3.5 w-3.5" /> {label}
            </button>
            {needsAuth && (
                <Link href="/login" className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground hover:underline" style={{ color: GOLD }}>
                    <Lock className="h-2.5 w-2.5" /> Inicia sesión
                </Link>
            )}
        </div>
    );
}

// ── Compartir (navigator.share / copiar enlace) ──────────────────────────────
function QuickShareButton({ item }: { item: ConnItem }) {
    const [copied, setCopied] = useState(false);
    const share = async () => {
        const url = typeof window !== "undefined" ? `${window.location.origin}${item.href}` : item.href;
        try {
            if (typeof navigator !== "undefined" && navigator.share) {
                await navigator.share({ title: item.name, url });
            } else if (typeof navigator !== "undefined" && navigator.clipboard) {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
            }
        } catch { /* cancelado */ }
    };
    return (
        <button
            type="button"
            onClick={share}
            aria-label={`Compartir ${item.name}`}
            className="inline-flex min-h-[2.75rem] min-w-[2.75rem] cursor-pointer items-center justify-center rounded-lg border border-white/12 bg-white/[0.04] text-muted-foreground transition-colors duration-200 hover:border-white/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:min-h-[2.25rem] sm:min-w-[2.25rem]"
        >
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Share2 className="h-4 w-4" />}
        </button>
    );
}

// ── Tarjeta de conexión enriquecida ──────────────────────────────────────────
function ConnCard({ item, myConn, onChanged }: { item: ConnItem; myConn: MyConnections; onChanged: () => void }) {
    const sys = SYSTEM_META[item.system];
    const typeMeta = TYPE_META[item.type];
    const isFollowing = item.followSlug ? myConn.followPageSlugs.has(item.followSlug) : false;
    const isMember = item.joinSlug ? myConn.memberGroupSlugs.has(item.joinSlug) : false;
    const canAct = item.type === "grupo" || typeMeta.action === "follow";

    return (
        <Card
            className="liquid-glass-panel group relative flex h-full flex-col overflow-hidden border transition-all duration-300 hover:-translate-y-0.5"
            style={{ borderColor: `${item.accent}2e` }}
        >
            {/* Franja de sistema */}
            <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: `linear-gradient(90deg, ${item.accent}, transparent)` }} aria-hidden />
            <CardContent className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border" style={{ background: `${item.accent}18`, borderColor: `${item.accent}33`, color: item.accent }}>
                            {typeMeta.icon}
                        </span>
                        <div className="min-w-0">
                            <Link href={item.href} className="block truncate text-sm font-bold leading-snug text-foreground hover:text-primary transition-colors focus-visible:outline-none focus-visible:underline">
                                {item.name}
                            </Link>
                            <div className="mt-0.5 flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold" style={{ color: sys.color }}>
                                    {sys.icon} {sys.label}
                                </span>
                                <span className="text-[10px] text-muted-foreground/70">·</span>
                                <span className="text-[10px] capitalize text-muted-foreground/80">{typeMeta.label.replace(/s$/, "")}</span>
                            </div>
                        </div>
                    </div>
                    {(isFollowing || isMember) && (
                        <Badge variant="outline" className="shrink-0 gap-1 border-emerald-500/30 bg-emerald-500/10 text-[9px] text-emerald-300">
                            <Check className="h-2.5 w-2.5" /> {isMember ? "Miembro" : "Sigues"}
                        </Badge>
                    )}
                </div>

                {/* Métricas reales */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" /> {item.count.toLocaleString("es-ES")} {item.countLabel}
                    </span>
                    {item.meta && (
                        <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {item.meta}
                        </span>
                    )}
                </div>

                {/* Acciones rápidas */}
                <div className="mt-auto flex items-center gap-2 pt-1">
                    {canAct && (
                        <QuickJoinButton
                            slug={item.type === "grupo" ? (item.joinSlug ?? item.slug) : (item.followSlug ?? item.slug)}
                            isJoin={item.type === "grupo"}
                            accent={item.accent}
                            initialActive={item.type === "grupo" ? isMember : isFollowing}
                            onChanged={onChanged}
                        />
                    )}
                    <Link
                        href={item.href}
                        aria-label={`Abrir ${item.name}`}
                        className="inline-flex min-h-[2.75rem] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.03] px-3 text-xs font-semibold text-foreground/90 transition-colors duration-200 hover:border-white/25 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:min-h-[2.25rem]"
                    >
                        Abrir <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                    <QuickShareButton item={item} />
                </div>
            </CardContent>
        </Card>
    );
}

// ── Tira compacta para "Mis conexiones" ──────────────────────────────────────
function MiniConnRow({ item }: { item: ConnItem }) {
    const sys = SYSTEM_META[item.system];
    return (
        <Link
            href={item.href}
            className="group flex min-h-[2.75rem] items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 transition-colors hover:border-white/25 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border" style={{ background: `${item.accent}18`, borderColor: `${item.accent}33`, color: item.accent }}>
                {TYPE_META[item.type].icon}
            </span>
            <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-foreground group-hover:text-primary transition-colors">{item.name}</p>
                <p className="truncate text-[10px]" style={{ color: sys.color }}>{sys.label} · {item.count.toLocaleString("es-ES")} {item.countLabel}</p>
            </div>
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-all group-hover:text-primary" />
        </Link>
    );
}

// ═════════════════════════════════════════════════════════════════════════════
// PERSONAS DE LA RED — «Sugeridos» + «Toda la red» + búsqueda transversal
// ---------------------------------------------------------------------------
// Faltaba lo esencial: en las recomendaciones solo cabían las conexiones por
// afinidad; ahora se puede BUSCAR y VER a TODAS las personas de la red.
//   · Datos: `@/lib/social/network-directory` (keyset sobre `os_profiles`,
//     búsqueda unificada Typesense→Supabase, y `recommendations()` de siempre).
//   · Acciones: las MISMAS del Hub — Seguir (QuickJoinButton → `os_follows`
//     con page_slug=username), Mensaje (`createDm`, igual que el directorio del
//     Buscador) y Ver perfil (`profileHref` → /profile/<username>).
// ═════════════════════════════════════════════════════════════════════════════

const PEOPLE_ACCENT = SYSTEM_META.social.color;

/** Abre (o crea) el DM con esa persona — mismo flujo que el directorio del Hub. */
function ProfileMessageButton({ userId, name }: { userId: string; name: string }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const open = async () => {
        setBusy(true);
        try {
            const res = await createDm(userId);
            if (res.needsAuth) {
                toast.error("Inicia sesión para escribir a alguien.");
                return;
            }
            if (!res.ok || !res.thread) {
                toast.error(res.error || "No se pudo iniciar la conversación.");
                return;
            }
            router.push("/messages");
        } finally {
            setBusy(false);
        }
    };
    return (
        <button
            type="button"
            onClick={() => void open()}
            disabled={busy}
            aria-label={`Enviar mensaje a ${name}`}
            className="inline-flex min-h-[2.75rem] min-w-[2.75rem] cursor-pointer items-center justify-center rounded-lg border border-white/12 bg-white/[0.04] text-muted-foreground transition-colors duration-200 hover:border-white/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-60 sm:min-h-[2.5rem] sm:min-w-[2.5rem]"
        >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
        </button>
    );
}

/** Tarjeta de PERSONA — mismo lenguaje visual que <ConnCard>. */
function ProfileCard({
    profile, reason, myConn,
}: {
    profile: NetworkProfile; reason?: string; myConn: MyConnections;
}) {
    // Seguir a una persona usa `os_follows` con page_slug = username, así que el
    // set ya cargado en "Mis conexiones" nos da el estado inicial sin más consultas.
    const isFollowing = myConn.followPageSlugs.has(profile.username);
    const href = profileHref({ handle: profile.username });
    const initial = (profile.displayName || profile.username || "S").trim().charAt(0).toUpperCase() || "S";

    return (
        <Card
            className="liquid-glass-panel group relative flex h-full flex-col overflow-hidden border transition-all duration-300 hover:-translate-y-0.5"
            style={{ borderColor: `${PEOPLE_ACCENT}2e` }}
        >
            <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: `linear-gradient(90deg, ${PEOPLE_ACCENT}, transparent)` }} aria-hidden />
            <CardContent className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                        <Avatar className="h-9 w-9 shrink-0 ring-2 ring-white/10">
                            <AvatarImage src={profile.avatarUrl} alt="" />
                            <AvatarFallback className="text-xs font-bold" style={{ background: `${PEOPLE_ACCENT}22`, color: PEOPLE_ACCENT }}>
                                {initial}
                            </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                            <Link href={href} className="block truncate text-sm font-bold leading-snug text-foreground transition-colors hover:text-primary focus-visible:underline focus-visible:outline-none">
                                {profile.displayName}
                            </Link>
                            <p className="mt-0.5 truncate text-[10px] text-muted-foreground/80">@{profile.username}</p>
                        </div>
                    </div>
                    {isFollowing && (
                        <Badge variant="outline" className="shrink-0 gap-1 border-emerald-500/30 bg-emerald-500/10 text-[9px] text-emerald-300">
                            <Check className="h-2.5 w-2.5" /> Sigues
                        </Badge>
                    )}
                </div>

                {profile.bio && (
                    <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{profile.bio}</p>
                )}

                {reason && (
                    <p className="flex items-start gap-1 text-[10px] leading-snug text-primary/90">
                        <Sparkles className="mt-0.5 h-3 w-3 shrink-0" /> {reason}
                    </p>
                )}

                {profile.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                        {profile.tags.slice(0, 3).map((t) => (
                            <span key={t} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] text-muted-foreground">
                                {t}
                            </span>
                        ))}
                    </div>
                )}

                <div className="mt-auto flex items-center gap-2 pt-1">
                    <QuickJoinButton
                        slug={profile.username}
                        isJoin={false}
                        accent={PEOPLE_ACCENT}
                        initialActive={isFollowing}
                        onChanged={myConn.refresh}
                    />
                    <Link
                        href={href}
                        aria-label={`Ver el perfil de ${profile.displayName}`}
                        className="inline-flex min-h-[2.75rem] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.03] px-3 text-xs font-semibold text-foreground/90 transition-colors duration-200 hover:border-white/25 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:min-h-[2.5rem]"
                    >
                        Ver perfil <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                    <ProfileMessageButton userId={profile.userId} name={profile.displayName} />
                </div>
            </CardContent>
        </Card>
    );
}

/** Skeleton simple mientras carga el directorio. */
function PeopleSkeleton({ count = 6 }: { count?: number }) {
    return (
        <div role="status" aria-live="polite">
            <span className="sr-only">Cargando personas…</span>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
                {Array.from({ length: count }, (_, i) => (
                    <div key={i} className="h-[9.5rem] animate-pulse rounded-2xl border border-white/10 bg-white/[0.02]" />
                ))}
            </div>
        </div>
    );
}

/** Estado vacío honesto reutilizable dentro de la sección de personas. */
function PeopleEmpty({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <Card className="liquid-glass-panel border-white/10">
            <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
                <div className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-muted-foreground">
                    {icon}
                </div>
                <div className="max-w-sm text-sm text-muted-foreground">{children}</div>
            </CardContent>
        </Card>
    );
}

type PeopleTab = "sugeridos" | "red";

/** ¿Coincide el perfil con el término? (nombre · handle · bio) */
function matchesPerson(p: NetworkProfile, term: string): boolean {
    if (!term) return true;
    return `${p.displayName} ${p.username} ${p.bio}`.toLowerCase().includes(term.toLowerCase());
}

function NetworkPeople({ myConn }: { myConn: MyConnections }) {
    const [tab, setTab] = useState<PeopleTab>("sugeridos");
    /** ¿Ha elegido el usuario el segmento a mano? (bloquea el auto-salto de abajo) */
    const [tabPicked, setTabPicked] = useState(false);
    const [query, setQuery] = useState("");
    const [term, setTerm] = useState("");

    const [suggested, setSuggested] = useState<SuggestedProfile[]>([]);
    const [suggestedLoading, setSuggestedLoading] = useState(true);

    const [network, setNetwork] = useState<NetworkProfile[]>([]);
    const [cursor, setCursor] = useState<NetworkCursor | null>(null);
    const [networkLoading, setNetworkLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [unavailable, setUnavailable] = useState(false);
    const [total, setTotal] = useState<number | null>(null);

    const [hits, setHits] = useState<NetworkProfile[]>([]);
    const [hitsLoading, setHitsLoading] = useState(false);

    // Debounce ~300 ms del buscador (evita una consulta por pulsación).
    useEffect(() => {
        const t = setTimeout(() => setTerm(query.trim()), 300);
        return () => clearTimeout(t);
    }, [query]);

    // Sugerencias por afinidad (las de siempre) — sin sesión devuelven [].
    useEffect(() => {
        let alive = true;
        void suggestedProfiles(12).then((r) => {
            if (!alive) return;
            setSuggested(r);
            setSuggestedLoading(false);
        });
        return () => { alive = false; };
    }, []);

    // Primera página de TODA la red + total (si es barato saberlo).
    useEffect(() => {
        let alive = true;
        void (async () => {
            const page = await listNetworkProfiles({ limit: NETWORK_PAGE_SIZE });
            if (!alive) return;
            setNetwork(page.profiles);
            setCursor(page.cursor);
            setUnavailable(page.unavailable);
            setNetworkLoading(false);
        })();
        void countNetworkProfiles().then((c) => { if (alive) setTotal(c); });
        return () => { alive = false; };
    }, []);

    // Búsqueda REAL en toda la red a partir de 2 caracteres (con 1 se filtra en
    // local sobre lo ya cargado: ni una consulta de más).
    useEffect(() => {
        if (term.length < 2) {
            setHits([]);
            setHitsLoading(false);
            return;
        }
        let alive = true;
        setHitsLoading(true);
        void searchNetworkProfiles(term, 48).then((r) => {
            if (!alive) return;
            setHits(r);
            setHitsLoading(false);
        });
        return () => { alive = false; };
    }, [term]);

    // Sin sugerencias (sin sesión, sin etiquetas, sin grupos) el panel quedaría
    // vacío pese a HABER gente en la red: se abre entonces «Toda la red». Solo
    // mientras el usuario no haya elegido segmento a mano.
    useEffect(() => {
        if (tabPicked || suggestedLoading || networkLoading) return;
        if (suggested.length === 0 && network.length > 0) setTab("red");
    }, [tabPicked, suggestedLoading, networkLoading, suggested.length, network.length]);

    const pickTab = useCallback((next: PeopleTab) => {
        setTabPicked(true);
        setTab(next);
    }, []);

    const loadMore = useCallback(async () => {
        if (!cursor || loadingMore) return;
        setLoadingMore(true);
        const page = await listNetworkProfiles({ limit: NETWORK_PAGE_SIZE, cursor });
        setNetwork((prev) => {
            const seen = new Set(prev.map((p) => p.userId));
            return [...prev, ...page.profiles.filter((p) => !seen.has(p.userId))];
        });
        setCursor(page.cursor);
        setLoadingMore(false);
    }, [cursor, loadingMore]);

    // La búsqueda es TRANSVERSAL: filtra los dos segmentos a la vez.
    const suggestedVisible = useMemo(
        () => suggested.filter((p) => matchesPerson(p, term)),
        [suggested, term],
    );
    const networkVisible = useMemo(() => {
        if (term.length >= 2) return hits;
        if (term.length === 1) return network.filter((p) => matchesPerson(p, term));
        return network;
    }, [network, hits, term]);

    const searching = term.length > 0;
    const listLoading = tab === "sugeridos"
        ? suggestedLoading
        : networkLoading || (term.length >= 2 && hitsLoading);
    const visible: (NetworkProfile | SuggestedProfile)[] = tab === "sugeridos" ? suggestedVisible : networkVisible;
    const canLoadMore = tab === "red" && !searching && !!cursor;

    return (
        <section aria-label="Personas de la red" className="space-y-3">
            <div className="section-label px-1 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-violet-300" /> Personas de la red
                {total !== null && (
                    <Badge variant="outline" className="ml-1 border-violet-500/30 bg-violet-500/5 text-[9px] uppercase tracking-widest text-violet-300">
                        {total.toLocaleString("es-ES")} {total === 1 ? "perfil" : "perfiles"}
                    </Badge>
                )}
            </div>

            {/* Buscador transversal (nombre · @handle · bio) */}
            <div className="relative">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar personas por nombre, @handle o biografía…"
                    aria-label="Buscar personas en toda la red"
                    className="h-11 rounded-xl border-white/12 bg-background/40 pl-10 backdrop-blur"
                />
                {query && (
                    <button
                        type="button"
                        onClick={() => setQuery("")}
                        aria-label="Limpiar búsqueda de personas"
                        className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>

            {/* Segmentos (con el recuento de CADA uno bajo la búsqueda activa) */}
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Segmento de personas">
                <FilterChip active={tab === "sugeridos"} onClick={() => pickTab("sugeridos")} color={PEOPLE_ACCENT} ariaLabel="Personas sugeridas">
                    <Sparkles className="h-3.5 w-3.5" /> Sugeridos
                    {suggestedVisible.length > 0 && <span className="opacity-70">· {suggestedVisible.length}</span>}
                </FilterChip>
                <FilterChip active={tab === "red"} onClick={() => pickTab("red")} color={PEOPLE_ACCENT} ariaLabel="Todos los perfiles de la red">
                    <Globe2 className="h-3.5 w-3.5" /> Toda la red
                    {searching
                        ? networkVisible.length > 0 && <span className="opacity-70">· {networkVisible.length}</span>
                        : total !== null && <span className="opacity-70">· {total.toLocaleString("es-ES")}</span>}
                </FilterChip>
            </div>

            {/* Resultados */}
            {listLoading ? (
                <PeopleSkeleton count={tab === "sugeridos" ? 3 : 6} />
            ) : visible.length === 0 ? (
                <PeopleEmpty icon={searching ? <Search className="h-5 w-5" /> : <Users className="h-5 w-5" />}>
                    {searching ? (
                        <>
                            Ninguna persona coincide con «{term}»
                            {tab === "sugeridos" ? " entre tus sugerencias" : " en la red"}.
                            {tab === "sugeridos" && hits.length > 0 && (
                                <>
                                    {" "}Hay {hits.length.toLocaleString("es-ES")} en toda la red —{" "}
                                    <button type="button" onClick={() => pickTab("red")} className="cursor-pointer font-semibold text-primary hover:underline">
                                        verlas
                                    </button>.
                                </>
                            )}
                        </>
                    ) : tab === "sugeridos" ? (
                        myConn.needsAuth
                            ? "Inicia sesión para recibir sugerencias por afinidad. Mientras tanto, explora «Toda la red»."
                            : "Aún no hay sugerencias para ti: añade etiquetas a tu perfil o únete a un grupo y aparecerán aquí. Puedes explorar «Toda la red» mientras tanto."
                    ) : unavailable ? (
                        "El directorio de perfiles no está disponible ahora mismo. Vuelve a intentarlo en un momento."
                    ) : (
                        "Aún no hay más perfiles en la red. Cuando alguien más cree su perfil, aparecerá aquí."
                    )}
                </PeopleEmpty>
            ) : (
                <>
                    {/* Cuentas HONESTAS y separadas: lo que se está viendo y, aparte, el
                        total real de la red (que incluye tu propio perfil, no listado aquí). */}
                    <p className="px-1 text-[11px] text-muted-foreground">
                        {visible.length.toLocaleString("es-ES")} {visible.length === 1 ? "persona" : "personas"}
                        {searching ? " coinciden con la búsqueda" : ""}
                        {!searching && tab === "red" && total !== null ? ` · ${total.toLocaleString("es-ES")} en la red` : ""}
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {visible.map((p) => (
                            <ProfileCard
                                key={p.userId}
                                profile={p}
                                reason={(p as SuggestedProfile).reason}
                                myConn={myConn}
                            />
                        ))}
                    </div>
                    {canLoadMore && (
                        <div className="flex justify-center pt-1">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void loadMore()}
                                disabled={loadingMore}
                                className="btn-pill min-h-[2.75rem] cursor-pointer gap-1.5"
                            >
                                {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                {loadingMore ? "Cargando…" : "Cargar más perfiles"}
                            </Button>
                        </div>
                    )}
                </>
            )}
        </section>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────
export function ConnectionsHub() {
    const { data: pages } = useOsPages();
    const { data: groups } = useOsGroups();
    const { data: events } = useOsEvents();
    const myConn = useMyConnections();

    const [query, setQuery] = useState("");
    const [systemFilter, setSystemFilter] = useState<SystemKey | "all">("all");
    const [typeFilter, setTypeFilter] = useState<ConnType | "all">("all");

    // Construye la lista unificada de conexiones desde todas las fuentes reales.
    const allItems = useMemo<ConnItem[]>(() => {
        const items: ConnItem[] = [];
        for (const p of pages) {
            const sys = entityKindMeta(p.kind).system;
            items.push({
                key: `page:${p.slug}`, type: "pagina", system: sys, slug: p.slug, name: p.name || p.slug,
                href: pageHref({ id: p.slug, title: p.name || p.slug }), accent: p.accent || sys && SYSTEM_META[sys].color || GOLD,
                count: num(p.memberCount), countLabel: "seguidores", followSlug: p.slug,
            });
        }
        for (const g of groups) {
            const sys = entityKindMeta(g.kind).system;
            items.push({
                key: `group:${g.slug}`, type: "grupo", system: sys, slug: g.slug, name: g.name || g.slug,
                href: groupHref({ id: g.slug, name: g.name || g.slug }), accent: g.accent || SYSTEM_META[sys].color,
                count: num(g.memberCount), countLabel: "miembros", joinSlug: g.slug,
            });
        }
        for (const e of events) {
            items.push({
                key: `event:${e.slug}`, type: "evento", system: "cultural", slug: e.slug, name: e.title || e.slug,
                href: eventHref(e.slug), accent: SYSTEM_META.cultural.color,
                count: num(e.attendeeCount), countLabel: "asistentes", meta: fmtEventDate(e.startsAt) || e.location || undefined,
            });
        }
        try {
            for (const ef of listFederativeEntities()) {
                items.push({
                    key: `ef:${ef.slug}`, type: "entidad", system: "politico", slug: ef.slug, name: ef.name,
                    href: `/entidad/${ef.slug}`, accent: ef.accent || SYSTEM_META.politico.color,
                    count: num(ef.citizens), countLabel: "ciudadanos", followSlug: ef.slug,
                });
            }
        } catch { /* gobernanza no disponible */ }
        try {
            for (const pa of listPartidos()) {
                items.push({
                    key: `party:${pa.slug}`, type: "partido", system: "politico", slug: pa.slug, name: pa.name,
                    href: `/partido/${pa.slug}`, accent: pa.accent || SYSTEM_META.politico.color,
                    count: num(pa.members), countLabel: "militantes", followSlug: pa.slug,
                });
            }
        } catch { /* gobernanza no disponible */ }
        return items;
    }, [pages, groups, events]);

    // Filtro por sistema/tipo/búsqueda.
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return allItems.filter((it) => {
            if (systemFilter !== "all" && it.system !== systemFilter) return false;
            if (typeFilter !== "all" && it.type !== typeFilter) return false;
            if (q && !(`${it.name} ${it.slug}`.toLowerCase().includes(q))) return false;
            return true;
        });
    }, [allItems, systemFilter, typeFilter, query]);

    // "Mis conexiones": cruza los sets reales con la lista unificada.
    const mine = useMemo(() => {
        const bySlug = new Map(allItems.map((it) => [it.slug, it]));
        const following: ConnItem[] = [];
        const memberOf: ConnItem[] = [];
        const administering: ConnItem[] = [];
        for (const slug of myConn.followPageSlugs) { const it = bySlug.get(slug); if (it) following.push(it); }
        for (const slug of myConn.memberGroupSlugs) { const it = bySlug.get(slug); if (it) memberOf.push(it); }
        for (const slug of myConn.adminSlugs) { const it = bySlug.get(slug); if (it) administering.push(it); }
        return { following, memberOf, administering };
    }, [allItems, myConn.followPageSlugs, myConn.memberGroupSlugs, myConn.adminSlugs]);

    const hasAnyMine = mine.following.length + mine.memberOf.length + mine.administering.length > 0;
    const activeFilters = systemFilter !== "all" || typeFilter !== "all" || query.trim().length > 0;

    const resetFilters = () => { setSystemFilter("all"); setTypeFilter("all"); setQuery(""); };

    return (
        <div className="space-y-6">
            {/* ── Encabezado ── */}
            <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                    <Compass className="h-4 w-4 text-cyan-300" />
                    <h3 className="font-headline text-lg font-black tracking-tight text-foreground/95">Conexiones de la Red</h3>
                    <Badge variant="outline" className="text-[9px] uppercase tracking-widest border-cyan-500/30 text-cyan-300 bg-cyan-500/5">
                        {allItems.length.toLocaleString("es-ES")} nodos
                    </Badge>
                </div>
                <p className="max-w-2xl text-sm text-muted-foreground text-balance leading-relaxed">
                    Todo tipo de vínculos de tu cuenta y de los perfiles en la red: personas, páginas, grupos,
                    eventos, Entidades Federativas y partidos. Busca en toda la red, sigue, únete, abre o
                    comparte — filtra por sistema y tipo.
                </p>
            </div>

            {/* ── Mis conexiones (perfil activo) ── */}
            <section aria-label="Mis conexiones">
                <div className="section-label mb-2.5 px-1 flex items-center gap-1.5">
                    <Star className="h-3.5 w-3.5 text-amber-300" /> Mis conexiones
                </div>
                {myConn.needsAuth ? (
                    <Card className="liquid-glass-panel border-white/10">
                        <CardContent className="flex flex-col items-center gap-3 py-7 text-center">
                            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-muted-foreground">
                                <Users className="h-5 w-5" />
                            </div>
                            <p className="max-w-sm text-sm text-muted-foreground">
                                Inicia sesión para ver y gestionar todo lo que sigues, los grupos donde participas
                                y las entidades que administras — reunido y en contexto.
                            </p>
                            <Button asChild size="sm" className="btn-pill min-h-[2.75rem]">
                                <Link href="/login"><Lock className="mr-1.5 h-3.5 w-3.5" /> Iniciar sesión</Link>
                            </Button>
                        </CardContent>
                    </Card>
                ) : myConn.loading ? (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="h-24 rounded-2xl border border-white/10 bg-white/[0.02] animate-pulse" />
                        ))}
                    </div>
                ) : !hasAnyMine ? (
                    <Card className="liquid-glass-panel border-white/10">
                        <CardContent className="flex flex-col items-center gap-3 py-7 text-center">
                            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-cyan-300">
                                <Sparkles className="h-5 w-5" />
                            </div>
                            <p className="max-w-sm text-sm text-muted-foreground">
                                Aún no tienes conexiones. Explora los nodos de abajo y empieza a seguir páginas,
                                unirte a grupos o participar en Entidades Federativas.
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                        <MyConnColumn title="Siguiendo" icon={<UserPlus className="h-3.5 w-3.5" />} color="#22d3ee" items={mine.following} empty="No sigues nada todavía." />
                        <MyConnColumn title="Miembro de" icon={<Users2 className="h-3.5 w-3.5" />} color="#10B981" items={mine.memberOf} empty="No participas en grupos aún." />
                        <MyConnColumn title="Administrando" icon={<LayoutGrid className="h-3.5 w-3.5" />} color="#FFBF00" items={mine.administering} empty="No administras entidades." />
                    </div>
                )}
            </section>

            {/* ── Personas: Sugeridos · Toda la red + buscador transversal ── */}
            <NetworkPeople myConn={myConn} />

            {/* ── Descubrir: filtros + tarjetas ── */}
            <section aria-label="Descubrir conexiones" className="space-y-3">
                <div className="section-label px-1 flex items-center gap-1.5">
                    <Compass className="h-3.5 w-3.5 text-cyan-300" /> Descubrir
                </div>

                {/* Buscador */}
                <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Buscar páginas, grupos, eventos, entidades…"
                        aria-label="Buscar conexiones"
                        className="h-11 rounded-xl border-white/12 bg-background/40 pl-10 backdrop-blur"
                    />
                    {query && (
                        <button type="button" onClick={() => setQuery("")} aria-label="Limpiar búsqueda" className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground">
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>

                {/* Filtro por sistema */}
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar por sistema">
                    <FilterChip active={systemFilter === "all"} onClick={() => setSystemFilter("all")} color="hsl(var(--primary))">
                        Todos los sistemas
                    </FilterChip>
                    {(Object.keys(SYSTEM_META) as SystemKey[]).map((s) => (
                        <FilterChip key={s} active={systemFilter === s} onClick={() => setSystemFilter(s)} color={SYSTEM_META[s].color} ariaLabel={`Sistema ${SYSTEM_META[s].label}`}>
                            {SYSTEM_META[s].icon} {SYSTEM_META[s].label}
                        </FilterChip>
                    ))}
                </div>

                {/* Filtro por tipo */}
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar por tipo">
                    <FilterChip active={typeFilter === "all"} onClick={() => setTypeFilter("all")} color="hsl(var(--primary))">
                        Todos los tipos
                    </FilterChip>
                    {(Object.keys(TYPE_META) as ConnType[]).map((t) => (
                        <FilterChip key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)} ariaLabel={`Tipo ${TYPE_META[t].label}`}>
                            {TYPE_META[t].icon} {TYPE_META[t].label}
                        </FilterChip>
                    ))}
                </div>

                {/* Resultados */}
                {filtered.length === 0 ? (
                    <Card className="liquid-glass-panel border-white/10">
                        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-muted-foreground">
                                <Search className="h-5 w-5" />
                            </div>
                            <p className="max-w-sm text-sm text-muted-foreground">
                                {activeFilters
                                    ? "Ningún nodo coincide con estos filtros. Prueba a ampliar la búsqueda."
                                    : "Aún no hay conexiones en la red. Crea la primera página o grupo y aparecerá aquí."}
                            </p>
                            {activeFilters ? (
                                <Button size="sm" variant="outline" className="btn-pill min-h-[2.75rem]" onClick={resetFilters}>
                                    Quitar filtros
                                </Button>
                            ) : (
                                <Button asChild size="sm" className="btn-pill min-h-[2.75rem]">
                                    <Link href="/crear"><Plus className="mr-1.5 h-3.5 w-3.5" /> Crear una entidad</Link>
                                </Button>
                            )}
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        <p className="px-1 text-[11px] text-muted-foreground">
                            {filtered.length.toLocaleString("es-ES")} {filtered.length === 1 ? "conexión" : "conexiones"}
                            {activeFilters ? " (filtradas)" : ""}
                        </p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {filtered.slice(0, 60).map((it) => (
                                <ConnCard key={it.key} item={it} myConn={myConn} onChanged={myConn.refresh} />
                            ))}
                        </div>
                    </>
                )}
            </section>
        </div>
    );
}

// ── Columna de "Mis conexiones" ──────────────────────────────────────────────
function MyConnColumn({
    title, icon, color, items, empty,
}: {
    title: string; icon: React.ReactNode; color: string; items: ConnItem[]; empty: string;
}) {
    return (
        <Card className="liquid-glass-panel border-white/10">
            <CardContent className="space-y-2.5 p-4">
                <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider" style={{ color }}>
                        {icon} {title}
                    </span>
                    <Badge variant="outline" className="text-[10px] border-white/15 bg-white/[0.04] text-foreground/80">
                        {items.length}
                    </Badge>
                </div>
                {items.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-[11px] text-muted-foreground">{empty}</p>
                ) : (
                    <div className="space-y-2">
                        {items.slice(0, 6).map((it) => <MiniConnRow key={it.key} item={it} />)}
                        {items.length > 6 && (
                            <p className="px-1 pt-0.5 text-[10px] text-muted-foreground">+{items.length - 6} más</p>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export default ConnectionsHub;

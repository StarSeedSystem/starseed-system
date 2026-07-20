"use client";

/**
 * ── hub-social/graph — El GRAFO REAL de conexiones del perfil ────────────────
 *
 * Columna vertebral de todos los paneles sociales del Hub. Sobre DATOS REALES
 * (Supabase) construye el grafo de vínculos de la cuenta activa y lo cruza con
 * el catálogo de entidades de la red (páginas/grupos/eventos + E.F./partidos de
 * la gobernanza de muestra) para enriquecer cada nodo con su sistema, tipo,
 * etiquetas, contadores y acento.
 *
 * HONESTIDAD DE ALCANCE (sin DDL):
 *   · `os_follows` y `os_memberships` están indexadas por CUENTA (follower_id /
 *     user_id = auth.uid()), no por perfil. StarSeed no tiene una tabla de
 *     follows por-perfil, así que el grafo es el de la CUENTA, presentado en el
 *     contexto del perfil activo (cuyo avatar/nombre se usan en presencia y en
 *     el manifiesto de exportación). Se es explícito con ello en la UI.
 *   · Nunca lanza: sin sesión → grafo vacío + needsAuth; si Supabase falla →
 *     degrada a lo que haya (catálogo público sigue disponible).
 *
 * Consumido por: badges, diversity, stories, synapses, export, presence.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { getCurrentUserId } from "@/lib/os-social";
import { useOsPages, useOsGroups, useOsEvents } from "@/hooks/use-os-entities";
import { listFederativeEntities, listPartidos } from "@/data/sample-governance";
import { entityKindMeta } from "@/lib/entity-kinds";
import { pageHref, groupHref, eventHref } from "@/lib/entity-links";
import { useActiveProfile } from "@/lib/profiles/profiles";
import {
    SYSTEM_KEYS, SYSTEM_META, GOLD,
    type SystemKey, type ConnType, type GraphBond,
} from "@/lib/hub-social/meta";

// ── Modelo de nodo del grafo ────────────────────────────────────────────────

export interface GraphNode {
    slug: string;
    name: string;
    type: ConnType;
    system: SystemKey;
    accent: string;
    tags: string[];
    count: number;
    countLabel: string;
    href: string;
    /** Vínculos que la cuenta tiene con esta entidad (vacío = solo catálogo). */
    bonds: GraphBond[];
    /** ISO más antiguo entre los vínculos (inicio del vínculo), si se conoce. */
    since?: string;
}

export interface GraphMetrics {
    /** Nº de conexiones (nodos con al menos un vínculo). */
    total: number;
    followCount: number;
    memberCount: number;
    adminCount: number;
    /** Nodos con ≥2 vínculos (recíprocos/sinápticos: p.ej. sigues Y participas). */
    reciprocalCount: number;
    perSystem: Record<SystemKey, number>;
    perType: Record<ConnType, number>;
    /** Sistemas con al menos una conexión. */
    systemsPresent: SystemKey[];
    /** Tipos con al menos una conexión. */
    typesPresent: ConnType[];
    /** Índice de equilibrio 0-100 (entropía normalizada sobre los 4 sistemas). */
    balanceIndex: number;
    /** Reciprocidad 0-100 (recíprocos / total). */
    reciprocityPct: number;
}

export interface ActiveProfileLite {
    id: string;
    name: string;
    avatarUrl: string | null;
}

export interface HubGraph {
    loading: boolean;
    needsAuth: boolean;
    /** Todas las entidades de la red (con `bonds` calculado para las mías). */
    catalog: GraphNode[];
    /** Solo mis conexiones (bonds.length > 0), ordenadas por nº de vínculos. */
    mine: GraphNode[];
    metrics: GraphMetrics;
    profile: ActiveProfileLite | null;
    /** Slugs de grupos donde soy miembro (para presencia por co-membresía). */
    myGroupSlugs: string[];
    refresh: () => void;
}

function num(v: unknown): number {
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function emptyPerSystem(): Record<SystemKey, number> {
    return { politico: 0, educativo: 0, cultural: 0, social: 0 };
}
function emptyPerType(): Record<ConnType, number> {
    return { pagina: 0, grupo: 0, evento: 0, entidad: 0, partido: 0 };
}

export function emptyMetrics(): GraphMetrics {
    return {
        total: 0, followCount: 0, memberCount: 0, adminCount: 0, reciprocalCount: 0,
        perSystem: emptyPerSystem(), perType: emptyPerType(),
        systemsPresent: [], typesPresent: [], balanceIndex: 0, reciprocityPct: 0,
    };
}

/**
 * Entropía de Shannon normalizada (0-100) sobre la distribución por sistemas.
 * 0 = todo en un solo sistema; 100 = repartido por igual entre los 4.
 */
export function balanceFromDistribution(perSystem: Record<SystemKey, number>): number {
    const counts = SYSTEM_KEYS.map((k) => perSystem[k]).filter((n) => n > 0);
    const total = counts.reduce((a, b) => a + b, 0);
    if (total <= 0 || counts.length <= 1) return counts.length <= 1 ? 0 : 0;
    let h = 0;
    for (const c of counts) {
        const p = c / total;
        h -= p * Math.log(p);
    }
    const hMax = Math.log(SYSTEM_KEYS.length); // log(4)
    return Math.round((h / hMax) * 100);
}

// ── Vínculos REALES de la cuenta (nunca lanza) ──────────────────────────────

interface RawBonds {
    follows: Map<string, string | undefined>;   // slug → created_at
    members: Map<string, string | undefined>;   // slug → created_at
    admins: Set<string>;                          // slug (admin/owner)
}

async function loadRawBonds(): Promise<RawBonds | null> {
    const uid = await getCurrentUserId();
    if (!uid) return null;
    const follows = new Map<string, string | undefined>();
    const members = new Map<string, string | undefined>();
    const admins = new Set<string>();
    try {
        const supabase = createClient();
        const [followRes, memberRes, ownedPagesRes, ownedGroupsRes] = await Promise.all([
            supabase.from("os_follows").select("*").eq("follower_id", uid).limit(1000),
            supabase.from("os_memberships").select("*").eq("user_id", uid).limit(1000),
            supabase.from("os_pages").select("slug").eq("owner_id", uid).limit(1000),
            supabase.from("os_groups").select("slug").eq("owner_id", uid).limit(1000),
        ]);
        for (const r of (followRes.data as Array<Record<string, unknown>> | null) ?? []) {
            const slug = typeof r.page_slug === "string" ? r.page_slug : null;
            if (slug) follows.set(slug, typeof r.created_at === "string" ? r.created_at : undefined);
        }
        for (const r of (memberRes.data as Array<Record<string, unknown>> | null) ?? []) {
            const slug = typeof r.group_slug === "string" ? r.group_slug : null;
            if (!slug) continue;
            members.set(slug, typeof r.created_at === "string" ? r.created_at : undefined);
            if (r.role === "admin" || r.role === "owner") admins.add(slug);
        }
        for (const r of (ownedPagesRes.data as Array<{ slug?: string }> | null) ?? []) if (r.slug) admins.add(r.slug);
        for (const r of (ownedGroupsRes.data as Array<{ slug?: string }> | null) ?? []) if (r.slug) admins.add(r.slug);
    } catch {
        /* degrada: vínculos parciales o vacíos */
    }
    return { follows, members, admins };
}

// ── Catálogo unificado de entidades (mismas fuentes que ConnectionsHub) ──────

interface CatalogInput {
    pages: ReturnType<typeof useOsPages>["data"];
    groups: ReturnType<typeof useOsGroups>["data"];
    events: ReturnType<typeof useOsEvents>["data"];
}

const dateFmt = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" });
function fmtEventDate(iso: string | null | undefined): string | undefined {
    if (!iso) return undefined;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return undefined;
    return dateFmt.format(d);
}

function buildCatalog({ pages, groups, events }: CatalogInput): GraphNode[] {
    const items: GraphNode[] = [];
    for (const p of pages) {
        const sys = entityKindMeta(p.kind).system;
        items.push({
            slug: p.slug, name: p.name || p.slug, type: "pagina", system: sys,
            accent: p.accent || SYSTEM_META[sys].color, tags: Array.isArray(p.tags) ? p.tags : [],
            count: num(p.memberCount), countLabel: "seguidores",
            href: pageHref({ id: p.slug, title: p.name || p.slug }), bonds: [],
        });
    }
    for (const g of groups) {
        const sys = entityKindMeta(g.kind).system;
        items.push({
            slug: g.slug, name: g.name || g.slug, type: "grupo", system: sys,
            accent: g.accent || SYSTEM_META[sys].color, tags: Array.isArray(g.tags) ? g.tags : [],
            count: num(g.memberCount), countLabel: "miembros",
            href: groupHref({ id: g.slug, name: g.name || g.slug }), bonds: [],
        });
    }
    for (const e of events) {
        const dateTag = fmtEventDate(e.startsAt);
        items.push({
            slug: e.slug, name: e.title || e.slug, type: "evento", system: "cultural",
            accent: SYSTEM_META.cultural.color,
            tags: [...(Array.isArray(e.tags) ? e.tags : []), ...(dateTag ? [dateTag] : [])],
            count: num(e.attendeeCount), countLabel: "asistentes",
            href: eventHref(e.slug), bonds: [],
        });
    }
    try {
        for (const ef of listFederativeEntities()) {
            items.push({
                slug: ef.slug, name: ef.name, type: "entidad", system: "politico",
                accent: ef.accent || SYSTEM_META.politico.color, tags: [],
                count: num(ef.citizens), countLabel: "ciudadanos",
                href: `/entidad/${ef.slug}`, bonds: [],
            });
        }
    } catch { /* gobernanza no disponible */ }
    try {
        for (const pa of listPartidos()) {
            items.push({
                slug: pa.slug, name: pa.name, type: "partido", system: "politico",
                accent: pa.accent || SYSTEM_META.politico.color, tags: [],
                count: num(pa.members), countLabel: "militantes",
                href: `/partido/${pa.slug}`, bonds: [],
            });
        }
    } catch { /* gobernanza no disponible */ }
    return items;
}

function applyBonds(catalog: GraphNode[], raw: RawBonds | null): GraphNode[] {
    if (!raw) return catalog;
    return catalog.map((node) => {
        const bonds: GraphBond[] = [];
        const sinces: string[] = [];
        if (raw.follows.has(node.slug)) {
            bonds.push("follow");
            const s = raw.follows.get(node.slug);
            if (s) sinces.push(s);
        }
        if (raw.members.has(node.slug)) {
            bonds.push("member");
            const s = raw.members.get(node.slug);
            if (s) sinces.push(s);
        }
        if (raw.admins.has(node.slug)) bonds.push("admin");
        if (bonds.length === 0) return node;
        const since = sinces.length ? sinces.sort()[0] : undefined;
        return { ...node, bonds, since };
    });
}

export function computeMetrics(mine: GraphNode[]): GraphMetrics {
    const perSystem = emptyPerSystem();
    const perType = emptyPerType();
    let followCount = 0, memberCount = 0, adminCount = 0, reciprocalCount = 0;
    for (const n of mine) {
        perSystem[n.system] += 1;
        perType[n.type] += 1;
        if (n.bonds.includes("follow")) followCount += 1;
        if (n.bonds.includes("member")) memberCount += 1;
        if (n.bonds.includes("admin")) adminCount += 1;
        if (n.bonds.length >= 2) reciprocalCount += 1;
    }
    const systemsPresent = SYSTEM_KEYS.filter((k) => perSystem[k] > 0);
    const typesPresent = (Object.keys(perType) as ConnType[]).filter((k) => perType[k] > 0);
    const total = mine.length;
    return {
        total, followCount, memberCount, adminCount, reciprocalCount,
        perSystem, perType, systemsPresent, typesPresent,
        balanceIndex: balanceFromDistribution(perSystem),
        reciprocityPct: total > 0 ? Math.round((reciprocalCount / total) * 100) : 0,
    };
}

// ── Hook principal ──────────────────────────────────────────────────────────

export function useHubGraph(): HubGraph {
    const { data: pages } = useOsPages();
    const { data: groups } = useOsGroups();
    const { data: events } = useOsEvents();
    const { profile } = useActiveProfile();

    const [raw, setRaw] = useState<RawBonds | null>(null);
    const [loadingBonds, setLoadingBonds] = useState(true);
    const [needsAuth, setNeedsAuth] = useState(false);

    const load = useCallback(async () => {
        setLoadingBonds(true);
        const uid = await getCurrentUserId();
        if (!uid) {
            setNeedsAuth(true);
            setRaw(null);
            setLoadingBonds(false);
            return;
        }
        setNeedsAuth(false);
        const bonds = await loadRawBonds();
        setRaw(bonds);
        setLoadingBonds(false);
    }, []);

    useEffect(() => { void load(); }, [load]);

    const catalog = useMemo(() => applyBonds(buildCatalog({ pages, groups, events }), raw), [pages, groups, events, raw]);
    const mine = useMemo(
        () => catalog.filter((n) => n.bonds.length > 0).sort((a, b) => b.bonds.length - a.bonds.length),
        [catalog],
    );
    const metrics = useMemo(() => computeMetrics(mine), [mine]);
    const myGroupSlugs = useMemo(
        () => mine.filter((n) => n.bonds.includes("member") || n.bonds.includes("admin")).map((n) => n.slug),
        [mine],
    );

    const profileLite: ActiveProfileLite | null = profile
        ? { id: profile.id, name: profile.name, avatarUrl: profile.avatarUrl }
        : null;

    return {
        loading: loadingBonds,
        needsAuth,
        catalog,
        mine,
        metrics,
        profile: profileLite,
        myGroupSlugs,
        refresh: load,
    };
}

export { SYSTEM_KEYS, SYSTEM_META, GOLD };
export type { SystemKey, ConnType, GraphBond };

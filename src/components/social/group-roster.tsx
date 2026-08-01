// src/components/social/group-roster.tsx
"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · GroupRoster — Directorio REAL de miembros de un grupo
 * ---------------------------------------------------------------------------
 * Reemplaza el componente de demostración `MemberAvatars` (que pintaba perfiles
 * de muestra por "sistema") por el censo REAL de la entidad, leído de la fuente
 * de verdad de la membresía. ADITIVO y de PURA PRESENTACIÓN.
 *
 * PRINCIPIO "UNA PERSONA, UNA VOZ" (CLAUDE.md §3): la lista se construye desde
 * `os_memberships` por CUENTA (una fila por cuenta y grupo). Este componente
 * JAMÁS escribe, ni toca el censo ni la votación — solo muestra quién es miembro
 * y con qué CARA (faceta) ha elegido mostrarse en este grupo.
 *
 * DUALIDAD CUENTA/PERFIL (CLAUDE.md §6): cada ciudadano puede elegir una faceta
 * pública (personal/cívico/artístico/profesional) para representarse en un grupo
 * concreto. Si la ha elegido, se muestra esa cara + una insignia de su tipo; si
 * no, se cae al perfil de directorio (os_profiles) y, en último término, a un
 * identificador de cuenta acortado.
 *
 * FLUJO DE DATOS (al montar, protegido para SSR):
 *   1. membersFromMemberships(slug)  → user_ids REALES (paginado, deduplicado).
 *   2. Promise.all([
 *        getGroupFaces(slug, ids),   → uid → profile_id (solo quien eligió cara)
 *        fetchProfilesByIds(ids),    → uid → OsProfile  (identidad de directorio)
 *      ])
 *   3. Para los profile_id elegidos (deduplicados): Promise.all(getProfile(pid))
 *      → hidrata cada faceta (nombre/handle/avatar/tipo).
 *   4. Por miembro: faceta elegida ▸ directorio ▸ id de cuenta acortado.
 *
 * DEFENSIVO Y LOCAL-FIRST: SSR-safe (efecto guardado). Todas las lecturas ya
 * degradan a vacío sin lanzar; ante cualquier error se renderiza el estado
 * vacío y NUNCA se lanza una excepción.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";

import { profileHref } from "@/lib/entity-links";
import { membersFromMemberships } from "@/lib/governance/membership";
import { getGroupFaces } from "@/lib/profiles/group-faces";
import {
    getProfile,
    profileKindLabel,
    type AccountProfile,
    type ProfileKind,
} from "@/lib/profiles/profiles";
import { fetchProfilesByIds } from "@/lib/social/os-profiles";
import { GlassCard } from "@/components/ui/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

/** Tope de filas renderizadas; por encima se muestra un afijo "+N más". */
const RENDER_CAP = 60;
/** Color de acento por defecto (coincide con el fallback de la página de grupo). */
const DEFAULT_ACCENT = "#22d3ee";

/** Fila de miembro ya resuelta para presentación. */
interface RosterRow {
    /** user_id (cuenta) — clave estable y censo real. */
    uid: string;
    /** Nombre visible (faceta ▸ directorio ▸ id acortado). */
    name: string;
    /** Handle/username para el enlace al perfil y como subtítulo (sin "@"), o null. */
    handle: string | null;
    /** URL de avatar, o null (se cae a iniciales). */
    avatar: string | null;
    /** Tipo de faceta, SOLO cuando se muestra con una cara elegida (para la insignia). */
    kind: ProfileKind | null;
}

/** Oculta la imagen si falla la carga; deja ver las iniciales del fondo. */
function onImgError(e: React.SyntheticEvent<HTMLImageElement, Event>) {
    e.currentTarget.style.display = "none";
}

/** Iniciales a partir de un nombre (1–2 letras), defensivo ante vacío. */
function initialsOf(name: string): string {
    const parts = (name || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Identificador de cuenta acortado para miembros sin faceta ni perfil de directorio. */
function shortUid(uid: string): string {
    const s = (uid || "").replace(/-/g, "");
    return s ? `Miembro ${s.slice(0, 6)}` : "Miembro";
}

/** Quita un "@" inicial de un handle para mostrarlo/enlazarlo de forma uniforme. */
function stripAt(handle: string): string {
    return handle.replace(/^@+/, "");
}

/**
 * Directorio REAL de miembros de un grupo.
 *
 * @param slug   Slug de la entidad (clave de `os_memberships.group_slug`).
 * @param accent Color de acento del grupo (para el anillo del avatar y el título).
 * @param total  Censo conocido por el llamador (pista para el estado vacío cuando
 *               no se puede leer el directorio, p.ej. sin sesión). No es la fuente
 *               de verdad del recuento mostrado: ese es el nº de miembros cargados.
 */
export function GroupRoster({
    slug,
    accent,
    total,
}: {
    slug: string;
    accent?: string;
    total?: number;
}) {
    const [rows, setRows] = useState<RosterRow[]>([]);
    const [loading, setLoading] = useState(true);

    const ringAccent = accent || DEFAULT_ACCENT;

    useEffect(() => {
        // SSR-guard: sin window no hay cliente Supabase ni sesión que consultar.
        if (typeof window === "undefined") return;
        let alive = true;
        setLoading(true);
        setRows([]);

        void (async () => {
            try {
                // 1) Censo REAL: user_ids de las cuentas miembro (una persona, una voz).
                const ids = await membersFromMemberships(slug);
                if (!alive) return;
                if (!ids.length) {
                    setRows([]);
                    setLoading(false);
                    return;
                }

                // 2) En paralelo: caras elegidas por grupo + identidad de directorio.
                const [faces, dir] = await Promise.all([
                    getGroupFaces(slug, ids),
                    fetchProfilesByIds(ids),
                ]);
                if (!alive) return;

                // 3) Hidrata cada faceta elegida (deduplicando profile_id).
                const pids = Array.from(new Set(Object.values(faces).filter(Boolean)));
                const hydrated = await Promise.all(pids.map((pid) => getProfile(pid)));
                if (!alive) return;
                const profileById: Record<string, AccountProfile> = {};
                pids.forEach((pid, i) => {
                    const p = hydrated[i];
                    if (p) profileById[pid] = p;
                });

                // 4) Resuelve cada miembro: faceta ▸ directorio ▸ id acortado.
                const built: RosterRow[] = ids.map((uid) => {
                    const pid = faces[uid];
                    const facet = pid ? profileById[pid] : undefined;
                    if (facet) {
                        const handle = facet.handle || dir[uid]?.username || null;
                        return {
                            uid,
                            name: facet.name || shortUid(uid),
                            handle: handle ? stripAt(handle) : null,
                            avatar: facet.avatarUrl,
                            kind: facet.kind,
                        };
                    }
                    const d = dir[uid];
                    if (d) {
                        return {
                            uid,
                            name: d.displayName || d.username || shortUid(uid),
                            handle: d.username ? stripAt(d.username) : null,
                            avatar: d.avatarUrl ?? null,
                            kind: null,
                        };
                    }
                    return { uid, name: shortUid(uid), handle: null, avatar: null, kind: null };
                });

                if (!alive) return;
                setRows(built);
                setLoading(false);
            } catch {
                // Defensivo: ante cualquier fallo, estado vacío. NUNCA lanza.
                if (!alive) return;
                setRows([]);
                setLoading(false);
            }
        })();

        return () => {
            alive = false;
        };
    }, [slug]);

    // ── Estado: cargando → esqueleto cristal ──
    if (loading) {
        return (
            <GlassCard className="p-[clamp(1rem,3vw,1.75rem)]">
                <div className="mb-4 flex items-center gap-2" style={{ color: ringAccent }}>
                    <Users className="h-5 w-5" />
                    <h2 className="font-headline text-lg font-semibold">Miembros</h2>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div
                            key={i}
                            className="flex items-center gap-3 rounded-xl border border-white/10 bg-background/30 p-3"
                        >
                            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                            <div className="min-w-0 flex-1 space-y-2">
                                <Skeleton className="h-3.5 w-2/3" />
                                <Skeleton className="h-3 w-1/3" />
                            </div>
                        </div>
                    ))}
                </div>
            </GlassCard>
        );
    }

    // ── Estado: vacío (o no legible) → EmptyState ──
    if (rows.length === 0) {
        const hasKnownCensus = (total ?? 0) > 0;
        return (
            <EmptyState
                icon={Users}
                title={hasKnownCensus ? "Directorio no disponible" : "Aún no hay miembros"}
                description={
                    hasKnownCensus
                        ? `Este grupo tiene ${(total ?? 0).toLocaleString("es-ES")} miembros. Inicia sesión para ver el directorio.`
                        : "Sé la primera persona en unirte a este grupo."
                }
            />
        );
    }

    // ── Estado: con datos → directorio real ──
    const count = rows.length; // recuento REAL de miembros cargados
    const shown = rows.slice(0, RENDER_CAP);
    const overflow = Math.max(0, count - shown.length);

    return (
        <GlassCard className="p-[clamp(1rem,3vw,1.75rem)]">
            <div className="mb-4 flex items-center gap-2" style={{ color: ringAccent }}>
                <Users className="h-5 w-5" />
                <h2 className="font-headline text-lg font-semibold">
                    Miembros · {count.toLocaleString("es-ES")}
                </h2>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {shown.map((m) => {
                    const inner = (
                        <div className="flex min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-background/30 p-3 transition-colors hover:bg-white/5">
                            <span
                                className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2"
                                style={{ ["--tw-ring-color" as any]: `${ringAccent}55` }}
                            >
                                {/* Iniciales de fondo: visibles si no hay avatar o si la imagen falla. */}
                                <span className="absolute inset-0 flex items-center justify-center bg-white/5 text-xs font-semibold text-white/80">
                                    {initialsOf(m.name)}
                                </span>
                                {m.avatar ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={m.avatar}
                                        alt={m.name}
                                        loading="lazy"
                                        onError={onImgError}
                                        className="relative h-full w-full object-cover"
                                    />
                                ) : null}
                            </span>
                            <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <p className="truncate text-sm font-medium">{m.name}</p>
                                    {m.kind ? (
                                        <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-white/70">
                                            {profileKindLabel(m.kind)}
                                        </span>
                                    ) : null}
                                </div>
                                {m.handle ? (
                                    <p className="truncate text-xs text-muted-foreground">@{m.handle}</p>
                                ) : null}
                            </div>
                        </div>
                    );
                    // Enlaza por faceta (handle) o, en su defecto, por username de directorio.
                    return m.handle ? (
                        <Link
                            key={m.uid}
                            href={profileHref({ handle: m.handle })}
                            className="cursor-pointer"
                        >
                            {inner}
                        </Link>
                    ) : (
                        <div key={m.uid}>{inner}</div>
                    );
                })}

                {overflow > 0 && (
                    <div className="flex items-center justify-center rounded-xl border border-dashed border-white/10 p-3 text-sm text-muted-foreground">
                        +{overflow.toLocaleString("es-ES")} miembros más
                    </div>
                )}
            </div>
        </GlassCard>
    );
}

export default GroupRoster;

// src/components/social/group-join-requests.tsx
"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · GroupJoinRequests — panel de aprobación del propietario
 * ---------------------------------------------------------------------------
 * Cierra el hueco #3 del roadmap de grupos/comunidades ("Onboarding con
 * aprobación real: el 'Solicitar unirse' es hoy cosmético; setMembership
 * inserta al instante; falta estado pending/approved" —
 * claude/roadmap-mejoras-ui-diseno-ajustes-grupos-2026-08-01.md).
 *
 * MODELO: una solicitud de ingreso es una fila `os_memberships` normal con
 * `role = 'pending'`, auto-insertada por quien solicita (JoinButton, en
 * `grupo/[slug]/page.tsx`, para grupos "asamblea") vía el mismo
 * `setMembership` de siempre — self-insert de SU PROPIA fila, ya permitido
 * por la RLS actual. Este panel es el lado OPUESTO: la RESOLUCIÓN.
 *
 * SOLO EL PROPIETARIO REAL PUEDE RESOLVER. La RLS de `os_memberships` es de
 * FILA PROPIA para INSERT/UPDATE/DELETE (`user_id = auth.uid()`) — el
 * propietario del grupo NO puede, por RLS directa, hacer UPDATE/DELETE de la
 * fila de OTRA persona. Por eso "Aprobar"/"Rechazar" llaman a dos RPC
 * SECURITY DEFINER que comprueban `os_groups.owner_id = auth.uid()`
 * SERVER-SIDE antes de tocar nada:
 *   · approve_group_membership(p_group_slug, p_user_id) → role 'pending' → 'miembro'.
 *   · reject_group_membership(p_group_slug, p_user_id)  → borra la fila 'pending'.
 * (supabase/migrations/20260805220000_group_join_approval.sql — migración
 * escrita para revisión; no aplicada por el agente).
 *
 * ÉTICA RESTAURATIVA, NO PUNITIVA (CLAUDE.md §6): rechazar SOLO borra la fila
 * pendiente. No deja marca, ni bloqueo, ni "lista negra" — la persona puede
 * volver a solicitar el ingreso cuando quiera con un nuevo self-insert.
 *
 * VISIBILIDAD: `isOwner` lo resuelve el llamador (ya lo tiene vía
 * `useEntityOwner` en la página de grupo) y se pasa por prop para no duplicar
 * esa consulta. Este componente no renderiza NADA para quien no es dueño —
 * es una herramienta de gestión, no contenido para visitantes — ni tampoco
 * cuando no hay solicitudes pendientes (evita un panel vacío permanente en
 * la pestaña "Miembros" de cada grupo).
 *
 * DEFENSIVO: todas las llamadas a Supabase van en try/catch: nunca lanza,
 * degrada a "sin solicitudes" ante cualquier fallo de lectura, y comunica
 * los fallos de escritura con `toast` (sonner) — nunca alert()/confirm()
 * nativos (rechazar usa `useConfirm`, ver confirm-dialog.tsx).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useCallback, useEffect, useState } from "react";
import { Loader2, UserPlus, Check, X } from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/ui/confirm-dialog";

import {
    fetchPendingGroupRequests,
    approveGroupJoinRequest,
    rejectGroupJoinRequest,
} from "@/lib/os-social";
import { fetchProfilesByIds, type OsProfile } from "@/lib/social/os-profiles";

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

/** Identificador de cuenta acortado para solicitantes sin perfil de directorio. */
function shortUid(uid: string): string {
    const s = (uid || "").replace(/-/g, "");
    return s ? `Solicitante ${s.slice(0, 6)}` : "Solicitante";
}

interface RequestRow {
    /** user_id (cuenta) que solicitó el ingreso. */
    uid: string;
    name: string;
    handle: string | null;
    avatar: string | null;
}

export function GroupJoinRequests({
    groupSlug,
    accent,
    isOwner,
}: {
    groupSlug: string;
    accent?: string;
    isOwner: boolean;
}) {
    const confirm = useConfirm();
    const [rows, setRows] = useState<RequestRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);

    const ringAccent = accent || "#22d3ee";

    const load = useCallback(async () => {
        if (!isOwner || !groupSlug) {
            setRows([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const ids = await fetchPendingGroupRequests(groupSlug);
            if (!ids.length) {
                setRows([]);
                setLoading(false);
                return;
            }
            const dir = await fetchProfilesByIds(ids);
            const built: RequestRow[] = ids.map((uid) => {
                const p: OsProfile | undefined = dir[uid];
                if (p) {
                    return {
                        uid,
                        name: p.displayName || p.username || shortUid(uid),
                        handle: p.username ? p.username.replace(/^@+/, "") : null,
                        avatar: p.avatarUrl ?? null,
                    };
                }
                return { uid, name: shortUid(uid), handle: null, avatar: null };
            });
            setRows(built);
        } catch {
            // Defensivo: ante cualquier fallo, sin solicitudes visibles. Nunca lanza.
            setRows([]);
        }
        setLoading(false);
    }, [groupSlug, isOwner]);

    useEffect(() => {
        void load();
    }, [load]);

    async function handleApprove(row: RequestRow) {
        setBusy("a:" + row.uid);
        try {
            const res = await approveGroupJoinRequest(groupSlug, row.uid);
            if (res.ok) {
                toast.success(`${row.name} ahora es miembro del grupo.`);
                setRows((prev) => prev.filter((r) => r.uid !== row.uid));
            } else if (res.needsAuth) {
                toast.error("Inicia sesión de nuevo para aprobar solicitudes.");
            } else {
                toast.error(res.error ?? "No se pudo aprobar la solicitud.");
            }
        } catch {
            toast.error("No se pudo aprobar la solicitud.");
        }
        setBusy(null);
    }

    async function handleReject(row: RequestRow) {
        const ok = await confirm({
            title: "¿Rechazar esta solicitud?",
            description: `${row.name} no se añadirá al grupo ahora. Nada aquí es permanente: podrá volver a solicitar el ingreso cuando quiera.`,
            confirmText: "Rechazar",
            cancelText: "Cancelar",
            destructive: true,
        });
        if (!ok) return;

        setBusy("r:" + row.uid);
        try {
            const res = await rejectGroupJoinRequest(groupSlug, row.uid);
            if (res.ok) {
                toast.success("Solicitud rechazada.");
                setRows((prev) => prev.filter((r) => r.uid !== row.uid));
            } else if (res.needsAuth) {
                toast.error("Inicia sesión de nuevo para gestionar solicitudes.");
            } else {
                toast.error(res.error ?? "No se pudo rechazar la solicitud.");
            }
        } catch {
            toast.error("No se pudo rechazar la solicitud.");
        }
        setBusy(null);
    }

    // Herramienta de gestión del propietario: invisible para cualquier otra persona.
    if (!isOwner) return null;

    if (loading) {
        return (
            <GlassCard className="p-[clamp(1rem,3vw,1.75rem)]">
                <div className="mb-3 flex items-center gap-2" style={{ color: ringAccent }}>
                    <UserPlus className="h-5 w-5" />
                    <h2 className="font-headline text-lg font-semibold">Solicitudes de ingreso</h2>
                </div>
                <div className="space-y-2">
                    {[0, 1].map((i) => (
                        <div
                            key={i}
                            className="flex items-center gap-3 rounded-xl border border-white/10 bg-background/30 p-3"
                        >
                            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                            <div className="min-w-0 flex-1 space-y-2">
                                <Skeleton className="h-3.5 w-1/3" />
                                <Skeleton className="h-3 w-1/4" />
                            </div>
                        </div>
                    ))}
                </div>
            </GlassCard>
        );
    }

    // Sin solicitudes pendientes → nada que gestionar: no ensuciar la pestaña
    // "Miembros" con un panel vacío permanente.
    if (rows.length === 0) return null;

    return (
        <GlassCard className="p-[clamp(1rem,3vw,1.75rem)] border-amber-400/20">
            <div className="mb-1 flex items-center gap-2" style={{ color: ringAccent }}>
                <UserPlus className="h-5 w-5" />
                <h2 className="font-headline text-lg font-semibold">Solicitudes de ingreso</h2>
                <Badge
                    variant="outline"
                    className="text-[10px] border-amber-400/40 text-amber-200 bg-amber-500/10"
                >
                    {rows.length}
                </Badge>
            </div>
            <p className="mb-4 text-xs text-muted-foreground">
                Personas que han pedido unirse a este grupo. Apruébalas para darles la
                bienvenida, o recházalas si no encajan ahora — nada aquí es permanente,
                siempre pueden volver a solicitarlo.
            </p>

            <div className="space-y-2">
                {rows.map((row) => {
                    const rowBusy = busy === "a:" + row.uid || busy === "r:" + row.uid;
                    return (
                        <div
                            key={row.uid}
                            className={`flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-background/30 p-3 transition-opacity ${
                                rowBusy ? "opacity-60" : ""
                            }`}
                        >
                            <span
                                className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2"
                                style={{ ["--tw-ring-color" as any]: `${ringAccent}55` }}
                            >
                                <span className="absolute inset-0 flex items-center justify-center bg-white/5 text-xs font-semibold text-white/80">
                                    {initialsOf(row.name)}
                                </span>
                                {row.avatar ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={row.avatar}
                                        alt={row.name}
                                        loading="lazy"
                                        onError={onImgError}
                                        className="relative h-full w-full object-cover"
                                    />
                                ) : null}
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{row.name}</p>
                                {row.handle ? (
                                    <p className="truncate text-xs text-muted-foreground">@{row.handle}</p>
                                ) : null}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-8 cursor-pointer gap-1.5 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 transition-colors"
                                    disabled={busy !== null}
                                    onClick={() => void handleApprove(row)}
                                >
                                    {busy === "a:" + row.uid ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Check className="h-3.5 w-3.5" />
                                    )}
                                    Aprobar
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-8 cursor-pointer gap-1.5 border-red-500/30 text-red-200 hover:bg-red-900/20 transition-colors"
                                    disabled={busy !== null}
                                    onClick={() => void handleReject(row)}
                                >
                                    {busy === "r:" + row.uid ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <X className="h-3.5 w-3.5" />
                                    )}
                                    Rechazar
                                </Button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </GlassCard>
    );
}

export default GroupJoinRequests;

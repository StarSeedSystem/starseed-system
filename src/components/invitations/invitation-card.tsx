"use client";

/*
 * InvitationCard — tarjeta-invitación enviable en Mensajes/Correos.
 * ---------------------------------------------------------------------------
 * Recibe solo {targetKind, refId, route} (lo que viaja en el adjunto
 * `kind:"invite"`, ver @/lib/invitations/invitations.ts) y resuelve en vivo:
 *   · un resumen fresco de la entidad (nombre/descripción/portada/fecha…),
 *   · si el usuario actual YA la aceptó (consulta directa a os_memberships/
 *     os_follows/os_event_attendance — sin tabla propia de invitaciones).
 *
 * Aceptar une de verdad; para eventos además agenda recordatorio + alarma
 * funcional (ver @/lib/events/event-accept.ts). Rechazar deshace cualquier
 * unión activa (idempotente) y descarta la tarjeta LOCALMENTE — no existe un
 * estado "rechazada" persistente en el modelo de datos (ver nota en
 * invitations.ts).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Check, X, Users2, FileText, CalendarDays, ExternalLink, MapPin } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
    acceptInvite,
    declineInvite,
    checkInviteStatus,
    fetchInviteEntitySummary,
    networkRefLabel,
    type InviteTargetKind,
    type InviteEntitySummary,
} from "@/lib/invitations/invitations";

export interface InvitationCardProps {
    targetKind: InviteTargetKind;
    refId: string;
    route: string;
    /** Nombre a mostrar mientras carga (el que iba en el adjunto al enviarse). */
    fallbackName?: string | null;
    className?: string;
}

const KIND_ICON: Record<InviteTargetKind, typeof Users2> = {
    group: Users2,
    page: FileText,
    event: CalendarDays,
};

function formatWhen(iso?: string | null): string {
    if (!iso) return "";
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return "";
        return d.toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    } catch {
        return "";
    }
}

export function InvitationCard({ targetKind, refId, route, fallbackName, className }: InvitationCardProps) {
    const [summary, setSummary] = useState<InviteEntitySummary | null>(null);
    const [loadingSummary, setLoadingSummary] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [accepted, setAccepted] = useState(false);
    const [declined, setDeclined] = useState(false);
    const [busy, setBusy] = useState<"accept" | "decline" | null>(null);

    useEffect(() => {
        let alive = true;
        setLoadingSummary(true);
        void Promise.all([fetchInviteEntitySummary(targetKind, refId), checkInviteStatus(targetKind, refId)]).then(
            ([sum, status]) => {
                if (!alive) return;
                setSummary(sum);
                setNotFound(!sum);
                setAccepted(status.accepted);
                setLoadingSummary(false);
            },
        );
        return () => {
            alive = false;
        };
    }, [targetKind, refId]);

    const Icon = KIND_ICON[targetKind] ?? FileText;
    const name = summary?.name || fallbackName || networkRefLabel(targetKind);

    const handleAccept = async () => {
        setBusy("accept");
        try {
            const res = await acceptInvite(targetKind, refId);
            if (res.needsAuth) {
                toast.error("Inicia sesión para aceptar esta invitación.");
                return;
            }
            if (!res.ok) {
                toast.error(res.error || "No se pudo aceptar la invitación.");
                return;
            }
            setAccepted(true);
            setDeclined(false);
            if (targetKind === "event") {
                const extra = res.reminderCreated || res.alarmCreated ? " Recordatorio y alarma creados en /recordatorios." : "";
                toast.success(`Asistencia confirmada.${extra}`);
            } else {
                toast.success(targetKind === "group" ? "Te uniste al grupo." : "Ahora sigues esta página.");
            }
        } finally {
            setBusy(null);
        }
    };

    const handleDecline = async () => {
        setBusy("decline");
        try {
            const res = await declineInvite(targetKind, refId);
            if (res.needsAuth) {
                toast.error("Inicia sesión para responder esta invitación.");
                return;
            }
            setAccepted(false);
            setDeclined(true);
        } finally {
            setBusy(null);
        }
    };

    return (
        <div
            className={cn(
                "w-[min(320px,80vw)] overflow-hidden rounded-2xl border border-cyan-400/25 bg-gradient-to-br from-cyan-500/[0.07] to-transparent",
                className,
            )}
        >
            <div className="flex items-center gap-2.5 border-b border-white/10 bg-white/[0.02] px-3.5 py-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-cyan-400/30 bg-cyan-500/10">
                    <Icon className="size-4 text-cyan-300" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-cyan-300/80">
                        Invitación · {networkRefLabel(targetKind)}
                    </p>
                    <p className="truncate text-sm font-semibold text-white/90">{name}</p>
                </div>
            </div>

            <div className="space-y-2 px-3.5 py-3">
                {loadingSummary ? (
                    <div className="flex items-center gap-2 text-xs text-white/40">
                        <Loader2 className="size-3.5 animate-spin" /> Cargando…
                    </div>
                ) : notFound ? (
                    <p className="text-xs italic text-white/40">Esta entidad ya no existe.</p>
                ) : (
                    <>
                        {summary?.description && <p className="line-clamp-2 text-xs text-white/60">{summary.description}</p>}
                        {targetKind === "event" && summary?.startsAt && (
                            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/50">
                                <span className="inline-flex items-center gap-1"><CalendarDays className="size-3" /> {formatWhen(summary.startsAt)}</span>
                                {summary.location && (
                                    <span className="inline-flex items-center gap-1"><MapPin className="size-3" /> {summary.location}</span>
                                )}
                            </p>
                        )}
                        {typeof summary?.memberCount === "number" && (
                            <p className="text-[11px] text-white/40">
                                {targetKind === "event" ? `${summary.memberCount} asistentes` : `${summary.memberCount} miembros`}
                            </p>
                        )}
                    </>
                )}

                <div className="flex items-center gap-2 pt-1">
                    {accepted ? (
                        <span className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
                            <Check className="size-3.5" /> Aceptada
                        </span>
                    ) : declined ? (
                        <span className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-white/40">
                            <X className="size-3.5" /> Rechazada
                        </span>
                    ) : (
                        !notFound && (
                            <>
                                <button
                                    type="button"
                                    disabled={busy !== null}
                                    onClick={() => void handleAccept()}
                                    className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition-colors duration-200 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {busy === "accept" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                                    Aceptar
                                </button>
                                <button
                                    type="button"
                                    disabled={busy !== null}
                                    onClick={() => void handleDecline()}
                                    className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-white/50 transition-colors duration-200 hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {busy === "decline" ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
                                    Rechazar
                                </button>
                            </>
                        )
                    )}
                    <Link
                        href={route}
                        className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-white/50 transition-colors duration-200 hover:border-cyan-400/30 hover:text-cyan-200"
                        title="Ver"
                    >
                        <ExternalLink className="size-3.5" />
                    </Link>
                </div>
            </div>
        </div>
    );
}

export default InvitationCard;

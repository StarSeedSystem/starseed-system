"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * invitations — tarjeta-invitación (grupo/comunidad·página/evento) para
 * Mensajes y Correos: aceptar une de verdad (os_memberships / os_follows /
 * os_event_attendance); para eventos, además agenda recordatorio + alarma.
 * ---------------------------------------------------------------------------
 * Una invitación es un adjunto `{kind:"invite", refKind, refId, route, name}`
 * (mismo shape que una referencia de "Contenido de la red", ver
 * @/lib/files/network-content-ref.ts) enviable como adjunto de un mensaje
 * (`DmAttachment`, @/lib/messages/dm.ts) o de un correo (mismo tipo, reexportado
 * por @/lib/mail/os-mail.ts). El componente `InvitationCard`
 * (@/components/invitations/invitation-card.tsx) la renderiza con botones
 * Aceptar/Rechazar.
 *
 * Estado de la invitación: NO existe (ni se crea aquí) una tabla dedicada de
 * "invitaciones" con estado propio — sería una tabla más para un dato que ya
 * es derivable en vivo: si el usuario aceptó, YA hay una fila real en
 * os_memberships/os_follows/os_event_attendance, así que `checkInviteStatus`
 * simplemente consulta esas tablas (idempotente, siempre exacto, cero
 * duplicación). "Rechazar" no tiene un estado negativo persistente en el
 * modelo de datos del repo (tampoco lo tienen los follows/membresías
 * existentes) — se limita a asegurar que no quede una unión activa; el
 * descarte visual de la tarjeta es responsabilidad del componente (estado de
 * sesión de UI).
 *
 * Filosofía del repo: nunca lanza, SSR-safe, degrada con mensajes honestos.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
    setMembership,
    setFollow,
    isMember,
    isFollowing,
    getAttendance,
    setAttendance,
    fetchGroupBySlug,
    fetchPageBySlug,
    fetchEventBySlug,
} from "@/lib/os-social";
import { acceptOsEventAndSchedule, type AcceptEventResult } from "@/lib/events/event-accept";
import { networkRefRoute, networkRefLabel, type NetworkRefKind } from "@/lib/files/network-content-ref";

/** Tipos de entidad a los que se puede invitar (subconjunto de NetworkRefKind: sin "post"). */
export type InviteTargetKind = "group" | "page" | "event";

/** Forma mínima de un adjunto de invitación (compatible con DmAttachment/CommentAttachment). */
export interface InviteAttachmentLike {
    kind: string;
    refKind?: string | null;
    refId?: string | null;
    route?: string | null;
    name?: string | null;
}

/** ¿Este adjunto es una tarjeta-invitación válida (kind "invite" + refKind/refId de entidad invitable)? */
export function isInviteAttachment(a: InviteAttachmentLike | null | undefined): a is InviteAttachmentLike & { refKind: InviteTargetKind; refId: string } {
    if (!a || a.kind !== "invite" || !a.refId) return false;
    return a.refKind === "group" || a.refKind === "page" || a.refKind === "event";
}

export interface BuildInviteInput {
    targetKind: InviteTargetKind;
    refId: string;
    name: string;
}

/** Construye el adjunto de invitación listo para enviar en un mensaje o correo. */
export function buildInviteAttachment(input: BuildInviteInput): {
    kind: "invite";
    refKind: InviteTargetKind;
    refId: string;
    route: string;
    name: string;
} {
    return {
        kind: "invite",
        refKind: input.targetKind,
        refId: input.refId,
        route: networkRefRoute(input.targetKind as NetworkRefKind, input.refId),
        name: input.name,
    };
}

export interface InviteEntitySummary {
    name: string;
    description?: string;
    coverUrl?: string;
    memberCount?: number;
    startsAt?: string | null;
    location?: string | null;
}

/** Datos frescos de la entidad invitada (para pintar la tarjeta); null si ya no existe. */
export async function fetchInviteEntitySummary(
    targetKind: InviteTargetKind,
    refId: string,
): Promise<InviteEntitySummary | null> {
    try {
        if (targetKind === "group") {
            const g = await fetchGroupBySlug(refId);
            if (!g) return null;
            return { name: g.name, description: g.description, coverUrl: g.coverUrl || g.avatarUrl, memberCount: g.memberCount };
        }
        if (targetKind === "page") {
            const p = await fetchPageBySlug(refId);
            if (!p) return null;
            return { name: p.name, description: p.description, coverUrl: p.coverUrl || p.avatarUrl, memberCount: p.memberCount };
        }
        const e = await fetchEventBySlug(refId);
        if (!e) return null;
        return {
            name: e.title,
            description: e.description,
            coverUrl: e.coverUrl,
            memberCount: e.attendeeCount,
            startsAt: e.startsAt,
            location: e.location,
        };
    } catch {
        return null;
    }
}

export interface InviteStatus {
    /** true si el usuario actual YA está unido/sigue/asiste (derivado en vivo, sin tabla propia). */
    accepted: boolean;
    /** Para eventos: el status crudo de os_event_attendance ("asiste", "interesado"…) si distinto de aceptado simple. */
    rawStatus?: string | null;
}

/** Consulta en vivo si el usuario actual ya aceptó esta invitación (idempotente). */
export async function checkInviteStatus(targetKind: InviteTargetKind, refId: string): Promise<InviteStatus> {
    try {
        if (targetKind === "group") return { accepted: await isMember(refId) };
        if (targetKind === "page") return { accepted: await isFollowing(refId) };
        const status = await getAttendance(refId);
        return { accepted: status === "asiste", rawStatus: status };
    } catch {
        return { accepted: false };
    }
}

export interface InviteActionResult {
    ok: boolean;
    needsAuth?: boolean;
    error?: string;
    /** Solo eventos: si además se creó el recordatorio/alarma (ver @/lib/events/event-accept.ts). */
    reminderCreated?: boolean;
    alarmCreated?: boolean;
}

/**
 * Acepta la invitación: une de verdad a la entidad real.
 *   · group → os_memberships (setMembership)
 *   · page  → os_follows (setFollow) — "unirse" a una página/comunidad/E.F./partido es seguirla
 *   · event → asistencia (os_event_attendance) + recordatorio + alarma funcional
 *             (@/lib/events/event-accept.ts) — agenda automáticamente.
 */
export async function acceptInvite(targetKind: InviteTargetKind, refId: string): Promise<InviteActionResult> {
    if (targetKind === "group") {
        const res = await setMembership(refId, true);
        return { ok: res.ok, needsAuth: res.needsAuth, error: res.error };
    }
    if (targetKind === "page") {
        const res = await setFollow(refId, true);
        return { ok: res.ok, needsAuth: res.needsAuth, error: res.error };
    }
    // event
    const event = await fetchEventBySlug(refId);
    if (!event) return { ok: false, error: "Este evento ya no existe." };
    const res: AcceptEventResult = await acceptOsEventAndSchedule(event);
    return {
        ok: res.ok,
        needsAuth: res.needsAuth,
        error: res.error,
        reminderCreated: res.reminderCreated,
        alarmCreated: res.alarmCreated,
    };
}

/**
 * Rechaza la invitación: garantiza que no quede unión activa (idempotente; sin
 * efecto si nunca se había aceptado). Ver nota honesta sobre el estado de
 * "rechazado" en la cabecera del archivo.
 */
export async function declineInvite(targetKind: InviteTargetKind, refId: string): Promise<InviteActionResult> {
    if (targetKind === "group") {
        const res = await setMembership(refId, false);
        return { ok: res.ok, needsAuth: res.needsAuth, error: res.error };
    }
    if (targetKind === "page") {
        const res = await setFollow(refId, false);
        return { ok: res.ok, needsAuth: res.needsAuth, error: res.error };
    }
    const res = await setAttendance(refId, null);
    return { ok: res.ok, needsAuth: res.needsAuth, error: res.error };
}

// Reexport de conveniencia para quien construya el composer de invitación
// (@/components/invitations/invite-composer-button.tsx): mismo vocabulario que
// "Contenido de la red", filtrado a los 3 tipos invitables.
export { networkRefRoute, networkRefLabel };

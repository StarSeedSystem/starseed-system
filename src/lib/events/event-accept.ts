"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * event-accept — Aceptar asistencia a un evento con AGENDA + RECORDATORIO + ALARMA
 * ---------------------------------------------------------------------------
 * Acción compuesta reutilizada por (a) los botones de asistencia de la propia
 * página del evento (/evento/[slug]) y (b) la tarjeta de invitación enviable en
 * Mensajes/Correos (@/components/invitations/invitation-card.tsx). Al aceptar:
 *
 *   1) Asistencia real     → setAttendance(slug, 'asiste')      (os_event_attendance)
 *   2) Recordatorio real   → fila en `scheduled_tasks`           (ver /recordatorios)
 *   3) Alarma funcional    → @/lib/alarms/alarms.ts (cliente, sincronizada)
 *
 * El evento YA aparece en el Sincrómetro unificado de TODAS las cuentas vía
 * `os_events` (@/lib/events/os-events-calendar.ts lista los `os_events` reales
 * sin filtrar por asistencia) — por eso este helper no duplica una copia en la
 * tabla `events` del calendario personal (esa tabla es para ítems creados a
 * mano en el propio Sincrómetro, un ámbito distinto); en cambio garantiza que
 * la asistencia, el recordatorio y la alarma queden reales y sincronizados.
 *
 * SSR-safe, nunca lanza: cualquier paso que falle se ignora sin romper el
 * flujo (el usuario siempre queda con al menos la asistencia registrada si la
 * sesión existe).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from "@/utils/supabase/client";
import { setAttendance, getCurrentUserId, type OsEvent } from "@/lib/os-social";
import { addAlarm } from "@/lib/alarms/alarms";

export interface AcceptableEvent {
    slug: string;
    title: string;
    /** ISO de comienzo (si falta, se usa "dentro de 1h" para no perder el aviso). */
    startsAt?: string | null;
    location?: string | null;
}

export interface AcceptEventResult {
    ok: boolean;
    needsAuth?: boolean;
    /** true si además se creó el recordatorio en /recordatorios. */
    reminderCreated: boolean;
    /** true si además se creó la alarma funcional. */
    alarmCreated: boolean;
    error?: string;
}

/** Minutos de antelación del recordatorio/alarma respecto al comienzo. */
const LEAD_MINUTES = 30;

function reminderFireISO(startsAt?: string | null): string {
    const d = startsAt ? new Date(startsAt) : new Date(Date.now() + 60 * 60 * 1000);
    const base = Number.isNaN(d.getTime()) ? new Date(Date.now() + 60 * 60 * 1000) : d;
    const fireAt = new Date(base.getTime() - LEAD_MINUTES * 60 * 1000);
    // Si el aviso quedaría en el pasado (evento ya muy próximo/empezado), avisa ya.
    return (fireAt.getTime() < Date.now() ? new Date(Date.now() + 30 * 1000) : fireAt).toISOString();
}

/**
 * Acepta la asistencia a un evento y, best-effort, crea su recordatorio +
 * alarma. Exige sesión para la asistencia (RLS); el recordatorio/alarma sólo
 * se intentan si hay sesión y el evento tiene fecha real.
 */
export async function acceptEventAndSchedule(event: AcceptableEvent): Promise<AcceptEventResult> {
    const attendance = await setAttendance(event.slug, "asiste");
    if (attendance.needsAuth) {
        return { ok: false, needsAuth: true, reminderCreated: false, alarmCreated: false };
    }
    if (!attendance.ok) {
        return { ok: false, reminderCreated: false, alarmCreated: false, error: attendance.error };
    }

    let reminderCreated = false;
    let alarmCreated = false;
    const link = `/evento/${event.slug}`;

    if (event.startsAt) {
        const fireISO = reminderFireISO(event.startsAt);
        const body = event.location ? `${event.title} · ${event.location}` : event.title;

        try {
            const uid = await getCurrentUserId();
            if (uid) {
                const supabase = createClient();
                const { error } = await supabase.from("scheduled_tasks").insert({
                    owner: uid,
                    kind: "recordatorio",
                    title: `Evento: ${event.title}`,
                    body,
                    run_at: fireISO,
                    recurrence: "una_vez",
                    payload: { target: "evento", ref: event.slug },
                    status: "pendiente",
                    link,
                });
                reminderCreated = !error;
            }
        } catch {
            /* best-effort: la asistencia ya quedó registrada */
        }

        try {
            addAlarm({
                title: `Evento: ${event.title}`,
                body,
                atISO: fireISO,
                link,
                recurrence: "none",
                sound: true,
                sourceRef: `event:${event.slug}`,
            });
            alarmCreated = true;
        } catch {
            /* best-effort */
        }
    }

    return { ok: true, reminderCreated, alarmCreated };
}

/** Variante que acepta directamente un `OsEvent` (evita repetir el mapeo en los llamadores). */
export function acceptOsEventAndSchedule(event: Pick<OsEvent, "slug" | "title" | "startsAt" | "location">): Promise<AcceptEventResult> {
    return acceptEventAndSchedule({
        slug: event.slug,
        title: event.title,
        startsAt: event.startsAt,
        location: event.location,
    });
}

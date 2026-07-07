"use client";

/*
 * AlarmsEngine — motor de ALARMAS del usuario (@/lib/alarms/alarms.ts).
 * ---------------------------------------------------------------------------
 * Revisa las alarmas pendientes cada ~20s mientras la app está abierta (más
 * un chequeo inmediato al montar/al cambiar la lista). Si una alarma entra en
 * su ventana de disparo:
 *   · Notification API del navegador (con permiso, best-effort).
 *   · Sonido de alarma opcional (reutiliza el generador Web Audio ya usado por
 *     el Sincrómetro: startAlarmSound/stopAlarmSound).
 *   · Toast persistente con "Posponer 10 min" / "Descartar".
 *   · Entrada en el Centro de Notificaciones existente (useNotifications()).
 *
 * Distinto del <AlarmScheduler/> del Sincrómetro (avisos por-evento del
 * calendario, en memoria): éste dispara alarmas propias del usuario nacidas
 * fuera del calendario (p.ej. al aceptar la invitación a un evento desde
 * Mensajes/Correos). Ambos coexisten sin pisarse — se montan uno junto al otro
 * en (app)/layout.tsx.
 *
 * Honesto: solo funciona con la pestaña abierta en ESTE dispositivo. Push con
 * la app cerrada requeriría Web Push (Service Worker + VAPID) — integración
 * futura, no implementada aquí.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useNotifications } from "@/context/notifications-context";
import { dueAlarms, dismissAlarm, snoozeAlarm, subscribeAlarms, type AlarmItem } from "@/lib/alarms/alarms";
import { startAlarmSound, stopAlarmSound } from "@/components/calendar/alarm-scheduler";

const POLL_MS = 20_000;

function ensureNotificationPermission(): void {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
        try {
            void Notification.requestPermission();
        } catch {
            /* noop */
        }
    }
}

function fireBrowserNotification(alarm: AlarmItem): void {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    try {
        const n = new Notification(alarm.title, {
            body: alarm.body || "Tu alarma StarSeed ha sonado.",
            tag: `starseed-alarm-${alarm.id}`,
        });
        if (alarm.link) {
            n.onclick = () => {
                try {
                    window.focus();
                    window.location.href = alarm.link!;
                } catch {
                    /* noop */
                }
            };
        }
    } catch {
        /* noop */
    }
}

export function AlarmsEngine() {
    const { add } = useNotifications();
    const shownRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        const check = () => {
            const due = dueAlarms();
            for (const alarm of due) {
                const fireKey = `${alarm.id}:${alarm.snoozedUntil || alarm.atISO}`;
                if (shownRef.current.has(fireKey)) continue;
                shownRef.current.add(fireKey);

                if (alarm.sound !== false) startAlarmSound();
                fireBrowserNotification(alarm);
                add({
                    title: alarm.title,
                    body: alarm.body,
                    category: "system",
                    priority: "high",
                    iconName: "AlarmClock",
                    action: alarm.link ? { label: "Abrir", href: alarm.link } : undefined,
                });
                toast(alarm.title, {
                    description: alarm.body || "Tu alarma ha sonado.",
                    duration: 30_000,
                    action: {
                        label: "Posponer 10 min",
                        onClick: () => {
                            stopAlarmSound();
                            snoozeAlarm(alarm.id, 10);
                        },
                    },
                    cancel: {
                        label: "Descartar",
                        onClick: () => {
                            stopAlarmSound();
                            dismissAlarm(alarm.id);
                        },
                    },
                    onAutoClose: () => stopAlarmSound(),
                    onDismiss: () => stopAlarmSound(),
                });
            }
        };

        ensureNotificationPermission();
        check();
        const id = window.setInterval(check, POLL_MS);
        const unsub = subscribeAlarms(check);
        return () => {
            window.clearInterval(id);
            unsub();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [add]);

    return null;
}

export default AlarmsEngine;

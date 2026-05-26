// src/components/calendar/alarm-scheduler.tsx
'use client';

/**
 * AlarmScheduler — motor que dispara avisos del calendario unificado.
 *
 * Diseño:
 *  - Corre globalmente en el árbol de la app (montado en (app)/layout.tsx).
 *  - Cada 15 s comprueba todos los `reminders` de todos los `items`.
 *  - Si un aviso entró en su ventana (fireMs ≤ now < eventMs) y aún no se ha
 *    disparado en esta sesión:
 *      • type === 'recordatorio' → notificación silenciosa (Web Notification API).
 *      • type === 'alarma'        → notificación + sonido en bucle (Web Audio)
 *                                   + modal global `<ActiveAlertModal />` con
 *                                   acciones snooze/dismiss.
 *  - Permiso de notificaciones se solicita perezosamente al primer disparo.
 *  - El sonido se genera con Web Audio API (sin assets) para mantener el
 *    bundle pequeño y respetar la regla de soberanía de datos.
 */

import { useEffect, useRef } from 'react';
import {
  eventDateTimeMs,
  reminderFireMs,
  useCalendar,
  type CalendarItem,
  type EventReminder,
} from '@/contexts/calendar-context';

const POLL_MS = 15_000;

function ensureNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return Promise.resolve('unsupported');
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Promise.resolve(Notification.permission);
  }
  try {
    return Notification.requestPermission();
  } catch {
    return Promise.resolve('default');
  }
}

function fireSilentNotification(item: CalendarItem, reminder: EventReminder) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(`⏰ ${item.title}`, {
      body: reminder.label
        ? `${reminder.label} · ${item.date}${item.time ? ' ' + item.time : ''}`
        : `Recordatorio · ${item.date}${item.time ? ' ' + item.time : ''}`,
      tag: `calendar-${item.id}-${reminder.id}`,
      silent: false,
    });
  } catch {
    // silently ignore
  }
}

// ── Generador de sonido (Web Audio) ────────────────────────────────────────
let audioCtx: AudioContext | null = null;
let alarmStop: (() => void) | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!audioCtx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new Ctor();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/** Inicia un beep pulsante en bucle. Devuelve función para detenerlo. */
export function startAlarmSound(): () => void {
  const ctx = getAudioContext();
  if (!ctx) return () => undefined;
  if (alarmStop) alarmStop();

  // Resume si el contexto estaba suspendido (políticas de autoplay)
  ctx.resume().catch(() => undefined);

  const gain = ctx.createGain();
  gain.gain.value = 0.001;
  gain.connect(ctx.destination);

  let intervalId: ReturnType<typeof setInterval> | null = null;
  let osc: OscillatorNode | null = null;

  const beep = () => {
    osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  };

  beep();
  intervalId = setInterval(beep, 900);

  const stop = () => {
    if (intervalId) clearInterval(intervalId);
    try {
      osc?.stop();
    } catch {
      // ignore
    }
    try {
      gain.disconnect();
    } catch {
      // ignore
    }
    alarmStop = null;
  };
  alarmStop = stop;
  return stop;
}

export function stopAlarmSound() {
  if (alarmStop) alarmStop();
}

// ── Componente Scheduler ───────────────────────────────────────────────────
export function AlarmScheduler() {
  const { items, activeAlert, setActiveAlert, isAlertFired, markAlertFired } = useCalendar();
  const itemsRef = useRef<CalendarItem[]>(items);

  // Mantén la última referencia de items sin reiniciar el interval
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    const check = () => {
      const now = Date.now();
      for (const item of itemsRef.current) {
        const reminders = item.reminders ?? [];
        if (reminders.length === 0) continue;
        const eventMs = eventDateTimeMs(item);
        // Ventana de validez: desde fireMs hasta eventMs + 5 min (tolerancia post-inicio)
        const tolerance = 5 * 60 * 1000;
        for (const r of reminders) {
          if (isAlertFired(item.id, r.id)) continue;
          const fireMs = reminderFireMs(item, r);
          if (now >= fireMs && now <= eventMs + tolerance) {
            markAlertFired(item.id, r.id);
            if (r.type === 'alarma') {
              // Dispara modal + sonido
              startAlarmSound();
              setActiveAlert({ itemId: item.id, reminderId: r.id, firedAt: now });
              // Notificación visual paralela (si está concedida)
              ensureNotificationPermission().then(() => fireSilentNotification(item, r));
            } else {
              ensureNotificationPermission().then(() => fireSilentNotification(item, r));
            }
          }
        }
      }
    };
    check();
    const id = setInterval(check, POLL_MS);
    return () => clearInterval(id);
  }, [isAlertFired, markAlertFired, setActiveAlert]);

  // Pide permiso al primer click de usuario (gesto necesario en algunos navegadores).
  useEffect(() => {
    const onFirstClick = () => {
      ensureNotificationPermission();
      // también "warmup" del audio context con el primer gesto
      try {
        getAudioContext()?.resume();
      } catch {
        // ignore
      }
      window.removeEventListener('click', onFirstClick);
    };
    window.addEventListener('click', onFirstClick, { once: true });
    return () => window.removeEventListener('click', onFirstClick);
  }, []);

  // Si la alarma se cierra externamente, asegura silenciar el sonido.
  useEffect(() => {
    if (!activeAlert) stopAlarmSound();
  }, [activeAlert]);

  return null;
}

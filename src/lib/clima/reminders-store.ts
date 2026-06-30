// ════════════════════════════════════════════════════════════════════════════
// lib/clima/reminders-store.ts — Recordatorios / alarmas / temporizadores
// ----------------------------------------------------------------------------
// Capa de persistencia + programación para la sección /clima. NO usa base de
// datos: persiste en localStorage con una clave por usuario (sufijo = user.id
// si hay sesión, o "anon"). Todo defensivo: guardas `typeof window`, try/catch
// y validación de la forma leída. SSR-safe (nada se ejecuta en el módulo).
//
//   • Tipos: TimerItem, AlarmItem, ReminderItem (+ unión ClimaItem).
//   • CRUD: loadItems / saveItems (puros sobre localStorage).
//   • Programación: isAlarmDue / isReminderDue / nextReminderFire.
//   • Notificaciones: ensureNotificationPermission / fireNotification.
//
// El "tick" (setInterval) vive en el panel; aquí solo van helpers puros.
// ════════════════════════════════════════════════════════════════════════════

// ───────────────────────────── Tipos ────────────────────────────────────────

export type ClimaItemKind = "timer" | "alarm" | "reminder";

export type ReminderRepeat = "ninguna" | "diario" | "semanal";

/** Temporizador de cuenta atrás (start/pause/reset). */
export interface TimerItem {
    id: string;
    kind: "timer";
    label: string;
    /** Duración configurada, en segundos. */
    durationSec: number;
    /** Segundos restantes (se actualiza al pausar / al tick). */
    remainingSec: number;
    /** Si corre, marca de tiempo (ms) en que vencerá; null si pausado. */
    endsAt: number | null;
    running: boolean;
    /** Ya disparó su notificación de fin (evita repetir). */
    fired: boolean;
    createdAt: number;
}

/** Alarma a una hora de reloj (HH:mm), opcionalmente cada día. */
export interface AlarmItem {
    id: string;
    kind: "alarm";
    label: string;
    /** Hora en formato "HH:mm" (24h, hora local). */
    time: string;
    enabled: boolean;
    repeatDaily: boolean;
    /** Última fecha "YYYY-MM-DD" en que ya saltó (evita doble disparo). */
    lastFiredDate: string | null;
    createdAt: number;
}

/** Recordatorio con nota + fecha/hora, repetición opcional. */
export interface ReminderItem {
    id: string;
    kind: "reminder";
    label: string;
    note: string;
    /** Instante objetivo (ms epoch). */
    dueAt: number;
    repeat: ReminderRepeat;
    /** Marca de tiempo (ms) del último disparo; null si nunca. */
    firedAt: number | null;
    createdAt: number;
}

export type ClimaItem = TimerItem | AlarmItem | ReminderItem;

export interface ClimaStore {
    timers: TimerItem[];
    alarms: AlarmItem[];
    reminders: ReminderItem[];
}

function emptyStore(): ClimaStore {
    return { timers: [], alarms: [], reminders: [] };
}

// ─────────────────────────── Persistencia ───────────────────────────────────

const KEY_BASE = "starseed.clima.reminders.v1";

/** Construye la clave de localStorage por usuario (o "anon" sin sesión). */
export function storageKey(userId?: string | null): string {
    const suffix = userId && userId.trim() ? userId.trim() : "anon";
    return `${KEY_BASE}.${suffix}`;
}

const isArr = Array.isArray;

/** Lee el store del usuario. Tolerante: devuelve estructura vacía ante fallo. */
export function loadItems(userId?: string | null): ClimaStore {
    if (typeof window === "undefined") return emptyStore();
    try {
        const raw = window.localStorage.getItem(storageKey(userId));
        if (!raw) return emptyStore();
        const parsed = JSON.parse(raw) as Partial<ClimaStore> | null;
        if (!parsed || typeof parsed !== "object") return emptyStore();
        return {
            timers: isArr(parsed.timers) ? (parsed.timers as TimerItem[]) : [],
            alarms: isArr(parsed.alarms) ? (parsed.alarms as AlarmItem[]) : [],
            reminders: isArr(parsed.reminders) ? (parsed.reminders as ReminderItem[]) : [],
        };
    } catch {
        return emptyStore();
    }
}

/** Persiste el store del usuario. Silencioso ante cuota / errores. */
export function saveItems(store: ClimaStore, userId?: string | null): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(storageKey(userId), JSON.stringify(store));
    } catch {
        /* cuota llena / modo privado: ignorar */
    }
}

/** Genera un id razonablemente único sin dependencias externas. */
export function genId(): string {
    try {
        if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
            return crypto.randomUUID();
        }
    } catch {
        /* fallback */
    }
    return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─────────────────────────── Programación ───────────────────────────────────

/** "YYYY-MM-DD" de una fecha en hora local. */
export function localDateKey(d = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * ¿La alarma debe sonar AHORA? Verdadero si está activa, su hora HH:mm ya pasó
 * dentro del último minuto del día actual y aún no saltó hoy.
 */
export function isAlarmDue(alarm: AlarmItem, now = new Date()): boolean {
    if (!alarm.enabled) return false;
    const m = /^(\d{1,2}):(\d{2})$/.exec(alarm.time);
    if (!m) return false;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return false;

    const today = localDateKey(now);
    if (alarm.lastFiredDate === today) return false;

    const target = new Date(now);
    target.setHours(h, min, 0, 0);
    // Ventana de disparo: la hora objetivo ya llegó hace <= 60s.
    const diff = now.getTime() - target.getTime();
    return diff >= 0 && diff < 60_000;
}

/** ¿El recordatorio venció (dueAt <= ahora) y no se ha disparado para este ciclo? */
export function isReminderDue(reminder: ReminderItem, now = Date.now()): boolean {
    if (reminder.dueAt > now) return false;
    if (reminder.firedAt == null) return true;
    // Para repetitivos, el dueAt se reprograma al disparar; si firedAt es viejo
    // respecto al dueAt actual, sigue pendiente.
    return reminder.firedAt < reminder.dueAt;
}

/** Calcula el siguiente vencimiento de un recordatorio repetitivo (o null). */
export function nextReminderFire(reminder: ReminderItem): number | null {
    if (reminder.repeat === "ninguna") return null;
    const base = new Date(reminder.dueAt);
    if (Number.isNaN(base.getTime())) return null;
    const next = new Date(base);
    if (reminder.repeat === "diario") next.setDate(next.getDate() + 1);
    else if (reminder.repeat === "semanal") next.setDate(next.getDate() + 7);
    // Si por inactividad quedó muy atrás, avanzar hasta el futuro.
    const step = reminder.repeat === "diario" ? 86_400_000 : 604_800_000;
    while (next.getTime() <= Date.now()) {
        next.setTime(next.getTime() + step);
    }
    return next.getTime();
}

// ─────────────────────────── Notificaciones ─────────────────────────────────

/** ¿Hay soporte de Notification en este entorno? */
export function notificationsSupported(): boolean {
    return typeof window !== "undefined" && "Notification" in window;
}

/** Estado actual del permiso ("default" si no soportado). */
export function notificationPermission(): NotificationPermission {
    if (!notificationsSupported()) return "default";
    try {
        return Notification.permission;
    } catch {
        return "default";
    }
}

/** Solicita permiso de notificación. Devuelve el estado final. */
export async function ensureNotificationPermission(): Promise<NotificationPermission> {
    if (!notificationsSupported()) return "denied";
    try {
        if (Notification.permission === "granted") return "granted";
        if (Notification.permission === "denied") return "denied";
        return await Notification.requestPermission();
    } catch {
        return "denied";
    }
}

/**
 * Dispara una notificación del navegador si hay permiso. Devuelve true si se
 * mostró; false si no había permiso/soporte (el llamador hace fallback in-app).
 */
export function fireNotification(title: string, body?: string): boolean {
    if (!notificationsSupported()) return false;
    try {
        if (Notification.permission !== "granted") return false;
        // eslint-disable-next-line no-new
        new Notification(title, {
            body: body || undefined,
            tag: `clima-${Date.now()}`,
            silent: false,
        });
        return true;
    } catch {
        return false;
    }
}

/** Formatea segundos como mm:ss o hh:mm:ss para los temporizadores. */
export function formatCountdown(totalSec: number): string {
    const s = Math.max(0, Math.floor(totalSec));
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
}

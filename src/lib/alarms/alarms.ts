"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * alarms — Sistema de ALARMAS funcionales del usuario
 * ---------------------------------------------------------------------------
 * Capa de datos PURA (sin JSX) para alarmas propias del usuario: se usa desde
 * la aceptación de invitaciones a eventos (@/lib/events/event-accept.ts) y
 * puede reutilizarse desde cualquier otra superficie que necesite "avísame a
 * tal hora". Distinto y complementario al `AlarmScheduler` del Sincrómetro
 * (@/components/calendar/alarm-scheduler.tsx, que dispara los `reminders` de
 * un `CalendarItem` en memoria): éste vive en localStorage, viaja con la
 * cuenta y es la base para avisos que nacen fuera del calendario (mensajes,
 * correos, invitaciones).
 *
 * Persistencia + sincronización: localStorage bajo `starseed.alarms.v1`,
 * registrada en SYNCED_KEYS (@/lib/settings-sync.ts). El motor de tiempo real
 * (@/lib/sync/realtime-sync.ts) ya parchea `localStorage.setItem` para TODA
 * clave en SYNCED_KEYS: en cuanto escribimos aquí con `window.localStorage.
 * setItem`, ese motor la sube a `user_settings.prefs` y la retransmite en vivo
 * (postgres_changes + broadcast) a cualquier otro dispositivo con sesión —
 * cero código adicional en este módulo. Local-first: sin sesión, sigue
 * funcionando solo en este dispositivo (igual que el resto del repo).
 *
 * Disparo: lo hace `<AlarmsEngine/>` (@/components/alarms/alarms-engine.tsx),
 * montado globalmente, revisando `dueAlarms()` en un intervalo corto MIENTRAS
 * LA APP ESTÁ ABIERTA. Honesto: no hay push real de sistema operativo con la
 * app/pestaña cerrada — eso requeriría una integración futura de Web Push
 * (Service Worker + VAPID) que este módulo no implementa.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type AlarmRecurrence = "none" | "daily" | "weekly" | "monthly";

export interface AlarmItem {
    id: string;
    title: string;
    body?: string;
    /** ISO timestamp del momento en que debe sonar. */
    atISO: string;
    /** Ruta in-app a abrir al pulsar la notificación/alarma (opcional). */
    link?: string;
    recurrence?: AlarmRecurrence;
    /** Si además de notificación/toast debe reproducir sonido (por defecto sí). */
    sound?: boolean;
    /** Referencia libre al origen (p.ej. `event:<slug>`, `invite:<id>`). */
    sourceRef?: string;
    createdAt: string;
    /** Pospuesta hasta este ISO (si está en el futuro, no se dispara hasta entonces). */
    snoozedUntil?: string | null;
    /** Descartada definitivamente (alarmas "una vez" ya atendidas). */
    dismissed?: boolean;
    /** Último disparo real (informativo). */
    lastFiredAt?: string | null;
}

const STORAGE_KEY = "starseed.alarms.v1";
const EVENT_NAME = "starseed:alarms";

function isClient(): boolean {
    return typeof window !== "undefined";
}

function uid(): string {
    try {
        if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    } catch {
        /* noop */
    }
    return `alm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readAll(): AlarmItem[] {
    if (!isClient()) return [];
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((a) => a && typeof a === "object" && a.id) : [];
    } catch {
        return [];
    }
}

/** Escribe la lista completa. Usa `localStorage.setItem` directamente (nunca
 *  otro wrapper) para que el parche de realtime-sync detecte la escritura. */
function writeAll(list: AlarmItem[]): void {
    if (!isClient()) return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
        /* noop: cuota excedida u otro fallo de storage */
    }
    try {
        window.dispatchEvent(new Event(EVENT_NAME));
    } catch {
        /* noop */
    }
}

/** Lista todas las alarmas (activas, pospuestas o descartadas), ordenadas por hora. */
export function listAlarms(): AlarmItem[] {
    return readAll().sort((a, b) => new Date(a.atISO).getTime() - new Date(b.atISO).getTime());
}

export interface CreateAlarmInput {
    title: string;
    body?: string;
    /** ISO timestamp o `Date`. */
    atISO: string;
    link?: string;
    recurrence?: AlarmRecurrence;
    sound?: boolean;
    sourceRef?: string;
}

/** Crea (persiste + sincroniza) una nueva alarma y la devuelve. */
export function addAlarm(input: CreateAlarmInput): AlarmItem {
    const item: AlarmItem = {
        id: uid(),
        title: input.title.trim() || "Alarma",
        body: input.body?.trim() || undefined,
        atISO: input.atISO,
        link: input.link,
        recurrence: input.recurrence ?? "none",
        sound: input.sound !== false,
        sourceRef: input.sourceRef,
        createdAt: new Date().toISOString(),
        snoozedUntil: null,
        dismissed: false,
        lastFiredAt: null,
    };
    const list = readAll();
    list.push(item);
    writeAll(list);
    return item;
}

/** Actualiza campos de una alarma existente (no-op si no existe). */
export function updateAlarm(id: string, patch: Partial<AlarmItem>): void {
    const list = readAll();
    if (!list.some((a) => a.id === id)) return;
    writeAll(list.map((a) => (a.id === id ? { ...a, ...patch } : a)));
}

/** Elimina una alarma definitivamente. */
export function removeAlarm(id: string): void {
    writeAll(readAll().filter((a) => a.id !== id));
}

function nextRecurrence(atISO: string, recurrence: AlarmRecurrence): string {
    const d = new Date(atISO);
    if (Number.isNaN(d.getTime())) return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    if (recurrence === "daily") d.setDate(d.getDate() + 1);
    else if (recurrence === "weekly") d.setDate(d.getDate() + 7);
    else if (recurrence === "monthly") d.setMonth(d.getMonth() + 1);
    return d.toISOString();
}

/** Pospone una alarma N minutos desde ahora (limpia cualquier descarte previo). */
export function snoozeAlarm(id: string, minutes: number): void {
    const at = new Date(Date.now() + Math.max(1, minutes) * 60_000).toISOString();
    updateAlarm(id, { snoozedUntil: at, dismissed: false });
}

/**
 * Descarta el disparo actual: si es recurrente, la reprograma a la siguiente
 * ocurrencia; si es "una vez", queda marcada como `dismissed` (no volverá a
 * sonar salvo que se edite su fecha).
 */
export function dismissAlarm(id: string): void {
    const list = readAll();
    const found = list.find((a) => a.id === id);
    if (!found) return;
    const firedAt = new Date().toISOString();
    if (found.recurrence && found.recurrence !== "none") {
        writeAll(
            list.map((a) =>
                a.id === id
                    ? { ...a, atISO: nextRecurrence(a.atISO, a.recurrence!), snoozedUntil: null, dismissed: false, lastFiredAt: firedAt }
                    : a,
            ),
        );
    } else {
        writeAll(list.map((a) => (a.id === id ? { ...a, dismissed: true, lastFiredAt: firedAt } : a)));
    }
}

/** Ventana de tolerancia tras el instante de disparo (ms): si la pestaña
 *  estaba en segundo plano justo al vencer, igual se dispara al volver. */
const FIRE_TOLERANCE_MS = 5 * 60_000;

/**
 * Alarmas que deben sonar AHORA: no descartadas, sin snooze futuro pendiente,
 * dentro de la ventana [hora, hora + tolerancia]. Función pura (no muta nada);
 * el llamador decide cuándo `dismissAlarm`/`snoozeAlarm` según la interacción.
 */
export function dueAlarms(now: number = Date.now()): AlarmItem[] {
    return readAll().filter((a) => {
        if (a.dismissed) return false;
        const fireAtRaw = a.snoozedUntil || a.atISO;
        const fireAt = new Date(fireAtRaw).getTime();
        if (Number.isNaN(fireAt)) return false;
        return now >= fireAt && now <= fireAt + FIRE_TOLERANCE_MS;
    });
}

/**
 * Se suscribe a cambios locales (`addAlarm`/`updateAlarm`/…) y a cambios
 * remotos aplicados por el motor de sincronización en tiempo real (evento
 * genérico `starseed:sync:apply`, ver @/lib/sync/realtime-sync.ts). Devuelve
 * función de limpieza. SSR-safe: no-op sin `window`.
 */
export function subscribeAlarms(cb: () => void): () => void {
    if (!isClient()) return () => {};
    const handler = () => cb();
    window.addEventListener(EVENT_NAME, handler);
    window.addEventListener("starseed:sync:apply", handler);
    return () => {
        window.removeEventListener(EVENT_NAME, handler);
        window.removeEventListener("starseed:sync:apply", handler);
    };
}

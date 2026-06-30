"use client";

// ════════════════════════════════════════════════════════════════════════════
// RemindersPanel — Recordatorios, alarmas y temporizadores con notificaciones
// ----------------------------------------------------------------------------
// • Temporizadores: cuenta atrás con iniciar / pausar / reiniciar.
// • Alarmas: saltan a una hora de reloj (HH:mm), con repetición diaria opcional.
// • Recordatorios: nota + fecha/hora, con repetición (ninguna/diario/semanal).
// • Persistencia en localStorage por usuario (useAccount → user.id).
// • Notificaciones del navegador (botón de permiso) + fallback a aviso in-app.
// • Programador con setInterval (1s) que sobrevive a la navegación con la app
//   abierta. Todo defensivo (typeof window, try/catch).
// SSR-safe: "use client"; ningún acceso a window en el cuerpo del módulo.
// ════════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    BellRing, AlarmClock, Timer as TimerIcon, Plus, Trash2, Play, Pause,
    RotateCcw, Clock, CalendarClock, Repeat, X, Check, BellOff, Bell,
    CheckCircle2, Inbox, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAccount } from "@/context/account-context";
import {
    loadItems, saveItems, genId,
    isAlarmDue, isReminderDue, nextReminderFire, localDateKey,
    ensureNotificationPermission, notificationPermission, notificationsSupported,
    fireNotification, formatCountdown,
    type ClimaStore, type TimerItem, type AlarmItem, type ReminderItem,
    type ReminderRepeat,
} from "@/lib/clima/reminders-store";

type TabKey = "timers" | "alarms" | "reminders";

interface ToastMsg {
    id: string;
    title: string;
    body?: string;
}

const REPEAT_OPTIONS: { value: ReminderRepeat; label: string }[] = [
    { value: "ninguna", label: "Sin repetir" },
    { value: "diario", label: "Diario" },
    { value: "semanal", label: "Semanal" },
];

// ─────────────────────── Utilidades de fecha (form) ─────────────────────────

function isoToLocalInput(ms?: number | null): string {
    const d = ms ? new Date(ms) : new Date(Date.now() + 60 * 60 * 1000);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToMs(value: string): number | null {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
}

function formatDateTime(ms: number): string {
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("es-ES", {
        weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
}

// ─────────────────────────── Componente raíz ────────────────────────────────

export function RemindersPanel() {
    const { user } = useAccount();
    const userId = user?.id ?? null;

    const [tab, setTab] = useState<TabKey>("timers");
    const [store, setStore] = useState<ClimaStore>({ timers: [], alarms: [], reminders: [] });
    const [hydrated, setHydrated] = useState(false);
    const [perm, setPerm] = useState<NotificationPermission>("default");
    const [toasts, setToasts] = useState<ToastMsg[]>([]);

    // Ref vivo del store para que el "tick" lea siempre el último valor.
    const storeRef = useRef(store);
    storeRef.current = store;

    // ── Hidratar desde localStorage cuando se conoce el usuario ──
    useEffect(() => {
        const data = loadItems(userId);
        setStore(data);
        setHydrated(true);
        if (notificationsSupported()) setPerm(notificationPermission());
    }, [userId]);

    // ── Persistir en cada cambio (tras hidratar) ──
    useEffect(() => {
        if (!hydrated) return;
        saveItems(store, userId);
    }, [store, userId, hydrated]);

    // ── Aviso in-app (fallback si no hay permiso de notificación) ──
    const pushToast = useCallback((title: string, body?: string) => {
        const id = genId();
        setToasts((t) => [...t, { id, title, body }]);
        if (typeof window !== "undefined") {
            window.setTimeout(() => {
                setToasts((t) => t.filter((x) => x.id !== id));
            }, 8000);
        }
    }, []);

    /** Notifica: navegador si hay permiso, si no aviso in-app. Siempre suena algo. */
    const notify = useCallback((title: string, body?: string) => {
        const shown = fireNotification(title, body);
        if (!shown) pushToast(title, body);
    }, [pushToast]);

    const requestPerm = useCallback(async () => {
        const result = await ensureNotificationPermission();
        setPerm(result);
        if (result === "granted") {
            notify("Notificaciones activadas", "Te avisaremos cuando algo venza.");
        }
    }, [notify]);

    // ── PROGRAMADOR: tick cada segundo (sobrevive a la navegación con la app abierta) ──
    useEffect(() => {
        if (!hydrated || typeof window === "undefined") return;

        const tick = () => {
            const cur = storeRef.current;
            const now = Date.now();
            const nowDate = new Date(now);
            let changed = false;

            // Temporizadores: si corren y vencieron → notificar y detener.
            const timers = cur.timers.map((t) => {
                if (!t.running || t.endsAt == null) return t;
                const remaining = Math.max(0, Math.round((t.endsAt - now) / 1000));
                if (remaining <= 0 && !t.fired) {
                    changed = true;
                    notify("Temporizador finalizado", t.label || "Tiempo cumplido");
                    return { ...t, remainingSec: 0, running: false, endsAt: null, fired: true };
                }
                if (remaining !== t.remainingSec) {
                    changed = true;
                    return { ...t, remainingSec: remaining };
                }
                return t;
            });

            // Alarmas: si llegó su hora → notificar; reprogramar (diaria) o desactivar.
            const alarms = cur.alarms.map((a) => {
                if (isAlarmDue(a, nowDate)) {
                    changed = true;
                    notify("Alarma", a.label || `Son las ${a.time}`);
                    return {
                        ...a,
                        lastFiredDate: localDateKey(nowDate),
                        enabled: a.repeatDaily ? true : false,
                    };
                }
                return a;
            });

            // Recordatorios: si vencieron → notificar; reprogramar repetitivos o marcar.
            const reminders = cur.reminders.map((r) => {
                if (isReminderDue(r, now)) {
                    changed = true;
                    notify(r.label || "Recordatorio", r.note || undefined);
                    const next = nextReminderFire(r);
                    if (next != null) return { ...r, dueAt: next, firedAt: now };
                    return { ...r, firedAt: now };
                }
                return r;
            });

            if (changed) setStore({ timers, alarms, reminders });
        };

        const handle = window.setInterval(tick, 1000);
        tick(); // ejecutar de inmediato al montar
        return () => window.clearInterval(handle);
    }, [hydrated, notify]);

    // ───────────────────── Acciones: Temporizadores ─────────────────────
    const addTimer = useCallback((label: string, durationSec: number) => {
        if (durationSec <= 0) return;
        const t: TimerItem = {
            id: genId(), kind: "timer", label: label.trim() || "Temporizador",
            durationSec, remainingSec: durationSec, endsAt: null, running: false,
            fired: false, createdAt: Date.now(),
        };
        setStore((s) => ({ ...s, timers: [t, ...s.timers] }));
    }, []);

    const toggleTimer = useCallback((id: string) => {
        setStore((s) => ({
            ...s,
            timers: s.timers.map((t) => {
                if (t.id !== id) return t;
                if (t.running) {
                    const remaining = t.endsAt ? Math.max(0, Math.round((t.endsAt - Date.now()) / 1000)) : t.remainingSec;
                    return { ...t, running: false, endsAt: null, remainingSec: remaining };
                }
                const base = t.remainingSec > 0 ? t.remainingSec : t.durationSec;
                return { ...t, running: true, fired: false, remainingSec: base, endsAt: Date.now() + base * 1000 };
            }),
        }));
    }, []);

    const resetTimer = useCallback((id: string) => {
        setStore((s) => ({
            ...s,
            timers: s.timers.map((t) =>
                t.id === id ? { ...t, running: false, endsAt: null, remainingSec: t.durationSec, fired: false } : t,
            ),
        }));
    }, []);

    const removeTimer = useCallback((id: string) => {
        setStore((s) => ({ ...s, timers: s.timers.filter((t) => t.id !== id) }));
    }, []);

    // ───────────────────── Acciones: Alarmas ─────────────────────
    const addAlarm = useCallback((label: string, time: string, repeatDaily: boolean) => {
        if (!/^\d{1,2}:\d{2}$/.test(time)) return;
        const a: AlarmItem = {
            id: genId(), kind: "alarm", label: label.trim() || "Alarma", time,
            enabled: true, repeatDaily, lastFiredDate: null, createdAt: Date.now(),
        };
        setStore((s) => ({ ...s, alarms: [a, ...s.alarms] }));
    }, []);

    const toggleAlarm = useCallback((id: string) => {
        setStore((s) => ({
            ...s,
            alarms: s.alarms.map((a) =>
                a.id === id ? { ...a, enabled: !a.enabled, lastFiredDate: null } : a,
            ),
        }));
    }, []);

    const removeAlarm = useCallback((id: string) => {
        setStore((s) => ({ ...s, alarms: s.alarms.filter((a) => a.id !== id) }));
    }, []);

    // ───────────────────── Acciones: Recordatorios ─────────────────────
    const addReminder = useCallback((label: string, note: string, dueAt: number, repeat: ReminderRepeat) => {
        const r: ReminderItem = {
            id: genId(), kind: "reminder", label: label.trim() || "Recordatorio",
            note: note.trim(), dueAt, repeat, firedAt: null, createdAt: Date.now(),
        };
        setStore((s) => ({ ...s, reminders: [r, ...s.reminders] }));
    }, []);

    const removeReminder = useCallback((id: string) => {
        setStore((s) => ({ ...s, reminders: s.reminders.filter((r) => r.id !== id) }));
    }, []);

    const counts = useMemo(() => ({
        timers: store.timers.length,
        alarms: store.alarms.length,
        reminders: store.reminders.length,
    }), [store]);

    const TABS: { key: TabKey; label: string; icon: typeof TimerIcon; count: number }[] = [
        { key: "timers", label: "Temporizadores", icon: TimerIcon, count: counts.timers },
        { key: "alarms", label: "Alarmas", icon: AlarmClock, count: counts.alarms },
        { key: "reminders", label: "Recordatorios", icon: CalendarClock, count: counts.reminders },
    ];

    return (
        <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-4 sm:p-5 backdrop-blur-xl">
            {/* Cabecera */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <span className="grid size-10 place-items-center rounded-2xl border border-amber-400/30 bg-amber-500/10">
                        <BellRing className="size-5 text-amber-300" />
                    </span>
                    <div>
                        <h2 className="text-base font-bold text-white/90">Recordatorios y alarmas</h2>
                        <p className="text-[12px] text-white/45">
                            Temporizadores, alarmas y recordatorios con avisos del navegador.
                        </p>
                    </div>
                </div>

                {/* Permiso de notificaciones */}
                {notificationsSupported() ? (
                    perm === "granted" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">
                            <Bell className="size-3.5" /> Avisos activos
                        </span>
                    ) : perm === "denied" ? (
                        <span
                            className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/55"
                            title="Has bloqueado las notificaciones; usaremos avisos dentro de la app."
                        >
                            <BellOff className="size-3.5" /> Avisos in-app
                        </span>
                    ) : (
                        <button
                            type="button"
                            onClick={requestPerm}
                            className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/35 bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-200 transition-colors hover:bg-amber-500/25 cursor-pointer"
                        >
                            <Bell className="size-3.5" /> Activar notificaciones
                        </button>
                    )
                ) : null}
            </div>

            {/* Pestañas */}
            <div className="mb-4 flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
                {TABS.map((t) => {
                    const active = tab === t.key;
                    return (
                        <button
                            key={t.key}
                            type="button"
                            onClick={() => setTab(t.key)}
                            className={cn(
                                "relative flex flex-1 items-center justify-center gap-1.5 rounded-full px-2.5 py-2 text-xs font-semibold transition-colors cursor-pointer",
                                active ? "text-amber-200" : "text-white/55 hover:text-white/80",
                            )}
                        >
                            {active && (
                                <motion.span
                                    layoutId="clima-rem-tab"
                                    className="absolute inset-0 rounded-full border border-amber-400/35 bg-amber-500/15"
                                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                                />
                            )}
                            <t.icon className="relative size-4" />
                            <span className="relative hidden sm:inline">{t.label}</span>
                            {t.count > 0 && (
                                <span className="relative rounded-full bg-white/10 px-1.5 text-[10px] text-white/70">{t.count}</span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Contenido por pestaña */}
            <div>
                {tab === "timers" && (
                    <TimersTab
                        timers={store.timers}
                        onAdd={addTimer}
                        onToggle={toggleTimer}
                        onReset={resetTimer}
                        onRemove={removeTimer}
                    />
                )}
                {tab === "alarms" && (
                    <AlarmsTab
                        alarms={store.alarms}
                        onAdd={addAlarm}
                        onToggle={toggleAlarm}
                        onRemove={removeAlarm}
                    />
                )}
                {tab === "reminders" && (
                    <RemindersTab
                        reminders={store.reminders}
                        onAdd={addReminder}
                        onRemove={removeReminder}
                    />
                )}
            </div>

            {/* Stack de avisos in-app (fallback) */}
            <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,22rem)] flex-col gap-2">
                <AnimatePresence>
                    {toasts.map((t) => (
                        <motion.div
                            key={t.id}
                            initial={{ opacity: 0, x: 40 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 40 }}
                            className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-amber-400/30 bg-[#0a1020]/95 p-3.5 shadow-2xl backdrop-blur-xl"
                        >
                            <Zap className="mt-0.5 size-4 shrink-0 text-amber-300" />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-white/90">{t.title}</p>
                                {t.body && <p className="mt-0.5 text-[12px] text-white/55">{t.body}</p>}
                            </div>
                            <button
                                type="button"
                                onClick={() => setToasts((arr) => arr.filter((x) => x.id !== t.id))}
                                className="text-white/40 transition-colors hover:text-white/80 cursor-pointer"
                                aria-label="Cerrar aviso"
                            >
                                <X className="size-4" />
                            </button>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </section>
    );
}

// ════════════════════════════ Pestaña: Temporizadores ══════════════════════

function TimersTab({
    timers, onAdd, onToggle, onReset, onRemove,
}: {
    timers: TimerItem[];
    onAdd: (label: string, durationSec: number) => void;
    onToggle: (id: string) => void;
    onReset: (id: string) => void;
    onRemove: (id: string) => void;
}) {
    const [label, setLabel] = useState("");
    const [min, setMin] = useState("5");
    const [sec, setSec] = useState("0");

    const submit = () => {
        const total = (parseInt(min, 10) || 0) * 60 + (parseInt(sec, 10) || 0);
        if (total <= 0) return;
        onAdd(label, total);
        setLabel("");
        setMin("5");
        setSec("0");
    };

    const PRESETS: { label: string; sec: number }[] = [
        { label: "1 min", sec: 60 },
        { label: "5 min", sec: 300 },
        { label: "10 min", sec: 600 },
        { label: "25 min", sec: 1500 },
    ];

    return (
        <div className="space-y-4">
            {/* Crear */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3.5">
                <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[140px] flex-1 space-y-1">
                        <label className="text-[10px] uppercase tracking-wider text-white/45">Etiqueta</label>
                        <input
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder="p. ej. Té, descanso…"
                            className="h-9 w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 text-sm text-white placeholder-white/35 outline-none focus:border-amber-400/40"
                        />
                    </div>
                    <div className="w-16 space-y-1">
                        <label className="text-[10px] uppercase tracking-wider text-white/45">Min</label>
                        <input
                            type="number" min={0} value={min}
                            onChange={(e) => setMin(e.target.value)}
                            className="h-9 w-full rounded-lg border border-white/12 bg-white/[0.04] px-2 text-center text-sm text-white outline-none focus:border-amber-400/40"
                        />
                    </div>
                    <div className="w-16 space-y-1">
                        <label className="text-[10px] uppercase tracking-wider text-white/45">Seg</label>
                        <input
                            type="number" min={0} max={59} value={sec}
                            onChange={(e) => setSec(e.target.value)}
                            className="h-9 w-full rounded-lg border border-white/12 bg-white/[0.04] px-2 text-center text-sm text-white outline-none focus:border-amber-400/40"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={submit}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 text-sm font-semibold text-white transition-colors hover:bg-amber-500 cursor-pointer"
                    >
                        <Plus className="size-4" /> Añadir
                    </button>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {PRESETS.map((p) => (
                        <button
                            key={p.sec}
                            type="button"
                            onClick={() => onAdd(label, p.sec)}
                            className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-white/55 transition-colors hover:border-amber-400/35 hover:text-amber-200 cursor-pointer"
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Lista */}
            {timers.length === 0 ? (
                <EmptyState icon={TimerIcon} title="Sin temporizadores" hint="Crea uno con una duración y púlsalo para iniciar la cuenta atrás." />
            ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                    {timers.map((t) => {
                        const done = t.remainingSec <= 0 && !t.running;
                        return (
                            <div
                                key={t.id}
                                className={cn(
                                    "rounded-2xl border p-3.5 transition-colors",
                                    t.running ? "border-amber-400/40 bg-amber-500/[0.06]"
                                        : done ? "border-emerald-500/30 bg-emerald-500/[0.05]" : "border-white/10 bg-white/[0.02]",
                                )}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <p className="truncate text-sm font-semibold text-white/85">{t.label}</p>
                                    <button
                                        type="button" onClick={() => onRemove(t.id)}
                                        className="text-rose-300/70 transition-colors hover:text-rose-300 cursor-pointer" aria-label="Eliminar"
                                    >
                                        <Trash2 className="size-4" />
                                    </button>
                                </div>
                                <div className={cn(
                                    "my-2 text-center font-mono text-3xl font-light tabular-nums",
                                    done ? "text-emerald-300" : "text-white",
                                )}>
                                    {formatCountdown(t.remainingSec)}
                                </div>
                                <div className="flex items-center justify-center gap-2">
                                    <button
                                        type="button" onClick={() => onToggle(t.id)}
                                        className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/35 bg-amber-500/15 px-3.5 py-1.5 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-500/25 cursor-pointer"
                                    >
                                        {t.running ? <><Pause className="size-3.5" /> Pausar</> : <><Play className="size-3.5" /> Iniciar</>}
                                    </button>
                                    <button
                                        type="button" onClick={() => onReset(t.id)}
                                        className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1.5 text-xs font-semibold text-white/60 transition-colors hover:text-white/85 cursor-pointer"
                                    >
                                        <RotateCcw className="size-3.5" /> Reiniciar
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ════════════════════════════ Pestaña: Alarmas ═════════════════════════════

function AlarmsTab({
    alarms, onAdd, onToggle, onRemove,
}: {
    alarms: AlarmItem[];
    onAdd: (label: string, time: string, repeatDaily: boolean) => void;
    onToggle: (id: string) => void;
    onRemove: (id: string) => void;
}) {
    const [label, setLabel] = useState("");
    const [time, setTime] = useState("08:00");
    const [daily, setDaily] = useState(false);

    const submit = () => {
        if (!/^\d{1,2}:\d{2}$/.test(time)) return;
        onAdd(label, time, daily);
        setLabel("");
    };

    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3.5">
                <div className="flex flex-wrap items-end gap-2">
                    <div className="w-28 space-y-1">
                        <label className="text-[10px] uppercase tracking-wider text-white/45">Hora</label>
                        <input
                            type="time" value={time}
                            onChange={(e) => setTime(e.target.value)}
                            className="h-9 w-full rounded-lg border border-white/12 bg-white/[0.04] px-2 text-sm text-white outline-none [color-scheme:dark] focus:border-amber-400/40"
                        />
                    </div>
                    <div className="min-w-[140px] flex-1 space-y-1">
                        <label className="text-[10px] uppercase tracking-wider text-white/45">Etiqueta</label>
                        <input
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder="p. ej. Despertar, reunión…"
                            className="h-9 w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 text-sm text-white placeholder-white/35 outline-none focus:border-amber-400/40"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => setDaily((d) => !d)}
                        className={cn(
                            "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors cursor-pointer",
                            daily ? "border-amber-400/40 bg-amber-500/15 text-amber-200" : "border-white/12 text-white/55 hover:text-white/80",
                        )}
                    >
                        <Repeat className="size-3.5" /> Diaria
                    </button>
                    <button
                        type="button"
                        onClick={submit}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 text-sm font-semibold text-white transition-colors hover:bg-amber-500 cursor-pointer"
                    >
                        <Plus className="size-4" /> Añadir
                    </button>
                </div>
            </div>

            {alarms.length === 0 ? (
                <EmptyState icon={AlarmClock} title="Sin alarmas" hint="Crea una alarma para que suene a una hora concreta. Mantén la app abierta para recibir el aviso." />
            ) : (
                <div className="space-y-2">
                    {alarms.map((a) => (
                        <div
                            key={a.id}
                            className={cn(
                                "flex items-center gap-3 rounded-2xl border p-3.5 transition-colors",
                                a.enabled ? "border-white/10 bg-white/[0.02]" : "border-white/8 bg-white/[0.01] opacity-60",
                            )}
                        >
                            <div className="font-mono text-2xl font-light tabular-nums text-white">{a.time}</div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-white/85">{a.label}</p>
                                <p className="flex items-center gap-1.5 text-[11px] text-white/45">
                                    {a.repeatDaily ? <><Repeat className="size-3" /> Cada día</> : <><Clock className="size-3" /> Una vez</>}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => onToggle(a.id)}
                                className={cn(
                                    "relative h-6 w-11 shrink-0 rounded-full border transition-colors cursor-pointer",
                                    a.enabled ? "border-amber-400/40 bg-amber-500/30" : "border-white/15 bg-white/10",
                                )}
                                aria-label={a.enabled ? "Desactivar alarma" : "Activar alarma"}
                            >
                                <span className={cn(
                                    "absolute top-0.5 size-5 rounded-full bg-white transition-all",
                                    a.enabled ? "left-[1.45rem]" : "left-0.5",
                                )} />
                            </button>
                            <button
                                type="button" onClick={() => onRemove(a.id)}
                                className="text-rose-300/70 transition-colors hover:text-rose-300 cursor-pointer" aria-label="Eliminar"
                            >
                                <Trash2 className="size-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ════════════════════════════ Pestaña: Recordatorios ═══════════════════════

function RemindersTab({
    reminders, onAdd, onRemove,
}: {
    reminders: ReminderItem[];
    onAdd: (label: string, note: string, dueAt: number, repeat: ReminderRepeat) => void;
    onRemove: (id: string) => void;
}) {
    const [label, setLabel] = useState("");
    const [note, setNote] = useState("");
    const [when, setWhen] = useState(isoToLocalInput(null));
    const [repeat, setRepeat] = useState<ReminderRepeat>("ninguna");

    const submit = () => {
        const ms = localInputToMs(when);
        if (!ms || !label.trim()) return;
        onAdd(label, note, ms, repeat);
        setLabel("");
        setNote("");
        setWhen(isoToLocalInput(null));
        setRepeat("ninguna");
    };

    const sorted = useMemo(
        () => [...reminders].sort((a, b) => a.dueAt - b.dueAt),
        [reminders],
    );

    return (
        <div className="space-y-4">
            <div className="space-y-2.5 rounded-2xl border border-white/10 bg-white/[0.02] p-3.5">
                <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="¿Qué quieres recordar?"
                    className="h-9 w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 text-sm text-white placeholder-white/35 outline-none focus:border-amber-400/40"
                />
                <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Nota (opcional)…"
                    className="min-h-[56px] w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder-white/35 outline-none focus:border-amber-400/40"
                />
                <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[180px] flex-1 space-y-1">
                        <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/45">
                            <CalendarClock className="size-3" /> Fecha y hora
                        </label>
                        <input
                            type="datetime-local" value={when}
                            onChange={(e) => setWhen(e.target.value)}
                            className="h-9 w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 text-sm text-white outline-none [color-scheme:dark] focus:border-amber-400/40"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/45">
                            <Repeat className="size-3" /> Repetir
                        </label>
                        <select
                            value={repeat}
                            onChange={(e) => setRepeat(e.target.value as ReminderRepeat)}
                            className="h-9 rounded-lg border border-white/12 bg-white/[0.04] px-2 text-sm text-white outline-none [color-scheme:dark] focus:border-amber-400/40"
                        >
                            {REPEAT_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value} className="bg-[#0a1020]">{o.label}</option>
                            ))}
                        </select>
                    </div>
                    <button
                        type="button"
                        onClick={submit}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 text-sm font-semibold text-white transition-colors hover:bg-amber-500 cursor-pointer"
                    >
                        <Plus className="size-4" /> Añadir
                    </button>
                </div>
            </div>

            {sorted.length === 0 ? (
                <EmptyState icon={CalendarClock} title="Sin recordatorios" hint="Crea un recordatorio con fecha y hora; te avisaremos cuando llegue el momento." />
            ) : (
                <div className="space-y-2">
                    {sorted.map((r) => {
                        const overdue = r.dueAt < Date.now() && r.repeat === "ninguna";
                        const done = r.firedAt != null && r.repeat === "ninguna";
                        return (
                            <div
                                key={r.id}
                                className={cn(
                                    "flex items-start gap-3 rounded-2xl border p-3.5 transition-colors",
                                    done ? "border-emerald-500/25 bg-emerald-500/[0.04] opacity-80"
                                        : overdue ? "border-rose-500/30 bg-rose-500/[0.04]" : "border-white/10 bg-white/[0.02]",
                                )}
                            >
                                <span className={cn(
                                    "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border",
                                    done ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300" : "border-amber-400/30 bg-amber-500/10 text-amber-300",
                                )}>
                                    {done ? <CheckCircle2 className="size-4" /> : <BellRing className="size-4" />}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className={cn("truncate text-sm font-semibold", done ? "text-white/60 line-through" : "text-white/85")}>{r.label}</p>
                                    {r.note && <p className="mt-0.5 line-clamp-2 text-[12px] text-white/55">{r.note}</p>}
                                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                        <span className={cn(
                                            "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold",
                                            overdue ? "border-rose-400/30 bg-rose-500/10 text-rose-200" : "border-white/10 bg-white/[0.03] text-white/60",
                                        )}>
                                            <Clock className="size-3" /> {formatDateTime(r.dueAt)}
                                        </span>
                                        {r.repeat !== "ninguna" && (
                                            <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-white/55">
                                                <Repeat className="size-3" /> {r.repeat === "diario" ? "Diario" : "Semanal"}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <button
                                    type="button" onClick={() => onRemove(r.id)}
                                    className="text-rose-300/70 transition-colors hover:text-rose-300 cursor-pointer" aria-label="Eliminar"
                                >
                                    <Trash2 className="size-4" />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ────────────────────────────── Estado vacío ───────────────────────────────

function EmptyState({
    icon: Icon, title, hint,
}: {
    icon: typeof Inbox;
    title: string;
    hint: string;
}) {
    return (
        <div className="grid place-items-center gap-2 rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-4 py-10 text-center">
            <Icon className="size-8 text-white/25" />
            <p className="text-sm font-semibold text-white/70">{title}</p>
            <p className="max-w-sm text-[12px] text-white/45">{hint}</p>
        </div>
    );
}

export default RemindersPanel;

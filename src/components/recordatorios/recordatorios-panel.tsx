"use client";

// ════════════════════════════════════════════════════════════════════════════
// RecordatoriosPanel — Gestión completa de tareas programadas y recordatorios
// ----------------------------------------------------------------------------
// UI real de CRUD sobre la tabla `scheduled_tasks` que ya consume el "tick"
// autónomo de fondo (pg_cron → bot `/api/imagine_tick`). Cuando una tarea vence
// (`run_at <= now()` y `status='pendiente'`), el tick la dispara hacia la tabla
// `notifications` y —según su `recurrence`— la reprograma (cada hora / diario /
// semanal / mensual) o la marca como `hecho` (una vez). Desde aquí el usuario
// puede crear, editar y eliminar esas tareas sin tocar la base de datos a mano.
//
// Campos editables: title, body, run_at (fecha-hora), recurrence, link, payload
// (acción opcional: abrir una pizarra / publicación / memoria). owner-scoped y
// en TIEMPO REAL (Supabase Realtime sobre `scheduled_tasks`, RLS aplica).
//
// SSR-safe: nada de `window` en el cuerpo del módulo; los accesos van guardados.
// ════════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRealtime } from "@/lib/realtime/realtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    BellRing, AlarmClock, Plus, Trash2, Pencil, Check, X, Clock, CalendarClock,
    Repeat, Link2, ExternalLink, Loader2, CheckCircle2, CircleDot, Inbox,
    LayoutDashboard, PenSquare, BookOpen, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ───────────────────────────── Tipos ────────────────────────────────────────

export type Recurrence = "una_vez" | "cada_hora" | "diario" | "semanal" | "mensual";
export type TaskStatus = "pendiente" | "hecho";
export type PayloadTarget = "" | "pizarra" | "publicacion" | "memoria";

export interface ScheduledTask {
    id: string;
    owner: string;
    kind: string | null;
    title: string;
    body: string | null;
    run_at: string;            // timestamptz ISO
    recurrence: string | null; // ver Recurrence
    payload: Record<string, unknown> | null;
    status: string | null;     // ver TaskStatus
    link: string | null;
    created_at?: string;
    updated_at?: string;
}

// ─────────────────────────── Constantes UI ──────────────────────────────────

const RECURRENCE_OPTIONS: { value: Recurrence; label: string; hint: string }[] = [
    { value: "una_vez", label: "Una vez", hint: "Salta una sola vez y se marca como hecha." },
    { value: "cada_hora", label: "Cada hora", hint: "Se reprograma +1 hora tras saltar." },
    { value: "diario", label: "Diario", hint: "Se reprograma +1 día tras saltar." },
    { value: "semanal", label: "Semanal", hint: "Se reprograma +1 semana tras saltar." },
    { value: "mensual", label: "Mensual", hint: "Se reprograma +1 mes tras saltar." },
];

const RECURRENCE_LABEL: Record<string, string> = {
    una_vez: "Una vez",
    cada_hora: "Cada hora",
    diario: "Diario",
    semanal: "Semanal",
    mensual: "Mensual",
};

const PAYLOAD_OPTIONS: { value: PayloadTarget; label: string; icon: typeof LayoutDashboard }[] = [
    { value: "", label: "Sin acción", icon: CircleDot },
    { value: "pizarra", label: "Abrir una pizarra", icon: LayoutDashboard },
    { value: "publicacion", label: "Abrir una publicación", icon: PenSquare },
    { value: "memoria", label: "Abrir una memoria", icon: BookOpen },
];

// ─────────────────────────── Utilidades fecha ───────────────────────────────

/** Convierte un ISO (o null) a valor de <input type="datetime-local"> en hora local. */
function isoToLocalInput(iso?: string | null): string {
    const d = iso ? new Date(iso) : new Date(Date.now() + 60 * 60 * 1000); // por defecto: dentro de 1h
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Convierte un valor de datetime-local (hora local) a ISO con zona. */
function localInputToIso(value: string): string | null {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function formatRunAt(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("es-ES", {
        weekday: "short", day: "2-digit", month: "short",
        hour: "2-digit", minute: "2-digit",
    });
}

/** Distancia humana relativa («en 3 h», «hace 2 días», «ahora»). */
function relativeTime(iso: string): string {
    const d = new Date(iso).getTime();
    if (Number.isNaN(d)) return "";
    const diff = d - Date.now();
    const abs = Math.abs(diff);
    const mins = Math.round(abs / 60000);
    const fmt = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : unit === "mes" ? "es" : "s"}`;
    let txt: string;
    if (mins < 1) txt = "menos de un minuto";
    else if (mins < 60) txt = fmt(mins, "minuto");
    else if (mins < 1440) txt = fmt(Math.round(mins / 60), "hora");
    else if (mins < 43200) txt = fmt(Math.round(mins / 1440), "día");
    else txt = fmt(Math.round(mins / 43200), "mes");
    return diff >= 0 ? `en ${txt}` : `hace ${txt}`;
}

// ───────────────────────── Estado del formulario ────────────────────────────

interface FormState {
    title: string;
    body: string;
    runAtLocal: string;
    recurrence: Recurrence;
    link: string;
    payloadTarget: PayloadTarget;
    payloadRef: string;   // id/slug/ruta del objetivo (pizarra/publicación/memoria)
}

function emptyForm(): FormState {
    return {
        title: "",
        body: "",
        runAtLocal: isoToLocalInput(null),
        recurrence: "una_vez",
        link: "",
        payloadTarget: "",
        payloadRef: "",
    };
}

function formFromTask(t: ScheduledTask): FormState {
    const payload = (t.payload ?? {}) as Record<string, unknown>;
    const target = (typeof payload.target === "string" ? payload.target : "") as PayloadTarget;
    const ref = typeof payload.ref === "string" ? payload.ref
        : typeof payload.id === "string" ? payload.id : "";
    return {
        title: t.title ?? "",
        body: t.body ?? "",
        runAtLocal: isoToLocalInput(t.run_at),
        recurrence: (RECURRENCE_LABEL[t.recurrence ?? ""] ? (t.recurrence as Recurrence) : "una_vez"),
        link: t.link ?? "",
        payloadTarget: target,
        payloadRef: ref,
    };
}

/** Construye el jsonb `payload` a partir del formulario (o null si no hay acción). */
function buildPayload(form: FormState): Record<string, unknown> | null {
    if (!form.payloadTarget) return null;
    const p: Record<string, unknown> = { target: form.payloadTarget };
    if (form.payloadRef.trim()) p.ref = form.payloadRef.trim();
    return p;
}

// ───────────────────────────── Sub-formulario ───────────────────────────────

function TaskForm({
    initial, saving, onCancel, onSubmit, submitLabel,
}: {
    initial: FormState;
    saving: boolean;
    onCancel: () => void;
    onSubmit: (form: FormState) => void;
    submitLabel: string;
}) {
    const [form, setForm] = useState<FormState>(initial);
    const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

    const recHint = RECURRENCE_OPTIONS.find((r) => r.value === form.recurrence)?.hint;
    const canSave = form.title.trim().length > 0 && !!form.runAtLocal;

    return (
        <div className="rounded-2xl border border-amber-400/20 bg-gradient-to-br from-amber-500/[0.06] to-transparent p-4 space-y-3">
            <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-amber-300" />
                <span className="text-sm font-semibold text-white/90">{submitLabel === "Crear" ? "Nuevo recordatorio" : "Editar recordatorio"}</span>
            </div>

            {/* Título */}
            <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-white/50">Título</label>
                <Input
                    value={form.title}
                    onChange={(e) => set("title", e.target.value)}
                    placeholder="p. ej. Revisar la propuesta de agua comunitaria"
                    className="bg-background/40 border-white/10 h-9"
                />
            </div>

            {/* Cuerpo */}
            <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-white/50">Nota (opcional)</label>
                <Textarea
                    value={form.body}
                    onChange={(e) => set("body", e.target.value)}
                    placeholder="Detalles que aparecerán en la notificación cuando salte…"
                    className="bg-background/40 border-white/10 min-h-[64px] text-sm"
                />
            </div>

            {/* Fecha-hora + recurrencia */}
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                    <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/50">
                        <CalendarClock className="size-3" /> Fecha y hora
                    </label>
                    <Input
                        type="datetime-local"
                        value={form.runAtLocal}
                        onChange={(e) => set("runAtLocal", e.target.value)}
                        className="bg-background/40 border-white/10 h-9 text-sm [color-scheme:dark]"
                    />
                </div>
                <div className="space-y-1">
                    <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/50">
                        <Repeat className="size-3" /> Recurrencia
                    </label>
                    <Select value={form.recurrence} onValueChange={(v) => set("recurrence", v as Recurrence)}>
                        <SelectTrigger className="bg-background/40 border-white/10 h-9 text-sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {RECURRENCE_OPTIONS.map((r) => (
                                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            {recHint && <p className="text-[11px] text-white/45 -mt-1">{recHint}</p>}

            {/* Enlace */}
            <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/50">
                    <Link2 className="size-3" /> Enlace (opcional)
                </label>
                <Input
                    value={form.link}
                    onChange={(e) => set("link", e.target.value)}
                    placeholder="/pizarra?id=… o https://…"
                    className="bg-background/40 border-white/10 h-9 text-sm"
                />
            </div>

            {/* Acción / payload */}
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-white/50">Acción al saltar</label>
                    <Select value={form.payloadTarget || "__none"} onValueChange={(v) => set("payloadTarget", (v === "__none" ? "" : v) as PayloadTarget)}>
                        <SelectTrigger className="bg-background/40 border-white/10 h-9 text-sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {PAYLOAD_OPTIONS.map((p) => (
                                <SelectItem key={p.value || "__none"} value={p.value || "__none"}>{p.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                {form.payloadTarget && (
                    <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider text-white/50">
                            {form.payloadTarget === "pizarra" ? "ID de la pizarra"
                                : form.payloadTarget === "publicacion" ? "ID de la publicación"
                                    : "ID de la memoria"}
                        </label>
                        <Input
                            value={form.payloadRef}
                            onChange={(e) => set("payloadRef", e.target.value)}
                            placeholder="identificador…"
                            className="bg-background/40 border-white/10 h-9 text-sm"
                        />
                    </div>
                )}
            </div>

            {/* Acciones */}
            <div className="flex items-center justify-end gap-2 pt-1">
                <Button size="sm" variant="ghost" className="gap-1.5" onClick={onCancel} disabled={saving}>
                    <X className="size-3.5" /> Cancelar
                </Button>
                <Button
                    size="sm"
                    className="btn-pill gap-1.5 bg-amber-600 hover:bg-amber-500 text-white"
                    disabled={!canSave || saving}
                    onClick={() => onSubmit(form)}
                >
                    {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                    {submitLabel}
                </Button>
            </div>
        </div>
    );
}

// ───────────────────────────── Tarjeta de tarea ─────────────────────────────

function TaskCard({
    task, onEdit, onDelete, onToggleStatus, busy,
}: {
    task: ScheduledTask;
    onEdit: () => void;
    onDelete: () => void;
    onToggleStatus: () => void;
    busy: boolean;
}) {
    const done = (task.status ?? "pendiente") === "hecho";
    const overdue = !done && new Date(task.run_at).getTime() < Date.now();
    const rec = RECURRENCE_LABEL[task.recurrence ?? "una_vez"] ?? "Una vez";
    const payload = (task.payload ?? {}) as Record<string, unknown>;
    const target = typeof payload.target === "string" ? payload.target : "";

    return (
        <div
            className={cn(
                "group rounded-2xl border bg-white/[0.02] p-3.5 transition-colors",
                done ? "border-emerald-500/20 opacity-80"
                    : overdue ? "border-rose-500/30" : "border-white/10 hover:border-amber-400/30",
            )}
        >
            <div className="flex items-start gap-3">
                <button
                    type="button"
                    onClick={onToggleStatus}
                    disabled={busy}
                    title={done ? "Marcar como pendiente" : "Marcar como hecha"}
                    className={cn(
                        "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border transition-colors",
                        done ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
                            : "border-white/15 bg-white/[0.03] text-white/40 hover:text-amber-200 hover:border-amber-400/40",
                    )}
                >
                    {done ? <CheckCircle2 className="size-4" /> : <CircleDot className="size-4" />}
                </button>

                <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-sm font-semibold", done ? "text-white/60 line-through" : "text-white/90")}>
                        {task.title}
                    </p>
                    {task.body && <p className="mt-0.5 line-clamp-2 text-[12px] text-white/55">{task.body}</p>}

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className={cn(
                            "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold",
                            overdue ? "border-rose-400/30 bg-rose-500/10 text-rose-200"
                                : "border-white/10 bg-white/[0.03] text-white/60",
                        )}>
                            {overdue ? <AlarmClock className="size-3" /> : <Clock className="size-3" />}
                            {formatRunAt(task.run_at)}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-white/55">
                            <Repeat className="size-3" /> {rec}
                        </span>
                        {!done && (
                            <span className="text-[10px] text-white/40">{relativeTime(task.run_at)}</span>
                        )}
                        {target && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-violet-400/25 bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-200">
                                {target === "pizarra" ? <LayoutDashboard className="size-3" />
                                    : target === "publicacion" ? <PenSquare className="size-3" />
                                        : <BookOpen className="size-3" />}
                                {target}
                            </span>
                        )}
                        {task.link && (
                            <a
                                href={task.link}
                                target={task.link.startsWith("http") ? "_blank" : undefined}
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-md border border-cyan-400/25 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-200 hover:bg-cyan-500/20"
                            >
                                <ExternalLink className="size-3" /> Enlace
                            </a>
                        )}
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button size="icon" variant="ghost" className="size-7 rounded-lg" onClick={onEdit} disabled={busy} title="Editar">
                        <Pencil className="size-3.5" />
                    </Button>
                    <Button
                        size="icon" variant="ghost"
                        className="size-7 rounded-lg text-rose-300/80 hover:text-rose-300 hover:bg-rose-500/10"
                        onClick={onDelete} disabled={busy} title="Eliminar"
                    >
                        <Trash2 className="size-3.5" />
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ───────────────────────────── Componente raíz ──────────────────────────────

export function RecordatoriosPanel() {
    const [userId, setUserId] = useState<string | null>(null);
    const [tasks, setTasks] = useState<ScheduledTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [filter, setFilter] = useState<"todos" | "pendiente" | "hecho">("todos");

    const load = useCallback(async () => {
        try {
            const supabase = createClient();
            const { data: au } = await supabase.auth.getUser();
            const uid = au?.user?.id ?? null;
            setUserId(uid);
            if (uid) {
                const { data } = await supabase
                    .from("scheduled_tasks")
                    .select("*")
                    .eq("owner", uid)
                    .order("run_at", { ascending: true });
                setTasks((data as ScheduledTask[]) ?? []);
            }
        } catch {
            /* sin sesión: lista vacía */
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    // TIEMPO REAL: la lista se sincroniza en vivo entre dispositivos cuando
    // cambia `scheduled_tasks` del propietario actual (RLS aplica). También
    // refleja en vivo las reprogramaciones que hace el tick autónomo.
    useRealtime(
        "scheduled_tasks",
        { filter: userId ? `owner=eq.${userId}` : undefined },
        () => void load(),
    );

    // ── crear ──
    const create = useCallback(async (form: FormState) => {
        if (!userId || !form.title.trim()) return;
        const runIso = localInputToIso(form.runAtLocal);
        if (!runIso) return;
        setSaving(true);
        try {
            const supabase = createClient();
            await supabase.from("scheduled_tasks").insert({
                owner: userId,
                kind: "recordatorio",
                title: form.title.trim(),
                body: form.body.trim() || null,
                run_at: runIso,
                recurrence: form.recurrence,
                payload: buildPayload(form),
                status: "pendiente",
                link: form.link.trim() || null,
            });
            setCreating(false);
            await load();
        } catch {
            /* error de red/permiso */
        } finally {
            setSaving(false);
        }
    }, [userId, load]);

    // ── editar ──
    const update = useCallback(async (id: string, form: FormState) => {
        const runIso = localInputToIso(form.runAtLocal);
        if (!runIso || !form.title.trim()) return;
        setSaving(true);
        try {
            const supabase = createClient();
            await supabase.from("scheduled_tasks").update({
                title: form.title.trim(),
                body: form.body.trim() || null,
                run_at: runIso,
                recurrence: form.recurrence,
                payload: buildPayload(form),
                link: form.link.trim() || null,
                updated_at: new Date().toISOString(),
            }).eq("id", id);
            setEditingId(null);
            await load();
        } catch {
            /* error */
        } finally {
            setSaving(false);
        }
    }, [load]);

    // ── eliminar ──
    const remove = useCallback(async (id: string) => {
        setBusyId(id);
        try {
            const supabase = createClient();
            await supabase.from("scheduled_tasks").delete().eq("id", id);
            if (editingId === id) setEditingId(null);
            await load();
        } catch {
            /* error */
        } finally {
            setBusyId(null);
        }
    }, [editingId, load]);

    // ── alternar estado (pendiente ↔ hecho) ──
    const toggleStatus = useCallback(async (t: ScheduledTask) => {
        setBusyId(t.id);
        const next = (t.status ?? "pendiente") === "hecho" ? "pendiente" : "hecho";
        try {
            const supabase = createClient();
            await supabase.from("scheduled_tasks")
                .update({ status: next, updated_at: new Date().toISOString() })
                .eq("id", t.id);
            await load();
        } catch {
            /* error */
        } finally {
            setBusyId(null);
        }
    }, [load]);

    const counts = useMemo(() => {
        let pend = 0, done = 0;
        for (const t of tasks) ((t.status ?? "pendiente") === "hecho" ? done++ : pend++);
        return { pend, done, total: tasks.length };
    }, [tasks]);

    const visible = useMemo(() => {
        if (filter === "todos") return tasks;
        return tasks.filter((t) => (t.status ?? "pendiente") === filter);
    }, [tasks, filter]);

    return (
        <div className="space-y-4">
            {/* Cabecera */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <span className="grid size-10 place-items-center rounded-2xl border border-amber-400/30 bg-amber-500/10">
                        <BellRing className="size-5 text-amber-300" />
                    </span>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-base font-bold text-white/90">Recordatorios y tareas programadas</h2>
                            <Badge variant="outline" className="border-white/10 text-[10px] text-white/60">
                                {counts.pend} pendientes
                            </Badge>
                        </div>
                        <p className="text-[12px] text-white/45">
                            Cuando una tarea vence, salta como notificación. Las repetitivas se reprograman solas.
                        </p>
                    </div>
                </div>
                {!creating && (
                    <Button
                        size="sm"
                        className="btn-pill gap-1.5 bg-amber-600 hover:bg-amber-500 text-white"
                        onClick={() => { setEditingId(null); setCreating(true); }}
                        disabled={!userId}
                    >
                        <Plus className="size-4" /> Nuevo
                    </Button>
                )}
            </div>

            {/* Sin sesión */}
            {!loading && !userId && (
                <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.02] p-8 text-center">
                    <AlarmClock className="mx-auto size-8 text-white/25" />
                    <p className="mt-3 text-sm text-white/60">Inicia sesión para crear y gestionar tus recordatorios.</p>
                </div>
            )}

            {/* Formulario de creación */}
            {creating && userId && (
                <TaskForm
                    initial={emptyForm()}
                    saving={saving}
                    submitLabel="Crear"
                    onCancel={() => setCreating(false)}
                    onSubmit={create}
                />
            )}

            {/* Filtros */}
            {userId && counts.total > 0 && (
                <div className="flex items-center gap-1.5">
                    {([
                        ["todos", `Todas · ${counts.total}`],
                        ["pendiente", `Pendientes · ${counts.pend}`],
                        ["hecho", `Hechas · ${counts.done}`],
                    ] as const).map(([k, label]) => (
                        <button
                            key={k}
                            onClick={() => setFilter(k)}
                            className={cn(
                                "rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors",
                                filter === k
                                    ? "border-amber-400/40 bg-amber-500/15 text-amber-200"
                                    : "border-white/10 text-white/55 hover:text-white/80",
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            )}

            {/* Lista */}
            {loading ? (
                <div className="space-y-2">
                    {[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-white/5" />)}
                </div>
            ) : userId && visible.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.02] p-10 text-center">
                    <Inbox className="mx-auto size-9 text-white/25" />
                    <p className="mt-3 text-sm font-semibold text-white/70">
                        {filter === "todos" ? "Aún no tienes recordatorios" : "Nada por aquí"}
                    </p>
                    <p className="mt-1 text-[12px] text-white/45">
                        {filter === "todos"
                            ? "Crea tu primer recordatorio: una tarea con fecha, hora y, si quieres, recurrencia."
                            : "Cambia de filtro para ver otras tareas."}
                    </p>
                    {filter === "todos" && (
                        <Button
                            size="sm"
                            className="btn-pill mt-4 gap-1.5 bg-amber-600 hover:bg-amber-500 text-white"
                            onClick={() => setCreating(true)}
                        >
                            <Plus className="size-4" /> Crear recordatorio
                        </Button>
                    )}
                </div>
            ) : (
                <div className="space-y-2">
                    {visible.map((t) =>
                        editingId === t.id ? (
                            <TaskForm
                                key={t.id}
                                initial={formFromTask(t)}
                                saving={saving}
                                submitLabel="Guardar"
                                onCancel={() => setEditingId(null)}
                                onSubmit={(form) => update(t.id, form)}
                            />
                        ) : (
                            <TaskCard
                                key={t.id}
                                task={t}
                                busy={busyId === t.id}
                                onEdit={() => { setCreating(false); setEditingId(t.id); }}
                                onDelete={() => remove(t.id)}
                                onToggleStatus={() => toggleStatus(t)}
                            />
                        ),
                    )}
                </div>
            )}
        </div>
    );
}

export default RecordatoriosPanel;

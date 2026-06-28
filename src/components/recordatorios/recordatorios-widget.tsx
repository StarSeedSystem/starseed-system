"use client";

// ════════════════════════════════════════════════════════════════════════════
// RecordatoriosWidget — Sección compacta de próximos recordatorios
// ----------------------------------------------------------------------------
// Vista resumida de la tabla `scheduled_tasks` (las mismas tareas que dispara el
// tick autónomo). Muestra los próximos N recordatorios PENDIENTES del usuario,
// permite marcarlos como hechos y crear uno rápido (título + fecha-hora). Para
// la gestión completa (recurrencia, payload, edición) enlaza a /recordatorios.
//
// owner-scoped + TIEMPO REAL. SSR-safe. Pensado para el Dashboard / perfil.
// ════════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { useRealtime } from "@/lib/realtime/realtime";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    BellRing, Plus, Clock, AlarmClock, CheckCircle2, CircleDot, ArrowRight, Loader2, Inbox, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ScheduledTaskRow {
    id: string;
    owner: string;
    title: string;
    run_at: string;
    recurrence: string | null;
    status: string | null;
}

function formatShort(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function defaultLocal(): string {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function RecordatoriosWidget({ limit = 4 }: { limit?: number }) {
    const [userId, setUserId] = useState<string | null>(null);
    const [tasks, setTasks] = useState<ScheduledTaskRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [quickOpen, setQuickOpen] = useState(false);
    const [qTitle, setQTitle] = useState("");
    const [qWhen, setQWhen] = useState(defaultLocal());
    const [saving, setSaving] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const supabase = createClient();
            const { data: au } = await supabase.auth.getUser();
            const uid = au?.user?.id ?? null;
            setUserId(uid);
            if (uid) {
                const { data } = await supabase
                    .from("scheduled_tasks")
                    .select("id,owner,title,run_at,recurrence,status")
                    .eq("owner", uid)
                    .eq("status", "pendiente")
                    .order("run_at", { ascending: true })
                    .limit(50);
                setTasks((data as ScheduledTaskRow[]) ?? []);
            }
        } catch {
            /* sin sesión */
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);
    useRealtime("scheduled_tasks", { filter: userId ? `owner=eq.${userId}` : undefined }, () => void load());

    const quickAdd = useCallback(async () => {
        if (!userId || !qTitle.trim()) return;
        const d = new Date(qWhen);
        if (Number.isNaN(d.getTime())) return;
        setSaving(true);
        try {
            const supabase = createClient();
            await supabase.from("scheduled_tasks").insert({
                owner: userId,
                kind: "recordatorio",
                title: qTitle.trim(),
                body: null,
                run_at: d.toISOString(),
                recurrence: "una_vez",
                payload: null,
                status: "pendiente",
                link: null,
            });
            setQTitle("");
            setQWhen(defaultLocal());
            setQuickOpen(false);
            await load();
        } catch {
            /* error */
        } finally {
            setSaving(false);
        }
    }, [userId, qTitle, qWhen, load]);

    const markDone = useCallback(async (id: string) => {
        setBusyId(id);
        try {
            const supabase = createClient();
            await supabase.from("scheduled_tasks")
                .update({ status: "hecho", updated_at: new Date().toISOString() })
                .eq("id", id);
            await load();
        } catch {
            /* error */
        } finally {
            setBusyId(null);
        }
    }, [load]);

    const visible = useMemo(() => tasks.slice(0, limit), [tasks, limit]);

    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                    <CardTitle className="font-headline flex items-center gap-2">
                        <BellRing className="size-4 text-amber-300" /> Recordatorios
                    </CardTitle>
                    <CardDescription>Tus próximas tareas programadas.</CardDescription>
                </div>
                <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 gap-1.5 border-white/15 text-xs"
                    onClick={() => setQuickOpen((v) => !v)}
                    disabled={!userId}
                >
                    {quickOpen ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
                    {quickOpen ? "Cerrar" : "Añadir"}
                </Button>
            </CardHeader>
            <CardContent className="space-y-3">
                {/* Alta rápida */}
                {quickOpen && userId && (
                    <div className="space-y-2 rounded-xl border border-amber-400/20 bg-amber-500/[0.05] p-3">
                        <Input
                            value={qTitle}
                            onChange={(e) => setQTitle(e.target.value)}
                            placeholder="Recuérdame que…"
                            className="bg-background/40 border-white/10 h-9 text-sm"
                        />
                        <div className="flex items-center gap-2">
                            <Input
                                type="datetime-local"
                                value={qWhen}
                                onChange={(e) => setQWhen(e.target.value)}
                                className="bg-background/40 border-white/10 h-9 text-sm [color-scheme:dark]"
                            />
                            <Button
                                size="sm"
                                className="btn-pill shrink-0 gap-1.5 bg-amber-600 hover:bg-amber-500 text-white"
                                onClick={quickAdd}
                                disabled={saving || !qTitle.trim()}
                            >
                                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                                Crear
                            </Button>
                        </div>
                    </div>
                )}

                {/* Lista */}
                {loading ? (
                    <div className="space-y-2">
                        {[0, 1].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-white/5" />)}
                    </div>
                ) : !userId ? (
                    <p className="rounded-xl border border-dashed border-white/12 p-5 text-center text-xs text-muted-foreground">
                        Inicia sesión para ver tus recordatorios.
                    </p>
                ) : visible.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/12 p-6 text-center">
                        <Inbox className="mx-auto size-7 text-white/25" />
                        <p className="mt-2 text-xs text-muted-foreground">No hay recordatorios pendientes.</p>
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        {visible.map((t) => {
                            const overdue = new Date(t.run_at).getTime() < Date.now();
                            return (
                                <div
                                    key={t.id}
                                    className={cn(
                                        "group flex items-center gap-2.5 rounded-xl border bg-white/[0.02] px-3 py-2 transition-colors",
                                        overdue ? "border-rose-500/30" : "border-white/10 hover:border-amber-400/30",
                                    )}
                                >
                                    <button
                                        type="button"
                                        onClick={() => markDone(t.id)}
                                        disabled={busyId === t.id}
                                        title="Marcar como hecha"
                                        className="grid size-6 shrink-0 place-items-center rounded-lg border border-white/15 bg-white/[0.03] text-white/40 transition-colors hover:border-emerald-400/40 hover:text-emerald-300"
                                    >
                                        {busyId === t.id ? <Loader2 className="size-3.5 animate-spin" /> : <CircleDot className="size-3.5" />}
                                    </button>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-white/85">{t.title}</p>
                                        <p className={cn("flex items-center gap-1 text-[11px]", overdue ? "text-rose-300" : "text-muted-foreground")}>
                                            {overdue ? <AlarmClock className="size-3" /> : <Clock className="size-3" />}
                                            {formatShort(t.run_at)}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                <Link
                    href="/recordatorios"
                    className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                >
                    Ver todos los recordatorios <ArrowRight className="size-3.5" />
                </Link>
            </CardContent>
        </Card>
    );
}

export default RecordatoriosWidget;

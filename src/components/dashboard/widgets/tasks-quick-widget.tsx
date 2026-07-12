'use client';

// ════════════════════════════════════════════════════════════════
// TasksQuickWidget — Tareas: check rápido + añadir, dato real y
// persistente (lib/tasks/quick-tasks.ts), sincronizado con la cuenta.
// S = pendientes grande, M = lista corta + añadir, L/XL = lista + progreso.
// ════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ListChecks, Plus, Check, Trash2, Sparkles } from 'lucide-react';
import { WidgetShell, ProgressRing, WidgetEmptyState } from '../kit';
import { useAppearance } from '@/context/appearance-context';
import { useQuickTasks } from '@/lib/tasks/quick-tasks';

const ACCENT = '#7C3AED';

export function TasksQuickWidget() {
    const { config } = useAppearance();
    const prefersReduced = useReducedMotion();
    const animate = config.animations.enabled && !prefersReduced;
    const { tasks, pending, completed, add, toggle, remove, clearCompleted } = useQuickTasks();
    const [draft, setDraft] = useState('');

    function submit() {
        const text = draft.trim();
        if (!text) return;
        add(text);
        setDraft('');
    }

    const ratio = tasks.length > 0 ? completed.length / tasks.length : 0;

    return (
        <WidgetShell
            title="Tareas"
            subtitle={tasks.length > 0 ? `${pending.length} pendientes · ${completed.length} hechas` : undefined}
            icon={ListChecks}
            accent={ACCENT}
            live={pending.length > 0}
            actions={completed.length > 0 ? (
                <button type="button" onClick={clearCompleted} title="Limpiar completadas"
                    className="grid place-items-center size-6 rounded-full text-muted-foreground/60 hover:text-rose-400 hover:bg-white/10 transition-colors cursor-pointer">
                    <Trash2 className="size-3.5" />
                </button>
            ) : undefined}
        >
            {(size) => {
                const micro = size.tier === 'micro' || size.vTier === 'micro';

                if (micro) {
                    return (
                        <div className="h-full flex items-center gap-3 px-1">
                            <ProgressRing value={ratio} size={44} stroke={5} color={ACCENT} label={String(pending.length)} sublabel="Pend." />
                            <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-black truncate" style={{ color: ACCENT }}>{pending[0]?.text ?? 'Todo al día'}</p>
                                <p className="text-[10px] font-bold text-muted-foreground/60">{tasks.length} tareas</p>
                            </div>
                        </div>
                    );
                }

                const max = size.vTier === 'expanded' ? 8 : size.vTier === 'compact' ? 3 : 5;

                return (
                    <div className="h-full flex flex-col gap-2 pt-1">
                        {/* Añadir rápido */}
                        <div className="shrink-0 flex items-center gap-1.5 rounded-xl border border-border/40 bg-white/[0.02] px-2 py-1.5 focus-within:border-violet-400/50 transition-colors">
                            <input
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                                placeholder="Añadir tarea…"
                                className="flex-1 min-w-0 bg-transparent text-[11px] font-semibold outline-none placeholder:text-muted-foreground/40"
                            />
                            <button type="button" onClick={submit} disabled={!draft.trim()} title="Añadir"
                                className="grid place-items-center size-6 rounded-lg text-white transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
                                style={{ background: ACCENT }}>
                                <Plus className="size-3.5" />
                            </button>
                        </div>

                        {tasks.length === 0 ? (
                            <div className="flex-1 min-h-0">
                                <WidgetEmptyState icon={Sparkles} title="Sin tareas" message="Añade tu primera tarea arriba." accent={ACCENT} />
                            </div>
                        ) : (
                            <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
                                <div className="flex flex-col gap-1.5">
                                    <AnimatePresence initial={false}>
                                        {[...pending, ...completed].slice(0, max).map((t, i) => (
                                            <motion.div
                                                key={t.id}
                                                layout={animate}
                                                initial={animate ? { opacity: 0, x: -8 } : false}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={animate ? { opacity: 0, x: 12, height: 0 } : { opacity: 0 }}
                                                transition={{ delay: animate ? i * 0.03 : 0, duration: animate ? 0.22 : 0 }}
                                                className={`group flex items-center gap-2 rounded-xl border px-2.5 py-1.5 transition-colors ${t.done ? 'border-border/30 bg-white/[0.015] opacity-55' : 'border-border/40 bg-white/[0.03]'}`}
                                            >
                                                <button type="button" onClick={() => toggle(t.id)} aria-label={t.done ? 'Marcar pendiente' : 'Marcar hecha'}
                                                    className="shrink-0 grid place-items-center size-5 rounded-md border transition-colors cursor-pointer"
                                                    style={t.done ? { background: ACCENT, borderColor: ACCENT } : { borderColor: 'hsl(var(--border))' }}>
                                                    {t.done && <Check className="size-3 text-white" />}
                                                </button>
                                                <span className={`min-w-0 flex-1 text-[11px] font-semibold truncate ${t.done ? 'line-through text-muted-foreground/50' : ''}`}>{t.text}</span>
                                                <button type="button" onClick={() => remove(t.id)} title="Eliminar"
                                                    className="opacity-0 group-hover:opacity-100 shrink-0 grid place-items-center size-5 rounded text-muted-foreground/50 hover:text-rose-400 transition-all cursor-pointer">
                                                    <Trash2 className="size-3" />
                                                </button>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </div>
                            </div>
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}

export default TasksQuickWidget;

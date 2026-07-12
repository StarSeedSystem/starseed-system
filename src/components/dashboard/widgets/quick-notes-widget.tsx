'use client';

// ════════════════════════════════════════════════════════════════
// QuickNotesWidget — Notas rápidas persistentes (lib/notes/quick-notes.ts).
// Bloc de notas cortas tipo post-it, con fijado, edición inline y borrado.
// S = última nota, M = 2-3 notas, L/XL = mosaico completo.
// ════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { StickyNote, Plus, Pin, Trash2, Sparkles } from 'lucide-react';
import { WidgetShell, WidgetEmptyState, timeAgo } from '../kit';
import { useAppearance } from '@/context/appearance-context';
import { useQuickNotes } from '@/lib/notes/quick-notes';

const ACCENT = '#f59e0b';

export function QuickNotesWidget() {
    const { config } = useAppearance();
    const prefersReduced = useReducedMotion();
    const animate = config.animations.enabled && !prefersReduced;
    const { notes, add, update, togglePin, remove } = useQuickNotes();
    const [draft, setDraft] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');

    function submit() {
        const text = draft.trim();
        if (!text) return;
        add(text);
        setDraft('');
    }
    function startEdit(id: string, text: string) {
        setEditingId(id);
        setEditText(text);
    }
    function commitEdit() {
        if (editingId) update(editingId, editText);
        setEditingId(null);
    }

    return (
        <WidgetShell
            title="Notas rápidas"
            subtitle={notes.length > 0 ? `${notes.length} nota${notes.length === 1 ? '' : 's'}` : undefined}
            icon={StickyNote}
            accent={ACCENT}
        >
            {(size) => {
                const micro = size.tier === 'micro' || size.vTier === 'micro';
                const max = size.vTier === 'expanded' ? 8 : size.vTier === 'compact' ? 2 : micro ? 1 : 4;
                const cols = size.tier === 'expanded' ? 2 : 1;

                if (micro) {
                    const top = notes[0];
                    return (
                        <div className="h-full flex flex-col justify-center gap-1 px-1">
                            {top ? (
                                <p className="text-[11px] font-semibold line-clamp-3" style={{ color: ACCENT }}>{top.text}</p>
                            ) : (
                                <p className="text-[10px] text-muted-foreground/50 italic">Sin notas</p>
                            )}
                        </div>
                    );
                }

                return (
                    <div className="h-full flex flex-col gap-2 pt-1">
                        <div className="shrink-0 flex items-center gap-1.5 rounded-xl border border-border/40 bg-white/[0.02] px-2 py-1.5 focus-within:border-amber-400/50 transition-colors">
                            <input
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                                placeholder="Escribe una nota…"
                                className="flex-1 min-w-0 bg-transparent text-[11px] font-semibold outline-none placeholder:text-muted-foreground/40"
                            />
                            <button type="button" onClick={submit} disabled={!draft.trim()} title="Añadir nota"
                                className="grid place-items-center size-6 rounded-lg text-white transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
                                style={{ background: ACCENT }}>
                                <Plus className="size-3.5" />
                            </button>
                        </div>

                        {notes.length === 0 ? (
                            <div className="flex-1 min-h-0">
                                <WidgetEmptyState icon={Sparkles} title="Sin notas todavía" message="Escribe tu primera nota arriba." accent={ACCENT} />
                            </div>
                        ) : (
                            <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
                                <div className={cols === 2 ? 'grid grid-cols-2 gap-1.5' : 'flex flex-col gap-1.5'}>
                                    <AnimatePresence initial={false}>
                                        {notes.slice(0, max).map((n, i) => (
                                            <motion.div
                                                key={n.id}
                                                layout={animate}
                                                initial={animate ? { opacity: 0, scale: 0.94 } : false}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={animate ? { opacity: 0, scale: 0.9 } : { opacity: 0 }}
                                                transition={{ delay: animate ? i * 0.04 : 0, duration: animate ? 0.24 : 0 }}
                                                className="group relative rounded-xl border px-2.5 py-2"
                                                style={{ borderColor: `${n.color ?? ACCENT}40`, background: `${n.color ?? ACCENT}12` }}
                                            >
                                                {editingId === n.id ? (
                                                    <textarea
                                                        autoFocus
                                                        value={editText}
                                                        onChange={(e) => setEditText(e.target.value)}
                                                        onBlur={commitEdit}
                                                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit(); } }}
                                                        className="w-full bg-transparent text-[11px] font-semibold outline-none resize-none leading-snug"
                                                        rows={3}
                                                    />
                                                ) : (
                                                    <p onClick={() => startEdit(n.id, n.text)} className="text-[11px] font-semibold leading-snug whitespace-pre-wrap cursor-text pr-8" style={{ color: n.color ?? ACCENT }}>
                                                        {n.text}
                                                    </p>
                                                )}
                                                <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button type="button" onClick={() => togglePin(n.id)} title={n.pinned ? 'Desfijar' : 'Fijar'}
                                                        className="grid place-items-center size-5 rounded text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer">
                                                        <Pin className={`size-3 ${n.pinned ? 'fill-current' : ''}`} />
                                                    </button>
                                                    <button type="button" onClick={() => remove(n.id)} title="Eliminar"
                                                        className="grid place-items-center size-5 rounded text-muted-foreground/60 hover:text-rose-400 transition-colors cursor-pointer">
                                                        <Trash2 className="size-3" />
                                                    </button>
                                                </div>
                                                {n.pinned && (
                                                    <Pin className="absolute -top-1 -left-1 size-3 fill-current rotate-45" style={{ color: n.color ?? ACCENT }} />
                                                )}
                                                <p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-muted-foreground/40">{timeAgo(n.updatedAt)}</p>
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

export default QuickNotesWidget;

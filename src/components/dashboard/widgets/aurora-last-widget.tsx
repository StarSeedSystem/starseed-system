'use client';

// ════════════════════════════════════════════════════════════════
// AuroraLastWidget — última respuesta real de Aurora + abrir chat.
// Lee el registro real de conversación (lib/aurora/aurora-chat-log.ts,
// persistido y sincronizado con la cuenta) — nunca simula una respuesta.
// Abre el Exocórtex/curtain de Aurora vía el bus global (Zenith).
// ════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Sparkles, MessageCircle, Mic, User } from 'lucide-react';
import { WidgetShell, WidgetEmptyState, LivePulseDot, timeAgo } from '../kit';
import { useAppearance } from '@/context/appearance-context';
import { readAuroraChatEntries, AURORA_CHATLOG_CHANGE_EVENT, type AuroraChatLogEntry } from '@/lib/aurora/aurora-chat-log';
import { AURORA_EXOCORTEX_OPEN_EVENT } from '@/lib/aurora/aurora-orb-bus';

const ACCENT = '#007FFF'; // Zenith (Norte) — guía IA contextual

function openAurora() {
    try { window.dispatchEvent(new CustomEvent(AURORA_EXOCORTEX_OPEN_EVENT)); } catch { /* noop */ }
}

export function AuroraLastWidget() {
    const { config } = useAppearance();
    const prefersReduced = useReducedMotion();
    const animate = config.animations.enabled && !prefersReduced;
    const [entries, setEntries] = useState<AuroraChatLogEntry[] | null>(null);

    useEffect(() => {
        const refresh = () => setEntries(readAuroraChatEntries());
        refresh();
        window.addEventListener(AURORA_CHATLOG_CHANGE_EVENT, refresh);
        const onStorage = (e: StorageEvent) => { if (e.key === 'starseed.aurora.chatlog.v1') refresh(); };
        window.addEventListener('storage', onStorage);
        return () => {
            window.removeEventListener(AURORA_CHATLOG_CHANGE_EVENT, refresh);
            window.removeEventListener('storage', onStorage);
        };
    }, []);

    return (
        <WidgetShell
            title="Aurora"
            subtitle="Exocórtex personal"
            icon={Sparkles}
            accent={ACCENT}
            live
            connections={[{ label: 'Registro completo', onClick: openAurora, color: ACCENT, icon: MessageCircle }]}
            actions={
                <button type="button" onClick={openAurora} title="Abrir chat con Aurora"
                    className="inline-flex items-center gap-1 rounded-full border border-sky-400/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-sky-300 hover:bg-sky-500/20 transition-colors cursor-pointer">
                    <MessageCircle className="size-3" /> Chat
                </button>
            }
        >
            {(size) => {
                if (entries === null) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;

                const last = entries[entries.length - 1];
                if (!last) {
                    return (
                        <WidgetEmptyState
                            icon={Sparkles}
                            title="Aún no has hablado con Aurora"
                            message="Tu exocórtex personal, siempre disponible."
                            actionLabel="Abrir chat"
                            onAction={openAurora}
                            accent={ACCENT}
                        />
                    );
                }

                const micro = size.tier === 'micro' || size.vTier === 'micro';
                const auroraTurn = last.role === 'aurora';
                const RoleIcon = auroraTurn ? Sparkles : User;
                const recent = [...entries].reverse().slice(0, micro ? 1 : size.vTier === 'expanded' ? 6 : 3);

                if (micro) {
                    return (
                        <button type="button" onClick={openAurora} className="h-full w-full flex items-center gap-2.5 px-1 text-left cursor-pointer">
                            <span className="shrink-0 grid place-items-center size-9 rounded-2xl border text-white" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT}66)`, borderColor: `${ACCENT}55` }}>
                                <RoleIcon className="size-4" />
                            </span>
                            <p className="min-w-0 flex-1 text-[10px] font-semibold text-muted-foreground/80 line-clamp-2">{last.text}</p>
                        </button>
                    );
                }

                return (
                    <div className="h-full flex flex-col gap-2 pt-1">
                        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar flex flex-col-reverse gap-1.5">
                            {recent.map((e, i) => {
                                const isAurora = e.role === 'aurora';
                                return (
                                    <motion.div
                                        key={`${e.ts}-${i}`}
                                        initial={animate ? { opacity: 0, y: 6 } : false}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: animate ? i * 0.04 : 0 }}
                                        className="rounded-xl border px-2.5 py-2"
                                        style={isAurora
                                            ? { borderColor: `${ACCENT}35`, background: `${ACCENT}10` }
                                            : { borderColor: 'hsl(var(--border)/0.4)', background: 'rgba(255,255,255,0.02)' }}
                                    >
                                        <div className="flex items-center gap-1.5 mb-0.5">
                                            {isAurora ? <Sparkles className="size-2.5" style={{ color: ACCENT }} /> : <User className="size-2.5 text-muted-foreground/60" />}
                                            <span className="text-[9px] font-black uppercase tracking-wide" style={{ color: isAurora ? ACCENT : undefined }}>
                                                {isAurora ? 'Aurora' : 'Tú'}
                                            </span>
                                            {i === 0 && isAurora && <LivePulseDot color={ACCENT} size={5} />}
                                            <span className="ml-auto text-[9px] font-bold text-muted-foreground/40 tabular-nums">{timeAgo(e.ts)}</span>
                                        </div>
                                        <p className="text-[11px] leading-snug line-clamp-3 text-foreground/85">{e.text}</p>
                                    </motion.div>
                                );
                            })}
                        </div>
                        <button type="button" onClick={openAurora}
                            className="shrink-0 flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-black uppercase tracking-wider transition-colors cursor-pointer hover:brightness-110"
                            style={{ color: ACCENT, borderColor: `${ACCENT}44`, background: `${ACCENT}14` }}>
                            <Mic className="size-3.5" /> Hablar con Aurora
                        </button>
                    </div>
                );
            }}
        </WidgetShell>
    );
}

export default AuroraLastWidget;

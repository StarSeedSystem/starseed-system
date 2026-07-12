'use client';

// ════════════════════════════════════════════════════════════════
// BadgesWidget — Insignias reales del usuario (Módulo 7: badges +
// profile_badges). Meritocracia del entendimiento verificable, no
// decorativa: lee el catálogo + lo realmente otorgado. NUNCA simula.
// ════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { Award, LogIn, Lock } from 'lucide-react';
import { WidgetShell, WidgetEmptyState, ProgressRing, Chip } from '../kit';
import { useAppearance } from '@/context/appearance-context';
import { listBadges, badgesForProfile, myProfileId, type Badge, type ProfileBadge } from '@/lib/badges/badges';

const ACCENT = '#D4AF37'; // dorado — mérito

const AREA_COLOR: Record<string, string> = {
    general: '#D4AF37',
    politica: '#FFBF00',
    educacion: '#8B5CF6',
    cultura: '#EC4899',
};

function BadgeIcon({ icon, size = 18 }: { icon: string | null; size?: number }) {
    if (icon && icon.length <= 4) return <span style={{ fontSize: size * 0.72, lineHeight: 1 }}>{icon}</span>;
    return <Award className="size-4" />;
}

export function BadgesWidget() {
    const { config } = useAppearance();
    const prefersReduced = useReducedMotion();
    const animate = config.animations.enabled && !prefersReduced;
    const [state, setState] = useState<'loading' | 'needsAuth' | 'ready'>('loading');
    const [earned, setEarned] = useState<ProfileBadge[]>([]);
    const [total, setTotal] = useState(0);

    useEffect(() => {
        let alive = true;
        (async () => {
            const pid = await myProfileId();
            if (!alive) return;
            if (!pid) { setState('needsAuth'); return; }
            const [mine, catalog] = await Promise.all([badgesForProfile(pid), listBadges()]);
            if (!alive) return;
            setEarned(mine);
            setTotal(catalog.length || mine.length);
            setState('ready');
        })();
        return () => { alive = false; };
    }, []);

    return (
        <WidgetShell
            title="Insignias"
            subtitle="Mérito verificable"
            icon={Award}
            accent={ACCENT}
            expandHref="/insignias"
            connections={[{ label: 'Catálogo completo', href: '/insignias', color: ACCENT, icon: Award }]}
        >
            {(size) => {
                if (state === 'loading') return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;

                if (state === 'needsAuth') {
                    return (
                        <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-3">
                            <span className="grid place-items-center size-12 rounded-2xl border border-amber-400/30 bg-amber-500/10">
                                <LogIn className="size-6 text-amber-300/70" strokeWidth={1.5} />
                            </span>
                            <p className="text-[11px] text-muted-foreground/70">Entra para ver tus insignias.</p>
                            <Link href="/login" className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-amber-300 hover:bg-amber-500/25 transition-colors cursor-pointer">
                                <LogIn className="size-3.5" /> Entrar
                            </Link>
                        </div>
                    );
                }

                if (earned.length === 0) {
                    return (
                        <WidgetEmptyState
                            icon={Lock}
                            title="Aún sin insignias"
                            message="Participa en la red — publica, delibera, contribuye — para desbloquear las primeras."
                            actionLabel="Ver catálogo"
                            actionHref="/insignias"
                            accent={ACCENT}
                        />
                    );
                }

                const micro = size.tier === 'micro' || size.vTier === 'micro';
                const ratio = total > 0 ? earned.length / total : 0;

                if (micro) {
                    return (
                        <div className="h-full flex items-center gap-3 px-1">
                            <ProgressRing value={ratio} size={44} stroke={5} color={ACCENT} label={String(earned.length)} sublabel="Ganadas" />
                            <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-black truncate" style={{ color: ACCENT }}>{earned[0]?.name}</p>
                                <p className="text-[10px] font-bold text-muted-foreground/60">de {total} insignias</p>
                            </div>
                        </div>
                    );
                }

                const max = size.vTier === 'expanded' ? 9 : size.vTier === 'compact' ? 4 : 6;

                return (
                    <div className="h-full flex flex-col gap-2 pt-1">
                        {size.tier !== 'compact' && (
                            <div className="shrink-0 flex items-center gap-3 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-1.5">
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold tabular-nums" style={{ color: ACCENT }}>
                                    <Award className="size-3" />{earned.length} de {total}
                                </span>
                                <div className="flex-1 h-1.5 rounded-full bg-muted/20 overflow-hidden">
                                    <motion.div className="h-full rounded-full" style={{ background: ACCENT }}
                                        initial={{ width: 0 }} animate={{ width: `${Math.round(ratio * 100)}%` }} transition={{ duration: 0.8 }} />
                                </div>
                            </div>
                        )}

                        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
                            <div className="grid grid-cols-2 @[16rem]:grid-cols-3 gap-1.5">
                                {earned.slice(0, max).map((b, i) => {
                                    const color = AREA_COLOR[b.area ?? 'general'] ?? ACCENT;
                                    return (
                                        <motion.div key={b.id}
                                            initial={animate ? { opacity: 0, scale: 0.85 } : false}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: animate ? i * 0.04 : 0, type: 'spring', stiffness: 240, damping: 18 }}
                                            title={b.description ?? b.name}
                                            className="flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-center"
                                            style={{ borderColor: `${color}40`, background: `${color}12` }}
                                        >
                                            <span className="grid place-items-center size-8 rounded-xl border text-white" style={{ background: `linear-gradient(135deg, ${color}, ${color}66)`, borderColor: `${color}55` }}>
                                                <BadgeIcon icon={b.icon} />
                                            </span>
                                            <span className="text-[9px] font-bold truncate w-full" style={{ color }}>{b.name}</span>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </div>

                        {size.vTier !== 'compact' && earned[0]?.area && (
                            <div className="shrink-0">
                                <Chip color={AREA_COLOR[earned[0].area ?? 'general'] ?? ACCENT}>Última: {earned[0].name}</Chip>
                            </div>
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}

export default BadgesWidget;

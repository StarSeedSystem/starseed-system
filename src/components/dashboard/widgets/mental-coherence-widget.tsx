'use client';

import React, { useState } from 'react';
import { Brain, Activity, Zap, Shield, Sparkles, Wind } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

export function MentalCoherenceWidget() {
    const [coherence, setCoherence] = useState(88.4);
    const [state, setState] = useState<'FLOW' | 'FOCUS' | 'REST'>('FLOW');

    return (
        <div className="@container w-full h-full bg-card/10 backdrop-blur-3xl rounded-xl relative overflow-hidden flex flex-col p-3 @sm:p-5 border border-border/40 shadow-2xl text-foreground font-display group/widget">
            {/* Ambient Pulse */}
            <motion.div
                animate={{
                    scale: [1, 1.1, 1],
                    opacity: [0.1, 0.2, 0.1]
                }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="absolute inset-x-0 top-0 h-40 bg-primary/20 blur-[100px] pointer-events-none"
            />

            {/* Header */}
            <header className="flex items-center justify-between pb-3 border-b border-white/5 shrink-0 z-10 relative">
                <div className="flex items-center gap-3">
                    <motion.div
                        whileHover={{ scale: 1.1, rotate: -5 }}
                        className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-[0_0_15px_rgba(var(--primary-hsl),0.3)] border border-white/10"
                    >
                        <Brain size={20} className="text-primary-foreground drop-shadow-md" />
                    </motion.div>
                    <div className="space-y-0 text-left">
                        <h2 className="text-[10px] uppercase tracking-[0.25em] text-primary/70 font-black leading-tight">Neural State</h2>
                        <h1 className="text-sm font-black text-foreground tracking-widest uppercase leading-none">Coherence Index</h1>
                    </div>
                </div>

                <div className="flex bg-white/5 rounded-lg p-1 border border-white/10">
                    {['REST', 'FLOW', 'FOCUS'].map((s) => (
                        <button
                            key={s}
                            onClick={() => setState(s as any)}
                            className={cn(
                                "px-2 py-1 rounded text-[8px] font-black tracking-widest uppercase transition-all",
                                state === s ? "bg-primary text-primary-foreground shadow-lg" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            </header>

            {/* Main Visualizer */}
            <main className="flex-1 flex flex-col justify-center items-center py-4 z-10 relative">
                <div className="relative w-full flex flex-col items-center">
                    {/* SVG Bio-Rhythm Waves */}
                    <div className="absolute inset-0 flex items-center justify-center -z-10 opacity-30">
                        <svg width="100%" height="100" viewBox="0 0 400 100" className="w-full">
                            {[1, 2, 3].map((i) => (
                                <motion.path
                                    key={i}
                                    d="M 0 50 Q 50 10, 100 50 T 200 50 T 300 50 T 400 50"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    className="text-primary"
                                    animate={{
                                        d: [
                                            "M 0 50 Q 50 10, 100 50 T 200 50 T 300 50 T 400 50",
                                            "M 0 50 Q 50 90, 100 50 T 200 50 T 300 50 T 400 50",
                                            "M 0 50 Q 50 10, 100 50 T 200 50 T 300 50 T 400 50"
                                        ],
                                        opacity: [0.1, 0.4, 0.1]
                                    }}
                                    transition={{
                                        duration: 3 / i,
                                        repeat: Infinity,
                                        ease: "easeInOut"
                                    }}
                                />
                            ))}
                        </svg>
                    </div>

                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="text-center"
                    >
                        <div className="text-5xl @sm:text-6xl font-black text-foreground tracking-tighter transition-all duration-1000">
                            {coherence}<span className="text-primary text-2xl">%</span>
                        </div>
                        <div className="flex items-center justify-center gap-2 mt-2">
                            <Activity size={14} className="text-primary animate-pulse" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Stable Flow</span>
                        </div>
                    </motion.div>
                </div>

                {/* Metrics Grid */}
                <div className="w-full grid grid-cols-3 gap-2 mt-6">
                    {[
                        { icon: Wind, label: 'Delta', value: '1.2 Hz', color: 'text-blue-400' },
                        { icon: Activity, label: 'Alpha', value: '10.5 Hz', color: 'text-primary' },
                        { icon: Zap, label: 'Gamma', value: '42.0 Hz', color: 'text-orange-400' }
                    ].map((metric, i) => (
                        <motion.div
                            key={metric.label}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 + i * 0.1 }}
                            className="bg-white/5 border border-white/10 rounded-xl p-2 flex flex-col items-center gap-1 group/metric hover:bg-white/10 transition-all"
                        >
                            <metric.icon size={12} className={cn(metric.color, "opacity-70 group-hover/metric:opacity-100 transition-opacity")} />
                            <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">{metric.label}</span>
                            <span className="text-[10px] font-bold font-mono">{metric.value}</span>
                        </motion.div>
                    ))}
                </div>
            </main>

            {/* Footer Status */}
            <footer className="mt-auto pt-3 border-t border-white/5 flex items-center justify-between text-[8px] font-black tracking-widest uppercase text-muted-foreground/60 z-10 relative">
                <div className="flex items-center gap-2">
                    <Sparkles size={10} className="text-primary" />
                    <span>Exocortex Link: Active</span>
                </div>
                <span>Sync v.2.4.1</span>
            </footer>
        </div>
    );
}

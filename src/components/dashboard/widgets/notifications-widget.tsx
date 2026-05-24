'use client';

import React from 'react';
import { Bell, AlertTriangle, Info, CheckCircle, Flame, Clock, X, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface Notification {
    id: string;
    type: 'critical' | 'warning' | 'success' | 'info';
    title: string;
    desc: string;
    time: string;
    icon: any;
}

const notifications: Notification[] = [
    { id: '1', type: 'critical', title: 'P2P Network Overload', desc: 'Global bandwidth reached 98% capacity.', time: '2m', icon: Flame },
    { id: '2', type: 'warning', title: 'Anomaly Detected', desc: 'Potential fork in sector Terra-4.', time: '15m', icon: AlertTriangle },
    { id: '3', type: 'success', title: 'Block Minz Verified', desc: 'Quantum sync is now stable.', time: '1h', icon: CheckCircle },
    { id: '4', type: 'info', title: 'System Update', desc: 'V4 modules ready for deployment.', time: '3h', icon: Info },
];

export function NotificationsWidget() {
    return (
        <div className="@container w-full h-full bg-card/10 backdrop-blur-3xl rounded-xl relative overflow-hidden flex flex-col p-3 border border-border/40 shadow-2xl text-foreground font-display group/widget">
            {/* Header */}
            <header className="flex items-center justify-between pb-2 mb-2 border-b border-white/5 shrink-0 z-10 relative">
                <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-destructive to-orange-600 flex items-center justify-center shadow-lg border border-white/10">
                        <Bell size={14} className="text-white" />
                    </div>
                    <div className="space-y-0 text-left">
                        <h2 className="text-[8px] uppercase tracking-[0.25em] text-destructive/70 font-black leading-tight">Sensory Monitor</h2>
                        <h1 className="text-xs font-black text-foreground tracking-widest uppercase leading-none">System Alerts</h1>
                    </div>
                </div>
                <button className="h-7 px-3 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-muted-foreground text-[10px] font-black uppercase tracking-wider">
                    Clear
                </button>
            </header>

            {/* Scrollable Area */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                <AnimatePresence mode="popLayout">
                    {notifications.map((note, idx) => {
                        const Icon = note.icon;
                        return (
                            <motion.div
                                key={note.id}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ delay: idx * 0.1 }}
                                whileHover={{ x: -2 }}
                                className={cn(
                                    "relative group/note bg-white/5 hover:bg-white/10 border border-white/5 hover:border-border/30 rounded-xl p-3 transition-all cursor-pointer overflow-hidden",
                                    note.type === 'critical' && "border-destructive/20 bg-destructive/5 hover:bg-destructive/10"
                                )}
                            >
                                {/* Accent Pillar */}
                                <div className={cn(
                                    "absolute left-0 top-0 bottom-0 w-1 transition-all group-hover/note:w-1.5",
                                    note.type === 'critical' ? "bg-destructive shadow-[0_0_10px_rgba(var(--destructive-hsl),0.5)]" :
                                        note.type === 'warning' ? "bg-amber-500" :
                                            note.type === 'success' ? "bg-emerald-500" :
                                                "bg-primary"
                                )} />

                                <div className="flex items-start gap-3">
                                    <div className={cn(
                                        "mt-0.5 shrink-0 p-1.5 rounded-lg bg-white/5 border border-white/10",
                                        note.type === 'critical' ? "text-destructive" :
                                            note.type === 'warning' ? "text-amber-500" :
                                                note.type === 'success' ? "text-emerald-500" :
                                                    "text-primary"
                                    )}>
                                        <Icon size={14} />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-center mb-0.5">
                                            <h3 className="text-[11px] font-black text-foreground uppercase tracking-tight truncate leading-tight">
                                                {note.title}
                                            </h3>
                                            <span className="text-[8px] text-muted-foreground/40 font-black uppercase tracking-tighter shrink-0 ml-2">
                                                {note.time}
                                            </span>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground/60 leading-tight line-clamp-2">
                                            {note.desc}
                                        </p>
                                    </div>
                                </div>

                                {note.type === 'critical' && (
                                    <motion.div
                                        animate={{ opacity: [0.3, 0.6, 0.3] }}
                                        transition={{ duration: 1.5, repeat: Infinity }}
                                        className="absolute inset-0 bg-destructive/5 pointer-events-none"
                                    />
                                )}
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>

            {/* Footer */}
            <footer className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between z-10 relative">
                <div className="flex items-center gap-2 text-[8px] font-black tracking-widest uppercase text-muted-foreground/40">
                    <Zap size={10} className="text-primary" />
                    <span>Real-time Sync Active</span>
                </div>
                <button className="h-5 w-5 flex items-center justify-center rounded-md bg-white/5 hover:bg-white/10 text-muted-foreground transition-colors group/x">
                    <X size={10} className="group-hover/x:rotate-90 transition-transform" />
                </button>
            </footer>
        </div>
    );
}

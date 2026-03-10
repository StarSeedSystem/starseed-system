'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, Wallet, ArrowUpRight, ArrowDownRight, Coins, Gauge, Info, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Metric {
    id: string;
    label: string;
    value: string;
    change: string;
    isUp: boolean;
    color: string;
}

const metrics: Metric[] = [
    { id: 'm1', label: 'SEEDS Balance', value: '42,850.2', change: '+2.4%', isUp: true, color: 'text-primary' },
    { id: 'm2', label: 'KARMA Flux', value: '892.1', change: '-4.1%', isUp: false, color: 'text-amber-400' },
];

export function EconomicOverviewWidget() {
    return (
        <div className="@container w-full h-full bg-card/10 backdrop-blur-3xl rounded-xl relative overflow-hidden flex flex-col p-4 border border-border/40 shadow-2xl text-foreground font-display group/economic">
            {/* Header */}
            <header className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0 z-10 relative">
                <div className="flex items-center gap-4">
                    <motion.div
                        whileHover={{ scale: 1.1, rotate: -5 }}
                        className="h-12 w-12 rounded-2xl bg-gradient-to-br from-emerald-400 via-primary to-blue-500 flex items-center justify-center shadow-[0_0_20px_rgba(var(--primary-hsl),0.3)] border border-white/20 group-hover/economic:shadow-primary/40 transition-all duration-500"
                    >
                        <Wallet size={24} className="text-white drop-shadow-lg" />
                    </motion.div>
                    <div className="space-y-0.5 text-left">
                        <h2 className="text-[12px] uppercase tracking-[0.3em] text-primary/80 font-black leading-tight">Economic Pulse</h2>
                        <h1 className="text-lg font-black text-foreground tracking-tighter uppercase leading-none bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/60">Resource Matrix</h1>
                    </div>
                </div>
                <motion.div
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 3, repeat: Infinity }}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-[11px] font-black uppercase tracking-widest text-primary shadow-inner"
                >
                    <Zap size={14} fill="currentColor" />
                    <span>Live Flux</span>
                </motion.div>
            </header>

            {/* Main Metrics */}
            <div className="flex-1 mt-8 space-y-6 z-10 relative">
                {metrics.map((metric, idx) => (
                    <motion.div
                        key={metric.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: idx * 0.2 }}
                        whileHover={{ y: -4, backgroundColor: "rgba(255,255,255,0.08)" }}
                        className="p-5 rounded-[2rem] bg-white/5 border border-white/5 hover:border-primary/30 transition-all duration-500 group/metric relative overflow-hidden shadow-xl"
                    >
                        <div className="flex justify-between items-start mb-4">
                            <span className="text-[11px] font-black uppercase tracking-[0.25em] text-muted-foreground/60 group-hover/metric:text-primary/70 transition-colors">{metric.label}</span>
                            <div className={cn(
                                "flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black border backdrop-blur-md shadow-sm",
                                metric.isUp ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400" : "bg-destructive/20 border-destructive/30 text-destructive"
                            )}>
                                {metric.isUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                {metric.change}
                            </div>
                        </div>

                        <div className="flex items-baseline gap-3">
                            <span className={cn(
                                "text-4xl @sm:text-5xl font-black tracking-tighter drop-shadow-[0_0_15px_currentColor] transition-all duration-500 group-hover/metric:scale-105 origin-left",
                                metric.color
                            )}>
                                {metric.value}
                            </span>
                            <span className="text-xs font-black text-muted-foreground/30 uppercase tracking-widest">Seeds</span>
                        </div>

                        {/* Animated Mesh/Sparkline */}
                        <div className="mt-5 h-12 w-full opacity-20 group-hover/metric:opacity-50 transition-all duration-700">
                            <svg className="w-full h-full overflow-visible">
                                <motion.path
                                    initial={{ pathLength: 0 }}
                                    animate={{
                                        pathLength: 1,
                                        d: [
                                            `M 0 30 Q 50 ${metric.isUp ? 10 : 50} 100 30 T 200 ${metric.isUp ? 0 : 60} T 300 30`,
                                            `M 0 30 Q 50 ${metric.isUp ? 20 : 40} 100 30 T 200 ${metric.isUp ? 10 : 50} T 300 30`,
                                            `M 0 30 Q 50 ${metric.isUp ? 10 : 50} 100 30 T 200 ${metric.isUp ? 0 : 60} T 300 30`
                                        ]
                                    }}
                                    transition={{
                                        pathLength: { duration: 2, delay: 0.5 },
                                        d: { duration: 4, repeat: Infinity, ease: "easeInOut" }
                                    }}
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    className={metric.color}
                                />
                                {/* Glow under path */}
                                <motion.path
                                    animate={{
                                        d: [
                                            `M 0 30 Q 50 ${metric.isUp ? 10 : 50} 100 30 T 200 ${metric.isUp ? 0 : 60} T 300 30`,
                                            `M 0 30 Q 50 ${metric.isUp ? 20 : 40} 100 30 T 200 ${metric.isUp ? 10 : 50} T 300 30`,
                                            `M 0 30 Q 50 ${metric.isUp ? 10 : 50} 100 30 T 200 ${metric.isUp ? 0 : 60} T 300 30`
                                        ]
                                    }}
                                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="8"
                                    strokeLinecap="round"
                                    className={cn("opacity-10 blur-md", metric.color)}
                                />
                            </svg>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Sub-Actions */}
            <footer className="mt-8 pt-6 border-t border-white/10 grid grid-cols-2 gap-4 z-10 relative shrink-0">
                <motion.button
                    whileHover={{ scale: 1.05, backgroundColor: "rgba(var(--primary-hsl), 0.2)" }}
                    whileTap={{ scale: 0.95 }}
                    className="flex items-center justify-center gap-3 p-4 rounded-2xl bg-primary/10 border border-primary/20 transition-all text-primary text-[11px] font-black uppercase tracking-[0.2em] shadow-lg shadow-primary/5"
                >
                    <Coins size={18} />
                    Swap Assets
                </motion.button>
                <motion.button
                    whileHover={{ scale: 1.05, backgroundColor: "rgba(255,255,255,0.12)" }}
                    whileTap={{ scale: 0.95 }}
                    className="flex items-center justify-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/10 transition-all text-foreground text-[11px] font-black uppercase tracking-[0.2em]"
                >
                    <Info size={18} className="text-muted-foreground" />
                    Ledger
                </motion.button>
            </footer>

            {/* Ambient Background Light */}
            <motion.div
                animate={{
                    scale: [1, 1.3, 1],
                    opacity: [0.1, 0.25, 0.1],
                    rotate: [0, 45, 0]
                }}
                transition={{ duration: 8, repeat: Infinity }}
                className="absolute -top-20 -left-20 w-64 h-64 bg-emerald-500/30 blur-[100px] rounded-full pointer-events-none"
            />
            <motion.div
                animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.05, 0.15, 0.05],
                    x: [0, 20, 0]
                }}
                transition={{ duration: 6, repeat: Infinity, delay: 1 }}
                className="absolute -bottom-20 -right-20 w-64 h-64 bg-primary/20 blur-[100px] rounded-full pointer-events-none"
            />
        </div>
    );
}

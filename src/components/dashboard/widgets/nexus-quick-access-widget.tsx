"use client";

import React from "react";
import {
    BrainCircuit,
    Plus,
    ArrowRight,
    Bot,
    Sparkles,
    Zap,
    LayoutGrid,
    MessageSquare,
    Clock
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const recentCycles = [
    { id: 'c1', title: "Constitution Analysis", agent: "Architect", time: "2h", icon: Bot, color: "text-blue-400" },
    { id: 'c2', title: "Citadel Blueprint", agent: "Strategist", time: "1d", icon: BrainCircuit, color: "text-emerald-400" },
    { id: 'c3', title: "Governance Protocol", agent: "Oracle", time: "3d", icon: Sparkles, color: "text-purple-400" },
];

export function NexusQuickAccessWidget() {
    const router = useRouter();

    return (
        <div className="@container w-full h-full bg-card/5 backdrop-blur-3xl rounded-xl relative overflow-hidden flex flex-col p-3 border border-border/40 shadow-2xl text-foreground font-display group/nexus">
            {/* Neural Background Sweep */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />

            {/* Header */}
            <header className="flex items-center justify-between pb-2 mb-3 border-b border-white/5 shrink-0 z-10 relative">
                <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shadow-lg group-hover/nexus:scale-110 transition-transform duration-500">
                        <BrainCircuit size={16} className="text-primary" />
                    </div>
                    <div className="space-y-0 text-left">
                        <h2 className="text-[8px] uppercase tracking-[0.25em] text-primary/70 font-black leading-tight">Neural Interface</h2>
                        <h1 className="text-xs font-black text-foreground tracking-widest uppercase leading-none">Nexus AI</h1>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/5 border border-primary/10">
                    <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary-hsl),0.6)]"
                    />
                    <span className="text-[8px] font-black uppercase tracking-tighter text-primary">Active</span>
                </div>
            </header>

            {/* Main Action */}
            <motion.button
                whileHover={{ scale: 0.99, y: 1 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => router.push('/nexus')}
                className="w-full h-10 mb-4 bg-primary/10 border border-primary/20 hover:bg-primary/20 hover:border-primary/40 rounded-xl flex items-center justify-center gap-2 transition-all group/btn relative overflow-hidden shrink-0"
            >
                <div className="absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
                <Plus size={14} className="text-primary group-hover/btn:rotate-90 transition-transform duration-300" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Initiate Interaction</span>
            </motion.button>

            {/* Cycle List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-primary/10 scrollbar-track-transparent">
                <div className="flex items-center justify-between px-1 mb-2">
                    <h4 className="text-[8px] uppercase text-muted-foreground/40 font-black tracking-[0.2em]">Recent Cycles</h4>
                    <Clock size={10} className="text-muted-foreground/20" />
                </div>

                <AnimatePresence mode="popLayout">
                    {recentCycles.map((cycle, idx) => {
                        const Icon = cycle.icon;
                        return (
                            <motion.div
                                key={cycle.id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                whileHover={{ x: 2 }}
                                onClick={() => router.push('/nexus')}
                                className="group/item flex items-center gap-3 p-2 rounded-xl bg-white/5 border border-white/5 hover:border-primary/30 transition-all cursor-pointer relative overflow-hidden"
                            >
                                <div className={cn(
                                    "w-8 h-8 rounded-lg bg-background/40 border border-border/10 flex items-center justify-center transition-colors group-hover/item:border-primary/40",
                                    cycle.color
                                )}>
                                    <Icon size={14} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-[11px] font-black text-foreground uppercase tracking-tight truncate group-hover/item:text-primary transition-colors">
                                        {cycle.title}
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[8px] font-bold text-muted-foreground/50 uppercase tracking-widest mt-0.5">
                                        <span>{cycle.agent}</span>
                                        <div className="w-0.5 h-0.5 rounded-full bg-border/40" />
                                        <span>{cycle.time}</span>
                                    </div>
                                </div>
                                <ArrowRight size={12} className="text-muted-foreground/20 group-hover/item:text-primary group-hover/item:translate-x-1 transition-all" />
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>

            {/* Quick Links */}
            <footer className="mt-4 grid grid-cols-2 gap-2 shrink-0">
                <motion.button
                    whileHover={{ scale: 0.98 }}
                    onClick={() => router.push('/nexus')}
                    className="flex flex-col items-center justify-center p-2 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-primary/20 transition-all group/link"
                >
                    <LayoutGrid size={14} className="text-muted-foreground/40 group-hover/link:text-primary mb-1 transition-colors" />
                    <span className="text-[9px] font-black uppercase tracking-tighter text-muted-foreground group-hover/link:text-foreground">Library</span>
                </motion.button>
                <motion.button
                    whileHover={{ scale: 0.98 }}
                    onClick={() => router.push('/nexus')}
                    className="flex flex-col items-center justify-center p-2 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-emerald-500/20 transition-all group/link"
                >
                    <MessageSquare size={14} className="text-muted-foreground/40 group-hover/link:text-emerald-400 mb-1 transition-colors" />
                    <span className="text-[9px] font-black uppercase tracking-tighter text-muted-foreground group-hover/link:text-foreground">Threads</span>
                </motion.button>
            </footer>

            {/* Ambient Pulse */}
            <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-primary/5 blur-[40px] rounded-full pointer-events-none group-hover/nexus:bg-primary/10 transition-colors duration-1000" />
        </div>
    );
}

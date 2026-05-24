'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Rocket, Users, Clock, Zap, ChevronRight, Star, MoreHorizontal, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Project {
    id: string;
    title: string;
    status: 'active' | 'review' | 'planning';
    progress: number;
    members: { name: string; avatar?: string }[];
    deadline: string;
    priority: 'high' | 'critical' | 'low';
}

const projects: Project[] = [
    {
        id: 'p1',
        title: "Solar System Reconstruction",
        status: 'active',
        progress: 75,
        members: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
        deadline: "2d",
        priority: 'high'
    },
    {
        id: 'p2',
        title: "Quantum Neural Network",
        status: 'review',
        progress: 92,
        members: [{ name: 'D' }, { name: 'E' }],
        deadline: "5h",
        priority: 'critical'
    },
    {
        id: 'p3',
        title: "Akashic Record Archive",
        status: 'planning',
        progress: 18,
        members: [{ name: 'F' }, { name: 'G' }, { name: 'H' }, { name: 'I' }],
        deadline: "1w",
        priority: 'low'
    }
];

export function CollabProjectsWidget() {
    return (
        <div className="@container w-full h-full bg-card/10 backdrop-blur-3xl rounded-xl relative overflow-hidden flex flex-col p-3 border border-border/40 shadow-2xl text-foreground font-display group/collab">
            {/* Header */}
            <header className="flex items-center justify-between pb-3 mb-4 border-b border-white/10 shrink-0 z-10 relative">
                <div className="flex items-center gap-3">
                    <motion.div
                        whileHover={{ scale: 1.1, rotate: 10 }}
                        className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 via-primary to-fuchsia-500 flex items-center justify-center shadow-[0_0_15px_rgba(var(--primary-hsl),0.3)] border border-white/20"
                    >
                        <Rocket size={18} className="text-white drop-shadow-md" />
                    </motion.div>
                    <div className="space-y-0.5 text-left">
                        <h2 className="text-[10px] uppercase tracking-[0.3em] text-primary/80 font-black leading-tight">Project Genesis</h2>
                        <h1 className="text-sm font-black text-foreground tracking-widest uppercase leading-none">Collab Hub v2</h1>
                    </div>
                </div>
                <motion.button
                    whileHover={{ scale: 1.1, backgroundColor: "rgba(255,255,255,0.1)" }}
                    className="h-8 w-8 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-muted-foreground group/more shadow-inner"
                >
                    <MoreHorizontal size={16} className="group-hover/more:text-primary transition-colors" />
                </motion.button>
            </header>

            {/* List */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 scrollbar-thin scrollbar-thumb-primary/10 scrollbar-track-transparent custom-scroll">
                <AnimatePresence mode="popLayout">
                    {projects.map((project, idx) => (
                        <motion.div
                            key={project.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.12 }}
                            whileHover={{ scale: 0.99, x: 2, backgroundColor: "rgba(255,255,255,0.06)" }}
                            className="bg-white/5 border border-white/5 hover:border-primary/20 rounded-2xl p-4 transition-all duration-300 cursor-pointer relative group/project overflow-hidden shadow-lg"
                        >
                            {/* Status Stripe */}
                            <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: "100%" }}
                                className={cn(
                                    "absolute left-0 top-0 bottom-0 w-1.5",
                                    project.status === 'active' ? "bg-primary shadow-[0_0_10px_rgba(var(--primary-hsl),0.5)]" :
                                        project.status === 'review' ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" :
                                            "bg-amber-500"
                                )}
                            />

                            <div className="flex justify-between items-start mb-3">
                                <div className="min-w-0 pr-4">
                                    <h3 className="text-[13px] font-black text-foreground uppercase tracking-tight truncate group-hover/project:text-primary transition-colors duration-300">
                                        {project.title}
                                    </h3>
                                    <div className="flex items-center gap-3 mt-1.5">
                                        <div className={cn(
                                            "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border backdrop-blur-md",
                                            project.priority === 'critical' ? "bg-destructive/20 border-destructive/30 text-destructive" :
                                                project.priority === 'high' ? "bg-primary/20 border-primary/30 text-primary" :
                                                    "bg-muted/10 border-border/20 text-muted-foreground"
                                        )}>
                                            {project.priority}
                                        </div>
                                        <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground/60 font-black uppercase tracking-tighter">
                                            <Clock size={10} className="group-hover/project:text-primary transition-colors" />
                                            <span>{project.deadline} LEFT</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex -space-x-2.5 shrink-0 group-hover/project:space-x-0.5 transition-all duration-500">
                                    {project.members.slice(0, 3).map((m, i) => (
                                        <motion.div
                                            key={i}
                                            whileHover={{ y: -5, scale: 1.2, zIndex: 10 }}
                                            className="w-7 h-7 rounded-full ring-2 ring-background bg-gradient-to-tr from-muted/40 to-muted/10 border border-white/10 flex items-center justify-center overflow-hidden shadow-md text-[10px] font-black"
                                        >
                                            {m.name}
                                        </motion.div>
                                    ))}
                                    {project.members.length > 3 && (
                                        <div className="w-7 h-7 rounded-full ring-2 ring-background bg-primary/20 border border-primary/20 flex items-center justify-center text-[9px] font-black text-primary backdrop-blur-sm">
                                            +{project.members.length - 3}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Progress */}
                            <div className="space-y-2">
                                <div className="flex justify-between text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">
                                    <span className="group-hover/project:text-primary/50 transition-colors">Synchronization</span>
                                    <span className="text-primary group-hover/project:scale-110 transition-transform">{project.progress}%</span>
                                </div>
                                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden shadow-inner">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${project.progress}%` }}
                                        transition={{ duration: 1.5, ease: "circOut" }}
                                        className={cn(
                                            "h-full rounded-full relative",
                                            project.status === 'active' ? "bg-primary" :
                                                project.status === 'review' ? "bg-emerald-500" :
                                                    "bg-amber-500"
                                        )}
                                    >
                                        <div className="absolute top-0 right-0 h-full w-4 bg-white/30 blur-sm animate-pulse" />
                                    </motion.div>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Stats Footer */}
            <footer className="mt-4 pt-4 border-t border-white/10 grid grid-cols-2 gap-3 shrink-0 z-10 relative">
                <motion.div
                    whileHover={{ scale: 1.02, backgroundColor: "rgba(255,255,255,0.08)" }}
                    className="p-3 rounded-2xl bg-white/5 border border-white/5 flex items-center gap-3 transition-colors"
                >
                    <div className="p-2 rounded-xl bg-primary/20 text-primary shadow-lg shadow-primary/10">
                        <Target size={16} />
                    </div>
                    <div className="text-left">
                        <div className="text-[8px] font-black uppercase text-muted-foreground/30 leading-none tracking-widest">Milestones</div>
                        <div className="text-[12px] font-black text-foreground">12 / 15</div>
                    </div>
                </motion.div>
                <motion.div
                    whileHover={{ scale: 1.02, backgroundColor: "rgba(255,255,255,0.08)" }}
                    className="p-3 rounded-2xl bg-white/5 border border-white/5 flex items-center gap-3 transition-colors"
                >
                    <div className="p-2 rounded-xl bg-amber-500/20 text-amber-500 shadow-lg shadow-amber-500/10">
                        <Zap size={16} />
                    </div>
                    <div className="text-left">
                        <div className="text-[8px] font-black uppercase text-muted-foreground/30 leading-none tracking-widest">Velocity</div>
                        <div className="text-[12px] font-black text-foreground">94.2%</div>
                    </div>
                </motion.div>
            </footer>

            {/* Background Decorative */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle_at_30%_30%,_rgba(var(--primary-hsl),0.05)_0%,_transparent_60%)] pointer-events-none" />
        </div>
    );
}

'use client';

import React from 'react';
import { ChevronRight, Network, Rocket, Terminal, Layers, Zap, Users, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface Project {
    id: string;
    title: string;
    lead: string;
    progress: number;
    members: number;
    color: string;
    status: 'active' | 'pending' | 'syncing';
}

const projects: Project[] = [
    { id: '1', title: 'Orbit Redesign', lead: '@aether_visionary', progress: 75, members: 5, color: 'primary', status: 'active' },
    { id: '2', title: 'Lunar Hub', lead: '@selene_architect', progress: 42, members: 8, color: 'accent', status: 'syncing' },
    { id: '3', title: 'Bio-Neural Interface', lead: '@neuro_linker', progress: 90, members: 3, color: 'secondary', status: 'active' },
    { id: '4', title: 'Quantum Mesh', lead: '@quant_dev', progress: 15, members: 12, color: 'primary', status: 'pending' },
];

export function ActiveProjectsWidget() {
    return (
        <div className="@container w-full h-full bg-card/10 backdrop-blur-3xl rounded-xl relative overflow-hidden flex flex-col p-3 border border-border/40 shadow-2xl text-foreground font-display group/widget">
            {/* Header */}
            <header className="flex items-center justify-between pb-2 mb-2 border-b border-white/5 shrink-0 z-10 relative">
                <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg border border-white/10">
                        <Rocket size={14} className="text-primary-foreground" />
                    </div>
                    <div className="space-y-0 text-left">
                        <h2 className="text-[8px] uppercase tracking-[0.25em] text-primary/70 font-black leading-tight">Project Stream</h2>
                        <h1 className="text-xs font-black text-foreground tracking-widest uppercase leading-none">Active Genesis</h1>
                    </div>
                </div>
                <div className="flex items-center gap-1.5">
                    <button className="h-7 px-3 flex items-center gap-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/20 transition-all text-primary text-[10px] font-black uppercase tracking-wider">
                        <Plus size={10} />
                        New
                    </button>
                </div>
            </header>

            {/* Scrollable Area */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                <AnimatePresence>
                    {projects.map((project, idx) => (
                        <motion.div
                            key={project.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            whileHover={{ scale: 1.01, x: 2 }}
                            className="group/card relative bg-white/5 hover:bg-white/10 border border-white/5 hover:border-primary/30 rounded-xl p-2.5 transition-all cursor-pointer overflow-hidden"
                        >
                            {/* Accent Line */}
                            <div className={cn(
                                "absolute left-0 top-0 bottom-0 w-1 transition-all group-hover/card:w-1.5",
                                project.color === 'primary' ? "bg-primary" : project.color === 'accent' ? "bg-accent" : "bg-secondary"
                            )} />

                            <div className="flex items-center gap-3">
                                {/* Progress Ring */}
                                <div className="relative h-10 w-10 shrink-0">
                                    <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                                        <circle className="stroke-white/5" cx="18" cy="18" fill="none" r="16" strokeWidth="3" />
                                        <motion.circle
                                            initial={{ strokeDashoffset: 100 }}
                                            animate={{ strokeDashoffset: 100 - project.progress }}
                                            transition={{ duration: 1.5, ease: "easeOut" }}
                                            className={cn(
                                                "drop-shadow-[0_0_5px_rgba(var(--primary-hsl),0.5)]",
                                                project.color === 'primary' ? "stroke-primary" : project.color === 'accent' ? "stroke-accent" : "stroke-secondary"
                                            )}
                                            cx="18" cy="18" fill="none" r="16" strokeDasharray="100" strokeLinecap="round" strokeWidth="3"
                                        />
                                    </svg>
                                    <div className="absolute inset-0 flex items-center justify-center text-[8px] font-black text-foreground/80">
                                        {project.progress}%
                                    </div>
                                </div>

                                <div className="flex-1 min-w-0">
                                    <h3 className="text-[11px] font-black text-foreground uppercase tracking-tight truncate leading-tight">
                                        {project.title}
                                    </h3>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[8px] font-bold text-muted-foreground/60 truncate italic">{project.lead}</span>
                                        <div className="h-1 w-1 rounded-full bg-white/20" />
                                        <div className="flex items-center gap-1 text-[8px] font-black text-primary/70 uppercase tracking-tighter">
                                            <Users size={8} />
                                            {project.members}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity">
                                    <div className="h-6 w-6 flex items-center justify-center rounded-lg bg-white/5 text-muted-foreground">
                                        <ChevronRight size={14} />
                                    </div>
                                </div>
                            </div>

                            {project.status === 'syncing' && (
                                <motion.div
                                    animate={{ x: ['100%', '-100%'] }}
                                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                    className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-accent to-transparent opacity-50"
                                />
                            )}
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Footer */}
            <footer className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between z-10 relative">
                <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                        <span className="text-[9px] font-black text-foreground leading-none">98%</span>
                        <span className="text-[7px] text-muted-foreground/40 uppercase tracking-tighter font-bold">Uptime</span>
                    </div>
                </div>
                <button className="text-[8px] font-black text-primary uppercase tracking-[0.2em] flex items-center gap-1 hover:gap-2 transition-all group/link">
                    View Network
                    <ChevronRight size={10} className="transition-transform" />
                </button>
            </footer>
        </div>
    );
}

"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import { Sparkles, Sun, Moon, Cloud, Zap, Droplets, Flame, Wind } from "lucide-react";

export function ThemeSelectorWidget() {
    const { theme: currentTheme, setTheme } = useTheme();

    const themes = [
        { id: 'light', name: 'Alabaster', icon: Sun, color: 'from-orange-100 to-amber-50' },
        { id: 'dark', name: 'Obsidian', icon: Moon, color: 'from-zinc-900 to-slate-900' },
        { id: 'liquid-crystal', name: 'Liquid Crystal', icon: Sparkles, color: 'from-cyan-500/20 to-blue-500/20' },
        { id: 'glass', name: 'Prism Glass', icon: Droplets, color: 'from-blue-600/20 to-indigo-600/20' },
        { id: 'natural', name: 'Gaia Pulse', icon: Zap, color: 'from-emerald-500/20 to-teal-500/20' },
        { id: 'grey', name: 'Monolith', icon: Wind, color: 'from-slate-500/20 to-zinc-500/20' },
    ];

    return (
        <div className="@container w-full h-full bg-card/10 backdrop-blur-3xl rounded-xl relative overflow-hidden flex flex-col p-4 @sm:p-6 border border-border/40 shadow-2xl text-foreground font-display group">
            {/* Background Effects */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] bg-[conic-gradient(at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-accent/10 opacity-30 pointer-events-none group-hover:rotate-12 transition-transform duration-1000"></div>

            {/* Header */}
            <header className="flex flex-col items-center justify-center pb-6 border-b border-border/10 shrink-0 z-10 relative text-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-background/40 border border-border/10 flex items-center justify-center shadow-sm">
                        <Sparkles size={18} className="text-primary animate-pulse" />
                    </div>
                    <div>
                        <h2 className="text-[10px] @sm:text-xs font-black text-foreground tracking-[0.3em] uppercase">Vibrancy</h2>
                        <p className="text-muted-foreground text-[8px] font-bold uppercase tracking-widest mt-1">Atmospheric Resonance</p>
                    </div>
                </div>
            </header>

            {/* Theme Grid */}
            <main className="flex-1 mt-6 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent z-10 relative">
                <div className="grid grid-cols-2 gap-3 min-h-full content-center">
                    {themes.map((theme) => (
                        <button
                            key={theme.id}
                            onClick={() => setTheme(theme.id)}
                            className={cn(
                                "group/item flex flex-col items-center justify-center p-4 rounded-xl transition-all duration-300 border relative overflow-hidden",
                                "hover:scale-[1.02] hover:shadow-lg active:scale-95",
                                currentTheme === theme.id
                                    ? "bg-primary/10 border-primary/40 shadow-[0_0_20px_rgba(var(--primary-hsl),0.2)]"
                                    : "bg-background/20 border-border/10 hover:bg-background/40 hover:border-border/20"
                            )}
                        >
                            {/* Inner Glow */}
                            <div className={cn(
                                "absolute inset-0 opacity-0 group-hover/item:opacity-20 transition-opacity pointer-events-none bg-gradient-to-br",
                                theme.color
                            )}></div>

                            <div className={cn(
                                "w-10 h-10 @sm:w-12 @sm:h-12 rounded-xl flex items-center justify-center mb-3 transition-transform duration-500 group-hover/item:rotate-12",
                                "bg-background/40 border border-border/10 shadow-inner",
                                currentTheme === theme.id ? "text-primary scale-110" : "text-muted-foreground group-hover/item:text-foreground"
                            )}>
                                <theme.icon size={20} className="@sm:scale-110" />
                            </div>

                            <span className={cn(
                                "text-[10px] @sm:text-xs font-black uppercase tracking-widest text-center transition-colors",
                                currentTheme === theme.id ? "text-primary" : "text-muted-foreground group-hover/item:text-foreground"
                            )}>
                                {theme.name}
                            </span>

                            {currentTheme === theme.id && (
                                <div className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-primary animate-ping"></div>
                            )}
                        </button>
                    ))}
                </div>
            </main>

            {/* Footer Status */}
            <footer className="mt-6 pt-4 border-t border-border/10 flex justify-center z-10 relative">
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-background/40 border border-border/10">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                    <span className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground/80">System Frequency Synchronized</span>
                </div>
            </footer>

            {/* Decorative Liquid Accents */}
            <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[80px] pointer-events-none"></div>
        </div>
    );
}

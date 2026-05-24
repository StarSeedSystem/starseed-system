"use client";

import React from 'react';
import { GlassCard } from '@/components/crystal/GlassCard';
import { cn } from '@/lib/utils';
import {
    Signal,
    Wifi,
    Battery,
    Activity,
    RefreshCw,
    Sparkles,
    Shield,
    Atom,
    Cpu
} from 'lucide-react';
import { motion } from 'framer-motion';

export function SystemMonitor({ className }: { className?: string }) {
    return (
        <div className={cn("w-full max-w-md mx-auto aspect-[9/19] relative rounded-[3rem] overflow-hidden shadow-2xl border-[8px] border-slate-800 dark:border-slate-900 bg-background-dark", className)}>
            {/* Wallpaper Background */}
            <div className="absolute inset-0 z-0 opacity-40 pointer-events-none">
                {/* Abstract deep space nebula placeholder or gradient */}
                <div className="w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-[#0f1923] to-black" />
                <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1462331940025-496dfbfc7564?q=80&w=2022&auto=format&fit=crop')] bg-cover bg-center mix-blend-overlay opacity-50" />
            </div>

            {/* UI Content Layer */}
            <div className="relative z-10 h-full flex flex-col p-6 space-y-6 overflow-y-auto">

                {/* Status Bar */}
                <div className="flex justify-between items-center px-4 pt-2 text-white/70">
                    <span className="text-xs font-bold tracking-widest uppercase">9:41</span>
                    <div className="flex items-center space-x-2">
                        <Signal size={14} />
                        <Wifi size={14} />
                        <Battery size={14} />
                    </div>
                </div>

                {/* Header Section */}
                <header className="flex justify-between items-center mt-4 text-white">
                    <div>
                        <h1 className="text-sm font-light tracking-[0.2em] text-[#007fff] uppercase opacity-80 font-headline">System Vitality</h1>
                        <p className="text-2xl font-bold tracking-tight font-display">StarSeed <span className="text-[#007fff]">Trinity</span></p>
                    </div>
                    <GlassCard variant="subtle" className="w-12 h-12 flex items-center justify-center rounded-full" intensity={0.5}>
                        <Activity className="text-[#007fff] animate-pulse" size={24} />
                    </GlassCard>
                </header>

                {/* Main Monitor Widget */}
                <GlassCard variant="intense" className="rounded-[2rem] p-6 space-y-8 relative overflow-hidden text-white" intensity={1.2} specular frost>
                    {/* Hex Grid Overlay */}
                    <div
                        className="absolute inset-0 opacity-10 pointer-events-none"
                        style={{
                            backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(220, 20, 60, 0.5) 1px, transparent 0)',
                            backgroundSize: '20px 20px'
                        }}
                    />

                    {/* Grid: CPU & Memory */}
                    <div className="grid grid-cols-2 gap-6 relative z-10">
                        {/* CPU Core Ring */}
                        <div className="flex flex-col items-center justify-center space-y-3">
                            <div className="relative w-28 h-28 flex items-center justify-center">
                                {/* Track */}
                                <div className="absolute inset-0 rounded-full border-4 border-slate-700/30"></div>
                                {/* Progress Ring (Animated via conic gradient) */}
                                <motion.div
                                    className="absolute inset-0 rounded-full"
                                    style={{
                                        background: 'conic-gradient(from 0deg, #007fff 0%, #007fff 65%, transparent 65%, transparent 100%)',
                                        boxShadow: '0 0 15px rgba(0,127,255,0.4)',
                                    }}
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                                />
                                {/* Inner Circle */}
                                <div className="w-20 h-20 rounded-full bg-[#0f1923]/90 flex flex-col items-center justify-center z-10 border border-white/10 backdrop-blur-sm">
                                    <span className="text-xs font-light opacity-60 uppercase">CPU</span>
                                    <span className="text-xl font-bold font-mono">65%</span>
                                </div>
                            </div>
                            <span className="text-[10px] tracking-widest uppercase opacity-50 font-medium">Core Load</span>
                        </div>

                        {/* Memory Pool Pill */}
                        <div className="flex flex-col items-center justify-center space-y-3">
                            <div className="relative w-16 h-28 bg-white/5 rounded-full border border-white/10 overflow-hidden backdrop-blur-md">
                                {/* Liquid Wave */}
                                <motion.div
                                    className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#39FF14] to-[#1a8a0a] opacity-80 shadow-[0_-5px_15px_rgba(57,255,20,0.3)]"
                                    initial={{ height: "40%" }}
                                    animate={{ height: ["70%", "75%", "68%", "72%"] }}
                                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                                />
                                <div className="absolute inset-0 flex flex-col items-center justify-center z-10 space-y-1">
                                    <span className="text-xs font-light text-white uppercase drop-shadow-md">RAM</span>
                                    <span className="text-lg font-bold text-white drop-shadow-md font-mono">7.2</span>
                                    <span className="text-[8px] font-medium text-white/80 uppercase">GB</span>
                                </div>
                            </div>
                            <span className="text-[10px] tracking-widest uppercase opacity-50 font-medium">Pool Occupancy</span>
                        </div>
                    </div>

                    {/* Network Stream Line Graph */}
                    <div className="space-y-2 relative z-10">
                        <div className="flex justify-between items-end">
                            <span className="text-[10px] tracking-widest uppercase opacity-50 font-medium">Network Stream</span>
                            <div className="flex items-center space-x-2 font-mono text-[9px]">
                                <span className="text-[#FFBF00]">↑ 14.2 MB/s</span>
                                <span className="text-[#007fff]">↓ 128.5 MB/s</span>
                            </div>
                        </div>
                        <div className="h-16 w-full relative">
                            {/* Simulated Graph */}
                            <svg className="w-full h-full overflow-visible" viewBox="0 0 100 40" preserveAspectRatio="none">
                                <defs>
                                    <linearGradient id="grad-amber" x1="0%" x2="0%" y1="0%" y2="100%">
                                        <stop offset="0%" stopColor="#FFBF00" stopOpacity="0.5" />
                                        <stop offset="100%" stopColor="#FFBF00" stopOpacity="0" />
                                    </linearGradient>
                                </defs>
                                <motion.path
                                    d="M0,30 Q10,10 20,25 T40,15 T60,20 T80,5 T100,25"
                                    fill="none"
                                    stroke="#FFBF00"
                                    strokeWidth="1.5"
                                    initial={{ pathLength: 0 }}
                                    animate={{ pathLength: 1 }}
                                    transition={{ duration: 2, ease: "easeInOut" }}
                                />
                                <motion.path
                                    d="M0,30 Q10,10 20,25 T40,15 T60,20 T80,5 T100,25 V40 H0 Z"
                                    fill="url(#grad-amber)"
                                    stroke="none"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 0.3 }}
                                    transition={{ delay: 0.5, duration: 1 }}
                                />
                                {/* Glowing Nodes */}
                                <circle cx="40" cy="15" r="1.5" fill="#FFBF00" className="animate-pulse" />
                                <circle cx="80" cy="5" r="1.5" fill="#FFBF00" className="animate-pulse" />
                            </svg>
                        </div>
                    </div>

                    {/* Perimeter Shield Integrity */}
                    <div className="pt-4 border-t border-white/10 relative z-10">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center space-x-2 text-[#DC143C]">
                                <Shield size={14} />
                                <span className="text-[10px] tracking-widest uppercase opacity-70 font-medium text-white">Shield Integrity</span>
                            </div>
                            <span className="text-xs font-mono text-[#DC143C] font-bold">98.2%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-700/30 rounded-full overflow-hidden flex">
                            <div className="h-full bg-[#DC143C] w-[98.2%] shadow-[0_0_10px_rgba(220,20,60,0.5)]"></div>
                        </div>
                    </div>
                </GlassCard>

                {/* Interaction Section (Droplet Buttons) */}
                <div className="grid grid-cols-3 gap-3">
                    <LiquidButton icon={RefreshCw} label="Recalibrate" color="primary" />
                    <LiquidButton icon={Sparkles} label="Purge Cache" color="neon-lime" />
                    <LiquidButton icon={Shield} label="Secure Stream" color="solar-amber" />
                </div>

                {/* Bottom Laboratory Metrics */}
                <GlassCard variant="subtle" className="mt-auto rounded-xl p-4 flex items-center justify-between text-white" intensity={0.6}>
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-[#007fff]/20 flex items-center justify-center">
                            <Atom className="text-[#007fff]" size={20} />
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-widest opacity-50">Lab Link</p>
                            <p className="text-xs font-bold font-mono">Alpha-7 Node</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] uppercase tracking-widest opacity-50">Latency</p>
                        <p className="text-xs font-bold text-[#39FF14] font-mono">12ms</p>
                    </div>
                </GlassCard>

                {/* Home Indicator */}
                <div className="w-32 h-1 bg-white/20 rounded-full mx-auto mt-4 mb-2"></div>
            </div>
        </div>
    );
}

// Sub-component for buttons to keep main clean
function LiquidButton({ icon: Icon, label, color }: { icon: any, label: string, color: string }) {
    const colorMap: Record<string, string> = {
        'primary': 'text-[#007fff] border-[#007fff]/20',
        'neon-lime': 'text-[#39FF14] border-[#39FF14]/20',
        'solar-amber': 'text-[#FFBF00] border-[#FFBF00]/20'
    };

    return (
        <button className={cn(
            "rounded-full py-4 flex flex-col items-center justify-center transition-all active:scale-95 border border-white/5 hover:border-white/20 bg-white/5 hover:bg-white/10 backdrop-blur-sm shadow-lg",
            colorMap[color]
        )}>
            <Icon className="mb-1 transition-transform group-hover:scale-110" size={20} />
            <span className="text-[8px] uppercase tracking-tighter font-bold opacity-60 text-white">{label}</span>
        </button>
    );
}

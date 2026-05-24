'use client';

import React from 'react';
import { MessageSquare, Send, Search, MoreVertical, ShieldCheck, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

const MESSAGES = [
    {
        id: '1',
        sender: 'Horizon',
        role: 'Creation Canvas',
        content: 'New architectural blueprints for the Sphere-City are ready for review.',
        time: 'Now',
        isAI: true,
        presence: 'online'
    },
    {
        id: '2',
        sender: 'Logic',
        role: 'Control Panel',
        content: 'System optimization complete. Network stability at 99.99%.',
        time: '2m ago',
        isAI: true,
        presence: 'online'
    },
    {
        id: '3',
        sender: 'User_41',
        role: 'Architect',
        content: 'I have some ideas for the governance module update.',
        time: '15m ago',
        isAI: false,
        presence: 'away'
    }
];

export function MessagesWidget() {
    return (
        <div className="@container w-full h-full bg-card/10 backdrop-blur-3xl rounded-xl relative overflow-hidden flex flex-col p-3 @sm:p-5 border border-border/40 shadow-2xl text-foreground font-display group/widget">
            {/* Neural Uplink Header */}
            <header className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0 z-10 relative">
                <div className="flex items-center gap-4">
                    <motion.div
                        whileHover={{ scale: 1.1, rotate: 5, shadow: "0 0 30px rgba(var(--primary-hsl),0.6)" }}
                        className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary via-accent to-blue-600 flex items-center justify-center shadow-[0_0_20px_rgba(var(--primary-hsl),0.4)] border border-white/20 relative overflow-hidden group/icon"
                    >
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/30 to-transparent animate-pulse" />
                        <MessageSquare size={24} className="text-white drop-shadow-lg relative z-10 group-hover/icon:animate-bounce" />
                    </motion.div>
                    <div className="space-y-0.5 text-left">
                        <div className="flex items-center gap-3">
                            <h2 className="text-[12px] uppercase tracking-[0.4em] text-primary font-black leading-tight drop-shadow-sm">Neural Uplink</h2>
                            <div className="flex gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
                                {[1, 2, 3].map(i => (
                                    <motion.div
                                        key={i}
                                        animate={{
                                            opacity: [0.3, 1, 0.3],
                                            scale: [0.8, 1.3, 0.8]
                                        }}
                                        transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                                        className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary-hsl),0.8)]"
                                    />
                                ))}
                            </div>
                        </div>
                        <h1 className="text-lg font-black text-foreground tracking-tighter uppercase leading-none opacity-80">Intelligence Hub</h1>
                    </div>
                </div>

                <div className="flex gap-3">
                    <motion.button
                        whileHover={{ scale: 1.1, backgroundColor: "rgba(255,255,255,0.15)" }}
                        whileTap={{ scale: 0.9 }}
                        className="h-10 w-10 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 transition-all shadow-inner"
                    >
                        <Search size={18} className="text-muted-foreground" />
                    </motion.button>
                    <motion.button
                        whileHover={{ scale: 1.1, rotate: 12, shadow: "0 0 20px rgba(245,158,11,0.4)" }}
                        whileTap={{ scale: 0.95 }}
                        className="h-10 w-10 flex items-center justify-center rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-all text-amber-500 shadow-lg"
                    >
                        <Zap size={18} fill="currentColor" />
                    </motion.button>
                </div>
            </header>

            {/* Message Thread */}
            <main className="flex-1 overflow-y-auto mt-6 space-y-6 pr-2 custom-scroll scrollbar-hide z-10 relative pb-6 h-full">
                <AnimatePresence initial={false}>
                    {MESSAGES.map((msg, idx) => (
                        <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, x: idx % 2 === 0 ? -20 : 20, scale: 0.9 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            transition={{
                                type: "spring",
                                stiffness: 200,
                                damping: 25,
                                delay: idx * 0.15
                            }}
                            className="flex flex-col gap-2 group/msg"
                        >
                            <div className="flex items-center justify-between px-2">
                                <div className="flex items-center gap-3">
                                    <span className={cn(
                                        "text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300",
                                        msg.isAI ? "text-primary drop-shadow-[0_0_8px_rgba(var(--primary-hsl),0.5)] scale-110" : "text-muted-foreground group-hover/msg:text-foreground"
                                    )}>
                                        {msg.sender}
                                    </span>
                                    {msg.isAI && (
                                        <motion.div
                                            animate={{ scale: [1, 1.2, 1] }}
                                            transition={{ duration: 2, repeat: Infinity }}
                                        >
                                            <ShieldCheck size={12} className="text-primary" />
                                        </motion.div>
                                    )}
                                    <div className={cn(
                                        "w-2 h-2 rounded-full ring-4 ring-background/50 shadow-[0_0_12px_currentColor]",
                                        msg.presence === 'online' ? "bg-emerald-500 text-emerald-400" : "bg-orange-500 text-orange-400"
                                    )} />
                                    <span className="text-[9px] font-bold text-muted-foreground/30 uppercase tracking-widest">{msg.role}</span>
                                </div>
                                <span className="text-[9px] text-muted-foreground/40 font-mono tracking-tighter bg-white/5 px-2 py-0.5 rounded-full border border-white/5">
                                    {msg.time}
                                </span>
                            </div>

                            <motion.div
                                whileHover={{ scale: 1.01, x: 5, backgroundColor: msg.isAI ? "rgba(var(--primary-hsl), 0.18)" : "rgba(255,255,255,0.12)" }}
                                className={cn(
                                    "p-5 rounded-[2rem] relative overflow-hidden backdrop-blur-2xl border transition-all duration-500 shadow-2xl",
                                    msg.isAI
                                        ? "bg-primary/15 border-primary/30 rounded-tl-none ring-1 ring-primary/20 shadow-primary/10"
                                        : "bg-white/5 border-white/10 rounded-tl-none shadow-black/30"
                                )}
                            >
                                {/* Neural Mesh Decoration */}
                                <div className="absolute inset-0 opacity-5 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />

                                {/* Glass Edge Highlight */}
                                <div className={cn(
                                    "absolute top-0 left-0 w-[3px] h-full",
                                    msg.isAI ? "bg-gradient-to-b from-primary via-primary/50 to-transparent shadow-[0_0_10px_rgba(var(--primary-hsl),0.5)]" : "bg-gradient-to-b from-white/30 to-transparent"
                                )} />

                                <p className="text-[13px] leading-relaxed relative z-10 font-medium tracking-tight text-foreground/90">
                                    {msg.content}
                                </p>

                                {/* Interactive Dots */}
                                <div className="absolute bottom-2 right-4 flex gap-1 opacity-10 group-hover/msg:opacity-60 transition-all duration-500">
                                    <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ duration: 2, repeat: Infinity }} className="w-1 h-1 rounded-full bg-white" />
                                    <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ duration: 2, repeat: Infinity, delay: 0.5 }} className="w-1 h-1 rounded-full bg-white" />
                                </div>
                            </motion.div>
                        </motion.div>
                    ))}

                    {/* Highly Animated Typing Indicator */}
                    <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-4 px-2 pt-4 group/typing"
                    >
                        <div className="flex gap-2 p-3 rounded-2xl bg-primary/10 border border-primary/20 shadow-inner ring-1 ring-primary/10 scale-110">
                            {[0, 1, 2].map((i) => (
                                <motion.div
                                    key={i}
                                    animate={{
                                        scale: [1, 1.5, 1],
                                        opacity: [0.4, 1, 0.4],
                                        y: [0, -4, 0]
                                    }}
                                    transition={{
                                        duration: 1,
                                        repeat: Infinity,
                                        delay: i * 0.15,
                                        ease: "easeInOut"
                                    }}
                                    className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_10px_rgba(var(--primary-hsl),1)]"
                                />
                            ))}
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-[0.3em] text-primary font-black animate-pulse drop-shadow-sm">Zenith synapsing</span>
                            <span className="text-[7px] text-muted-foreground/50 font-mono tracking-widest bg-white/5 px-2 py-0.5 rounded-full mt-1 border border-white/5">
                                UPLINK_STRENGTH_99.9%
                            </span>
                        </div>
                    </motion.div>
                </AnimatePresence>
            </main>

            {/* Premium Input Area */}
            <footer className="mt-auto pt-6 border-t border-white/10 z-10 relative">
                <div className="relative group/input shadow-2xl rounded-[1.5rem] overflow-hidden">
                    <input
                        type="text"
                        placeholder="Broadcast intent to the neural network..."
                        className="w-full bg-white/5 border border-white/15 rounded-[1.5rem] px-6 py-5 text-sm placeholder:text-muted-foreground/20 focus:outline-none focus:border-primary/50 focus:bg-white/10 focus:ring-8 focus:ring-primary/5 transition-all pr-16 font-medium tracking-tight"
                    />
                    <motion.button
                        whileHover={{ scale: 1.1, x: -5, backgroundColor: "rgba(var(--primary-hsl), 1)", shadow: "0 0 20px rgba(var(--primary-hsl),0.5)" }}
                        whileTap={{ scale: 0.9 }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 h-12 w-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-2xl transition-all border border-white/20"
                    >
                        <Send size={20} className="drop-shadow-lg" />
                    </motion.button>
                </div>
            </footer>

            {/* Immersive Glass Overlays */}
            <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-card/100 via-card/50 to-transparent pointer-events-none z-[5] blur-sm" />

            {/* Ambient Neural Light Flows */}
            <motion.div
                animate={{
                    opacity: [0.1, 0.25, 0.1],
                    x: [-20, 20, -20],
                    y: [-10, 10, -10]
                }}
                transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
                className="absolute top-0 right-0 w-80 h-80 bg-primary/30 blur-[120px] rounded-full pointer-events-none z-0"
            />
            <motion.div
                animate={{
                    opacity: [0.05, 0.2, 0.05],
                    scale: [1, 1.2, 1],
                    x: [20, -20, 20]
                }}
                transition={{ duration: 10, repeat: Infinity, delay: 2 }}
                className="absolute bottom-0 left-0 w-80 h-80 bg-accent/20 blur-[120px] rounded-full pointer-events-none z-0"
            />
        </div>
    );
}

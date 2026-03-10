'use client';

import React, { useState } from 'react';
import { Calculator, Equal, History, Delete, Zap, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

export function CalculatorWidget() {
    const [display, setDisplay] = useState('0');
    const [lastOp, setLastOp] = useState<string | null>(null);

    const handlePress = (val: string) => {
        if (display === '0') setDisplay(val);
        else if (display.length < 12) setDisplay(display + val);
    };

    const clear = () => setDisplay('0');

    const buttons = [
        { label: 'C', type: 'action' },
        { label: '±', type: 'action' },
        { label: '%', type: 'action' },
        { label: '/', type: 'operator' },
        { label: '7', type: 'num' },
        { label: '8', type: 'num' },
        { label: '9', type: 'num' },
        { label: '*', type: 'operator' },
        { label: '4', type: 'num' },
        { label: '5', type: 'num' },
        { label: '6', type: 'num' },
        { label: '-', type: 'operator' },
        { label: '1', type: 'num' },
        { label: '2', type: 'num' },
        { label: '3', type: 'num' },
        { label: '+', type: 'operator' },
        { label: '0', type: 'num', wide: true },
        { label: '.', type: 'num' },
        { label: '=', type: 'equal' },
    ];

    return (
        <div className="@container w-full h-full bg-card/10 backdrop-blur-3xl rounded-xl relative overflow-hidden flex flex-col p-3 border border-border/40 shadow-2xl text-foreground font-display group/widget">
            {/* Header */}
            <header className="flex items-center justify-between pb-2 mb-2 border-b border-white/5 shrink-0 z-10 relative">
                <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg border border-white/10">
                        <Calculator size={14} className="text-primary-foreground" />
                    </div>
                    <div className="space-y-0 text-left">
                        <h2 className="text-[8px] uppercase tracking-[0.25em] text-primary/70 font-black leading-tight">Logic Engine</h2>
                        <h1 className="text-xs font-black text-foreground tracking-widest uppercase leading-none">Quantum Calc</h1>
                    </div>
                </div>
                <button className="h-7 w-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-muted-foreground">
                    <History size={12} />
                </button>
            </header>

            {/* Display */}
            <div className="mb-3 relative shrink-0">
                <div className="bg-black/40 border border-primary/20 rounded-xl p-3 flex flex-col items-end justify-center h-16 @sm:h-20 shadow-inner overflow-hidden relative group/display">
                    {/* Animated Glow */}
                    <motion.div
                        animate={{ opacity: [0.1, 0.3, 0.1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="absolute inset-0 bg-primary/10 blur-xl pointer-events-none"
                    />
                    <span className="text-[8px] absolute top-1.5 left-3 font-black tracking-[0.3em] text-primary/40 uppercase">Output Scalar</span>
                    <AnimatePresence mode="wait">
                        <motion.span
                            key={display}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-2xl @sm:text-4xl font-mono text-primary drop-shadow-[0_0_10px_rgba(var(--primary-hsl),0.5)] tracking-tighter"
                        >
                            {display}
                        </motion.span>
                    </AnimatePresence>
                </div>
            </div>

            {/* Keypad */}
            <div className="flex-1 grid grid-cols-4 gap-1.5 z-10 relative min-h-0">
                {buttons.map((btn) => (
                    <motion.button
                        key={btn.label}
                        whileHover={{ scale: 1.02, y: -1 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => btn.label === 'C' ? clear() : handlePress(btn.label)}
                        className={cn(
                            "rounded-xl flex items-center justify-center text-xs @sm:text-sm font-black transition-all border relative overflow-hidden group/btn",
                            btn.wide ? "col-span-2" : "col-span-1",
                            btn.type === 'equal'
                                ? "bg-primary text-primary-foreground border-white/20 shadow-lg shadow-primary/20"
                                : btn.type === 'operator'
                                    ? "bg-accent/10 border-accent/20 text-accent hover:bg-accent/20"
                                    : btn.type === 'action'
                                        ? "bg-white/5 border-white/10 text-muted-foreground hover:text-foreground"
                                        : "bg-white/5 border-white/10 text-foreground hover:bg-white/10 hover:border-primary/30"
                        )}
                    >
                        {btn.type === 'equal' && <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-500" />}
                        {btn.label === '=' ? <Equal size={20} /> : btn.label}
                    </motion.button>
                ))}
            </div>

            {/* Footer Status */}
            <footer className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-[7px] font-black tracking-widest uppercase text-muted-foreground/40 z-10 relative">
                <div className="flex items-center gap-1.5">
                    <Zap size={8} className="text-primary" />
                    <span>Processing: Local</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <Sparkles size={8} className="text-accent" />
                    <span>Mode: Scalar</span>
                </div>
            </footer>
        </div>
    );
}

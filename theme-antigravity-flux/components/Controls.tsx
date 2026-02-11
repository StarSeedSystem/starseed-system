'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const SPRINGS = {
    buttonPress: { type: 'spring' as const, stiffness: 500, damping: 30, mass: 0.6 },
    toggleSnap: { type: 'spring' as const, stiffness: 700, damping: 25, mass: 0.4 },
    sliderThumb: { type: 'spring' as const, stiffness: 200, damping: 20, mass: 0.3 },
};

// ── LiquidButton ─────────────────────────────────────────────────────────────
export const LiquidButton: React.FC<{
    children: React.ReactNode;
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
}> = ({ children, variant = 'primary', size = 'md', onClick, disabled = false, className = '' }) => {
    const sizes: Record<string, string> = {
        sm: 'px-4 py-2 text-sm rounded-lg',
        md: 'px-6 py-3 text-base rounded-xl',
        lg: 'px-8 py-4 text-lg rounded-2xl',
    };
    const variants: Record<string, string> = {
        primary: 'bg-gradient-to-br from-violet-600 to-indigo-700 text-white shadow-[0_4px_14px_0_rgba(124,58,237,0.39)]',
        secondary: 'bg-white/10 text-white border border-white/10 backdrop-blur-md',
        danger: 'bg-red-500/20 text-red-200 border border-red-500/30 shadow-[0_0_12px_rgba(239,68,68,0.2)]',
        ghost: 'text-white/60 hover:text-white',
    };

    return (
        <motion.button
            onClick={onClick}
            disabled={disabled}
            whileHover={{ scale: 1.04, y: -1 }}
            whileTap={{ scale: 0.95, y: 1 }}
            transition={SPRINGS.buttonPress}
            className={`relative font-medium overflow-hidden group cursor-pointer transition-shadow duration-300 ${sizes[size]} ${variants[variant]} ${disabled ? 'opacity-50 pointer-events-none' : ''} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F0F23] ${className}`}
        >
            <span className="relative z-10 flex items-center justify-center gap-2">{children}</span>
            <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out pointer-events-none" />
            {variant === 'primary' && (
                <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-40 transition-opacity duration-400 pointer-events-none" style={{ boxShadow: 'inset 0 0 24px rgba(139,92,246,0.4)' }} />
            )}
            <div className="absolute inset-0 rounded-xl opacity-0 group-active:opacity-100 transition-opacity duration-100 pointer-events-none" style={{ boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.3)' }} />
        </motion.button>
    );
};

// ── ToggleSwitch ─────────────────────────────────────────────────────────────
export const ToggleSwitch: React.FC<{
    checked: boolean;
    onChange: (checked: boolean) => void;
    label?: string;
}> = ({ checked, onChange, label }) => (
    <div className="flex items-center gap-3">
        <div
            className={`relative w-14 h-8 rounded-full cursor-pointer transition-colors duration-300 p-1 ${checked ? 'bg-indigo-600 shadow-[0_0_16px_rgba(99,102,241,0.6)]' : 'bg-slate-700/50 border border-white/8'}`}
            onClick={() => onChange(!checked)}
            role="switch"
            aria-checked={checked}
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onChange(!checked)}
        >
            <motion.div layout transition={SPRINGS.toggleSnap}
                className={`w-6 h-6 bg-white rounded-full shadow-md flex items-center justify-center ${checked ? 'shadow-[0_0_10px_rgba(255,255,255,0.8)]' : ''}`}
                style={{ x: checked ? '100%' : '0%' }}
            >
                <AnimatePresence>
                    {checked && (
                        <motion.div initial={{ scale: 0, opacity: 0.8 }} animate={{ scale: 2.5, opacity: 0 }} exit={{ scale: 0 }} transition={{ duration: 0.5 }} className="absolute rounded-full bg-indigo-400" style={{ width: '100%', height: '100%' }} />
                    )}
                </AnimatePresence>
                {checked && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-2 h-2 rounded-full bg-indigo-500" />}
            </motion.div>
        </div>
        {label && <span className="text-sm text-white/70 select-none">{label}</span>}
    </div>
);

// ── GlassInput ───────────────────────────────────────────────────────────────
export const GlassInput: React.FC<{
    placeholder?: string;
    label?: string;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    type?: string;
    icon?: React.ComponentType<any>;
    error?: string;
}> = ({ placeholder, label, value, onChange, type = 'text', icon: Icon, error }) => {
    const [isFocused, setIsFocused] = React.useState(false);
    const hasValue = value && value.length > 0;

    return (
        <div className="relative group">
            {label && (
                <motion.label className="absolute left-4 pointer-events-none font-medium z-10"
                    animate={{
                        top: isFocused || hasValue ? '6px' : '50%', y: isFocused || hasValue ? '0%' : '-50%',
                        fontSize: isFocused || hasValue ? '10px' : '14px',
                        color: isFocused ? 'rgba(139,92,246,0.9)' : error ? 'rgba(239,68,68,0.8)' : 'rgba(255,255,255,0.4)',
                    }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                >{label}</motion.label>
            )}
            {Icon && <div className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-300 ${isFocused ? 'text-indigo-400' : 'text-white/40'}`}><Icon size={18} /></div>}
            <input type={type} value={value} onChange={onChange} placeholder={!label ? placeholder : isFocused ? placeholder : ''}
                onFocus={() => setIsFocused(true)} onBlur={() => setIsFocused(false)}
                className={`w-full bg-black/20 rounded-xl text-white placeholder-white/25 transition-all duration-300 backdrop-blur-sm ${label ? 'pt-5 pb-2 px-4' : 'py-3 px-4'} ${Icon ? 'pl-12' : ''} ${error ? 'border-red-500/50 focus:ring-red-500/50' : 'border-white/10 focus:ring-indigo-500/50'} border focus:outline-none focus:ring-2 shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)]`}
                style={{ caretColor: error ? '#ef4444' : '#818cf8' }}
            />
            <motion.div className="absolute inset-0 rounded-xl pointer-events-none"
                animate={{ boxShadow: isFocused ? (error ? '0 0 0 2px rgba(239,68,68,0.3), 0 0 16px rgba(239,68,68,0.1)' : '0 0 0 2px rgba(99,102,241,0.3), 0 0 16px rgba(99,102,241,0.1)') : '0 0 0 0px transparent' }}
                transition={{ duration: 0.3 }}
            />
            {error && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-1.5 text-xs text-red-400 pl-1">{error}</motion.p>}
        </div>
    );
};

// ── GlassSlider ──────────────────────────────────────────────────────────────
export const GlassSlider: React.FC<{
    value: number; min?: number; max?: number; step?: number;
    onChange: (value: number) => void; label?: string; showValue?: boolean; accentColor?: string;
}> = ({ value, min = 0, max = 100, step = 1, onChange, label, showValue = true, accentColor = '#8B5CF6' }) => {
    const [isDragging, setIsDragging] = React.useState(false);
    const pct = ((value - min) / (max - min)) * 100;

    return (
        <div className="space-y-2">
            {(label || showValue) && (
                <div className="flex items-center justify-between">
                    {label && <span className="text-sm text-white/60 font-medium">{label}</span>}
                    {showValue && <motion.span className="text-sm font-mono font-bold" style={{ color: accentColor }} animate={{ scale: isDragging ? 1.1 : 1 }}>{value}</motion.span>}
                </div>
            )}
            <div className="relative h-2 w-full">
                <div className="absolute inset-0 rounded-full bg-white/10 overflow-hidden backdrop-blur-sm border border-white/5">
                    <motion.div className="h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${accentColor}88, ${accentColor})`, boxShadow: `0 0 12px ${accentColor}44` }} layout transition={SPRINGS.sliderThumb} />
                </div>
                <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
                    onMouseDown={() => setIsDragging(true)} onMouseUp={() => setIsDragging(false)}
                    onTouchStart={() => setIsDragging(true)} onTouchEnd={() => setIsDragging(false)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <motion.div className="absolute top-1/2 -translate-y-1/2 pointer-events-none" style={{ left: `calc(${pct}% - 8px)` }}
                    animate={{ scale: isDragging ? 1.3 : 1, boxShadow: isDragging ? `0 0 16px ${accentColor}66` : '0 2px 6px rgba(0,0,0,0.3)' }}
                    transition={SPRINGS.sliderThumb}
                >
                    <div className="w-4 h-4 rounded-full bg-white border-2" style={{ borderColor: accentColor }} />
                </motion.div>
                <AnimatePresence>
                    {isDragging && (
                        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: -8 }} exit={{ opacity: 0, y: 4 }}
                            className="absolute -top-8 pointer-events-none px-2 py-0.5 rounded-md text-xs font-mono font-bold text-white"
                            style={{ left: `calc(${pct}% - 16px)`, background: accentColor, boxShadow: `0 4px 12px ${accentColor}44` }}
                        >{value}</motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

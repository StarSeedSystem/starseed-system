'use client';

import React from 'react';
import { motion } from 'framer-motion';

// ── Spring constants ─────────────────────────────────────────────────────────
const SPRINGS = {
    widgetEmerge: { type: 'spring' as const, stiffness: 180, damping: 15, mass: 0.5 },
    cardHover: { type: 'spring' as const, stiffness: 300, damping: 20 },
};

// ── Trinity color mapping ────────────────────────────────────────────────────
const GLOW_MAP: Record<string, { glow: string; mist: string; accent: string }> = {
    zenith: { glow: 'rgba(0,127,255,0.5)', mist: 'rgba(0,200,255,0.08)', accent: '#007FFF' },
    horizonte: { glow: 'rgba(16,185,129,0.5)', mist: 'rgba(57,255,20,0.06)', accent: '#10B981' },
    logica: { glow: 'rgba(255,191,0,0.5)', mist: 'rgba(212,175,55,0.08)', accent: '#FFBF00' },
    base: { glow: 'rgba(220,20,60,0.4)', mist: 'rgba(220,20,60,0.06)', accent: '#DC143C' },
    purple: { glow: 'rgba(168,85,247,0.4)', mist: 'rgba(168,85,247,0.06)', accent: '#A855F7' },
    blue: { glow: 'rgba(59,130,246,0.4)', mist: 'rgba(59,130,246,0.06)', accent: '#3B82F6' },
    emerald: { glow: 'rgba(16,185,129,0.4)', mist: 'rgba(16,185,129,0.06)', accent: '#10B981' },
    amber: { glow: 'rgba(245,158,11,0.4)', mist: 'rgba(245,158,11,0.06)', accent: '#F59E0B' },
};

type GlowKey = keyof typeof GLOW_MAP;

// ── GlassCard ────────────────────────────────────────────────────────────────
export const GlassCard: React.FC<{
    children: React.ReactNode;
    className?: string;
    glowColor?: GlowKey;
    interactive?: boolean;
}> = ({ children, className = '', glowColor = 'purple', interactive = true }) => {
    const colors = GLOW_MAP[glowColor] || GLOW_MAP.purple;
    const Wrapper = interactive ? motion.div : 'div';
    const motionProps = interactive ? {
        whileHover: { y: -5, scale: 1.02 },
        transition: SPRINGS.cardHover,
    } : {};

    return (
        <Wrapper
            {...motionProps}
            className={`relative p-6 rounded-3xl overflow-hidden border border-white/10 bg-gradient-to-br from-white/5 to-white/0 backdrop-blur-xl ${className}`}
            style={{ boxShadow: '0 8px 32px 0 rgba(0,0,0,0.37), inset 0 0 0 1px rgba(255,255,255,0.05)' }}
        >
            {/* Dynamic Glow Orb */}
            <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full blur-[80px] opacity-40 mix-blend-screen pointer-events-none transition-colors duration-500" style={{ background: colors.glow }} />
            {/* Mist Layer */}
            <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at 50% 0%, ${colors.mist}, transparent 70%)` }} />
            {/* Content */}
            <div className="relative z-10">{children}</div>
            {/* Scanline */}
            <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none" style={{ background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, #000 4px)' }} />
        </Wrapper>
    );
};

// ── StatWidget ───────────────────────────────────────────────────────────────
export const StatWidget: React.FC<{
    title: string; value: string; change?: string;
    icon: React.ComponentType<any>; color?: GlowKey;
}> = ({ title, value, change, icon: Icon, color = 'purple' }) => {
    const isPositive = change?.startsWith('+');
    return (
        <GlassCard glowColor={color} className="flex flex-col justify-between h-32">
            <div className="flex justify-between items-start">
                <span className="text-white/60 text-sm font-medium">{title}</span>
                <div className="p-2 rounded-xl bg-white/5 text-white/80 border border-white/5">
                    <Icon size={18} />
                </div>
            </div>
            <div className="flex items-end justify-between">
                <span className="text-3xl font-bold text-white tracking-tight">{value}</span>
                {change && (
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${isPositive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>{change}</span>
                )}
            </div>
        </GlassCard>
    );
};

// ── OracleCard (Zenith Axis) ─────────────────────────────────────────────────
export const OracleCard: React.FC<{
    children: React.ReactNode;
    title?: string;
    glowIntensity?: number; // 0-1
    className?: string;
}> = ({ children, title, glowIntensity = 0.6, className = '' }) => (
    <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={SPRINGS.widgetEmerge}
        className={`relative p-6 rounded-3xl overflow-hidden border border-cyan-500/15 backdrop-blur-xl ${className}`}
        style={{
            background: 'linear-gradient(145deg, rgba(0,30,63,0.7) 0%, rgba(0,15,35,0.5) 100%)',
            boxShadow: `0 8px 32px rgba(0,127,255,${0.15 * glowIntensity}), 0 0 60px rgba(0,200,255,${0.06 * glowIntensity})`,
        }}
    >
        {/* Cyan Mist */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at 50% 20%, rgba(0,200,255,${0.08 * glowIntensity}), transparent 70%)` }} />
        {/* Resplandor Edge */}
        <div className="absolute top-0 left-[5%] right-[5%] h-px pointer-events-none" style={{ background: `linear-gradient(90deg, transparent, rgba(0,200,255,${0.5 * glowIntensity}), transparent)` }} />
        {title && <h3 className="relative z-10 text-sm font-medium text-cyan-300/80 mb-3 tracking-wide uppercase">{title}</h3>}
        <div className="relative z-10">{children}</div>
    </motion.div>
);

// ── GraphNode (Lógica Axis) ──────────────────────────────────────────────────
export const GraphNode: React.FC<{
    label: string;
    value?: string;
    status?: 'active' | 'idle' | 'error';
    connections?: number;
}> = ({ label, value, status = 'idle', connections = 0 }) => {
    const statusColors = {
        active: { ring: 'border-amber-500/50', dot: 'bg-amber-400', glow: '0 0 12px rgba(255,191,0,0.4)' },
        idle: { ring: 'border-white/15', dot: 'bg-white/40', glow: 'none' },
        error: { ring: 'border-red-500/50', dot: 'bg-red-500 animate-pulse', glow: '0 0 12px rgba(239,68,68,0.4)' },
    };
    const s = statusColors[status];

    return (
        <motion.div
            whileHover={{ scale: 1.05 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className={`relative inline-flex flex-col items-center gap-1.5 p-3 rounded-2xl border ${s.ring} bg-black/30 backdrop-blur-sm cursor-pointer`}
            style={{ boxShadow: s.glow }}
        >
            <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${s.dot}`} />
                <span className="text-xs font-mono text-amber-200/80">{label}</span>
            </div>
            {value && <span className="text-lg font-bold font-mono text-white">{value}</span>}
            {connections > 0 && (
                <span className="text-[10px] text-white/30 font-mono">{connections} conn</span>
            )}
        </motion.div>
    );
};

// ── ProgressRing ─────────────────────────────────────────────────────────────
export const ProgressRing: React.FC<{
    progress: number; // 0-100
    size?: number;
    strokeWidth?: number;
    color?: string;
    label?: string;
}> = ({ progress, size = 80, strokeWidth = 6, color = '#8B5CF6', label }) => {
    const r = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * r;
    const offset = circumference - (progress / 100) * circumference;

    return (
        <div className="flex flex-col items-center gap-2">
            <div className="relative" style={{ width: size, height: size }}>
                <svg width={size} height={size} className="-rotate-90">
                    <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth} fill="none" />
                    <motion.circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={strokeWidth} fill="none"
                        strokeLinecap="round"
                        initial={{ strokeDasharray: circumference, strokeDashoffset: circumference }}
                        animate={{ strokeDashoffset: offset }}
                        transition={{ duration: 1, ease: 'easeOut' }}
                        style={{ filter: `drop-shadow(0 0 6px ${color}66)` }}
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm font-bold text-white font-mono">{Math.round(progress)}%</span>
                </div>
            </div>
            {label && <span className="text-xs text-white/50">{label}</span>}
        </div>
    );
};

// ── DataFusionCluster (Metaball-like grouped cards) ──────────────────────────
export const DataFusionCluster: React.FC<{
    children: React.ReactNode;
    gap?: number;
    className?: string;
}> = ({ children, gap = 2, className = '' }) => (
    <div className={`relative ${className}`}>
        {/* Shared glow underlay */}
        <div className="absolute inset-0 rounded-[32px] blur-[40px] opacity-20 bg-gradient-to-br from-violet-500/40 via-transparent to-indigo-500/30 pointer-events-none" />
        <div className="relative grid grid-cols-1 sm:grid-cols-2 rounded-[32px] overflow-hidden border border-white/8 bg-white/[0.02] backdrop-blur-sm"
            style={{ gap: `${gap}px` }}
        >
            {children}
        </div>
    </div>
);

'use client';

/**
 * Antigravity Flux — SVG Icon Pack
 *
 * Morphable icons designed for Trinity Interface integration.
 * Each icon uses Framer Motion `motion.path` for animate-between-states
 * via `variants`.  Pass `animate="active"` or `animate="idle"` to morph.
 *
 * Usage:
 *   <ZenithGlyph size={24} animate="active" />
 */

import React from 'react';
import { motion, Variants } from 'framer-motion';

// ── Shared transition ────────────────────────────────────────────────────────
const morph = { type: 'spring' as const, stiffness: 260, damping: 18, mass: 0.6 };

interface IconProps {
    size?: number;
    className?: string;
    animate?: 'idle' | 'active';
    color?: string;
}

const SVGWrap: React.FC<IconProps & { children: React.ReactNode; viewBox?: string }> = ({
    size = 24, className = '', children, viewBox = '0 0 24 24',
}) => (
    <svg width={size} height={size} viewBox={viewBox} fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        {children}
    </svg>
);

// ── Zenith Glyph (upward chevron → expanded star) ───────────────────────────
const zenithVariants: Variants = {
    idle: { d: 'M12 4 L5 14 L12 11 L19 14 Z', opacity: 0.7 },
    active: { d: 'M12 2 L3 12 L12 9 L21 12 Z M12 13 L7 19 L12 17 L17 19 Z', opacity: 1 },
};

export const ZenithGlyph: React.FC<IconProps> = ({ size, className, animate = 'idle', color = '#00C8FF' }) => (
    <SVGWrap size={size} className={className}>
        <motion.path
            variants={zenithVariants} initial="idle" animate={animate} transition={morph}
            fill={color} stroke={color} strokeWidth={0.5} strokeLinejoin="round"
        />
    </SVGWrap>
);

// ── Horizonte Glyph (seedling → branching tree) ─────────────────────────────
const horizonteVariants: Variants = {
    idle: { d: 'M12 20 V12 M12 12 C12 8 8 6 8 6 M12 12 C12 8 16 6 16 6', opacity: 0.7 },
    active: { d: 'M12 22 V10 M12 14 C10 12 6 10 4 8 M12 14 C14 12 18 10 20 8 M12 10 C10 8 7 4 5 2 M12 10 C14 8 17 4 19 2', opacity: 1 },
};

export const HorizonteGlyph: React.FC<IconProps> = ({ size, className, animate = 'idle', color = '#39FF14' }) => (
    <SVGWrap size={size} className={className}>
        <motion.path
            variants={horizonteVariants} initial="idle" animate={animate} transition={morph}
            fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round"
        />
    </SVGWrap>
);

// ── Lógica Glyph (simple node → graph) ──────────────────────────────────────
const logicaPathVariants: Variants = {
    idle: { d: 'M12 12 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0', opacity: 0.7 },
    active: { d: 'M6 6 L18 6 L18 18 L6 18 Z M6 6 L18 18 M18 6 L6 18', opacity: 1 },
};

export const LogicaGlyph: React.FC<IconProps> = ({ size, className, animate = 'idle', color = '#FFBF00' }) => (
    <SVGWrap size={size} className={className}>
        <motion.path
            variants={logicaPathVariants} initial="idle" animate={animate} transition={morph}
            fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
        />
        {/* Corner nodes visible in active state */}
        {['6,6', '18,6', '18,18', '6,18'].map(c => {
            const [cx, cy] = c.split(',');
            return (
                <motion.circle
                    key={c} cx={cx} cy={cy} r={2} fill={color}
                    initial={{ opacity: 0, scale: 0 }}
                    variants={{ idle: { opacity: 0, scale: 0 }, active: { opacity: 1, scale: 1 } }}
                    animate={animate} transition={morph}
                />
            );
        })}
    </SVGWrap>
);

// ── Base Glyph (flat line → anchor) ─────────────────────────────────────────
const baseVariants: Variants = {
    idle: { d: 'M4 18 H20', opacity: 0.7 },
    active: { d: 'M12 4 V14 M8 18 A4 4 0 0 0 16 18 M4 18 H20', opacity: 1 },
};

export const BaseGlyph: React.FC<IconProps> = ({ size, className, animate = 'idle', color = '#DC143C' }) => (
    <SVGWrap size={size} className={className}>
        <motion.path
            variants={baseVariants} initial="idle" animate={animate} transition={morph}
            fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
        />
    </SVGWrap>
);

// ── Sovereign ID (shield → shield with checkmark) ──────────────────────────
const sovereignVariants: Variants = {
    idle: { d: 'M12 3 L4 7 V13 C4 17 12 21 12 21 C12 21 20 17 20 13 V7 L12 3 Z' },
    active: { d: 'M12 3 L4 7 V13 C4 17 12 21 12 21 C12 21 20 17 20 13 V7 L12 3 Z M9 12 L11 14 L15 10' },
};

export const SovereignGlyph: React.FC<IconProps> = ({ size, className, animate = 'idle', color = '#A855F7' }) => (
    <SVGWrap size={size} className={className}>
        <motion.path
            variants={sovereignVariants} initial="idle" animate={animate} transition={morph}
            fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
        />
    </SVGWrap>
);

// ── Flux Spinner (static ring → orbiting ring) ─────────────────────────────
export const FluxSpinner: React.FC<IconProps & { spinning?: boolean }> = ({ size = 24, className, color = '#8B5CF6', spinning = true }) => (
    <SVGWrap size={size} className={className}>
        <circle cx={12} cy={12} r={9} stroke="rgba(255,255,255,0.08)" strokeWidth={2} fill="none" />
        <motion.circle
            cx={12} cy={12} r={9} stroke={color} strokeWidth={2} fill="none"
            strokeDasharray="14 42" strokeLinecap="round"
            animate={spinning ? { rotate: 360 } : {}}
            transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
            style={{ transformOrigin: '12px 12px' }}
        />
    </SVGWrap>
);

// ── Network Glyph (dots → connected mesh) ───────────────────────────────────
export const NetworkGlyph: React.FC<IconProps> = ({ size, className, animate = 'idle', color = '#38BDF8' }) => {
    const nodes = [
        { cx: 12, cy: 5 },
        { cx: 5, cy: 12 },
        { cx: 19, cy: 12 },
        { cx: 8, cy: 19 },
        { cx: 16, cy: 19 },
    ];

    const edges = [
        'M12 5 L5 12', 'M12 5 L19 12', 'M5 12 L8 19',
        'M19 12 L16 19', 'M8 19 L16 19',
    ];

    return (
        <SVGWrap size={size} className={className}>
            {edges.map((d, i) => (
                <motion.path
                    key={i} d={d} stroke={color} strokeWidth={1} fill="none" strokeLinecap="round"
                    initial={{ pathLength: 0, opacity: 0 }}
                    variants={{ idle: { pathLength: 0, opacity: 0 }, active: { pathLength: 1, opacity: 0.5 } }}
                    animate={animate} transition={{ ...morph, delay: i * 0.04 }}
                />
            ))}
            {nodes.map((n, i) => (
                <motion.circle
                    key={i} cx={n.cx} cy={n.cy} fill={color}
                    initial={{ r: 1.5, opacity: 0.5 }}
                    variants={{ idle: { r: 1.5, opacity: 0.5 }, active: { r: 2.5, opacity: 1 } }}
                    animate={animate} transition={morph}
                />
            ))}
        </SVGWrap>
    );
};

// ── Convenience barrel export ────────────────────────────────────────────────
export const AntigravityIcons = {
    ZenithGlyph,
    HorizonteGlyph,
    LogicaGlyph,
    BaseGlyph,
    SovereignGlyph,
    FluxSpinner,
    NetworkGlyph,
} as const;

'use client';

import React, { useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { Home, Grid, CircleUser, Settings, Command, Wifi, Battery, Shield } from 'lucide-react';

// ── Theme Constants ──────────────────────────────────────────────────────────
const DOCK = {
    floatingMargin: 16,
    magnificationScale: 1.35,
    magnificationRange: 80, // px range for proximity effect
    bgOpacity: 0.4,
    iconSize: 22,
    iconGap: 4,
    processIndicatorSize: 4,
};

const SPRINGS = {
    dockEnter: { type: 'spring' as const, stiffness: 300, damping: 22, mass: 0.6 },
    dockMagnify: { type: 'spring' as const, stiffness: 350, damping: 28, mass: 0.5 },
    menuElastic: { type: 'spring' as const, stiffness: 400, damping: 20, mass: 0.4 },
    panelSlide: { type: 'spring' as const, stiffness: 200, damping: 25, mass: 0.8 },
};

// ── Props ────────────────────────────────────────────────────────────────────
interface DockItem {
    id: string;
    Icon: React.ComponentType<any>;
    label: string;
    hasProcess?: boolean;
    badge?: number;
}

interface DockProps {
    items: DockItem[];
    activeItem: string;
    onItemClick: (id: string) => void;
}

interface ContextMenuItem {
    id: string;
    label: string;
    icon?: React.ReactNode;
    shortcut?: string;
    divider?: boolean;
    danger?: boolean;
    onClick?: () => void;
}

// ── DockIcon (Magnification-Aware) ───────────────────────────────────────────
const DockIcon: React.FC<{
    item: DockItem;
    isActive: boolean;
    onClick: () => void;
    mouseX: ReturnType<typeof useMotionValue>;
    itemRef: React.RefObject<HTMLButtonElement | null>;
}> = ({ item, isActive, onClick, mouseX, itemRef }) => {
    const distance = useMotionValue(200);

    const scale = useTransform(distance, [-DOCK.magnificationRange, 0, DOCK.magnificationRange], [1, DOCK.magnificationScale, 1]);
    const iconScale = useTransform(distance, [-DOCK.magnificationRange, 0, DOCK.magnificationRange], [1, 1.15, 1]);

    const handlePointerMove = useCallback(() => {
        if (!itemRef.current) return;
        const rect = itemRef.current.getBoundingClientRect();
        const center = rect.left + rect.width / 2;
        distance.set(mouseX.get() - center);
    }, [mouseX, distance, itemRef]);

    React.useEffect(() => {
        const unsub = mouseX.on('change', () => {
            if (!itemRef.current) return;
            const rect = itemRef.current.getBoundingClientRect();
            const center = rect.left + rect.width / 2;
            distance.set(mouseX.get() - center);
        });
        return unsub;
    }, [mouseX, distance, itemRef]);

    return (
        <motion.button
            ref={itemRef}
            onClick={onClick}
            className={`relative p-3 rounded-full group transition-colors duration-200 cursor-pointer ${isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
            style={{ scale }}
            whileTap={{ scale: 0.9 }}
            aria-label={item.label}
        >
            <motion.div style={{ scale: iconScale }}>
                <item.Icon className="w-[22px] h-[22px]" />
            </motion.div>

            {/* Active Indicator */}
            {isActive && (
                <motion.div
                    layoutId="dock-active-indicator"
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full"
                    style={{
                        width: DOCK.processIndicatorSize * 1.5,
                        height: DOCK.processIndicatorSize * 1.5,
                        background: 'linear-gradient(135deg, #A78BFA, #FBBF24)',
                        boxShadow: '0 0 8px 2px rgba(167, 139, 250, 0.6)',
                    }}
                    transition={SPRINGS.dockMagnify}
                />
            )}

            {/* Process Indicator (non-active running task) */}
            {!isActive && item.hasProcess && (
                <div
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-white/40"
                    style={{ width: DOCK.processIndicatorSize, height: DOCK.processIndicatorSize }}
                />
            )}

            {/* Badge */}
            {item.badge && item.badge > 0 && (
                <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-lg">
                    {item.badge > 99 ? '99+' : item.badge}
                </div>
            )}

            {/* Tooltip */}
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 px-2.5 py-1 bg-black/80 backdrop-blur-lg text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap border border-white/10 shadow-xl">
                {item.label}
            </div>
        </motion.button>
    );
};

// ── Dock ─────────────────────────────────────────────────────────────────────
export const Dock: React.FC<DockProps> = ({ items, activeItem, onItemClick }) => {
    const mouseX = useMotionValue(-200);
    const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

    return (
        <div
            className="fixed left-1/2 -translate-x-1/2 z-50 px-2"
            style={{ bottom: DOCK.floatingMargin }}
            onMouseMove={(e) => mouseX.set(e.clientX)}
            onMouseLeave={() => mouseX.set(-200)}
        >
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={SPRINGS.dockEnter}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full ring-1 ring-white/5"
                style={{
                    background: `rgba(0, 0, 0, ${DOCK.bgOpacity})`,
                    backdropFilter: 'blur(24px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: '0 8px 32px rgba(31, 38, 135, 0.37), inset 0 1px 0 rgba(255,255,255,0.06)',
                }}
            >
                {items.map((item, idx) => (
                    <DockIcon
                        key={item.id}
                        item={item}
                        isActive={activeItem === item.id}
                        onClick={() => onItemClick(item.id)}
                        mouseX={mouseX}
                        itemRef={{ current: itemRefs.current[idx] } as React.RefObject<HTMLButtonElement | null>}
                    />
                ))}
            </motion.div>
        </div>
    );
};

// ── ContextMenu ──────────────────────────────────────────────────────────────
export const ContextMenu: React.FC<{
    items: ContextMenuItem[];
    isOpen: boolean;
    position: { x: number; y: number };
    onClose: () => void;
}> = ({ items, isOpen, position, onClose }) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={onClose} />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: -8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.92, y: -4 }}
                        transition={SPRINGS.menuElastic}
                        className="fixed z-50 py-2 min-w-[200px]"
                        style={{
                            left: position.x,
                            top: position.y,
                            background: 'rgba(20, 20, 45, 0.85)',
                            backdropFilter: 'blur(24px) saturate(180%)',
                            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                            border: '1px solid rgba(255, 255, 255, 0.12)',
                            borderRadius: '20px',
                            boxShadow: '0 16px 48px rgba(0, 0, 0, 0.4)',
                        }}
                    >
                        {items.map((item) =>
                            item.divider ? (
                                <div key={item.id} className="my-1.5 mx-3 h-px bg-white/8" />
                            ) : (
                                <button
                                    key={item.id}
                                    onClick={() => { item.onClick?.(); onClose(); }}
                                    className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors duration-150 cursor-pointer ${item.danger
                                            ? 'text-red-400 hover:bg-red-500/15'
                                            : 'text-white/80 hover:bg-white/8 hover:text-white'
                                        }`}
                                >
                                    {item.icon && <span className="w-4 h-4 opacity-70">{item.icon}</span>}
                                    <span className="flex-1 text-left">{item.label}</span>
                                    {item.shortcut && (
                                        <span className="text-xs text-white/30 font-mono">{item.shortcut}</span>
                                    )}
                                </button>
                            )
                        )}
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

// ── TopBar (System Tray) ─────────────────────────────────────────────────────
export const TopBar: React.FC<{
    systemStatus?: 'active' | 'idle' | 'warning';
    networkLabel?: string;
    batteryLevel?: number;
}> = ({
    systemStatus = 'active',
    networkLabel = 'CONN',
    batteryLevel = 98,
}) => {
        const statusColors: Record<string, { dot: string; text: string; glow: string }> = {
            active: { dot: 'bg-emerald-500', text: 'text-emerald-400', glow: '0 0 8px rgba(16,185,129,0.5)' },
            idle: { dot: 'bg-yellow-500', text: 'text-yellow-400', glow: '0 0 8px rgba(245,158,11,0.4)' },
            warning: { dot: 'bg-red-500', text: 'text-red-400', glow: '0 0 8px rgba(239,68,68,0.5)' },
        };
        const status = statusColors[systemStatus];

        const batteryColor = batteryLevel > 50 ? 'text-emerald-400' : batteryLevel > 20 ? 'text-yellow-400' : 'text-red-400';

        return (
            <div className="fixed top-0 left-0 right-0 z-40 px-6 py-2 flex justify-between items-center pointer-events-none">
                {/* System Status Pill */}
                <div className="pointer-events-auto flex items-center gap-3 px-4 py-1.5 rounded-full"
                    style={{
                        background: 'rgba(0,0,0,0.2)',
                        backdropFilter: 'blur(16px)',
                        border: '1px solid rgba(255,255,255,0.05)',
                    }}
                >
                    <div
                        className={`w-2 h-2 rounded-full ${status.dot} animate-pulse`}
                        style={{ boxShadow: status.glow }}
                    />
                    <span className={`text-xs font-mono ${status.text}`}>
                        FLUX.OS::{systemStatus.toUpperCase()}
                    </span>
                </div>

                {/* System Tray */}
                <div
                    className="pointer-events-auto flex items-center gap-4 text-xs font-medium text-white/50 px-4 py-1.5 rounded-full"
                    style={{
                        background: 'rgba(0,0,0,0.2)',
                        backdropFilter: 'blur(16px)',
                        border: '1px solid rgba(255,255,255,0.05)',
                    }}
                >
                    {/* Command */}
                    <button className="hover:text-white transition-colors cursor-pointer flex items-center gap-1">
                        <Command size={10} /> SYS.CMD
                    </button>
                    <span className="w-px h-3 bg-white/10" />

                    {/* Network */}
                    <button className="hover:text-white transition-colors cursor-pointer flex items-center gap-1">
                        <Wifi size={10} /> {networkLabel}
                    </button>
                    <span className="w-px h-3 bg-white/10" />

                    {/* Battery */}
                    <button className={`hover:text-white transition-colors cursor-pointer flex items-center gap-1 ${batteryColor}`}>
                        <Battery size={10} /> {batteryLevel}%
                    </button>
                    <span className="w-px h-3 bg-white/10" />

                    {/* Sovereign ID */}
                    <button className="hover:text-white transition-colors cursor-pointer flex items-center gap-1">
                        <Shield size={10} /> ID
                    </button>
                </div>
            </div>
        );
    };

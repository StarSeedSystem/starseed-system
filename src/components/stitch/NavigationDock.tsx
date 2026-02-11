"use client";

import React, { useState } from 'react';
import {
    Home,
    Network,
    FlaskConical,
    Settings,
    Brain,
    ChevronUp,
    AppWindow,
    LayoutGrid
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/crystal/GlassCard';

interface NavigationDockProps {
    className?: string;
    activeTab?: string;
    onTabChange?: (tab: string) => void;
}

export function NavigationDock({ className, activeTab = 'home', onTabChange }: NavigationDockProps) {
    const [hoveredTab, setHoveredTab] = useState<string | null>(null);
    const [isExpanded, setIsExpanded] = useState(true);

    const tabs = [
        { id: 'home', icon: Home, label: 'Home', color: '#007FFF' }, // Electric Azure
        { id: 'network', icon: Network, label: 'Network', color: '#10B981' }, // Emerald Green
        { id: 'lab', icon: FlaskConical, label: 'Lab', color: '#FFBF00' }, // Solar Amber
        { id: 'ai', icon: Brain, label: 'Zenith', color: '#D946EF' }, // Neon Fuchsia
        { id: 'settings', icon: Settings, label: 'System', color: '#A855F7' }, // Purple
    ];

    return (
        <div className={cn("fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2", className)}>

            <AnimatePresence>
                {isExpanded && (
                    <GlassCard
                        variant="intense"
                        intensity={1.2}
                        cornerRadius={9999}
                        className="px-6 py-3 flex items-center gap-4 relative"
                    >
                        {/* Background Frost/Noise is handled by GlassCard */}

                        {tabs.map((tab) => {
                            const isActive = activeTab === tab.id;
                            const isHovered = hoveredTab === tab.id;

                            return (
                                <motion.button
                                    key={tab.id}
                                    className="relative group p-3 rounded-full flex flex-col items-center justify-center outline-none"
                                    onMouseEnter={() => setHoveredTab(tab.id)}
                                    onMouseLeave={() => setHoveredTab(null)}
                                    onClick={() => onTabChange && onTabChange(tab.id)}
                                    whileHover={{ scale: 1.2, y: -5 }}
                                    whileTap={{ scale: 0.95 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                >
                                    {/* Icon */}
                                    <tab.icon
                                        size={24}
                                        style={{
                                            color: isActive ? tab.color : (isHovered ? tab.color : 'rgba(255,255,255,0.5)')
                                        }}
                                        className="transition-colors duration-300 relative z-10"
                                    />

                                    {/* Active/Hover Glow Background */}
                                    <AnimatePresence>
                                        {(isActive || isHovered) && (
                                            <motion.div
                                                className="absolute inset-0 rounded-full blur-md -z-0"
                                                style={{ backgroundColor: tab.color }}
                                                initial={{ opacity: 0, scale: 0.5 }}
                                                animate={{ opacity: isActive ? 0.2 : 0.1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.5 }}
                                            />
                                        )}
                                    </AnimatePresence>

                                    {/* Label Tooltip (Floating above) */}
                                    <AnimatePresence>
                                        {isHovered && (
                                            <motion.div
                                                className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 rounded-md bg-black/80 border border-white/10 backdrop-blur-md whitespace-nowrap pointer-events-none"
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 5 }}
                                            >
                                                <span
                                                    className="text-[10px] uppercase font-bold tracking-widest"
                                                    style={{ color: tab.color }}
                                                >
                                                    {tab.label}
                                                </span>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {/* Active Dot Indicator */}
                                    {isActive && (
                                        <motion.div
                                            layoutId="activeTabIndicator"
                                            className="absolute -bottom-1 w-1 h-1 rounded-full"
                                            style={{ backgroundColor: tab.color, boxShadow: `0 0 8px ${tab.color}` }}
                                        />
                                    )}
                                </motion.button>
                            );
                        })}

                        {/* Divider */}
                        <div className="w-px h-8 bg-white/10 mx-2" />

                        {/* System Action (e.g. Expand/Collapse or Launcher) */}
                        <motion.button
                            className="p-3 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                            whileHover={{ rotate: 90 }}
                            whileTap={{ scale: 0.9 }}
                        >
                            <LayoutGrid size={20} />
                        </motion.button>

                    </GlassCard>
                )}
            </AnimatePresence>

            {/* Collapse/Expand Toggle (Optional small pill if docked is collapsed) */}
            {/* For now, just keeping it expanded as per prompt "Floating glass pill" */}

        </div>
    );
}

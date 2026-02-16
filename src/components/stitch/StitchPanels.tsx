import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Activity, Wifi, Cpu, Layers, Maximize2, X, Database } from 'lucide-react';

interface StitchPanelProps {
    theme: "liquid" | "organic";
    className?: string;
    styleConfig?: {
        borderColor?: string;
        borderWidth?: number;
        borderRadius?: number;
        backgroundColor?: string;
        blurAmount?: number;
        glowIntensity?: number;
        glowColor?: string;
    };
}

// --- System Status Panel ---
export const StitchSystemPanel: React.FC<StitchPanelProps> = ({ theme, className, styleConfig }) => {
    const isLiquid = theme === 'liquid';

    const dynamicStyle: React.CSSProperties = {};
    if (styleConfig) {
        if (styleConfig.borderColor) dynamicStyle.borderColor = styleConfig.borderColor;
        if (styleConfig.borderWidth !== undefined) dynamicStyle.borderWidth = `${styleConfig.borderWidth}px`;
        if (styleConfig.borderRadius !== undefined) dynamicStyle.borderRadius = `${styleConfig.borderRadius}px`;
        if (styleConfig.backgroundColor) dynamicStyle.backgroundColor = styleConfig.backgroundColor;
        if (styleConfig.blurAmount !== undefined) dynamicStyle.backdropFilter = `blur(${styleConfig.blurAmount}px)`;
        if (styleConfig.glowIntensity && styleConfig.glowColor) {
            dynamicStyle.boxShadow = `0 0 ${styleConfig.glowIntensity * 10}px ${styleConfig.glowColor}`;
        }
    }

    return (
        <div
            className={cn(
                "relative p-4 overflow-hidden group",
                !styleConfig && (isLiquid
                    ? "bg-slate-900/60 border border-cyan-500/30 rounded-lg backdrop-blur-md"
                    : "bg-emerald-950/40 border border-emerald-500/20 rounded-2xl backdrop-blur-sm"),
                className
            )}
            style={dynamicStyle}
        >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-current to-transparent opacity-20" />

            <div className="space-y-4">
                <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-mono opacity-50 uppercase tracking-widest">System Status</span>
                    <div className={cn("w-2 h-2 rounded-full animate-pulse", isLiquid ? "bg-cyan-400" : "bg-emerald-400")} />
                </div>

                <div className="space-y-3">
                    <MetricBar label="CPU" value={45} theme={theme} />
                    <MetricBar label="MEM" value={62} theme={theme} />
                    <MetricBar label="NET" value={28} theme={theme} />
                </div>

                <div className="mt-4 pt-4 border-t border-white/5">
                    <div className="flex justify-between items-center text-xs opacity-70">
                        <span>Packets</span>
                        <span className="font-mono">8,942 /s</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Window Widgets Panel ---
export const StitchWidgetPanel: React.FC<StitchPanelProps> = ({ theme, className, styleConfig }) => {
    const isLiquid = theme === 'liquid';

    const dynamicStyle: React.CSSProperties = {};
    if (styleConfig) {
        if (styleConfig.borderColor) dynamicStyle.borderColor = styleConfig.borderColor;
        if (styleConfig.borderWidth !== undefined) dynamicStyle.borderWidth = `${styleConfig.borderWidth}px`;
        if (styleConfig.borderRadius !== undefined) dynamicStyle.borderRadius = `${styleConfig.borderRadius}px`;
        if (styleConfig.backgroundColor) dynamicStyle.backgroundColor = styleConfig.backgroundColor;
        if (styleConfig.blurAmount !== undefined) dynamicStyle.backdropFilter = `blur(${styleConfig.blurAmount}px)`;
        if (styleConfig.glowIntensity && styleConfig.glowColor) {
            dynamicStyle.boxShadow = `0 0 ${styleConfig.glowIntensity * 10}px ${styleConfig.glowColor}`;
        }
    }

    return (
        <div
            className={cn(
                "relative p-3 grid grid-cols-2 gap-2",
                !styleConfig && (isLiquid
                    ? "bg-slate-900/60 border border-cyan-500/30 rounded-lg backdrop-blur-md"
                    : "bg-emerald-950/40 border border-emerald-500/20 rounded-2xl backdrop-blur-sm"),
                className
            )}
            style={dynamicStyle}
        >
            <WidgetCard theme={theme} title="Weather" icon={Wifi} />
            <WidgetCard theme={theme} title="Network" icon={Activity} />
            <WidgetCard theme={theme} title="Storage" icon={Database} className="col-span-2" />
        </div>
    );
};

// --- Helpers ---

const MetricBar: React.FC<{ label: string; value: number; theme: 'liquid' | 'organic' }> = ({ label, value, theme }) => {
    const isLiquid = theme === 'liquid';

    return (
        <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[9px] opacity-70">
                <span>{label}</span>
                <span>{value}%</span>
            </div>
            <div className={cn(
                "h-1.5 w-full overflow-hidden",
                isLiquid ? "bg-slate-800 rounded-sm" : "bg-emerald-900/30 rounded-full"
            )}>
                <motion.div
                    className={cn(
                        "h-full",
                        isLiquid ? "bg-cyan-500" : "bg-emerald-500"
                    )}
                    initial={{ width: 0 }}
                    animate={{ width: `${value}%` }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                />
            </div>
        </div>
    );
};

const WidgetCard: React.FC<{ theme: 'liquid' | 'organic'; title: string; icon: any }> = ({ theme, title, icon: Icon }) => {
    const isLiquid = theme === 'liquid';

    return (
        <motion.button
            className={cn(
                "flex flex-col items-center justify-center p-2 gap-1 transition-all",
                isLiquid
                    ? "bg-cyan-500/5 hover:bg-cyan-500/10 border border-cyan-500/20 rounded hover:border-cyan-500/50"
                    : "bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10 rounded-xl hover:border-emerald-500/40"
            )}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
        >
            <Icon size={16} className={isLiquid ? "text-cyan-400" : "text-emerald-400"} />
            <span className="text-[9px] opacity-60">{title}</span>
        </motion.button>
    );
}

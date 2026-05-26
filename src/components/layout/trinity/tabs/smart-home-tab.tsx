"use client";

import React from "react";
import { Power, Thermometer, Droplets, Lock, Wifi, Tv } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export function SmartHomeTab() {
    return (
        <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
                <DeviceCard
                    label="Living Room"
                    icon={Tv}
                    isActive={true}
                    status="Playing"
                    color="purple"
                    value="Apple TV"
                />
                <DeviceCard
                    label="Thermostat"
                    icon={Thermometer}
                    isActive={true}
                    status="Heating"
                    color="amber"
                    value="22°C"
                />
                <DeviceCard
                    label="Main Lock"
                    icon={Lock}
                    isActive={true}
                    status="Locked"
                    color="emerald"
                    value="Secure"
                />
                <DeviceCard
                    label="Purifier"
                    icon={Droplets}
                    isActive={false}
                    status="Standby"
                    color="blue"
                    value="Good"
                />
            </div>

            {/* Scene Selectors */}
            <div className="grid grid-cols-3 gap-2">
                <SceneCard label="Cinema" color="purple" />
                <SceneCard label="Focus" color="cyan" />
                <SceneCard label="Sleep" color="indigo" />
            </div>

            <div className="p-4 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between gap-3 overflow-hidden">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400 shrink-0">
                        <Wifi className="w-5 h-5 animate-pulse" />
                    </div>
                    <div className="min-w-0">
                        <div className="text-sm font-medium truncate">Network Status</div>
                        <div className="text-xs text-emerald-400 truncate">Optimal · 850 Mbps</div>
                    </div>
                </div>
                <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981] shrink-0" />
            </div>
        </div>
    );
}

function DeviceCard({ label, icon: Icon, isActive, status, color, value }: any) {
    const colorMap: any = {
        purple: "group-hover:text-purple-400 group-hover:shadow-[0_0_20px_-5px_rgba(168,85,247,0.5)] group-hover:border-purple-500/50",
        amber: "group-hover:text-amber-400 group-hover:shadow-[0_0_20px_-5px_rgba(245,158,11,0.5)] group-hover:border-amber-500/50",
        emerald: "group-hover:text-emerald-400 group-hover:shadow-[0_0_20px_-5px_rgba(16,185,129,0.5)] group-hover:border-emerald-500/50",
        blue: "group-hover:text-blue-400 group-hover:shadow-[0_0_20px_-5px_rgba(59,130,246,0.5)] group-hover:border-blue-500/50",
    };

    return (
        <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={cn(
                "group relative h-28 rounded-2xl border bg-black/40 backdrop-blur-md p-2 flex flex-col items-center justify-center gap-2 transition-all duration-300 overflow-hidden",
                isActive ? "border-white/10" : "border-white/5 opacity-70 hover:opacity-100",
                isActive && colorMap[color]
            )}
        >
            <div className="flex items-center justify-center relative w-full">
                <div className={cn("p-2 rounded-full bg-white/5 transition-colors shrink-0", isActive ? "text-white" : "text-muted-foreground")}>
                    <Icon className="w-4 h-4" />
                </div>
                {isActive && <div className={cn("absolute right-2 top-0 w-1.5 h-1.5 rounded-full shadow-[0_0_8px] animate-pulse bg-current shrink-0")} />}
            </div>

            <div className="text-center z-10 w-full px-2 flex flex-col items-center justify-center min-w-0">
                <div className="text-[10px] md:text-[11px] text-muted-foreground font-medium mb-0.5 truncate w-full">{label}</div>
                <div className="text-xs md:text-sm font-bold truncate w-full text-white">
                    {value || status}
                </div>
            </div>

            {/* Hover Glow Gradient */}
            <div className={cn(
                "absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl pointer-events-none"
            )} />
        </motion.button>
    );
}

function SceneCard({ label, color }: any) {
    const colorMap: any = {
        purple: "hover:bg-purple-500/20 hover:text-purple-400 hover:border-purple-500/30",
        cyan: "hover:bg-cyan-500/20 hover:text-cyan-400 hover:border-cyan-500/30",
        indigo: "hover:bg-indigo-500/20 hover:text-indigo-400 hover:border-indigo-500/30",
    };

    return (
        <motion.button
            whileTap={{ scale: 0.95 }}
            className={cn(
                "h-12 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-xs font-medium transition-all duration-300 px-2 min-w-0 w-full text-white",
                colorMap[color]
            )}
        >
            <span className="w-full text-center truncate">{label}</span>
        </motion.button>
    )
}

"use client";
import React, { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Wifi, Bluetooth, Moon, Sun, Volume2, Mic, WifiOff, Bell, BellOff, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export function QuickSettingsTab() {
    const [toggles, setToggles] = useState({
        wifi: true,
        bluetooth: true,
        darkMode: true,
        notifications: true,
        power: false
    });

    const [volume, setVolume] = useState(75);
    const [brightness, setBrightness] = useState(90);

    const toggle = (key: keyof typeof toggles) => {
        setToggles(prev => ({ ...prev, [key]: !prev[key] }));
    };

    return (
        <div className="space-y-6 pt-2">
            {/* Main Toggles Grid */}
            <div className="grid grid-cols-2 gap-3">
                <NeonToggle
                    active={toggles.wifi}
                    onClick={() => toggle('wifi')}
                    icon={toggles.wifi ? Wifi : WifiOff}
                    label="Wi-Fi"
                    color="cyan"
                    status={toggles.wifi ? "Connected" : "Off"}
                />
                <NeonToggle
                    active={toggles.bluetooth}
                    onClick={() => toggle('bluetooth')}
                    icon={Bluetooth}
                    label="Bluetooth"
                    color="blue"
                    status={toggles.bluetooth ? "On" : "Off"}
                />
            </div>

            {/* Sub Toggles */}
            <div className="grid grid-cols-4 gap-2">
                <MiniToggle active={toggles.darkMode} onClick={() => toggle('darkMode')} icon={toggles.darkMode ? Moon : Sun} />
                <MiniToggle active={toggles.notifications} onClick={() => toggle('notifications')} icon={toggles.notifications ? Bell : BellOff} color="amber" />
                <MiniToggle active={toggles.power} onClick={() => toggle('power')} icon={Zap} color="yellow" />
                <MiniToggle active={true} onClick={() => { }} icon={Mic} color="red" />
            </div>

            {/* Sliders Area */}
            <div className="space-y-4 bg-black/20 p-5 rounded-2xl border border-white/5 backdrop-blur-md">
                <EnergySlider
                    icon={Volume2}
                    value={volume}
                    onChange={(v: number[]) => setVolume(v[0])}
                    label="Volume"
                />
                <EnergySlider
                    icon={Sun}
                    value={brightness}
                    onChange={(v: number[]) => setBrightness(v[0])}
                    label="Brightness"
                    color="bg-amber-500"
                />
            </div>
        </div>
    );
}

function NeonToggle({ active, onClick, icon: Icon, label, color = "cyan", status }: any) {
    const colorMap: any = {
        cyan: "shadow-cyan-500/50 text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
        blue: "shadow-blue-500/50 text-blue-400 bg-blue-500/10 border-blue-500/30",
        amber: "shadow-amber-500/50 text-amber-400 bg-amber-500/10 border-amber-500/30",
    };

    const activeClass = colorMap[color];

    return (
        <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onClick}
            className={cn(
                "relative h-20 rounded-2xl border flex flex-col justify-between p-4 transition-all duration-300 overflow-hidden group",
                active
                    ? `${activeClass} shadow-[0_0_20px_-5px]`
                    : "bg-white/5 border-white/5 text-muted-foreground hover:bg-white/10"
            )}
        >
            <div className="flex justify-between items-start w-full">
                <Icon className={cn("w-6 h-6", active && "animate-pulse")} />
                <div className={cn("w-2 h-2 rounded-full", active ? "bg-current shadow-[0_0_8px] shadow-current" : "bg-white/10")} />
            </div>
            <div className="text-left">
                <div className="font-semibold text-sm">{label}</div>
                <div className="text-[10px] opacity-70">{status}</div>
            </div>

            {/* Background Gradient */}
            {active && (
                <div className="absolute inset-0 bg-gradient-to-tr from-current to-transparent opacity-10" />
            )}
        </motion.button>
    );
}

function MiniToggle({ active, onClick, icon: Icon, color = "blue" }: any) {
    const colorMap: any = {
        blue: "text-blue-400 bg-blue-500/10 border-blue-500/30 shadow-blue-500/20",
        amber: "text-amber-400 bg-amber-500/10 border-amber-500/30 shadow-amber-500/20",
        yellow: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30 shadow-yellow-500/20",
        red: "text-red-400 bg-red-500/10 border-red-500/30 shadow-red-500/20",
    };

    return (
        <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onClick}
            className={cn(
                "h-14 rounded-xl border flex items-center justify-center transition-all duration-300",
                active
                    ? `${colorMap[color]} border shadow-[0_0_15px_-3px]`
                    : "bg-white/5 border-white/5 text-muted-foreground hover:bg-white/10"
            )}
        >
            <Icon className="w-5 h-5" />
        </motion.button>
    );
}

function EnergySlider({ icon: Icon, value, onChange, label, color = "bg-white" }: any) {
    return (
        <div className="space-y-3">
            <div className="flex justify-between text-xs font-medium text-muted-foreground px-1">
                <span className="flex items-center gap-2"><Icon className="w-3 h-3" /> {label}</span>
                <span>{value}%</span>
            </div>
            <Slider
                value={[value]}
                max={100}
                onValueChange={onChange}
                className={cn("cursor-pointer", color !== "bg-white" && "[&>.relative>.absolute]:bg-amber-500")}
            />
        </div>
    );
}

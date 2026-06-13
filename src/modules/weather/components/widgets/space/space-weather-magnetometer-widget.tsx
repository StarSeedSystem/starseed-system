'use client';

import React, { useMemo } from 'react';
import { Card } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { Compass, Zap, Radio, Activity, Navigation, Magnet, Info, LocateFixed, MoveDiagonal } from "lucide-react";
import { UnifiedSpaceWeather } from "@/modules/weather/services/space/schema";
import { cn } from "@/lib/utils";

interface MagnetometerWidgetProps {
    data?: UnifiedSpaceWeather;
    loading?: boolean;
}

export const MagnetometerWidget: React.FC<MagnetometerWidgetProps> = ({ data, loading }) => {
    const magData = data?.localMagnetometer;
    const hComponent = magData?.hComponent || 28420.5;
    const xComp = magData?.xComponent || 20150.2;
    const yComp = magData?.yComponent || 150.8;
    const zComp = magData?.zComponent || -45020.4;

    // Total intensity calculation |B|
    const totalB = Math.sqrt(xComp ** 2 + yComp ** 2 + zComp ** 2);

    // Compass heading calculation
    const heading = useMemo(() => {
        return Math.atan2(yComp, xComp) * (180 / Math.PI);
    }, [xComp, yComp]);

    return (
        <Card className="@container relative overflow-hidden w-full h-full min-h-[400px] bg-[#020508] border border-white/10 group rounded-[2.5rem] shadow-2xl transition-all duration-700 hover:border-emerald-500/30">

            {/* Magnetic Flux Background */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,#10b98111,transparent_70%)] opacity-30" />

                {/* Micro-HUD Grid */}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[length:24px_24px]" />

                {/* Field Line Warp Simulation */}
                <svg className="absolute inset-0 w-full h-full opacity-10">
                    {[...Array(4)].map((_, i) => (
                        <motion.path
                            key={i}
                            d={`M ${100 + i * 100} 0 Q ${200 + (heading)} 200 ${100 + i * 100} 400`}
                            stroke="#10b981"
                            strokeWidth="0.5"
                            fill="none"
                            animate={{
                                d: [
                                    `M ${100 + i * 100} 0 Q ${200 + (heading / 2)} 200 ${100 + i * 100} 400`,
                                    `M ${100 + i * 100} 0 Q ${250 + (heading / 2)} 200 ${100 + i * 100} 400`,
                                    `M ${100 + i * 100} 0 Q ${200 + (heading / 2)} 200 ${100 + i * 100} 400`,
                                ]
                            }}
                            transition={{ duration: 10 + i * 2, repeat: Infinity, ease: "easeInOut" }}
                        />
                    ))}
                </svg>
            </div>

            {/* Main Content Interface */}
            <div className="relative z-10 h-full p-6 flex flex-col">

                {/* Header HUD */}
                <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-4">
                        <div className="size-11 rounded-xl border border-white/10 bg-white/[0.03] flex items-center justify-center text-emerald-400 shadow-xl group-hover:border-emerald-500/40 transition-all duration-500">
                            <Magnet className="size-5" />
                        </div>
                        <div className="flex flex-col">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 leading-none mb-1">Local.Field.Flux</h2>
                            <span className="text-sm font-bold tracking-tight text-white flex items-center gap-2 uppercase">
                                Magnetometer
                                <div className="size-1 rounded-full bg-emerald-500 animate-pulse" />
                            </span>
                        </div>
                    </div>

                    <div className="px-3 py-1.5 rounded-lg border border-white/5 bg-white/[0.02] backdrop-blur-md text-[9px] font-black tracking-widest text-white/40 flex items-center gap-2">
                        <LocateFixed className="size-3 text-emerald-500" />
                        STN: {magData?.stationCode || "TEO-UX"}
                    </div>
                </div>

                {/* Central Vector HUD */}
                <div className="flex-1 flex flex-col items-center justify-center relative">
                    <div className="relative size-56 @md:size-64">
                        {/* Static Compass Frame */}
                        <div className="absolute inset-0 rounded-full border border-white/5" />
                        <div className="absolute inset-4 rounded-full border border-white/5 bg-gradient-to-br from-emerald-500/5 to-transparent" />

                        {/* Cardinal Markers */}
                        {['N', 'E', 'S', 'W'].map((dir, i) => (
                            <div key={dir} className="absolute inset-0 flex flex-col items-center justify-between p-2" style={{ transform: `rotate(${i * 90}deg)` }}>
                                <span className="text-[8px] font-black text-white/20">{dir}</span>
                            </div>
                        ))}

                        {/* Dynamic Vector Pointer */}
                        <motion.div
                            animate={{ rotate: heading }}
                            transition={{ type: "spring", stiffness: 60, damping: 15 }}
                            className="absolute inset-0 z-20 flex items-center justify-center"
                        >
                            <div className="relative h-1/2 w-1.5 flex flex-col items-center -translate-y-1/2">
                                <div className="w-full flex-1 bg-gradient-to-t from-emerald-400 to-cyan-500 rounded-full shadow-[0_0_20px_#10b981]" />
                                <div className="absolute -top-1 size-3 bg-emerald-400 rounded-full blur-[2px] opacity-60" />
                            </div>
                        </motion.div>

                        {/* Core Value Overlay */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center mt-8">
                            <div className="flex items-baseline gap-1">
                                <span className="text-3xl font-black text-white tracking-tighter">
                                    {totalB.toFixed(0)}
                                </span>
                                <span className="text-[10px] font-bold text-emerald-500/60 uppercase">nT</span>
                            </div>
                            <span className="text-[7px] font-black text-white/20 tracking-[0.3em] uppercase mt-1">Total Flux Density</span>
                        </div>
                    </div>
                </div>

                {/* 3-Axis Telemetry Grid */}
                <div className="grid grid-cols-3 gap-2 mt-4">
                    {[
                        { label: 'Bx (North)', val: xComp, icon: Navigation, color: 'text-emerald-400' },
                        { label: 'By (East)', val: yComp, icon: MoveDiagonal, color: 'text-cyan-400' },
                        { label: 'Bz (Vertical)', val: zComp, icon: Activity, color: 'text-blue-400' }
                    ].map((m, i) => (
                        <div key={i} className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 flex flex-col items-center justify-center transition-all hover:bg-white/[0.08] hover:border-white/10">
                            <m.icon className={cn("size-3 mb-2 opacity-50", m.color)} />
                            <div className="flex items-baseline gap-0.5">
                                <span className="text-[11px] font-black text-white">{m.val.toFixed(1)}</span>
                                <span className="text-[7px] font-bold text-white/30">nT</span>
                            </div>
                            <span className="text-[6px] font-black text-white/20 uppercase tracking-widest mt-1 text-center w-full">
                                {m.label}
                            </span>
                        </div>
                    ))}
                </div>

                {/* GIC Risk Footer */}
                <div className="mt-4 flex items-center justify-between p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
                            <Zap className="size-3" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[7px] font-black text-white/30 uppercase tracking-widest leading-none mb-1">Grid Inductance (GIC)</span>
                            <span className="text-[10px] font-black text-white uppercase">Nominal / No Risk</span>
                        </div>
                    </div>
                    <div className="text-[14px] font-black text-emerald-500">0.02 <span className="text-[8px] text-white/20">A/km</span></div>
                </div>
            </div>

            {/* Corner Markers */}
            <div className="absolute top-0 right-0 p-3 opacity-20 pointer-events-none">
                <Info className="size-3 text-white" />
            </div>
        </Card>
    );
};

"use client";

import React from "react";
import {
    Home,
    FlaskConical,
    Network,
    Settings,
    Zap,
    SkipBack,
    Play,
    SkipForward,
    ChevronUp,
    Activity,
    Cpu,
    Share2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LiquidGlassWrapper } from "@/components/ui/LiquidGlassWrapper";
import { SystemMonitor } from "@/components/stitch/SystemMonitor";

export default function CrystalDashboard() {
    return (
        <div className="font-sans text-white min-h-screen relative overflow-hidden bg-[#0a0a20] selection:bg-[#ff00ff]/30">
            {/* Background Gradient & Grid */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_#0a0a20_0%,_#000000_100%)] z-0" />
            <div
                className="absolute inset-0 z-0 opacity-30 pointer-events-none"
                style={{
                    backgroundImage: `
            linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px)
          `,
                    backgroundSize: "50px 50px",
                    transform: "perspective(500px) rotateX(60deg) scale(2)",
                    transformOrigin: "center top"
                }}
            />

            {/* Navigation Dock */}
            <header className="fixed top-8 left-1/2 -translate-x-1/2 z-50">
                <LiquidGlassWrapper
                    displacementScale={50}
                    blurAmount={10}
                    saturation={120}
                    cornerRadius={9999} // Pill shape
                    className="flex items-center gap-8 px-8 py-3 border border-white/10"
                >
                    <button className="hover:text-[#ff00ff] transition-colors flex items-center justify-center p-2 rounded-full hover:bg-white/5">
                        <Home className="w-6 h-6" />
                    </button>
                    <button className="text-[#ff00ff] flex items-center justify-center p-2 rounded-full bg-[#ff00ff]/10">
                        <FlaskConical className="w-6 h-6" />
                    </button>
                    <button className="hover:text-[#ff00ff] transition-colors flex items-center justify-center p-2 rounded-full hover:bg-white/5">
                        <Network className="w-6 h-6" />
                    </button>
                    <div className="w-px h-6 bg-white/20 mx-2" />
                    <button className="hover:text-[#ff00ff] transition-colors flex items-center justify-center p-2 rounded-full hover:bg-white/5">
                        <Settings className="w-6 h-6" />
                    </button>
                </LiquidGlassWrapper>
            </header>

            {/* Main Content Grid */}
            <main className="container mx-auto pt-32 pb-12 h-screen max-h-screen grid grid-cols-12 grid-rows-6 gap-6 px-6 relative z-10">

                {/* Top Left: System Vitality */}
                <section className="col-span-4 row-span-3 relative group">
                    <SystemMonitor className="w-full h-full" />
                </section>

                {/* Right Side: Network Topology */}
                <section className="col-span-8 row-span-4 relative group">
                    <LiquidGlassWrapper
                        className="w-full h-full p-8 relative overflow-hidden border border-white/10"
                        cornerRadius={24}
                        displacementScale={20}
                        elasticity={0.05}
                    >
                        <div className="flex justify-between items-center mb-6 relative z-10">
                            <div>
                                <h2 className="text-2xl font-bold tracking-tight font-headline">Network Topology</h2>
                                <p className="text-white/40 text-sm">Hyper-Crystal Node Mapping</p>
                            </div>
                            <div className="flex gap-2">
                                <span className="px-3 py-1 bg-white/10 rounded-full text-xs border border-white/20 backdrop-blur-md">Active Nodes: 1,204</span>
                                <span className="px-3 py-1 bg-[#ff00ff]/20 text-[#ff00ff] rounded-full text-xs border border-[#ff00ff]/40 backdrop-blur-md">Sync Level: MAX</span>
                            </div>
                        </div>

                        {/* Simulated Node Graph */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-80 pointer-events-none">
                            <svg className="w-full h-full p-12" viewBox="0 0 800 500">
                                <defs>
                                    <radialGradient id="glow" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                                        <stop offset="0%" stopColor="rgb(255,0,255)" stopOpacity="0.4" />
                                        <stop offset="100%" stopColor="rgb(255,0,255)" stopOpacity="0" />
                                    </radialGradient>
                                </defs>
                                {/* Connection Lines */}
                                <g className="stroke-white/10 stroke-[1]">
                                    <line x1="400" y1="250" x2="200" y2="150" />
                                    <line x1="400" y1="250" x2="600" y2="150" />
                                    <line x1="400" y1="250" x2="400" y2="450" />
                                    <line x1="200" y1="150" x2="100" y2="300" />
                                    <line x1="600" y1="150" x2="700" y2="350" />
                                </g>

                                {/* Nodes */}
                                <circle className="drop-shadow-[0_0_15px_rgba(255,0,255,1)] animate-pulse" cx="400" cy="250" r="12" fill="#ff00ff" />
                                <circle cx="400" cy="250" r="30" fill="url(#glow)" className="animate-pulse" />

                                <circle className="drop-shadow-[0_0_8px_rgba(0,243,255,0.8)]" cx="200" cy="150" r="6" fill="#00f3ff" />
                                <circle className="drop-shadow-[0_0_8px_rgba(0,243,255,0.8)]" cx="600" cy="150" r="6" fill="#00f3ff" />
                                <circle className="drop-shadow-[0_0_8px_rgba(0,243,255,0.8)]" cx="400" cy="450" r="6" fill="#00f3ff" />

                                <circle cx="100" cy="300" r="4" fill="rgba(255,255,255,0.5)" />
                                <circle cx="700" cy="350" r="4" fill="rgba(255,255,255,0.5)" />
                            </svg>
                        </div>

                        {/* Floating Data Tag */}
                        <div className="absolute bottom-12 left-12 px-4 py-2 rounded-lg text-[10px] font-mono border border-white/10 bg-white/5 backdrop-blur-md">
                            <span className="text-[#ff00ff]">DATA_STREAM:</span> 0x8F2A...9C1
                        </div>
                    </LiquidGlassWrapper>
                </section>

                {/* Bottom Left: Active Processes */}
                <section className="col-span-4 row-span-3">
                    <LiquidGlassWrapper
                        className="w-full h-full p-8 flex flex-col border border-white/10"
                        cornerRadius={24}
                        displacementScale={40}
                    >
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold font-headline">Active Processes</h2>
                            <div className="w-2 h-2 rounded-full bg-[#00f3ff] animate-pulse" />
                        </div>

                        <div className="flex-1 overflow-hidden font-mono text-[11px] space-y-2 text-white/60">
                            <div className="flex gap-4">
                                <span className="text-[#00f3ff]">[08:42:11]</span>
                                <span>Initializing quantum resonance...</span>
                            </div>
                            <div className="flex gap-4">
                                <span className="text-[#00f3ff]">[08:42:15]</span>
                                <span>Crystal core synchronization: 99.4%</span>
                            </div>
                            <div className="flex gap-4">
                                <span className="text-[#ff00ff]">[08:42:18]</span>
                                <span>ALERT: Sub-strata oscillation detected.</span>
                            </div>
                            <div className="flex gap-4">
                                <span className="text-[#00f3ff]">[08:42:20]</span>
                                <span>Calibrating photonic emitters... DONE</span>
                            </div>
                            <div className="flex gap-4">
                                <span className="text-white/30">[08:42:25]</span>
                                <span>Idle connection maintenance...</span>
                            </div>
                            <div className="flex gap-4">
                                <span className="text-[#00f3ff]">[08:42:30]</span>
                                <span>StarSeed kernel re-patching... OK</span>
                            </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between text-xs font-mono">
                            <span className="text-white/40 italic animate-pulse">Listening for input_</span>
                            <span className="text-[#00f3ff]">PID: 9021</span>
                        </div>
                    </LiquidGlassWrapper>
                </section>

                {/* Bottom Right: Media Control */}
                <section className="col-span-8 row-span-2">
                    <LiquidGlassWrapper
                        className="w-full h-full p-8 flex items-center gap-8 border border-white/10"
                        cornerRadius={24}
                        displacementScale={60}
                        elasticity={0.3}
                    >
                        <div className="w-32 h-32 rounded-2xl overflow-hidden flex-shrink-0 relative group shadow-2xl">
                            <div className="absolute inset-0 bg-gradient-to-br from-[#ff00ff] to-[#00f3ff] opacity-80" />
                            <div className="absolute inset-0 bg-black/20" />
                            <div className="absolute inset-0 flex items-center justify-center text-white top-10">
                                <Activity className="w-12 h-12" />
                            </div>
                        </div>

                        <div className="flex-1">
                            <div className="mb-4">
                                <h2 className="text-2xl font-bold tracking-tight font-headline">Alpha-Wave Focusing</h2>
                                <p className="text-white/40">Binaural Beats • 14Hz Crystal Resonator</p>
                            </div>

                            {/* Progress Bar */}
                            <div className="w-full h-1.5 bg-white/10 rounded-full relative mb-3 overflow-hidden">
                                <div className="absolute left-0 top-0 h-full w-1/3 bg-[#ff00ff] shadow-[0_0_10px_#ff00ff]" />
                            </div>

                            <div className="flex justify-between text-[10px] font-mono text-white/40 uppercase tracking-widest">
                                <span>12:45</span>
                                <span>30:00</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-6">
                            <button className="w-12 h-12 flex items-center justify-center hover:text-[#ff00ff] transition-colors">
                                <SkipBack className="w-8 h-8" />
                            </button>
                            <button className="w-16 h-16 bg-white text-[#0a0a20] rounded-[40%_60%_70%_30%_/_40%_50%_60%_50%] flex items-center justify-center hover:scale-105 transition-transform hover:shadow-[0_0_20px_rgba(255,255,255,0.5)]">
                                <Play className="w-8 h-8 ml-1" />
                            </button>
                            <button className="w-12 h-12 flex items-center justify-center hover:text-[#ff00ff] transition-colors">
                                <SkipForward className="w-8 h-8" />
                            </button>
                        </div>
                    </LiquidGlassWrapper>
                </section>

            </main>

            {/* Side Decoration */}
            <div className="fixed -right-12 top-1/2 -translate-y-1/2 rotate-90 flex items-center gap-4 text-white/20 select-none pointer-events-none z-0">
                <span className="text-sm font-mono tracking-[1em] uppercase">Hyper-Crystal</span>
                <div className="h-px w-32 bg-white/20" />
                <span className="text-sm font-mono">v4.0.2</span>
            </div>

        </div>
    );
}

"use client";

import React, { useState } from 'react';
import {
    Brain,
    Search,
    Bell,
    Wand2,
    PenTool,
    Droplets,
    Workflow,
    PlusCircle,
    Cpu,
    Home,
    Grid,
    CircleDot,
    FolderOpen,
    Network,
    RefreshCw,
    Rocket,
    Zap,
    Shield,
    LineChart,
    Heart
} from 'lucide-react';
import { cn } from '@/lib/utils'; // Assuming this exists, common in shadcn
// If LiquidGlassWrapper is too heavy for everything, we use CSS classes for now,
// but we can wrap the main container or specific widgets if needed.
// For now, I will simulate the "liquid-glass" and "heavy-glass" classes using standard Tailwind + custom styles in globals.css

export default function TrinityInterface() {
    const [activePanel, setActivePanel] = useState<'left' | 'right' | null>(null);

    // Helper to toggle panels (for touch/click backup)
    const togglePanel = (panel: 'left' | 'right') => {
        setActivePanel(activePanel === panel ? null : panel);
    };

    return (
        <div className="bg-background-light dark:bg-background-dark text-white font-sans selection:bg-primary/40 h-screen w-screen relative overflow-hidden">
            {/* Background Nebula Effect */}
            <div className="fixed inset-0 pointer-events-none -z-10 opacity-30">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-electric-azure/10 blur-[150px] rounded-full"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-primary/10 blur-[150px] rounded-full"></div>
            </div>

            {/* ZENITH PANEL (Top) */}
            <header className="absolute top-0 left-0 right-0 z-50 px-10 pt-4 flex justify-center pointer-events-none">
                <div className="pointer-events-auto w-full max-w-4xl backdrop-blur-xl bg-electric-azure/10 rounded-b-xl border border-t-0 border-white/10 p-4 flex items-center gap-4 shadow-[0_0_20px_rgba(0,127,255,0.3)]">
                    <div className="flex items-center gap-3 px-4 border-r border-white/10">
                        <Brain className="text-electric-azure w-6 h-6" />
                        <span className="text-xs font-bold tracking-[0.2em] uppercase text-electric-azure/80">Zenith AI</span>
                    </div>
                    <div className="flex-1 flex items-center bg-white/5 rounded-full px-4 py-2 border border-white/5 focus-within:border-electric-azure/50 transition-all">
                        <Search className="text-white/40 mr-2 w-4 h-4" />
                        <input
                            className="bg-transparent border-none outline-none text-sm w-full placeholder:text-white/20 focus:ring-0"
                            placeholder="Initiate neural query..."
                            type="text"
                        />
                        <span className="text-[10px] text-white/30 font-mono">⌘+K</span>
                    </div>
                    <div className="flex gap-2">
                        <button className="p-2 rounded-full hover:bg-white/10 text-white/60 transition-colors">
                            <Bell className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </header>

            {/* CREATION SIDEBAR (Left) */}
            <aside
                className="absolute left-0 top-0 bottom-0 z-40 w-20 flex items-center justify-center pl-4 group/sidebar"
                onMouseEnter={() => setActivePanel('left')}
                onMouseLeave={() => setActivePanel(null)}
            >
                <div className={cn(
                    "h-[70%] w-full backdrop-blur-xl bg-emerald-green/10 rounded-r-xl flex flex-col items-center py-8 gap-8 shadow-[0_0_20px_rgba(16,185,129,0.3)] border border-l-0 border-white/10 transition-transform duration-300",
                    activePanel === 'left' ? "translate-x-0" : "-translate-x-2/3 opacity-50 hover:opacity-100"
                )}>
                    <div className="p-3 bg-emerald-green/20 rounded-full mb-4">
                        <Wand2 className="text-emerald-green w-6 h-6" />
                    </div>

                    <button className="group relative p-3 rounded-xl hover:bg-emerald-green/20 text-white/40 hover:text-emerald-green transition-all">
                        <PenTool className="w-6 h-6" />
                        <span className="absolute left-full ml-4 px-2 py-1 bg-emerald-green text-black text-[10px] font-bold rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-50 pointer-events-none">
                            DRAFT
                        </span>
                    </button>

                    <button className="group relative p-3 rounded-xl hover:bg-emerald-green/20 text-white/40 hover:text-emerald-green transition-all">
                        <Droplets className="w-6 h-6" />
                        <span className="absolute left-full ml-4 px-2 py-1 bg-emerald-green text-black text-[10px] font-bold rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-50 pointer-events-none">
                            MORPH
                        </span>
                    </button>

                    <button className="group relative p-3 rounded-xl hover:bg-emerald-green/20 text-white/40 hover:text-emerald-green transition-all">
                        <Workflow className="w-6 h-6" />
                        <span className="absolute left-full ml-4 px-2 py-1 bg-emerald-green text-black text-[10px] font-bold rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-50 pointer-events-none">
                            FLOW
                        </span>
                    </button>

                    <div className="mt-auto">
                        <button className="p-3 rounded-xl text-white/20 hover:text-white transition-colors">
                            <PlusCircle className="w-6 h-6" />
                        </button>
                    </div>
                </div>
            </aside>

            {/* LOGIC SIDEBAR (Right) */}
            <aside
                className="absolute right-0 top-0 bottom-0 z-40 w-80 flex items-center justify-center pr-4 group/sidebar"
                onMouseEnter={() => setActivePanel('right')}
                onMouseLeave={() => setActivePanel(null)}
            >
                <div className={cn(
                    "h-[85%] w-full backdrop-blur-xl bg-solar-amber/10 rounded-l-xl p-6 flex flex-col gap-6 shadow-[0_0_20px_rgba(255,191,0,0.3)] border border-r-0 border-white/10 overflow-hidden transition-transform duration-300",
                    activePanel === 'right' ? "translate-x-0" : "translate-x-[80%] opacity-50 hover:opacity-100"
                )}>
                    <div className="flex items-center justify-between border-b border-white/5 pb-4">
                        <h2 className="text-xs font-bold tracking-[0.3em] uppercase text-solar-amber">Logic Core</h2>
                        <Cpu className="text-solar-amber w-4 h-4 animate-pulse" />
                    </div>

                    {/* Technical Stats */}
                    <div className="space-y-4 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
                        <div className="space-y-2">
                            <div className="flex justify-between text-[10px] text-white/40 uppercase tracking-widest">
                                <span>Entropy Sync</span>
                                <span>88%</span>
                            </div>
                            <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                <div className="h-full bg-solar-amber w-[88%] rounded-full shadow-[0_0_10px_#FFBF00]"></div>
                            </div>
                        </div>

                        <div className="p-4 rounded-lg bg-white/5 border border-white/5 space-y-3">
                            <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-solar-amber"></span>
                                <span className="text-[10px] font-bold text-solar-amber/80 uppercase">Node Activity</span>
                            </div>
                            <div className="h-20 flex items-end justify-between gap-1">
                                {/* Simulated Graph Bars */}
                                <div className="w-full bg-solar-amber/20 h-[40%] rounded-t-sm"></div>
                                <div className="w-full bg-solar-amber/40 h-[70%] rounded-t-sm"></div>
                                <div className="w-full bg-solar-amber/60 h-[50%] rounded-t-sm"></div>
                                <div className="w-full bg-solar-amber/30 h-[90%] rounded-t-sm"></div>
                                <div className="w-full bg-solar-amber/50 h-[60%] rounded-t-sm"></div>
                                <div className="w-full bg-solar-amber/20 h-[30%] rounded-t-sm"></div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <h3 className="text-[10px] text-white/40 uppercase tracking-widest font-bold">System Log</h3>
                            <div className="text-[10px] font-mono space-y-2 text-white/60">
                                <div className="flex gap-2">
                                    <span className="text-solar-amber">[OK]</span>
                                    <span>Neural link established</span>
                                </div>
                                <div className="flex gap-2">
                                    <span className="text-solar-amber">[OK]</span>
                                    <span>Buffer optimized (2ms)</span>
                                </div>
                                <div className="flex gap-2">
                                    <span className="text-primary">[WARN]</span>
                                    <span>Packet jitter in sector 7</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </aside>

            {/* ANCHOR DOCK (Bottom) */}
            <nav className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50">
                <div className="px-8 py-3 backdrop-blur-xl bg-primary/10 rounded-full flex items-center gap-8 shadow-[0_0_20px_rgba(219,20,60,0.3)] border border-primary/20">
                    <button className="flex flex-col items-center gap-1 group">
                        <Home className="text-primary w-6 h-6" />
                        <span className="w-1 h-1 rounded-full bg-primary"></span>
                    </button>
                    <button className="flex flex-col items-center gap-1 group text-white/40 hover:text-white transition-colors">
                        <Grid className="w-6 h-6" />
                    </button>
                    <button className="flex flex-col items-center gap-1 group text-white/40 hover:text-white transition-colors">
                        <CircleDot className="w-6 h-6" />
                    </button>
                    <div className="w-px h-6 bg-white/10 mx-2"></div>
                    <button className="flex flex-col items-center gap-1 group text-white/40 hover:text-white transition-colors">
                        <FolderOpen className="w-6 h-6" />
                    </button>
                    <button className="flex flex-col items-center gap-1 group text-white/40 hover:text-white transition-colors">
                        <Network className="w-6 h-6" />
                    </button>
                </div>
            </nav>

            {/* CENTRAL CONTENT (Masonry Grid) */}
            <main className="h-screen w-screen pt-24 pb-28 px-4 md:px-28 overflow-y-auto scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
                <div className="max-w-7xl mx-auto columns-1 md:columns-2 lg:columns-3 gap-6 space-y-6">

                    {/* Widget: Live Feed */}
                    <div className="break-inside-avoid backdrop-blur-md bg-white/5 border border-white/10 rounded-xl p-6 group hover:border-white/20 transition-all">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">Ontocratic News</span>
                            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                        </div>
                        <h3 className="text-lg font-light mb-4">Hyper-reality integration protocol V2.4 successfully deployed in Tokyo-Berlin corridor.</h3>
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-electric-azure flex items-center justify-center text-[10px] font-bold">OZ</div>
                            <span className="text-xs text-white/40">Nexus Network · 2m ago</span>
                        </div>
                    </div>

                    {/* Widget: Stats Card */}
                    <div className="break-inside-avoid backdrop-blur-md bg-white/5 border border-white/10 rounded-xl p-6 flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-electric-azure/20 rounded-lg">
                                <LineChart className="text-electric-azure w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-[10px] uppercase text-white/40 font-bold tracking-widest">Network Flow</p>
                                <p className="text-2xl font-bold">1.42 Pb/s</p>
                            </div>
                        </div>
                        <div className="relative h-24 overflow-hidden rounded-lg">
                            <div className="absolute inset-0 bg-gradient-to-t from-electric-azure/10 to-transparent"></div>
                            {/* Simple CSS Wave Representation */}
                            <div className="w-full h-full flex items-end">
                                <div className="w-[10%] h-[20%] bg-electric-azure/30"></div>
                                <div className="w-[10%] h-[40%] bg-electric-azure/30"></div>
                                <div className="w-[10%] h-[60%] bg-electric-azure/30"></div>
                                <div className="w-[10%] h-[30%] bg-electric-azure/30"></div>
                                <div className="w-[10%] h-[80%] bg-electric-azure/30"></div>
                                <div className="w-[10%] h-[50%] bg-electric-azure/30"></div>
                                <div className="w-[10%] h-[70%] bg-electric-azure/30"></div>
                                <div className="w-[10%] h-[40%] bg-electric-azure/30"></div>
                                <div className="w-[10%] h-[90%] bg-electric-azure/30"></div>
                                <div className="w-[10%] h-[60%] bg-electric-azure/30"></div>
                            </div>
                        </div>
                    </div>

                    {/* Widget: Active Project */}
                    <div className="break-inside-avoid backdrop-blur-md bg-white/5 border border-white/10 rounded-xl overflow-hidden group">
                        <div className="relative h-48 bg-gradient-to-br from-purple-500/20 to-blue-500/20">
                            {/* Placeholder for Image */}
                            <div className="absolute inset-0 flex items-center justify-center text-white/10">
                                <Workflow className="w-12 h-12" />
                            </div>
                            <div className="absolute inset-0 bg-gradient-to-t from-background-dark to-transparent"></div>
                            <div className="absolute bottom-4 left-4">
                                <span className="px-2 py-1 rounded bg-emerald-green text-[8px] font-bold text-black uppercase">Active</span>
                                <h4 class="text-xl font-bold mt-1">Project Morphosis</h4>
                            </div>
                        </div>
                        <div className="p-4 flex justify-between items-center">
                            <div className="flex -space-x-2">
                                <div className="w-6 h-6 rounded-full border-2 border-background-dark bg-white/20"></div>
                                <div className="w-6 h-6 rounded-full border-2 border-background-dark bg-white/40"></div>
                                <div className="w-6 h-6 rounded-full border-2 border-background-dark bg-white/60"></div>
                            </div>
                            <span className="text-[10px] text-white/40 uppercase font-bold">72% Optimized</span>
                        </div>
                    </div>

                    {/* Widget: Quick Actions */}
                    <div className="break-inside-avoid backdrop-blur-md bg-white/5 border border-white/10 rounded-xl p-6 grid grid-cols-2 gap-3">
                        <button className="flex flex-col items-center justify-center p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-colors gap-2">
                            <RefreshCw className="text-emerald-green w-6 h-6" />
                            <span className="text-[10px] font-bold text-white/60 uppercase">Sync</span>
                        </button>
                        <button className="flex flex-col items-center justify-center p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-colors gap-2">
                            <Rocket className="text-solar-amber w-6 h-6" />
                            <span className="text-[10px] font-bold text-white/60 uppercase">Deploy</span>
                        </button>
                        <button className="flex flex-col items-center justify-center p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-colors gap-2">
                            <Zap className="text-electric-azure w-6 h-6" />
                            <span className="text-[10px] font-bold text-white/60 uppercase">Overdrive</span>
                        </button>
                        <button className="flex flex-col items-center justify-center p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-colors gap-2">
                            <Shield className="text-primary w-6 h-6" />
                            <span className="text-[10px] font-bold text-white/60 uppercase">Protect</span>
                        </button>
                    </div>

                    {/* Widget: Node Map */}
                    <div className="break-inside-avoid backdrop-blur-md bg-white/5 border border-white/10 rounded-xl p-2 relative">
                        <div className="rounded-lg overflow-hidden h-64 bg-black/50 grayscale contrast-125 brightness-50 relative">
                            {/* Placeholder Map */}
                            <div className="absolute inset-0 opacity-50 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-black to-black"></div>
                            <div className="absolute top-1/2 left-1/2 w-2 h-2 bg-emerald-green rounded-full shadow-[0_0_10px_#10B981]"></div>
                            <div className="absolute top-1/3 left-1/3 w-1 h-1 bg-white/50 rounded-full"></div>
                            <div className="absolute bottom-1/4 right-1/4 w-1 h-1 bg-white/50 rounded-full"></div>
                        </div>
                        <div className="absolute top-6 left-6 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-green animate-ping"></div>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-green">Live Topology</span>
                        </div>
                        <div className="p-4 flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold">Active Nodes</p>
                                <p className="text-[10px] text-white/40">Global Distribution</p>
                            </div>
                            <p className="text-xl font-bold text-emerald-green">14,288</p>
                        </div>
                    </div>

                    {/* Widget: System Health */}
                    <div className="break-inside-avoid backdrop-blur-md bg-white/5 border border-white/10 rounded-xl p-6">
                        <div className="flex items-center gap-2 mb-6">
                            <Heart className="text-primary w-4 h-4" />
                            <h3 className="text-xs font-bold uppercase tracking-widest">Vitality Matrix</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-y-4">
                            <div>
                                <p className="text-[10px] text-white/40 uppercase">Core Heat</p>
                                <p className="text-lg font-bold">34°C</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-white/40 uppercase">Memory</p>
                                <p className="text-lg font-bold">12.4 GB</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-white/40 uppercase">Uptime</p>
                                <p className="text-lg font-bold">142:12</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-white/40 uppercase">Latency</p>
                                <p className="text-lg font-bold text-emerald-green">4ms</p>
                            </div>
                        </div>
                    </div>

                </div>
            </main>

            {/* LIQUID EDGES (Visual Markers) - Only visible when hovering near edge? Or always to prompt interaction? 
          Stitch design had them absolute. keeping them for visual flair.
      */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-electric-azure rounded-b-full shadow-[0_0_15px_#007FFF] opacity-50"></div>
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-32 bg-emerald-green rounded-r-full shadow-[0_0_15px_#10B981] opacity-50"></div>
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-32 bg-solar-amber rounded-l-full shadow-[0_0_15px_#FFBF00] opacity-50"></div>
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-primary rounded-t-full shadow-[0_0_15px_#db143c] opacity-50"></div>

        </div>
    );
}

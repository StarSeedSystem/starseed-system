import React from 'react';
import { Settings, Bell, CheckCircle2, AlertTriangle, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from "@/lib/utils";

export function SystemStatusWidget() {
    return (
        <div className="w-full h-full bg-card/10 backdrop-blur-2xl rounded-xl relative overflow-hidden flex flex-col p-4 md:p-6 border border-border/40 shadow-2xl text-foreground font-display group/main">
            {/* Ambient Background Glows */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 blur-[100px] rounded-full pointer-events-none group-hover/main:bg-primary/30 transition-colors duration-1000"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/10 blur-[100px] rounded-full pointer-events-none"></div>

            {/* Header */}
            <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-border/20 gap-4 shrink-0 z-10">
                <div className="flex items-center gap-3">
                    <motion.div 
                        initial={{ rotate: -90, opacity: 0 }}
                        animate={{ rotate: 0, opacity: 1 }}
                        className="p-2 bg-primary/10 rounded-lg text-primary border border-primary/20 shadow-[0_0_15px_rgba(var(--primary-hsl),0.2)]"
                    >
                        <Activity size={24} className="animate-pulse" />
                    </motion.div>
                    <div>
                        <h1 className="text-[8px] md:text-[10px] uppercase tracking-[0.3em] md:tracking-[0.4em] text-muted-foreground font-bold italic">StarSeed Trinity</h1>
                        <h2 className="text-lg md:text-xl font-black tracking-widest text-primary drop-shadow-[0_0_8px_rgba(var(--primary-hsl),0.3)]">TELEMETRY & CORE</h2>
                    </div>
                </div>

                <div className="flex items-center gap-4 self-end sm:self-auto">
                    <div className="text-right hidden sm:block">
                        <p className="text-[8px] uppercase tracking-[0.3em] text-muted-foreground/60 font-bold">Mission Time</p>
                        <motion.p 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="font-mono text-sm md:text-base text-foreground/90 font-black tabular-nums tracking-tighter"
                        >
                            08:42:11:04
                        </motion.p>
                    </div>
                    <div className="flex gap-2">
                        <button className="h-9 w-9 flex items-center justify-center rounded-lg border border-border/40 bg-muted/5 hover:bg-primary/20 transition-all text-muted-foreground hover:text-primary hover:border-primary/40 group">
                            <Settings size={18} className="group-hover:rotate-90 transition-transform duration-500" />
                        </button>
                        <button className="h-9 w-9 flex items-center justify-center rounded-lg border border-border/40 bg-muted/5 hover:bg-primary/20 transition-all text-muted-foreground hover:text-primary hover:border-primary/40 relative">
                            <Bell size={18} />
                            <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full animate-ping"></span>
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6 py-6 relative z-10 overflow-hidden min-h-0">

                {/* Left Side Status */}
                <div className="hidden md:flex flex-col justify-center col-span-3 space-y-6 min-w-0">
                    <div className="space-y-4">
                        <div className="w-full">
                            <div className="flex justify-between items-end mb-2">
                                <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground font-black">CPU Cores</p>
                                <span className="text-[9px] font-mono text-primary/80">68% AVG</span>
                            </div>
                            <div className="flex gap-1.5 h-16 xl:h-24 w-full min-w-0 items-end px-1">
                                {[65, 42, 88, 30, 55, 72].map((h, i) => (
                                    <div key={i} className="flex-1 bg-muted/20 rounded-t-md relative overflow-hidden ring-1 ring-border/10 h-full group/bar">
                                        <motion.div
                                            initial={{ height: 0 }}
                                            animate={{ height: `${h}%` }}
                                            transition={{ duration: 1.5, delay: i * 0.1, ease: "easeOut" }}
                                            className="absolute bottom-0 w-full bg-gradient-to-t from-primary/40 via-primary to-primary/90 shadow-[0_0_20px_rgba(var(--primary-hsl),0.4)] transition-all duration-300 group-hover/bar:brightness-125"
                                        >
                                            <div className="absolute top-0 left-0 w-full h-1 bg-white/40 blur-[1px]"></div>
                                        </motion.div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="w-full bg-card/40 p-3 rounded-xl border border-border/20 shadow-inner">
                            <div className="flex justify-between items-center mb-2">
                                <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground font-black">RAM</p>
                                <p className="font-mono text-[10px] text-primary font-black">12.4 / 16 GB</p>
                            </div>
                            <div className="w-full bg-muted/30 h-1.5 rounded-full overflow-hidden border border-border/20">
                                <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: "74.2%" }}
                                    transition={{ duration: 2, ease: "circOut" }}
                                    className="h-full bg-gradient-to-r from-primary/60 to-primary shadow-[0_0_15px_rgba(var(--primary-hsl),0.6)] relative"
                                >
                                    <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.2)_50%,transparent_75%)] bg-[length:20px_20px] animate-[shimmer_2s_linear_infinite]"></div>
                                </motion.div>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 border border-primary/20 rounded-xl bg-primary/5 flex flex-col items-center justify-center text-center backdrop-blur-sm relative group/thermal overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover/thermal:opacity-100 transition-opacity"></div>
                        <p className="text-[9px] uppercase tracking-[0.3em] text-muted-foreground mb-1 font-bold z-10">Thermal Core</p>
                        <p className="text-2xl xl:text-3xl font-black text-primary z-10 tabular-nums">32.4<span className="text-xs font-light ml-0.5">K</span></p>
                        <div className="flex items-center gap-1 mt-1 z-10">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                            <p className="text-[8px] xl:text-[9px] text-muted-foreground/80 uppercase font-mono tracking-widest font-black">Stable</p>
                        </div>
                    </div>
                </div>

                {/* Central holographic Visualizer */}
                <div className="col-span-1 md:col-span-6 flex flex-col items-center justify-center relative min-h-[200px] min-w-0">
                    {/* Dynamic Background SVG Waves */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20" viewBox="0 0 400 200">
                        <motion.path
                            d="M 0 100 Q 100 50 200 100 T 400 100"
                            stroke="hsl(var(--primary))"
                            strokeWidth="1"
                            fill="none"
                            initial={{ pathLength: 0, opacity: 0 }}
                            animate={{ pathLength: 1, opacity: 1, d: ["M 0 100 Q 100 50 200 100 T 400 100", "M 0 100 Q 100 150 200 100 T 400 100", "M 0 100 Q 100 50 200 100 T 400 100"] }}
                            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                        />
                        <motion.path
                            d="M 0 120 Q 150 180 300 120 T 400 100"
                            stroke="hsl(var(--accent))"
                            strokeWidth="0.5"
                            fill="none"
                            animate={{ d: ["M 0 120 Q 150 180 300 120 T 400 100", "M 0 120 Q 150 60 300 120 T 400 100", "M 0 120 Q 150 180 300 120 T 400 100"] }}
                            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                        />
                    </svg>

                    {/* Decorative Spinning Rings */}
                    <div className="absolute w-[85%] max-w-[320px] aspect-square border border-primary/20 rounded-full animate-[spin_10s_linear_infinite] border-dashed"></div>
                    <div className="absolute w-[95%] max-w-[360px] aspect-square border border-primary/10 rounded-full animate-[spin_15s_linear_infinite_reverse]"></div>
                    <motion.div 
                        animate={{ scale: [1, 1.05, 1], rotate: [0, 90, 180, 270, 360] }}
                        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                        className="absolute w-[110%] max-w-[420px] aspect-square border-t border-b border-primary/5 rounded-full"
                    ></motion.div>

                    {/* Radar UI / Quantum Display */}
                    <div className="relative w-[75%] max-w-[260px] aspect-square flex items-center justify-center">
                        <div className="absolute inset-0 rounded-full border-[3px] border-primary/20 shadow-[0_0_60px_rgba(var(--primary-hsl),0.15)] bg-primary/5 backdrop-blur-[2px]"></div>
                        <div className="absolute w-full h-px bg-primary/30"></div>
                        <div className="absolute h-full w-px bg-primary/30"></div>

                        {/* Radar Sweep */}
                        <div className="absolute w-1/2 h-1/2 left-1/2 bottom-1/2 origin-bottom-left bg-gradient-to-t from-transparent to-primary/40 border-r-2 border-primary/60 animate-[spin_3s_linear_infinite]" style={{ borderRadius: "100% 0 0 0" }}></div>

                        {/* Center Display - ENLARGED */}
                        <motion.div 
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            whileHover={{ scale: 1.05 }}
                            className="z-10 text-center bg-card/90 p-6 md:p-10 rounded-full backdrop-blur-3xl border-2 border-primary/40 shadow-[0_0_50px_rgba(var(--primary-hsl),0.3)] flex flex-col items-center justify-center min-w-[150px] cursor-default group/quantum"
                        >
                            <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping opacity-20 pointer-events-none"></div>
                            <p className="text-[10px] md:text-xs tracking-[0.4em] text-primary mb-2 font-black uppercase drop-shadow-sm">Quantum</p>
                            <p className="text-3xl md:text-6xl font-black text-foreground drop-shadow-[0_0_20px_rgba(var(--primary-hsl),0.6)] tabular-nums tracking-tighter">98.2%</p>
                            <div className="mt-3 flex items-center gap-2">
                                <div className="h-1 w-12 bg-muted/40 rounded-full overflow-hidden">
                                    <div className="h-full bg-primary w-full animate-[shimmer_2s_linear_infinite]"></div>
                                </div>
                                <p className="text-[8px] md:text-[10px] text-primary/80 uppercase font-mono tracking-widest font-black">Sync</p>
                            </div>
                        </motion.div>
                    </div>

                    {/* Coordinate Data */}
                    <div className="absolute bottom-[-20px] w-full flex justify-center gap-8 font-mono text-[10px] text-primary/40 tracking-[0.3em] hidden sm:flex font-black uppercase">
                        <span className="bg-primary/5 px-2 py-0.5 rounded border border-primary/10">X: 192.441</span>
                        <span className="bg-primary/5 px-2 py-0.5 rounded border border-primary/10">Y: 004.882</span>
                        <span className="bg-primary/5 px-2 py-0.5 rounded border border-primary/10">Z: 992.001</span>
                    </div>
                </div>

                {/* Right Side Data */}
                <div className="hidden md:flex flex-col justify-center col-span-3 text-right space-y-6 min-w-0">
                    <div className="space-y-4">
                        <div className="w-full bg-card/40 p-3 rounded-xl border border-border/20 shadow-inner group/io">
                            <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground mb-3 font-black">Network Topology</p>
                            <div className="flex flex-col gap-3 items-end w-full min-w-0">
                                <div className="w-full">
                                    <div className="flex justify-between text-[10px] mb-1 font-bold">
                                        <span className="text-muted-foreground/60 tracking-widest italic font-mono uppercase">Downlink</span>
                                        <span className="text-primary font-black">1.2 GB/s</span>
                                    </div>
                                    <div className="w-full bg-muted/20 h-1.5 rounded-full overflow-hidden border border-border/10">
                                        <motion.div 
                                            initial={{ width: 0 }}
                                            animate={{ width: "85%" }}
                                            className="h-full bg-primary shadow-[0_0_12px_rgba(var(--primary-hsl),0.5)]"
                                        ></motion.div>
                                    </div>
                                </div>
                                <div className="w-full">
                                    <div className="flex justify-between text-[10px] mb-1 font-bold">
                                        <span className="text-muted-foreground/60 tracking-widest italic font-mono uppercase">Uplink</span>
                                        <span className="text-accent font-black">450 MB/s</span>
                                    </div>
                                    <div className="w-full bg-muted/20 h-1.5 rounded-full overflow-hidden border border-border/10">
                                        <motion.div 
                                            initial={{ width: 0 }}
                                            animate={{ width: "32%" }}
                                            className="h-full bg-accent shadow-[0_0_12px_rgba(var(--accent-hsl),0.5)]"
                                        ></motion.div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="w-full flex flex-col items-end">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-[9px] uppercase tracking-[0.3em] text-muted-foreground font-black italic">Neural Link v4</span>
                                <Activity size={10} className="text-primary animate-pulse" />
                            </div>
                            <motion.div 
                                whileHover={{ scale: 1.05 }}
                                className="inline-flex items-center justify-end gap-3 text-primary font-black text-[11px] uppercase tracking-widest bg-primary/10 px-4 py-2 rounded-full border-2 border-primary/20 shadow-[0_0_20px_rgba(var(--primary-hsl),0.2)]"
                            >
                                <span className="h-2 w-2 bg-primary rounded-full shadow-[0_0_12px_rgba(var(--primary-hsl),1)]"></span>
                                Linked & Encrypted
                            </motion.div>
                        </div>
                    </div>

                    <div className="p-4 border border-border/40 rounded-xl bg-card/60 flex flex-col items-center justify-center text-center shadow-lg group/uptime">
                        <p className="text-[9px] uppercase tracking-[0.3em] text-muted-foreground mb-1 font-bold">Total Uptime</p>
                        <p className="text-lg xl:text-xl font-black text-primary font-mono tracking-[0.15em] tabular-nums underline decoration-primary/20 decoration-2 underline-offset-4">142:18:22</p>
                        <p className="text-[8px] xl:text-[9px] text-muted-foreground/60 mt-2 uppercase font-mono tracking-widest font-black">Power: Nominal</p>
                    </div>
                </div>
            </main>

            {/* Bottom Terminal Output */}
            <footer className="h-24 lg:h-36 bg-muted/10 border-t border-border/20 p-4 font-mono text-[9px] md:text-[10px] overflow-hidden rounded-b-xl shrink-0 z-10 relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/20 to-transparent"></div>
                <div className="h-full overflow-y-auto pr-2 space-y-2 scrollbar-thin scrollbar-thumb-primary/30 scrollbar-track-transparent">
                    <AnimatePresence>
                        {[
                            { time: "08:42:11", msg: "INIT QUANTUM RESONANCE CORE... SUCCESS", type: "success" },
                            { time: "08:42:12", msg: "NEURAL GRID ESTABLISHED - LATENCY 0.4ms", type: "info" },
                            { time: "08:42:13", msg: "TELEMETRY HANDSHAKE COMPLETE", type: "primary" },
                            { time: "08:42:20", msg: "WARNING: SECTOR 7 PACKET LOSS DETECTED - REROUTING...", type: "warning" },
                            { time: "08:42:25", msg: "RE-ROUTING COMPLETE. ALL SYSTEMS NOMINAL.", type: "success" },
                            { time: "08:42:30", msg: "LISTENING ON PORT 443... SYSTEM READY.", type: "info" }
                        ].map((log, idx) => (
                            <motion.div 
                                key={idx}
                                initial={{ x: -20, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                transition={{ delay: idx * 0.1 }}
                                className={cn(
                                    "flex gap-3 px-2 py-0.5 rounded-sm transition-colors",
                                    log.type === 'warning' ? "bg-destructive/10 text-destructive/80 font-black" : "hover:bg-primary/5"
                                )}
                            >
                                <span className="text-primary/60 shrink-0 font-black opacity-80">[{log.time}]</span>
                                <span className={cn(
                                    "truncate tracking-wide",
                                    log.type === 'warning' ? "uppercase animate-pulse" : "text-foreground/70"
                                )}>
                                    {log.type === 'primary' && <CheckCircle2 size={10} className="inline mr-2 text-primary" />}
                                    {log.type === 'warning' && <AlertTriangle size={10} className="inline mr-2" />}
                                    {log.msg}
                                </span>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            </footer>

            {/* Abstract Background Scanline & Grid */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] z-0" style={{ 
                backgroundImage: `
                    linear-gradient(rgba(var(--foreground-hsl), 0) 50%, rgba(0, 0, 0, 0.25) 50%), 
                    linear-gradient(90deg, rgba(var(--primary-hsl), 0.1), transparent),
                    radial-gradient(circle at 50% 50%, rgba(var(--primary-hsl), 0.05) 0%, transparent 70%)
                `, 
                backgroundSize: "100% 4px, 10% 100%, 100% 100%" 
            }}></div>
        </div>
    );
}

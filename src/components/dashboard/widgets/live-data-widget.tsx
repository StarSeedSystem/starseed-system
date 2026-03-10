'use client';

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Activity, Wifi, Server, Database, Share2 } from "lucide-react";
import { useEffect, useState } from "react";

export function LiveDataWidget() {
    // Simulation state
    const [metrics, setMetrics] = useState({
        nodes: 124,
        latency: 24,
        throughput: 856,
        uptime: 99.9
    });

    useEffect(() => {
        const interval = setInterval(() => {
            setMetrics(prev => ({
                nodes: prev.nodes + (Math.random() > 0.7 ? 1 : 0),
                latency: 20 + Math.floor(Math.random() * 10),
                throughput: prev.throughput + Math.floor(Math.random() * 20 - 10),
                uptime: prev.uptime
            }));
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    const items = [
        { label: "Nodos Activos", value: metrics.nodes, unit: "", icon: <Share2 className="h-4 w-4 text-emerald-400" /> },
        { label: "Latencia", value: metrics.latency, unit: "ms", icon: <Wifi className="h-4 w-4 text-amber-400" /> },
        { label: "Throughput", value: metrics.throughput, unit: "tx/s", icon: <Activity className="h-4 w-4 text-cyan-400" /> },
        { label: "Storage", value: "4.2", unit: "TB", icon: <Database className="h-4 w-4 text-indigo-400" /> },
    ];

    return (
        <div className="@container w-full h-full bg-card/10 backdrop-blur-3xl rounded-xl relative overflow-hidden flex flex-col p-4 @sm:p-6 border border-border/40 shadow-2xl text-foreground font-display group">
            {/* Background Effects */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] bg-[conic-gradient(at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-accent/10 opacity-30 pointer-events-none group-hover:rotate-12 transition-transform duration-1000"></div>

            <header className="flex items-center justify-between pb-6 shrink-0 z-10 relative">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-primary/10 shadow-sm border border-primary/20">
                        <Server className="h-5 w-5 text-primary animate-pulse" />
                    </div>
                    <div>
                        <h3 className="font-black text-xs @sm:text-sm tracking-[0.2em] uppercase">Network Telemetry</h3>
                        <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mt-0.5">Real-time Stream</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 bg-muted/10 px-3 py-1.5 rounded-full border border-border/10 backdrop-blur-md">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="text-[10px] text-emerald-500 font-black tracking-tighter">ONLINE</span>
                </div>
            </header>

            <div className="flex-1 grid grid-cols-1 @sm:grid-cols-2 gap-4 z-10 relative">
                {items.map((item, i) => (
                    <div key={i} className="p-4 rounded-2xl bg-muted/5 border border-border/10 backdrop-blur-xl flex flex-col justify-between group/item hover:bg-muted/10 hover:border-primary/30 transition-all duration-300 shadow-sm">
                        <div className="flex justify-between items-start">
                            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">{item.label}</span>
                            <div className="p-1.5 rounded-lg bg-background/40 border border-border/20 group-hover/item:scale-110 transition-transform">
                                {item.icon}
                            </div>
                        </div>
                        <div className="flex items-baseline gap-2 mt-4">
                            <span className="text-3xl @sm:text-4xl font-black tracking-tighter text-foreground drop-shadow-sm">{item.value}</span>
                            <span className="text-xs font-bold text-muted-foreground/60 uppercase">{item.unit}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Decorative Liquid Accents */}
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[80px] pointer-events-none"></div>
        </div>
    );
}

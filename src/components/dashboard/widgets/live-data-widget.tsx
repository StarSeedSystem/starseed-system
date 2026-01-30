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
        <Card className="h-full border-none shadow-none bg-transparent">
            <CardHeader className="pb-2 px-0 pt-0">
                <div className="flex items-center gap-2">
                    <div className="p-2 rounded-full bg-emerald-500/10">
                        <Server className="h-4 w-4 text-emerald-500" />
                    </div>
                    <h3 className="font-semibold text-sm">Telemetría de Red</h3>
                    <div className="ml-auto flex items-center gap-1.5">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        <span className="text-[10px] text-emerald-500 font-medium">ONLINE</span>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="px-0 pt-2 pb-0">
                <div className="grid grid-cols-2 gap-3">
                    {items.map((item, i) => (
                        <div key={i} className="p-3 rounded-xl bg-white/5 border border-white/5 backdrop-blur-sm flex flex-col justify-between h-[80px]">
                            <div className="flex justify-between items-start">
                                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{item.label}</span>
                                {item.icon}
                            </div>
                            <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-bold tracking-tight">{item.value}</span>
                                <span className="text-xs text-muted-foreground">{item.unit}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

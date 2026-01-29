'use client';

import { Activity, Cpu, Server, Wifi } from "lucide-react";
import { useEffect, useState } from "react";

export function SystemStatusWidget() {
    const [cpu, setCpu] = useState(0);
    const [memory, setMemory] = useState(0);
    const [history, setHistory] = useState<number[]>(new Array(20).fill(0));

    useEffect(() => {
        const interval = setInterval(() => {
            const newCpu = Math.floor(Math.random() * 30) + 10; // 10-40%
            const newMem = Math.floor(Math.random() * 20) + 40; // 40-60%

            setCpu(newCpu);
            setMemory(newMem);
            setHistory(prev => [...prev.slice(1), newCpu]);
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="flex h-full flex-col p-5 bg-card/40 backdrop-blur-md border border-white/5 rounded-xl">
            <div className="flex items-center gap-2 mb-4">
                <div className="bg-primary/10 p-1.5 rounded-md">
                    <Activity className="h-4 w-4 text-primary" />
                </div>
                <h3 className="text-sm font-semibold">Estado del Sistema</h3>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="flex items-center gap-3 p-2 rounded-lg bg-background/50 border border-border/50">
                    <Cpu className="h-4 w-4 text-blue-500" />
                    <div>
                        <p className="text-[10px] text-muted-foreground uppercase">CPU</p>
                        <p className="font-mono text-sm font-bold">{cpu}%</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 p-2 rounded-lg bg-background/50 border border-border/50">
                    <Server className="h-4 w-4 text-purple-500" />
                    <div>
                        <p className="text-[10px] text-muted-foreground uppercase">RAM</p>
                        <p className="font-mono text-sm font-bold">{memory}%</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex flex-col justify-end">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                    <span>Actividad en tiempo real</span>
                    <Wifi className="h-3 w-3 text-green-500 animate-pulse" />
                </div>

                <div className="h-16 flex items-end gap-1">
                    {history.map((val, i) => (
                        <div
                            key={i}
                            className="flex-1 bg-primary/20 rounded-t-sm transition-all duration-500 hover:bg-primary/40"
                            style={{ height: `${val}%` }}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

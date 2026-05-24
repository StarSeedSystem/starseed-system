"use client";

import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, Zap, BrainCircuit, Activity, CheckCircle, AlertTriangle, Info, Vote, Users, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAppearance } from "@/context/appearance-context";
import { Badge } from "@/components/ui/badge";

const activityFeed = [
    { id: 1, type: "vote", text: "Tu voto sobre 'Ley de Energía' fue registrado", time: "hace 5m", icon: <Vote className="w-3 h-3 text-primary" /> },
    { id: 2, type: "connection", text: "Dra. Evelyn Reed se unió a tu constelación", time: "hace 14m", icon: <Users className="w-3 h-3 text-cyan-400" /> },
    { id: 3, type: "alert", text: "Propuesta urgente pendiente de tu voto", time: "hace 1h", icon: <AlertTriangle className="w-3 h-3 text-amber-400" /> },
    { id: 4, type: "system", text: "Nodo sincronizado con E.F. Valle Central", time: "hace 2h", icon: <CheckCircle className="w-3 h-3 text-emerald-400" /> },
    { id: 5, type: "info", text: "Karma aumentó a ×2.4 por contribuciones recientes", time: "hace 3h", icon: <Info className="w-3 h-3 text-blue-400" /> },
];

const exocortexSuggestions = [
    "Analizar impacto de prop-1 en tu perfil de riesgo",
    "Sintetizar artículos sobre Física Cuántica (60% completado)",
    "Planificar próximos pasos en Proyecto de Riego",
];

export function RightSidebar({
    className
}: {
    className?: string;
}) {
    const { config } = useAppearance();
    const { menuBehavior } = config.layout;
    const isSticky = menuBehavior === 'sticky';
    const [syncProgress, setSyncProgress] = useState(75);
    const [cpuUsage, setCpuUsage] = useState(42);
    const [activeProcesses, setActiveProcesses] = useState(3);

    // Simulate live node stats
    useEffect(() => {
        const interval = setInterval(() => {
            setSyncProgress(prev => {
                const next = prev + Math.random() * 2 - 0.5;
                return Math.min(99, Math.max(60, next));
            });
            setCpuUsage(prev => {
                const next = prev + Math.random() * 8 - 4;
                return Math.min(95, Math.max(15, next));
            });
        }, 2500);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className={cn(
            "flex flex-col h-screen border-l transition-all duration-500 liquid-glass-panel",
            isSticky && "sticky top-0",
            className
        )}>
            <div className="flex items-center justify-between h-[60px] px-4 border-b">
                <span className="font-semibold text-xs tracking-widest text-muted-foreground uppercase">
                    Panel de Control
                </span>
                <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    En línea
                </span>
            </div>

            <div className="flex-1 overflow-auto p-3">
                <Tabs defaultValue="exocortex" className="w-full">
                    <TabsList className="grid w-full grid-cols-3 mb-3 h-8">
                        <TabsTrigger value="exocortex" className="text-[10px] px-1">
                            <BrainCircuit className="w-3 h-3 mr-1" />
                            Exocortex
                        </TabsTrigger>
                        <TabsTrigger value="activity" className="text-[10px] px-1">
                            <Activity className="w-3 h-3 mr-1" />
                            Actividad
                        </TabsTrigger>
                        <TabsTrigger value="node" className="text-[10px] px-1">
                            <Cpu className="w-3 h-3 mr-1" />
                            Nodo
                        </TabsTrigger>
                    </TabsList>

                    {/* ── EXOCORTEX TAB ── */}
                    <TabsContent value="exocortex" className="space-y-3">
                        <div className="bg-gradient-to-br from-primary/10 to-accent/5 border border-primary/20 rounded-xl p-3">
                            <div className="flex items-center gap-2 mb-2">
                                <BrainCircuit className="w-4 h-4 text-primary" />
                                <span className="text-xs font-semibold">Exocortex Activo</span>
                                <Badge className="ml-auto text-[9px] px-1.5 py-0 bg-primary/20 text-primary border-primary/30">BETA</Badge>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                Tu agente de IA personal está monitorizando la red y filtrando señales relevantes para tu contexto.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Tareas sugeridas</p>
                            {exocortexSuggestions.map((suggestion, i) => (
                                <Button
                                    key={i}
                                    variant="ghost"
                                    className="w-full text-left justify-start h-auto p-2.5 rounded-xl text-[11px] hover:bg-primary/10 hover:text-primary border border-white/5 hover:border-primary/30 transition-all"
                                >
                                    <Zap className="w-3 h-3 mr-2 flex-shrink-0 text-primary" />
                                    <span className="line-clamp-2 text-left">{suggestion}</span>
                                </Button>
                            ))}
                        </div>

                        <div className="bg-background/30 border border-white/10 rounded-xl p-3">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">Síntesis activa</p>
                            <div className="space-y-2">
                                {[
                                    { topic: "Política", progress: 82, color: "primary" },
                                    { topic: "Ciencia", progress: 61, color: "cyan" },
                                    { topic: "Cultura", progress: 45, color: "purple" },
                                ].map(item => (
                                    <div key={item.topic}>
                                        <div className="flex justify-between text-[10px] mb-1">
                                            <span className="text-muted-foreground">{item.topic}</span>
                                            <span className="text-muted-foreground">{item.progress}%</span>
                                        </div>
                                        <div className="h-1 bg-muted rounded-full overflow-hidden">
                                            <div
                                                className={cn("h-full rounded-full transition-all duration-1000", {
                                                    "bg-primary": item.color === "primary",
                                                    "bg-cyan-400": item.color === "cyan",
                                                    "bg-purple-400": item.color === "purple",
                                                })}
                                                style={{ width: `${item.progress}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </TabsContent>

                    {/* ── ACTIVITY TAB ── */}
                    <TabsContent value="activity" className="space-y-2">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">Flujo de actividad</p>
                        {activityFeed.map((item) => (
                            <div key={item.id} className="flex items-start gap-2.5 p-2.5 rounded-xl hover:bg-white/5 transition-colors cursor-pointer group">
                                <div className="mt-0.5 w-5 h-5 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0">
                                    {item.icon}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[11px] text-muted-foreground leading-snug group-hover:text-foreground transition-colors">{item.text}</p>
                                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">{item.time}</p>
                                </div>
                            </div>
                        ))}
                    </TabsContent>

                    {/* ── NODE STATUS TAB ── */}
                    <TabsContent value="node" className="space-y-3">
                        <div className="bg-gradient-to-br from-emerald-500/10 to-transparent border border-emerald-500/20 rounded-xl p-3">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-semibold flex items-center gap-1.5">
                                    <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                                    Estado del Nodo
                                </span>
                                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                            </div>
                            <p className="text-[10px] text-muted-foreground">ID: node-a4f7c831</p>
                            <p className="text-[10px] text-muted-foreground">E.F. Valle Central</p>
                        </div>

                        <div className="space-y-3">
                            {[
                                { label: "Sincronización", value: Math.round(syncProgress), unit: "%", color: "primary" },
                                { label: "CPU Exocortex", value: Math.round(cpuUsage), unit: "%", color: cpuUsage > 70 ? "amber" : "emerald" },
                                { label: "Uptime", value: "99.8", unit: "%", color: "emerald" },
                            ].map(stat => (
                                <div key={stat.label}>
                                    <div className="flex justify-between text-[11px] mb-1">
                                        <span className="text-muted-foreground">{stat.label}</span>
                                        <span className={cn("font-mono font-bold", {
                                            "text-primary": stat.color === "primary",
                                            "text-emerald-400": stat.color === "emerald",
                                            "text-amber-400": stat.color === "amber",
                                        })}>{stat.value}{stat.unit}</span>
                                    </div>
                                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                        <div
                                            className={cn("h-full rounded-full transition-all duration-700", {
                                                "bg-primary": stat.color === "primary",
                                                "bg-emerald-400": stat.color === "emerald",
                                                "bg-amber-400": stat.color === "amber",
                                            })}
                                            style={{ width: `${stat.value}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { label: "Conexiones", value: "247" },
                                { label: "Procesos", value: `${activeProcesses}` },
                                { label: "Seeds/día", value: "+84" },
                                { label: "Karma", value: "×2.4" },
                            ].map(stat => (
                                <div key={stat.label} className="bg-white/5 rounded-xl p-2.5 text-center border border-white/5">
                                    <div className="text-sm font-bold font-headline">{stat.value}</div>
                                    <div className="text-[10px] text-muted-foreground">{stat.label}</div>
                                </div>
                            ))}
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}

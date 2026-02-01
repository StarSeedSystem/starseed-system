"use client";

import React from "react";
import {
    BrainCircuit,
    MessageSquare,
    Folder,
    Plus,
    ArrowRight,
    Bot,
    Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export function NexusQuickAccessWidget() {
    const router = useRouter();

    return (
        <div className="flex flex-col h-full bg-gradient-to-br from-black/60 to-cyan-950/20 backdrop-blur-xl border border-cyan-500/10 rounded-xl overflow-hidden relative group">

            {/* Background Effects */}
            <div className="absolute top-0 right-0 p-12 bg-cyan-500/10 blur-[60px] rounded-full pointer-events-none" />

            {/* Header */}
            <div className="p-4 border-b border-cyan-500/10 flex items-center justify-between relative z-10">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-cyan-500/10 border border-cyan-500/20">
                        <BrainCircuit className="w-4 h-4 text-cyan-400" />
                    </div>
                    <span className="font-medium text-cyan-100 uppercase tracking-wide text-xs">Nexus AI</span>
                </div>
                <Badge variant="outline" className="text-[10px] bg-cyan-500/5 text-cyan-400 border-cyan-500/20">
                    Online
                </Badge>
            </div>

            {/* Content */}
            <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">

                    {/* Quick Action - New Chat */}
                    <button
                        onClick={() => router.push('/nexus')}
                        className="w-full p-3 rounded-lg border border-dashed border-cyan-500/30 bg-cyan-500/5 hover:bg-cyan-500/10 hover:border-cyan-500/50 transition-all group/btn flex items-center justify-center gap-2 text-cyan-300"
                    >
                        <Plus className="w-4 h-4 group-hover/btn:scale-110 transition-transform" />
                        <span className="text-xs font-medium uppercase tracking-wider">Nueva Conversación</span>
                    </button>

                    {/* Recent Threads */}
                    <div className="space-y-2">
                        <h4 className="text-[10px] uppercase text-cyan-500/50 font-semibold tracking-wider px-1">Recientes</h4>

                        <div className="space-y-1">
                            {[
                                { title: "Análisis Constitución", agent: "Arquitecto", time: "2h", icon: <Bot className="w-3 h-3" /> },
                                { title: "Plan Ciudadela", agent: "Estratega", time: "1d", icon: <BrainCircuit className="w-3 h-3" /> },
                                { title: "Consultas Legales", agent: "Consejero", time: "3d", icon: <Sparkles className="w-3 h-3" /> },
                            ].map((item, i) => (
                                <button
                                    key={i}
                                    onClick={() => router.push('/nexus')}
                                    className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-white/5 transition-colors group/item text-left"
                                >
                                    <div className="w-7 h-7 rounded-full bg-cyan-900/30 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                                        {item.icon}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs text-cyan-100 font-medium truncate group-hover/item:text-cyan-300 transition-colors">
                                            {item.title}
                                        </div>
                                        <div className="text-[10px] text-cyan-500/50 flex items-center gap-1.5">
                                            <span>{item.agent}</span>
                                            <span className="w-0.5 h-0.5 rounded-full bg-cyan-500/50" />
                                            <span>{item.time}</span>
                                        </div>
                                    </div>
                                    <ArrowRight className="w-3 h-3 text-cyan-500/20 group-hover/item:text-cyan-400 transition-colors opacity-0 group-hover/item:opacity-100" />
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Workspaces Link */}
                    <div className="pt-2">
                        <button
                            onClick={() => router.push('/nexus')}
                            className="w-full flex items-center justify-between p-3 rounded-lg bg-black/20 border border-cyan-500/10 hover:border-cyan-500/30 transition-all group/ws"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                                    <Folder className="w-4 h-4" />
                                </div>
                                <div className="flex flex-col text-left">
                                    <span className="text-xs font-semibold text-cyan-100 group-hover/ws:text-cyan-300 transition-colors">Espacios de Trabajo</span>
                                    <span className="text-[10px] text-cyan-500/50">3 Carpetas • 12 Chats</span>
                                </div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-cyan-500/40 group-hover/ws:text-cyan-200 group-hover/ws:translate-x-0.5 transition-all" />
                        </button>
                    </div>

                </div>
            </ScrollArea>
        </div>
    );
}

"use client";

/**
 * ── ConnectionStoryPopover — Historia de una conexión ────────────────────────
 * Popover con la micro-línea de tiempo del vínculo (inicio, naturaleza, sistema,
 * hitos derivados). Datos reales del grafo; honesto cuando no hay fecha.
 */

import React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { History } from "lucide-react";
import { buildStory } from "@/lib/hub-social/stories";
import type { GraphNode } from "@/lib/hub-social/graph";

export function ConnectionStoryPopover({ node, mine }: { node: GraphNode; mine: GraphNode[] }) {
    const [open, setOpen] = React.useState(false);
    const milestones = React.useMemo(() => (open ? buildStory(node, mine) : []), [open, node, mine]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label={`Historia de tu vínculo con ${node.name}`}
                    title="Historia de la conexión"
                    className="inline-flex min-h-[2.75rem] min-w-[2.75rem] cursor-pointer items-center justify-center rounded-lg border border-white/12 bg-white/[0.04] text-muted-foreground transition-colors duration-200 hover:border-white/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:min-h-[2.25rem] sm:min-w-[2.25rem]"
                >
                    <History className="h-4 w-4" />
                </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 border-white/12 bg-background/95 p-0 backdrop-blur-xl">
                <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border" style={{ background: `${node.accent}18`, borderColor: `${node.accent}33`, color: node.accent }}>
                        <History className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-foreground">{node.name}</p>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Historia del vínculo</p>
                    </div>
                </div>
                <div className="max-h-80 overflow-y-auto p-4">
                    <ol className="relative space-y-3.5 pl-1">
                        {/* Línea vertical */}
                        <span className="absolute bottom-1 left-[9px] top-1 w-px bg-white/10" aria-hidden />
                        {milestones.map((m) => (
                            <li key={m.id} className="relative flex gap-3">
                                <span
                                    className="relative z-10 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border bg-background"
                                    style={{ borderColor: `${m.tone}66`, color: m.tone }}
                                >
                                    <m.icon className="h-2.5 w-2.5" />
                                </span>
                                <div className="min-w-0 -mt-0.5">
                                    <p className="text-[12px] font-semibold leading-snug text-foreground/90">{m.title}</p>
                                    {m.detail && <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{m.detail}</p>}
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>
            </PopoverContent>
        </Popover>
    );
}

export default ConnectionStoryPopover;

import React from "react";
import { cn } from "@/lib/utils";
import { CanvasState, ElementFamily } from "./state-types";

interface FamilyWrapperProps {
    id: ElementFamily | string;
    label: string;
    selected: boolean;
    onSelect: () => void;
    children: React.ReactNode;
    palette: CanvasState["palette"];
    className?: string;
}

export function FamilyWrapper({
    id, label, selected, onSelect, children, palette, className
}: FamilyWrapperProps) {
    return (
        <div
            id={`family-wrapper-${id}`}
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
            className={cn(
                "relative rounded-2xl p-4 transition-all cursor-pointer group border",
                selected
                    ? "ring-2 ring-cyan-400/60 border-cyan-400/30 bg-cyan-400/5"
                    : "border-white/5 hover:border-white/15 hover:bg-white/[0.02]",
                className
            )}
        >
            <div className="flex items-center justify-between mb-3">
                <span className={cn(
                    "text-[10px] uppercase tracking-widest font-medium",
                    selected ? "text-cyan-400" : "text-white/30 group-hover:text-white/50"
                )}>
                    {label}
                </span>
                {selected && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400">
                        Editando
                    </span>
                )}
            </div>
            {children}
        </div>
    );
}

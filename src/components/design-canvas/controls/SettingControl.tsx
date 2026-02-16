"use client";

import React from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

export interface SettingControlProps {
    id: string; // The highlight ID
    label: string;
    description?: string;
    onHighlight?: (id: string | null) => void;
    children?: React.ReactNode;
    className?: string;
    headerAction?: React.ReactNode; // Optional extra action next to label (like a toggle)
}

export function SettingControl({
    id,
    label,
    description,
    onHighlight,
    children,
    className,
    headerAction
}: SettingControlProps) {

    const handleMouseEnter = () => {
        if (onHighlight) onHighlight(id);
    };

    const handleMouseLeave = () => {
        if (onHighlight) onHighlight(null);
    };

    return (
        <div
            className={cn("group/setting space-y-2", className)}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-xs text-white/50 group-hover/setting:text-white/80 transition-colors">
                        {label}
                    </span>
                    {description && (
                        <TooltipProvider delayDuration={300}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Info className="w-3 h-3 text-white/20 hover:text-cyan-400 cursor-help transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent
                                    side="right"
                                    className="bg-black/80 backdrop-blur-xl border border-white/10 text-white text-xs max-w-[200px]"
                                >
                                    <p>{description}</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                </div>
                {headerAction}
            </div>

            {/* Control Body */}
            <div>
                {children}
            </div>
        </div>
    );
}

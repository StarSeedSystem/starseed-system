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
// Variaciones públicas (Ola 1019V · W, contrato §2): el panel del lienzo lleva
// su clave `ajuste:<id>` en el DOM (atributo `data-ss-elemento` vía ConClave)
// para el clic derecho global; el id se normaliza a kebab-case y, si no es
// canónico, el panel se pinta igual sin clave (degrada en silencio).
import { ConClave } from "@/components/variaciones/con-clave";
import { claveDeAjuste } from "@/lib/variaciones/claves-ajustes";

export interface SettingControlProps {
    id: string; // The highlight ID
    label: React.ReactNode;
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

    const clavePanel = claveDeAjuste(id);

    return (
        <ConClave
            clave={clavePanel}
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
        </ConClave>
    );
}

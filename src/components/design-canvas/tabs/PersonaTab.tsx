import React from "react";
import { CanvasState } from "../state-types";
import { StitchCard } from "@/components/stitch/StitchCard";
import { cn } from "@/lib/utils";
import { LayoutDashboard, PenTool, Globe, Monitor } from "lucide-react";

interface Props {
    activePersona: string;
    onSelectPersona: (persona: "analyst" | "creative" | "strategic" | "standard") => void;
    state: CanvasState;
}

export function PersonaTab({ activePersona, onSelectPersona, state }: Props) {

    return (
        <div className="p-6 h-full overflow-y-auto custom-scrollbar">
            <div className="max-w-4xl mx-auto space-y-8">

                <div>
                    <h2 className="text-lg font-bold mb-2">Agent User Personas</h2>
                    <p className="text-sm opacity-60 mb-6 font-light">
                        Select a specialized interface layout tailored to specific cognitive modes.
                        Theme settings will apply to these layouts.
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <PersonaOption
                        id="standard"
                        label="Standard / Universal"
                        description="Balanced layout for general navigation and simple tasks."
                        icon={<Monitor className="w-6 h-6" />}
                        active={activePersona === "standard"}
                        onClick={() => onSelectPersona("standard")}
                        state={state}
                    />

                    <PersonaOption
                        id="analyst"
                        label="The Analyst"
                        description="Data-dense grid layout optimized for monitoring, metrics, and logs."
                        icon={<LayoutDashboard className="w-6 h-6" />}
                        active={activePersona === "analyst"}
                        onClick={() => onSelectPersona("analyst")}
                        state={state}
                    />

                    <PersonaOption
                        id="creative"
                        label="The Creator"
                        description="Canvas-centric workspace with floating tools. Focused on generation."
                        icon={<PenTool className="w-6 h-6" />}
                        active={activePersona === "creative"}
                        onClick={() => onSelectPersona("creative")}
                        state={state}
                    />

                    <PersonaOption
                        id="strategic"
                        label="The Strategist"
                        description="Macro-view map interface for high-level operations and monitoring."
                        icon={<Globe className="w-6 h-6" />}
                        active={activePersona === "strategic"}
                        onClick={() => onSelectPersona("strategic")}
                        state={state}
                    />
                </div>
            </div>
        </div>
    );
}

function PersonaOption({ id, label, description, icon, active, onClick, state }: any) {
    const { palette, geometry, effects } = state;

    return (
        <button
            onClick={onClick}
            className={cn(
                "relative text-left w-full p-6 transition-all duration-300 group overflow-hidden border",
                active ? "bg-white/5 border-primary/50" : "bg-black/20 border-white/5 hover:border-white/10 hover:bg-white/5"
            )}
            style={{
                borderRadius: geometry.radiusMd + 'px',
                borderColor: active ? palette.primary : undefined,
                boxShadow: active ? `0 0 20px ${palette.primary}20` : 'none'
            }}
        >
            <div className="flex items-start gap-4 relative z-10">
                <div
                    className={cn(
                        "p-3 rounded-lg transition-colors",
                        active ? "text-white" : "text-white/50 group-hover:text-white/80"
                    )}
                    style={{
                        background: active ? palette.primary : 'rgba(255,255,255,0.05)',
                        borderRadius: geometry.radiusSm + 'px'
                    }}
                >
                    {icon}
                </div>
                <div>
                    <h3 className={cn("font-bold mb-1 transition-colors", active ? "text-white" : "text-white/80")}>
                        {label}
                    </h3>
                    <p className="text-xs opacity-50 leading-relaxed">
                        {description}
                    </p>
                </div>
            </div>

            {/* Background Glow */}
            {active && (
                <div className="absolute inset-0 z-0 opacity-10 pointer-events-none"
                    style={{
                        background: `linear-gradient(45deg, ${palette.primary}, transparent)`
                    }}
                />
            )}
        </button>
    );
}

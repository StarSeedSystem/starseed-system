import React from "react";
import { CanvasState, ElementFamily } from "../design-canvas/DesignIntegrationCanvas";
import { cn } from "@/lib/utils";
import { StitchDock } from "../stitch/StitchDock";
import { StitchCard } from "../stitch/StitchCard";
import { FamilyWrapper } from "../design-canvas/FamilyWrapper";
import { StitchButton } from "../stitch/StitchButton";
import { Palette, Layers, Type, MousePointer2 } from "lucide-react";

interface Props {
    state: CanvasState;
    selectedElement: ElementFamily;
    onSelectElement: (family: ElementFamily) => void;
    children?: React.ReactNode;
}

export function CreativeLayout({ state, selectedElement, onSelectElement }: Props) {
    const { palette, typography, iconography } = state;
    const theme = iconography.activeCollection === "stitch-organic" ? "organic" : "liquid";

    return (
        <div className="w-full h-full p-6 relative overflow-hidden flex flex-col"
            style={{
                fontFamily: typography.fontMain,
                color: palette.textPrimary
            }}>

            {/* Feature: Top Bar (Secondary Elements & Typography) */}
            <div className="flex justify-between items-start mb-4 z-20">
                <FamilyWrapper id="secondary" label="Mode" selected={selectedElement === "secondary"} onSelect={() => onSelectElement("secondary")} palette={palette} className="py-2 px-4 rounded-full">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]" />
                        <span className="text-xs font-medium tracking-wide">CREATIVE FLOW</span>
                    </div>
                </FamilyWrapper>

                <FamilyWrapper id="typography" label="Text Styles" selected={selectedElement === "typography"} onSelect={() => onSelectElement("typography")} palette={palette} className="py-2 px-4">
                    <div className="flex gap-4 text-xs opacity-70">
                        <span className="hover:text-white cursor-pointer transition-colors">Helvetica</span>
                        <span className="hover:text-white cursor-pointer transition-colors">12pt</span>
                        <span className="hover:text-white cursor-pointer transition-colors">Bold</span>
                    </div>
                </FamilyWrapper>
            </div>

            {/* Central Canvas Area (Layout / Geometry) */}
            <FamilyWrapper id="geometry" label="Canvas Geometry" selected={selectedElement === "geometry"} onSelect={() => onSelectElement("geometry")} palette={palette} className="flex-1 relative rounded-3xl overflow-hidden flex items-center justify-center border-0 ring-0 bg-transparent">
                <div className="absolute inset-0 border border-white/5 bg-white/5 backdrop-blur-sm rounded-3xl" />
                <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none" />

                <StitchCard theme={theme} className="w-96 h-80 flex items-center justify-center relative shadow-2xl">
                    <div className="absolute top-4 left-4 flex gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500/50" />
                        <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                        <div className="w-3 h-3 rounded-full bg-green-500/50" />
                    </div>
                    <span className="opacity-30 text-2xl font-light tracking-widest">ARTBOARD 01</span>
                </StitchCard>
            </FamilyWrapper>

            {/* Bottom Dock (Navigation) */}
            <div className="mt-6 flex justify-center z-20">
                <FamilyWrapper id="navigation" label="Tools" selected={selectedElement === "navigation"} onSelect={() => onSelectElement("navigation")} palette={palette} className="rounded-full px-8 border-0">
                    <StitchDock theme={theme} className="shadow-2xl" />
                </FamilyWrapper>
            </div>

            {/* Floating Tool Palette (Buttons) */}
            <div className="absolute left-6 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-20">
                <FamilyWrapper id="buttons" label="Toolbar" selected={selectedElement === "buttons"} onSelect={() => onSelectElement("buttons")} palette={palette} className="p-2 w-14 flex flex-col items-center gap-2">
                    {[
                        { icon: MousePointer2, active: true },
                        { icon: Layers, active: false },
                        { icon: Palette, active: false },
                        { icon: Type, active: false }
                    ].map((item, i) => (
                        <StitchButton key={i} theme={theme} variant={item.active ? "primary" : "ghost"} size="icon" className="w-8 h-8 rounded-lg">
                            <item.icon className="w-4 h-4" />
                        </StitchButton>
                    ))}
                    <div className="h-px w-full bg-white/10 my-1" />
                    <div className="w-6 h-6 rounded-full border border-white/20" style={{ background: palette.primary }} />
                    <div className="w-6 h-6 rounded-full border border-white/20" style={{ background: palette.secondary }} />
                </FamilyWrapper>
            </div>

            {/* Right Panel (Inputs / Settings) */}
            <div className="absolute right-6 top-20 bottom-32 w-64 flex flex-col gap-2 z-20 pointer-events-none">
                {/* Only show this implicitly via "Inputs" selection area, or make it interactive */}
                <FamilyWrapper id="inputs" label="Properties" selected={selectedElement === "inputs"} onSelect={() => onSelectElement("inputs")} palette={palette} className="h-full pointer-events-auto bg-black/40 backdrop-blur-md border-l border-white/5">
                    <div className="space-y-4 p-2">
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase opacity-50">Opacity</label>
                            <input type="range" className="w-full h-1 bg-white/20 rounded-full" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase opacity-50">Blend Mode</label>
                            <div className="w-full p-2 bg-white/5 rounded text-xs border border-white/10">Normal</div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase opacity-50">Fill</label>
                            <div className="flex gap-2">
                                <div className="flex-1 h-8 rounded bg-white/5 border border-white/10 flex items-center px-2 text-xs">#FFFFFF</div>
                                <div className="w-8 h-8 rounded bg-white border border-white/10" />
                            </div>
                        </div>
                    </div>
                </FamilyWrapper>
            </div>
        </div>
    );
}

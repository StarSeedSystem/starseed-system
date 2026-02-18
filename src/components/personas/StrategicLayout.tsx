import React from "react";
import { CanvasState, ElementFamily } from "../design-canvas/DesignIntegrationCanvas";
import { cn } from "@/lib/utils";
import { StitchCard } from "../stitch/StitchCard";
import { StitchGraph } from "../stitch/StitchGraph";
import { FamilyWrapper } from "../design-canvas/FamilyWrapper";
import { StitchButton } from "../stitch/StitchButton";
import { StitchDock } from "../stitch/StitchDock";

interface Props {
    state: CanvasState;
    selectedElement: ElementFamily;
    onSelectElement: (family: ElementFamily) => void;
    children?: React.ReactNode;
}

export function StrategicLayout({ state, selectedElement, onSelectElement }: Props) {
    const { palette, typography, iconography } = state;
    const theme = iconography.activeCollection === "stitch-organic" ? "organic" : "liquid";

    return (
        <div className="w-full h-full p-8 grid grid-cols-2 gap-8 relative overflow-y-auto custom-scrollbar"
            style={{
                fontFamily: typography.fontMain,
                color: palette.textPrimary
            }}>

            {/* Left Column: Mission Overview */}
            <div className="flex flex-col gap-6">
                <div>
                    <FamilyWrapper id="typography" label="Headlines" selected={selectedElement === "typography"} onSelect={() => onSelectElement("typography")} palette={palette} className="border-0 p-0 hover:bg-transparent">
                        <h2 className="text-2xl font-light mb-1">Strategic Overview</h2>
                        <p className="text-xs opacity-50 uppercase tracking-widest">Global Operations</p>
                    </FamilyWrapper>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <FamilyWrapper id="widgets" label="Key Metrics" selected={selectedElement === "widgets"} onSelect={() => onSelectElement("widgets")} palette={palette} className="col-span-2 grid grid-cols-2 gap-4 border-0 p-0 hover:bg-transparent hover:border-transparent ring-0">
                        <StitchCard theme={theme} className="p-4">
                            <div className="text-xs opacity-50">Total Reach</div>
                            <div className="text-2xl font-bold mt-1 text-cyan-400">1.2M</div>
                        </StitchCard>
                        <StitchCard theme={theme} className="p-4">
                            <div className="text-xs opacity-50">Conversion</div>
                            <div className="text-2xl font-bold mt-1 text-purple-400">3.4%</div>
                        </StitchCard>
                    </FamilyWrapper>
                </div>

                <FamilyWrapper id="data" label="Regional Data" selected={selectedElement === "data" as any} onSelect={() => onSelectElement("data" as any)} palette={palette} className="flex-1 min-h-[250px]">
                    <StitchCard theme={theme} className="h-full p-4 flex flex-col relative overflow-hidden border-0 shadow-none bg-transparent">
                        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-cyan-500 via-transparent to-transparent pointer-events-none" />
                        <h3 className="text-sm font-medium mb-4 relative z-10">Regional Performance</h3>
                        <div className="flex-1 w-full">
                            <StitchGraph theme={theme} height={200} showGrid={false} />
                        </div>
                    </StitchCard>
                </FamilyWrapper>
            </div>

            {/* Right Column: Roadmap & Actions */}
            <div className="flex flex-col gap-6">
                <FamilyWrapper id="effects" label="Roadmap Visualization" selected={selectedElement === "effects"} onSelect={() => onSelectElement("effects")} palette={palette} className="flex-1">
                    <StitchCard theme={theme} className="h-full p-6 border-0 shadow-none bg-transparent">
                        <h3 className="text-sm font-medium mb-6">Mission Roadmap</h3>

                        <div className="space-y-6 relative">
                            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-white/10" />

                            {[
                                { title: "Phase 1: Initialization", status: "completed" },
                                { title: "Phase 2: Expansion", status: "active" },
                                { title: "Phase 3: Consolidation", status: "pending" },
                            ].map((phase, i) => (
                                <div key={i} className="flex items-start gap-4 relative z-10">
                                    <div className={cn(
                                        "w-4 h-4 rounded-full border-2 flex-none bg-black transition-all duration-500",
                                        phase.status === "completed" ? "border-emerald-500 bg-emerald-500/20" :
                                            phase.status === "active" ? "border-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.5)] animate-pulse" :
                                                "border-white/20"
                                    )} />
                                    <div>
                                        <div className={cn(
                                            "text-sm font-medium",
                                            phase.status === "active" ? "text-white" : "text-white/50"
                                        )}>{phase.title}</div>
                                        <div className="text-xs opacity-40 mt-1">
                                            {phase.status === "active" ? "Currently executing core protocols." : "Pending activation."}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </StitchCard>
                </FamilyWrapper>

                <FamilyWrapper id="buttons" label="Command Actions" selected={selectedElement === "buttons"} onSelect={() => onSelectElement("buttons")} palette={palette}>
                    <div className="h-32 grid grid-cols-2 gap-4">
                        <StitchButton theme={theme} variant="glass" className="h-full flex flex-col items-center justify-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400">+</div>
                            <span className="text-xs">New Campaign</span>
                        </StitchButton>
                        <StitchButton theme={theme} variant="glass" className="h-full flex flex-col items-center justify-center gap-2">
                            <span className="text-xl">📄</span>
                            <span className="text-xs">View Reports</span>
                        </StitchButton>
                    </div>
                </FamilyWrapper>

                {/* Compact Dock for Strategy */}
                <FamilyWrapper id="navigation" label="Global Nav" selected={selectedElement === "navigation"} onSelect={() => onSelectElement("navigation")} palette={palette} className="py-2">
                    <StitchDock theme={theme} className="w-full justify-between" />
                </FamilyWrapper>
            </div>
        </div>
    );
}

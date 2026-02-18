import React from "react";
import { CanvasState, ElementFamily } from "../design-canvas/DesignIntegrationCanvas";
import { cn } from "@/lib/utils";
import { StitchGraph } from "../stitch/StitchGraph";
import { StitchDataGrid } from "../stitch/StitchDataGrid";
import { StitchCard } from "../stitch/StitchCard";
import { FamilyWrapper } from "../design-canvas/FamilyWrapper";
import { StitchButton } from "../stitch/StitchButton";
import { StitchDock } from "../stitch/StitchDock";

interface Props {
    state: CanvasState;
    selectedElement: ElementFamily;
    onSelectElement: (family: ElementFamily) => void;
    children?: React.ReactNode;
}

const mockColumns = [
    { id: "id", label: "ID", width: "15%" },
    { id: "status", label: "Status", width: "20%" },
    { id: "metric", label: "Metric", width: "40%" },
    { id: "value", label: "Value", width: "25%", align: "right" as const },
];

const mockData = [
    { id: "NODE-01", status: "Active", metric: "Throughput", value: "98.2%" },
    { id: "NODE-02", status: "Pending", metric: "Latency", value: "45ms" },
    { id: "NODE-03", status: "Active", metric: "Uptime", value: "99.9%" },
    { id: "NODE-04", status: "Offline", metric: "Error Rate", value: "0.0%" },
];

export function AnalystLayout({ state, selectedElement, onSelectElement }: Props) {
    const { palette, typography, iconography } = state;
    const theme = iconography.activeCollection === "stitch-organic" ? "organic" : "liquid";

    return (
        <div className="w-full h-full p-4 grid grid-cols-12 grid-rows-[auto_1fr] gap-4 relative overflow-y-auto custom-scrollbar"
            style={{
                fontFamily: typography.fontMain,
                color: palette.textPrimary
            }}>

            {/* Header: KPIs (Widgets) */}
            <div className="col-span-12">
                <FamilyWrapper id="widgets" label="System Widgets" selected={selectedElement === "widgets"} onSelect={() => onSelectElement("widgets")} palette={palette}>
                    <div className="grid grid-cols-4 gap-4">
                        <StitchCard theme={theme} className="flex flex-col justify-center items-center py-4">
                            <span className="text-xs uppercase opacity-70">Active Nodes</span>
                            <span className="text-3xl font-bold" style={{ color: palette.primary }}>2,451</span>
                        </StitchCard>
                        <StitchCard theme={theme} className="flex flex-col justify-center items-center py-4">
                            <span className="text-xs uppercase opacity-70">Network Load</span>
                            <span className="text-3xl font-bold" style={{ color: palette.secondary }}>87%</span>
                        </StitchCard>
                        <StitchCard theme={theme} className="flex flex-col justify-center items-center py-4">
                            <span className="text-xs uppercase opacity-70">Transactions</span>
                            <span className="text-3xl font-bold" style={{ color: palette.accent }}>14.2k</span>
                        </StitchCard>
                        <StitchCard theme={theme} className="col-span-1 flex flex-col justify-center items-center border-dashed border-white/20 py-4">
                            <span className="text-xs opacity-50">System Panel</span>
                            <div className="mt-2 w-full h-2 bg-white/10 rounded-full overflow-hidden px-4">
                                <div className="h-full bg-emerald-500 w-3/4 rounded-full" />
                            </div>
                        </StitchCard>
                    </div>
                </FamilyWrapper>
            </div>

            {/* Main Grid: Data & Charts */}
            <div className="col-span-12 lg:col-span-9 grid grid-cols-1 gap-4 h-full min-h-0">
                <FamilyWrapper id="data" label="Data Grid & Visualization" selected={selectedElement === "data" as any} onSelect={() => onSelectElement("data" as any)} palette={palette} className="h-full">
                    <div className="flex flex-col gap-4 h-full">
                        <StitchDataGrid theme={theme} columns={mockColumns} data={mockData} className="flex-1 min-h-[200px]" />
                        <div className="grid grid-cols-2 gap-4 h-48">
                            <StitchGraph theme={theme} height={180} />
                            <StitchGraph theme={theme} height={180} colorOverride={palette.secondary} />
                        </div>
                    </div>
                </FamilyWrapper>
            </div>

            {/* Right Sidebar: Controls */}
            <div className="col-span-12 lg:col-span-3 flex flex-col gap-4">
                <FamilyWrapper id="buttons" label="Control Actions" selected={selectedElement === "buttons"} onSelect={() => onSelectElement("buttons")} palette={palette}>
                    <div className="flex flex-col gap-2">
                        <StitchButton theme={theme} variant="primary" size="sm" className="w-full">
                            Run Diagnostics
                        </StitchButton>
                        <StitchButton theme={theme} variant="secondary" size="sm" className="w-full">
                            Export Logs
                        </StitchButton>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            <StitchButton theme={theme} variant="ghost" size="sm" className="text-xs">
                                Reset
                            </StitchButton>
                            <StitchButton theme={theme} variant="ghost" size="sm" className="text-xs text-red-400 hover:text-red-300">
                                Purge
                            </StitchButton>
                        </div>
                    </div>
                </FamilyWrapper>

                <FamilyWrapper id="inputs" label="System Parameters" selected={selectedElement === "inputs"} onSelect={() => onSelectElement("inputs")} palette={palette}>
                    <div className="space-y-3 p-1">
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase opacity-50">Threshold</label>
                            <input type="range" className="w-full accent-cyan-500 h-1 bg-white/10 rounded-full appearance-none" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase opacity-50">Filter Query</label>
                            <div className="h-8 bg-black/20 border border-white/10 rounded-md flex items-center px-2 text-xs text-white/50">
                                SELECT * FROM nodes...
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-xs">Auto-refresh</span>
                            <div className="w-8 h-4 bg-emerald-500/20 rounded-full relative border border-emerald-500/50">
                                <div className="absolute right-0.5 top-0.5 w-3 h-3 bg-emerald-400 rounded-full shadow-sm" />
                            </div>
                        </div>
                    </div>
                </FamilyWrapper>

                <FamilyWrapper id="navigation" label="Nav Dock" selected={selectedElement === "navigation"} onSelect={() => onSelectElement("navigation")} palette={palette}>
                    <div className="flex justify-center py-2">
                        <StitchDock theme={theme} className="scale-75 origin-center" />
                    </div>
                </FamilyWrapper>
            </div>
        </div>
    );
}

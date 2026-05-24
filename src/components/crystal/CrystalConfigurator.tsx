import React from "react";
import { Sliders, Eye, Droplet, Activity, Square, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CrystalConfig {
    displacementScale: number;
    blurAmount: number;
    saturation: number;
    aberrationIntensity: number;
    elasticity: number;
    cornerRadius: number;
    mode: "standard" | "polar" | "prominent" | "shader";
    overLight: boolean;
}

export const DEFAULT_CRYSTAL_CONFIG: CrystalConfig = {
    displacementScale: 100,
    blurAmount: 0.5,
    saturation: 140,
    aberrationIntensity: 2.0,
    elasticity: 0.2,
    cornerRadius: 48,
    mode: "standard",
    overLight: false,
};

interface CrystalConfiguratorProps {
    config: CrystalConfig;
    onChange: (newConfig: CrystalConfig) => void;
    className?: string;
}

export function CrystalConfigurator({ config, onChange, className }: CrystalConfiguratorProps) {

    const handleChange = (key: keyof CrystalConfig, value: any) => {
        onChange({ ...config, [key]: value });
    };

    return (
        <div className={cn("bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl p-6 text-white w-full max-w-sm overflow-y-auto scrollbar-thin scrollbar-thumb-white/20", className)}>
            <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-4">
                <Sliders className="w-5 h-5 text-electric-azure" />
                <h2 className="text-sm font-bold uppercase tracking-widest">Crystal Tuner</h2>
            </div>

            <div className="space-y-6">

                {/* Mode Selection */}
                <div className="space-y-3">
                    <label className="text-xs font-bold text-white/50 uppercase flex items-center gap-2">
                        <Eye className="w-3 h-3" /> Refraction Mode
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                        {["standard", "polar", "prominent", "shader"].map((m) => (
                            <button
                                key={m}
                                onClick={() => handleChange("mode", m)}
                                className={cn(
                                    "px-3 py-2 text-xs rounded-lg border transition-all text-left capitalize",
                                    config.mode === m
                                        ? "bg-electric-azure/20 border-electric-azure text-electric-azure shadow-[0_0_10px_rgba(0,127,255,0.2)]"
                                        : "bg-white/5 border-transparent text-white/40 hover:bg-white/10"
                                )}
                            >
                                {m}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Displacement */}
                <div className="space-y-3">
                    <div className="flex justify-between">
                        <label className="text-xs font-bold text-white/50 uppercase flex items-center gap-2">
                            <Activity className="w-3 h-3" /> Displacement
                        </label>
                        <span className="text-xs font-mono text-electric-azure">{config.displacementScale}</span>
                    </div>
                    <input
                        type="range" min="0" max="200"
                        value={config.displacementScale}
                        onChange={(e) => handleChange("displacementScale", Number(e.target.value))}
                        className="w-full accent-electric-azure h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
                    />
                </div>

                {/* Blur */}
                <div className="space-y-3">
                    <div className="flex justify-between">
                        <label className="text-xs font-bold text-white/50 uppercase flex items-center gap-2">
                            <Droplet className="w-3 h-3" /> Blur Amount
                        </label>
                        <span className="text-xs font-mono text-emerald-green">{config.blurAmount.toFixed(2)}</span>
                    </div>
                    <input
                        type="range" min="0" max="2" step="0.05"
                        value={config.blurAmount}
                        onChange={(e) => handleChange("blurAmount", Number(e.target.value))}
                        className="w-full accent-emerald-green h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
                    />
                </div>

                {/* Saturation */}
                <div className="space-y-3">
                    <div className="flex justify-between">
                        <label className="text-xs font-bold text-white/50 uppercase flex items-center gap-2">
                            <Zap className="w-3 h-3" /> Saturation
                        </label>
                        <span className="text-xs font-mono text-solar-amber">{config.saturation}%</span>
                    </div>
                    <input
                        type="range" min="0" max="300" step="10"
                        value={config.saturation}
                        onChange={(e) => handleChange("saturation", Number(e.target.value))}
                        className="w-full accent-solar-amber h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
                    />
                </div>

                {/* Elasticity */}
                <div className="space-y-3">
                    <div className="flex justify-between">
                        <label className="text-xs font-bold text-white/50 uppercase flex items-center gap-2">
                            <Activity className="w-3 h-3" /> Elasticity
                        </label>
                        <span className="text-xs font-mono text-pink-400">{config.elasticity.toFixed(2)}</span>
                    </div>
                    <input
                        type="range" min="0" max="1" step="0.05"
                        value={config.elasticity}
                        onChange={(e) => handleChange("elasticity", Number(e.target.value))}
                        className="w-full accent-pink-400 h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
                    />
                </div>

                {/* Corner Radius */}
                <div className="space-y-3">
                    <div className="flex justify-between">
                        <label className="text-xs font-bold text-white/50 uppercase flex items-center gap-2">
                            <Square className="w-3 h-3" /> Radius
                        </label>
                        <span className="text-xs font-mono text-white/70">{config.cornerRadius}px</span>
                    </div>
                    <input
                        type="range" min="0" max="100"
                        value={config.cornerRadius}
                        onChange={(e) => handleChange("cornerRadius", Number(e.target.value))}
                        className="w-full accent-white h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
                    />
                </div>

                {/* Toggles */}
                <div className="pt-4 border-t border-white/10">
                    <label className="flex items-center justify-between cursor-pointer group">
                        <span className="text-xs font-bold text-white/50 uppercase group-hover:text-white transition-colors">Over Light Background</span>
                        <input
                            type="checkbox"
                            checked={config.overLight}
                            onChange={(e) => handleChange("overLight", e.target.checked)}
                            className="w-4 h-4 rounded border-white/20 bg-white/5 checked:bg-electric-azure"
                        />
                    </label>
                </div>

            </div>
        </div>
    );
}

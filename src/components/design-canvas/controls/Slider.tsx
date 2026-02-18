"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { SettingControl } from "./SettingControl";

export interface SliderProps {
    label: string;
    description?: string;
    id?: string;
    value: number;
    min: number;
    max: number;
    step: number;
    unit?: string;
    onChange: (v: number) => void;
    color?: string;
    onHighlight?: (id: string | null) => void;
}

export function Slider({ label, description, id, value, min, max, step, unit, onChange, color = "amber", onHighlight }: SliderProps) {
    return (
        <SettingControl id={id || label} label={label} description={description} onHighlight={onHighlight}
            headerAction={<span className="text-white/70 font-mono text-[11px]">{value ?? 0}{unit}</span>}
        >
            <input type="range" min={min} max={max} step={step} value={value ?? 0} onChange={e => onChange(+e.target.value)}
                className={cn("w-full h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer",
                    `accent-${color}-500`,
                    "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white/20",
                    color === "amber" && "[&::-webkit-slider-thumb]:bg-amber-400",
                    color === "cyan" && "[&::-webkit-slider-thumb]:bg-cyan-400",
                    color === "purple" && "[&::-webkit-slider-thumb]:bg-purple-400",
                    color === "rose" && "[&::-webkit-slider-thumb]:bg-rose-400",
                    color === "emerald" && "[&::-webkit-slider-thumb]:bg-emerald-400",
                    color === "blue" && "[&::-webkit-slider-thumb]:bg-blue-400",
                    color === "pink" && "[&::-webkit-slider-thumb]:bg-pink-400",
                    color === "fuchsia" && "[&::-webkit-slider-thumb]:bg-fuchsia-400",
                    color === "indigo" && "[&::-webkit-slider-thumb]:bg-indigo-400",
                    color === "teal" && "[&::-webkit-slider-thumb]:bg-teal-400",
                )}
            />
        </SettingControl>
    );
}

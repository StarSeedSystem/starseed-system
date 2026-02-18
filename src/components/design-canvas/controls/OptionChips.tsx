"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { SettingControl } from "./SettingControl";

interface OptionChipsProps<T extends string> {
    options: ({ id: T; label: string } | { value: T; label: string })[];
    value: T;
    onChange: (v: T) => void;
    color?: "amber" | "cyan" | "purple" | "rose" | "emerald";
    label?: string;
    description?: string;
    id?: string;
    onHighlight?: (id: string | null) => void;
}

export function OptionChips<T extends string>({
    options,
    value,
    onChange,
    color = "amber",
    label,
    description,
    id,
    onHighlight,
}: OptionChipsProps<T>) {
    const colorMap: Record<string, string> = {
        amber: "bg-amber-500/15 border-amber-500/30 text-amber-300",
        cyan: "bg-cyan-500/15 border-cyan-500/30 text-cyan-300",
        purple: "bg-purple-500/15 border-purple-500/30 text-purple-300",
        rose: "bg-rose-500/15 border-rose-500/30 text-rose-300",
        emerald: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
    };

    const content = (
        <div className="flex flex-wrap gap-2">
            {options.map((o) => {
                const optionKey = 'id' in o ? o.id : o.value;
                return (
                    <button
                        key={optionKey}
                        onClick={() => onChange(optionKey)}
                        className={cn(
                            "px-3 py-1.5 rounded-lg text-xs transition-all border",
                            value === optionKey
                                ? colorMap[color]
                                : "bg-white/5 border-white/5 text-white/60 hover:bg-white/8"
                        )}
                    >
                        {o.label}
                    </button>
                );
            })}
        </div>
    );

    if (label) {
        return (
            <SettingControl id={id || label} label={label} description={description} onHighlight={onHighlight}>
                {content}
            </SettingControl>
        );
    }

    return content;
}

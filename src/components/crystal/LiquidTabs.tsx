import React, { useState, useRef, useEffect } from "react";
import { LiquidGlassWrapper } from "@/components/ui/LiquidGlassWrapper";
import { cn } from "@/lib/utils";

interface LiquidTabsProps {
    tabs: { id: string; label: string }[];
    activeTab: string;
    onChange: (id: string) => void;
    className?: string;
}

/**
 * LiquidTabs
 * A navigation component where the active indicator is a liquid bubble 
 * that physically morphs appropriately to the new position.
 */
export function LiquidTabs({ tabs, activeTab, onChange, className }: LiquidTabsProps) {
    const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
    const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);

    useEffect(() => {
        const activeIndex = tabs.findIndex(t => t.id === activeTab);
        const activeElement = tabsRef.current[activeIndex];

        if (activeElement) {
            setIndicatorStyle({
                left: activeElement.offsetLeft,
                width: activeElement.offsetWidth
            });
        }
    }, [activeTab, tabs]);

    return (
        <div className={cn("relative flex items-center gap-2 p-2 rounded-full bg-white/5 backdrop-blur-md border border-white/10", className)}>
            {/* Liquid Indicator */}
            <div
                className="absolute top-2 bottom-2 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]"
                style={{
                    left: indicatorStyle.left,
                    width: indicatorStyle.width
                }}
            >
                <LiquidGlassWrapper
                    displacementScale={40}
                    blurAmount={0.2}
                    saturation={120}
                    aberrationIntensity={1.5}
                    cornerRadius={99}
                    elasticity={0.4}
                    className="w-full h-full bg-electric-azure/20 shadow-[0_0_15px_rgba(0,127,255,0.3)] border border-electric-azure/30"
                >
                    {/* Empty container, the glass effect is the indicator */}
                    <div className="w-full h-full" />
                </LiquidGlassWrapper>
            </div>

            {/* Tab Buttons */}
            {tabs.map((tab, index) => (
                <button
                    key={tab.id}
                    ref={el => { tabsRef.current[index] = el; }}
                    onClick={() => onChange(tab.id)}
                    className={cn(
                        "relative z-10 flex-1 px-4 py-2 text-sm font-medium transition-colors duration-300 rounded-full",
                        activeTab === tab.id ? "text-white" : "text-white/40 hover:text-white/70"
                    )}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );
}

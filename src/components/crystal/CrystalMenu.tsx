import React from "react";
import { LiquidGlassWrapper } from "@/components/ui/LiquidGlassWrapper";
import { CrystalConfig } from "./CrystalConfigurator";
import { cn } from "@/lib/utils";

interface CrystalMenuProps extends React.HTMLAttributes<HTMLDivElement> {
    config: CrystalConfig;
    items: { icon: React.ReactNode; label?: string; onClick?: () => void; active?: boolean }[];
}

export function CrystalMenu({
    config,
    items,
    className,
    ...props
}: CrystalMenuProps) {

    // Enforce high rounding for pill shape regardless of config, unless config is higher?
    // User asked for "Bordes más Redondeados", so we prioritize the config but ensure it looks like a pill if reasonable.
    // Actually, let's respect the config fully so they can tune it.

    return (
        <div className={cn("inline-flex", className)} {...props}>
            <LiquidGlassWrapper
                displacementScale={config.displacementScale}
                blurAmount={config.blurAmount}
                saturation={config.saturation}
                aberrationIntensity={config.aberrationIntensity}
                elasticity={config.elasticity + 0.1} // Slightly more elastic for menus
                cornerRadius={Math.max(config.cornerRadius, 24)} // Ensure at least some rounding for menu
                mode={config.mode}
                overLight={config.overLight}
                className="shadow-lg border border-white/10"
            >
                <div className="flex items-center gap-1 p-2 bg-white/5">
                    {items.map((item, idx) => (
                        <button
                            key={idx}
                            onClick={item.onClick}
                            className={cn(
                                "relative group flex items-center gap-2 px-3 py-2 rounded-full transition-all duration-300",
                                item.active
                                    ? "bg-white/10 text-white shadow-inner"
                                    : "text-white/50 hover:text-white hover:bg-white/5"
                            )}
                        >
                            <div className={cn("transition-transform duration-300", item.active && "scale-110 text-electric-azure")}>
                                {item.icon}
                            </div>
                            {item.label && (
                                <span className={cn("text-xs font-medium", item.active ? "opacity-100" : "opacity-0 w-0 overflow-hidden group-hover:opacity-100 group-hover:w-auto transition-all")}>
                                    {item.label}
                                </span>
                            )}

                            {/* Active Indicator */}
                            {item.active && (
                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-electric-azure rounded-full shadow-[0_0_4px_#007FFF]"></div>
                            )}
                        </button>
                    ))}
                </div>
            </LiquidGlassWrapper>
        </div>
    );
}

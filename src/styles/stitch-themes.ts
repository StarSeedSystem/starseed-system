export type StitchTheme = "lucide" | "custom" | "ai-generated" | "stitch-liquid" | "stitch-organic";

export interface StitchDesignTokens {
    background: string;
    border: string;
    shadow: string;
    textGlow: string;
    accentColor: string;
    dock: {
        background: string;
        border: string;
        itemHover: string;
    };
    card: {
        background: string;
        border: string;
        backdropBlur: string;
    };
    fontFamily: string;
    animations: {
        idle: string;
        hover: string;
        active: string;
    };
}

export const STITCH_THEMES: Record<string, StitchDesignTokens> = {
    "stitch-liquid": {
        background: "bg-slate-900",
        border: "border-cyan-500/30",
        shadow: "shadow-[0_0_30px_rgba(6,182,212,0.15)]",
        textGlow: "drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]",
        accentColor: "#06b6d4", // cyan-500
        dock: {
            background: "linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, rgba(6, 182, 212, 0.05) 100%)",
            border: "1px solid rgba(34, 211, 238, 0.2)",
            itemHover: "bg-cyan-500/20",
        },
        card: {
            background: "linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0%, rgba(6, 182, 212, 0.02) 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            backdropBlur: "blur(12px)",
        },
        fontFamily: "'Rajdhani', sans-serif",
        animations: {
            idle: "animate-[pulse_4s_ease-in-out_infinite]",
            hover: "hover:shadow-[0_0_20px_rgba(6,182,212,0.5)] hover:scale-[1.02] transition-all duration-300",
            active: "animate-[pulse_1s_ease-in-out_infinite]"
        }
    },
    "stitch-organic": {
        background: "bg-emerald-950",
        border: "border-emerald-500/30",
        shadow: "shadow-[0_0_30px_rgba(16,185,129,0.15)]",
        textGlow: "drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]",
        accentColor: "#10b981", // emerald-500
        dock: {
            background: "linear-gradient(180deg, rgba(16, 185, 129, 0.05) 0%, rgba(6, 78, 59, 0.2) 100%)",
            border: "1px solid rgba(52, 211, 153, 0.2)",
            itemHover: "bg-emerald-500/20",
        },
        card: {
            background: "linear-gradient(135deg, rgba(6, 78, 59, 0.1) 0%, rgba(16, 185, 129, 0.05) 100%)",
            border: "1px solid rgba(52, 211, 153, 0.15)",
            backdropBlur: "blur(8px)",
        },
        fontFamily: "'Quicksand', sans-serif",
        animations: {
            idle: "animate-[pulse_6s_ease-in-out_infinite]",
            hover: "hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:-translate-y-1 transition-all duration-500 ease-out",
            active: "animate-[bounce_1s_infinite]"
        }
    }
};

export const getStitchTheme = (collection: string): StitchDesignTokens | null => {
    return STITCH_THEMES[collection] || null;
};

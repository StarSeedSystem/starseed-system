import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence, HTMLMotionProps } from "framer-motion";

interface StitchInputProps extends Omit<HTMLMotionProps<"input">, "ref"> {
    theme?: "default" | "glass" | "liquid" | "neon" | "brutal";
    label?: string;
    floatingLabel?: boolean;
    styleConfig?: {
        cornerRadius?: number;
        primaryColor?: string;
        secondaryColor?: string;
        borderWidth?: number;
        fontFamily?: string;
        blur?: number;
        glowIntensity?: number;
        focusRingColor?: string;
    };
    icon?: React.ReactNode;
}

export function StitchInput({
    className,
    theme = "glass",
    label,
    floatingLabel = true,
    styleConfig = {},
    icon,
    onFocus,
    onBlur,
    ...props
}: StitchInputProps) {
    const [isFocused, setIsFocused] = useState(false);
    const [hasValue, setHasValue] = useState(false);

    const {
        cornerRadius = 12,
        primaryColor = "#8B5CF6",
        secondaryColor = "#A78BFA",
        borderWidth = 1,
        fontFamily,
        blur = 12,
        glowIntensity = 0.8,
        focusRingColor
    } = styleConfig;

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        setIsFocused(true);
        onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        setIsFocused(false);
        setHasValue(e.target.value.length > 0);
        onBlur?.(e);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setHasValue(e.target.value.length > 0);
        props.onChange?.(e);
    };

    const getThemeStyles = () => {
        switch (theme) {
            case "liquid":
                return {
                    container: "bg-white/5",
                    border: isFocused ? `rgba(255,255,255,0.4)` : `rgba(255,255,255,0.1)`,
                    glow: isFocused ? `0 0 ${20 * glowIntensity}px ${primaryColor}44` : "none",
                    backdrop: `blur(${blur}px)`
                };
            case "neon":
                return {
                    container: "bg-transparent",
                    border: isFocused ? primaryColor : "rgba(255,255,255,0.2)",
                    glow: isFocused ? `0 0 ${15 * glowIntensity}px ${primaryColor}66` : "none",
                    backdrop: "none"
                };
            case "brutal":
                return {
                    container: "bg-white text-black",
                    border: "#000000",
                    glow: isFocused ? `4px 4px 0px #000000` : "2px 2px 0px #000000",
                    backdrop: "none",
                    cornerRadius: 0
                };
            case "default":
                return {
                    container: "bg-white text-black",
                    border: isFocused ? primaryColor : "#e2e8f0",
                    glow: "none",
                    backdrop: "none"
                };
            case "glass":
            default:
                return {
                    container: "bg-white/3",
                    border: isFocused ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.1)",
                    glow: isFocused ? "0 0 15px rgba(255,255,255,0.1)" : "none",
                    backdrop: `blur(${blur}px)`
                };
        }
    };

    const styles = getThemeStyles();
    const isLabelFloating = floatingLabel && (isFocused || hasValue || !!props.placeholder);

    return (
        <div className="flex flex-col w-full group" style={{ fontFamily }}>
            {!floatingLabel && label && (
                <span className="text-[10px] uppercase tracking-wider font-bold mb-1.5 ml-1 opacity-50">
                    {label}
                </span>
            )}

            <div className="relative">
                {/* Floating Label */}
                {floatingLabel && label && (
                    <motion.label
                        initial={false}
                        animate={{
                            y: isLabelFloating ? -26 : 0,
                            x: isLabelFloating ? -4 : 0,
                            scale: isLabelFloating ? 0.85 : 1,
                            color: isFocused ? primaryColor : (isLabelFloating ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.3)")
                        }}
                        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                        className={cn(
                            "absolute left-4 top-[10px] pointer-events-none z-10 text-sm origin-left select-none uppercase tracking-wider font-medium",
                            theme === "brutal" && !isFocused && !hasValue && "text-black/40",
                            theme === "default" && !isFocused && !hasValue && "text-slate-400"
                        )}
                    >
                        {label}
                    </motion.label>
                )}

                <div
                    className={cn(
                        "relative flex items-center transition-all duration-300",
                        theme === "liquid" && "overflow-hidden"
                    )}
                    style={{
                        borderRadius: theme === "brutal" ? "0px" : `${cornerRadius}px`,
                        backgroundColor: styles.container.includes('bg-') ? undefined : styles.container,
                        border: `${borderWidth}px solid ${styles.border}`,
                        boxShadow: styles.glow,
                        backdropFilter: styles.backdrop
                    }}
                >
                    {/* Liquid Effect Background */}
                    {theme === "liquid" && (
                        <motion.div
                            className="absolute inset-0 opacity-20 pointer-events-none"
                            animate={{
                                background: [
                                    `radial-gradient(circle at 0% 0%, ${primaryColor}22 0%, transparent 50%)`,
                                    `radial-gradient(circle at 100% 100%, ${primaryColor}22 0%, transparent 50%)`,
                                    `radial-gradient(circle at 0% 0%, ${primaryColor}22 0%, transparent 50%)`,
                                ]
                            }}
                            transition={{ duration: 10, repeat: Infinity }}
                        />
                    )}

                    {icon && (
                        <div className={cn(
                            "pl-4 py-3 opacity-40 group-focus-within:opacity-100 transition-opacity",
                            theme === "brutal" && "text-black",
                            theme === "default" && "text-slate-400"
                        )}>
                            {icon}
                        </div>
                    )}

                    <motion.input
                        className={cn(
                            "w-full bg-transparent outline-none border-none py-3 px-4 text-sm font-medium",
                            theme === "brutal" ? "text-black placeholder:text-black/30" :
                                theme === "default" ? "text-slate-900 placeholder:text-slate-300" :
                                    "text-white placeholder:text-white/20",
                            icon && "pl-2"
                        )}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        onChange={handleChange}
                        {...props}
                    />
                </div>

                {/* Focus Line for Glass/Liquid */}
                {(theme === "glass" || theme === "liquid") && (
                    <motion.div
                        className="absolute bottom-0 left-4 right-4 h-[2px] rounded-full pointer-events-none origin-center"
                        initial={{ scaleX: 0, opacity: 0 }}
                        animate={{
                            scaleX: isFocused ? 1 : 0,
                            opacity: isFocused ? 1 : 0,
                            backgroundColor: focusRingColor || primaryColor,
                            boxShadow: `0 0 10px ${focusRingColor || primaryColor}`
                        }}
                        transition={{ duration: 0.3 }}
                    />
                )}
            </div>
        </div>
    );
}

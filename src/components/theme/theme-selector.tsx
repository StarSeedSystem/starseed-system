"use client";

import React, { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Diamond, Leaf, Circle, Palette, Download, Upload } from "lucide-react";
import { GlassFilter } from "./glass-filter";
import { exportTheme, importTheme, applyTheme, loadCustomTheme } from "./theme-utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// Types
interface GlassEffectProps {
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
    onClick?: () => void;
}

interface ThemeOption {
    id: string;
    icon: React.ReactNode;
    label: string;
}

// Glass Effect Wrapper Component
const GlassEffect: React.FC<GlassEffectProps> = ({
    children,
    className = "",
    style = {},
    onClick,
}) => {
    const glassStyle = {
        boxShadow: "0 6px 6px rgba(0, 0, 0, 0.2), 0 0 20px rgba(0, 0, 0, 0.1)",
        transitionTimingFunction: "cubic-bezier(0.175, 0.885, 0.32, 2.2)",
        ...style,
    };

    return (
        <div
            className={`relative flex font-semibold overflow-hidden text-foreground cursor-pointer transition-all duration-700 ${className}`}
            style={glassStyle}
            onClick={onClick}
        >
            {/* Glass Layers */}
            <div
                className="absolute inset-0 z-0 overflow-hidden rounded-inherit"
                style={{
                    backdropFilter: "blur(3px)",
                    filter: "url(#glass-distortion)",
                    isolation: "isolate",
                }}
            />
            <div
                className="absolute inset-0 z-10 rounded-inherit"
                style={{ background: "rgba(255, 255, 255, 0.1)" }}
            />
            <div
                className="absolute inset-0 z-20 rounded-inherit overflow-hidden"
                style={{
                    boxShadow:
                        "inset 2px 2px 1px 0 rgba(255, 255, 255, 0.2), inset -1px -1px 1px 1px rgba(255, 255, 255, 0.2)",
                }}
            />

            {/* Content */}
            <div className="relative z-30">{children}</div>
        </div>
    );
};

export function ThemeSelector() {
    const { setTheme, theme } = useTheme();
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        // Load custom theme if it exists, but only apply if current theme is custom
        // or just ensure variables are available if we switch to it.
        loadCustomTheme();
    }, []);

    // Re-apply custom theme variables when switching to 'custom' to ensure they are active
    useEffect(() => {
        if (theme === 'custom') {
            loadCustomTheme();
        }
    }, [theme]);

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const themeData = await importTheme(file);
            applyTheme(themeData);
            setTheme("custom");
            toast.success("Tema importado y aplicado correctamente");
        } catch (error) {
            console.error(error);
            toast.error("Error al importar el tema");
        }
        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleExportClick = () => {
        try {
            exportTheme();
            toast.success("Tema exportado correctamente");
        } catch (error) {
            console.error(error);
            toast.error("Error al exportar el tema");
        }
    };

    const themes: ThemeOption[] = [
        { id: "light", label: "Modo Claro", icon: <Sun className="w-6 h-6" /> },
        { id: "dark", label: "Modo Oscuro", icon: <Moon className="w-6 h-6" /> },
        { id: "grey", label: "Modo Gris", icon: <Circle className="w-6 h-6 text-gray-400" /> },
        { id: "natural", label: "Modo Natural", icon: <Leaf className="w-6 h-6 text-green-500" /> },
        { id: "glass", label: "Modo Cristal", icon: <Diamond className="w-6 h-6 text-cyan-400" /> },
        { id: "custom", label: "Personalizado", icon: <Palette className="w-6 h-6 text-purple-500" /> },
    ];

    return (
        <div className="flex flex-col items-center justify-center p-4 gap-6">
            {/* Ensure filter is present in the DOM */}
            <GlassFilter />

            {/* Theme Icons Dock */}
            <div className="flex items-center justify-center gap-4 flex-wrap">
                {themes.map((t) => {
                    // Avoid hydration mismatch by only showing active state after mount
                    // However, that might flicker. 
                    // Better approach: Use a specific 'mounted' check or just accept that 'theme' is undefined on server.
                    // If 'theme' is undefined on server, 'theme === t.id' is false. 
                    // If on client it's 'dark', then it's true. This causes the mismatch.
                    // We must return the same output on server and first client render, OR force client-only rendering for this part.

                    // We'll use the 'mounted' pattern from useTheme docs usually, or just a local mounted state.
                    const [mounted, setMounted] = React.useState(false);
                    React.useEffect(() => setMounted(true), []);

                    if (!mounted) {
                        // Render a neutral state or skeleton to avoid mismatch, 
                        // OR just render the buttons without the active state initially.
                        // But if we render them without active state, and then client adds it, React handles it as an update, not a mismatch?
                        // Incorrect. React expects the HTML to match exactly.
                        // So we should return null or a skeleton until mounted if we depend on 'theme'.
                        // But returning null for the whole selector is jarring.
                        // Let's just suppress the mismatch on the specific props if possible, or render standard without active styles until mounted.
                        return (
                            <GlassEffect
                                key={t.id}
                                className="rounded-full p-4 hover:scale-110"
                                style={{ background: 'transparent' }}
                            >
                                <div className="flex flex-col items-center justify-center gap-2">
                                    {t.icon}
                                    <span className="text-[10px] hidden md:block">{t.label}</span>
                                </div>
                            </GlassEffect>
                        )
                    }

                    return (
                        <GlassEffect
                            key={t.id}
                            onClick={() => setTheme(t.id)}
                            className={`rounded-full p-4 hover:scale-110 ${theme === t.id ? 'scale-110 border border-primary/50' : ''}`}
                            style={{
                                background: theme === t.id ? 'rgba(255,255,255,0.2)' : 'transparent'
                            }}
                        >
                            <div className="flex flex-col items-center justify-center gap-2">
                                {t.icon}
                                <span className="text-[10px] hidden md:block">{t.label}</span>
                            </div>
                        </GlassEffect>
                    );
                })}
            </div>

            {/* Actions for Export/Import */}
            <div className="flex gap-4">
                <Button variant="outline" size="sm" onClick={handleExportClick} className="gap-2">
                    <Download className="w-4 h-4" />
                    Exportar Tema
                </Button>
                <div className="relative">
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept=".json"
                        className="hidden"
                    />
                    <Button variant="outline" size="sm" onClick={handleImportClick} className="gap-2">
                        <Upload className="w-4 h-4" />
                        Importar Tema
                    </Button>
                </div>
            </div>
        </div>
    );
}

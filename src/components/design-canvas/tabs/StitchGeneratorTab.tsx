"use client";

import React, { useState, useEffect } from "react";
import { Wand2, Loader2, Copy, Check, Play, Smartphone, Monitor, Tablet, Sparkles, Palette, Code, Save, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { generateMockTheme } from "@/lib/stitch-theme-parser";
import type { CanvasState } from "../state-types";
import { useAppearance } from "@/context/appearance-context";
import { mapCanvasToAppearance, applyCanvasPalette } from "../canvas-to-appearance";

interface StitchGeneratorTabProps {
    state: CanvasState;
    dispatch: React.Dispatch<any>;
}

const QUICK_PROMPTS = [
    { label: "Dashboard Cósmico", prompt: "A cosmic dashboard with glass cards, neon metrics, and floating elements on a deep space background", type: "component" },
    { label: "Panel de Control", prompt: "A futuristic control panel with liquid glass sliders, toggle switches, and holographic readouts", type: "component" },
    { label: "Login Cuántico", prompt: "An ethereal login form with crystalline glass input fields, floating particles, and quantum wave animations", type: "component" },
    { label: "Tema Neón", prompt: "Cyberpunk neon theme with dark background, glowing borders, and vibrant pink/cyan accents", type: "theme" },
    { label: "Tema Natural", prompt: "Organic nature theme with soft greens, curved shapes, and wood textures", type: "theme" },
    { label: "Glassmorphism Puro", prompt: "Clean glassmorphism theme with high blur, white transparency, and subtle shadows", type: "theme" },
];

export function StitchGeneratorTab({ state, dispatch }: StitchGeneratorTabProps) {
    const [prompt, setPrompt] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [deviceType, setDeviceType] = useState<"DESKTOP" | "MOBILE" | "TABLET">("DESKTOP");
    const [generationMode, setGenerationMode] = useState<"code" | "theme">("code");
    const [generatedCode, setGeneratedCode] = useState(state.stitchCode || "");
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Theme Persistence State
    const [savedThemes, setSavedThemes] = useState<any[]>([]);
    const { updateConfig, saveTheme: saveGlobalTheme } = useAppearance();

    // Load saved themes on mount
    useEffect(() => {
        const loadThemes = () => {
            try {
                const saved = JSON.parse(localStorage.getItem("starseed-saved-themes") || "[]");
                setSavedThemes(saved);
            } catch (e) {
                console.error("Failed to load themes", e);
            }
        };
        loadThemes();
        // Listen for storage events to sync across tabs/updates
        window.addEventListener('storage', loadThemes);
        return () => window.removeEventListener('storage', loadThemes);
    }, []);

    const handleSaveTheme = () => {
        const themeName = prompt.trim() || `Theme ${new Date().toLocaleTimeString()}`;
        const mapped = mapCanvasToAppearance(state);

        const newTheme = {
            id: `theme_${Date.now()}`,
            name: themeName,
            date: new Date().toISOString(),
            canvasState: state,
            appearanceConfig: mapped,
        };

        const updatedThemes = [...savedThemes, newTheme];
        localStorage.setItem("starseed-saved-themes", JSON.stringify(updatedThemes));
        setSavedThemes(updatedThemes);

        // Also save to global appearance context for redundancy
        saveGlobalTheme(themeName);

        setSuccessMessage(`Theme "${themeName}" saved successfully.`);
        setTimeout(() => setSuccessMessage(null), 3000);
    };

    const handleLoadTheme = (theme: any) => {
        if (!theme.canvasState) return;

        // Load into Canvas Loop
        dispatch({ type: "LOAD_STATE", payload: theme.canvasState });

        // Apply immediately to global CSS
        applyCanvasPalette(theme.canvasState);
        if (theme.appearanceConfig) {
            updateConfig(theme.appearanceConfig);
        }

        setSuccessMessage(`Theme "${theme.name}" loaded.`);
        setTimeout(() => setSuccessMessage(null), 3000);
    };

    const handleDeleteTheme = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const updated = savedThemes.filter(t => t.id !== id);
        localStorage.setItem("starseed-saved-themes", JSON.stringify(updated));
        setSavedThemes(updated);
    };

    const [isFallback, setIsFallback] = useState(false);

    const handleGenerate = async () => {
        if (!prompt.trim()) return;
        setIsGenerating(true);
        setError(null);
        setSuccessMessage(null);
        setIsFallback(false);

        // ─── THEME GENERATION MODE ──────────────────────────────────────────
        if (generationMode === "theme") {
            // Artificial delay to simulate thinking
            await new Promise(resolve => setTimeout(resolve, 1500));

            try {
                const generatedTheme: any = generateMockTheme(prompt);

                // Merge generated theme into current state
                const newState: CanvasState = {
                    ...state,
                    // Merge Nested Objects Carefully
                    palette: generatedTheme.colors ? {
                        ...state.palette,
                        primary: generatedTheme.colors.primary,
                        secondary: generatedTheme.colors.secondary,
                        accent: generatedTheme.colors.accent,
                        background: generatedTheme.colors.background,
                        surface: generatedTheme.colors.surface,
                    } : state.palette,
                    typography: generatedTheme.typography ? {
                        ...state.typography,
                        ...generatedTheme.typography
                    } : state.typography,
                    iconography: generatedTheme.iconography ? {
                        ...state.iconography,
                        ...generatedTheme.iconography
                    } : state.iconography,
                    positioning: generatedTheme.positioning ? {
                        ...state.positioning,
                        ...generatedTheme.positioning
                    } : state.positioning,
                    widgets: generatedTheme.widgets ? {
                        ...state.widgets,
                        ...generatedTheme.widgets
                    } : state.widgets,
                    backgrounds: generatedTheme.backgrounds ? {
                        ...state.backgrounds,
                        ...generatedTheme.backgrounds
                    } : state.backgrounds,
                    secondary: generatedTheme.secondary ? {
                        ...state.secondary,
                        ...generatedTheme.secondary
                    } : state.secondary,
                };

                dispatch({ type: "LOAD_STATE", payload: newState });
                applyCanvasPalette(newState); // Apply immediately for visual feedback
                setSuccessMessage("Theme generated and applied to global environment.");
            } catch (err: any) {
                setError("Failed to generate theme: " + err.message);
            } finally {
                setIsGenerating(false);
            }
            return;
        }

        // ─── CODE GENERATION MODE ───────────────────────────────────────────
        setGeneratedCode("");

        try {
            const res = await fetch("/api/stitch-generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt,
                    deviceType,
                    modelId: "GEMINI_3_FLASH",
                }),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `Generation failed (${res.status})`);
            }

            const data = await res.json();
            const code = data.code || data.html || "// No code returned";

            setGeneratedCode(code);
            setIsFallback(!!data.fallback);

            dispatch({
                type: "SET_STITCH_CODE",
                payload: {
                    code,
                    screenId: data.screenId || "",
                },
            });
        } catch (err: any) {
            setError(err.message || "Failed to generate design");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(generatedCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center border border-cyan-500/20">
                        <Wand2 className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div>
                        <h3 className="text-base font-semibold text-white">Generador Stitch AI</h3>
                        <p className="text-xs text-white/60">Genera interfaces y temas con IA</p>
                    </div>
                </div>

                {/* Mode Toggle */}
                <div className="flex bg-white/5 rounded-lg p-1 border border-white/5">
                    <button
                        onClick={() => setGenerationMode("code")}
                        className={cn(
                            "px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-2",
                            generationMode === "code"
                                ? "bg-cyan-500/20 text-cyan-300 shadow-sm"
                                : "text-white/40 hover:text-white/60"
                        )}
                    >
                        <Code className="w-3.5 h-3.5" />
                        Componente
                    </button>
                    <button
                        onClick={() => setGenerationMode("theme")}
                        className={cn(
                            "px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-2",
                            generationMode === "theme"
                                ? "bg-purple-500/20 text-purple-300 shadow-sm"
                                : "text-white/40 hover:text-white/60"
                        )}
                    >
                        <Palette className="w-3.5 h-3.5" />
                        Tema Global
                    </button>
                </div>
            </div>

            {/* Quick Prompts */}
            <div>
                <label className="text-xs text-white/60 uppercase tracking-wider mb-2 block">Prompts Rápidos</label>
                <div className="flex flex-wrap gap-2">
                    {QUICK_PROMPTS
                        .filter(qp => (qp.type === generationMode) || !qp.type)
                        .map(qp => (
                            <button
                                key={qp.label}
                                onClick={() => setPrompt(qp.prompt)}
                                className={cn(
                                    "px-3 py-1.5 rounded-xl text-xs font-medium transition-all border",
                                    prompt === qp.prompt
                                        ? "bg-purple-500/20 border-purple-500/40 text-purple-300"
                                        : "bg-white/3 border-white/5 text-white/50 hover:bg-white/5 hover:text-white/70"
                                )}
                            >
                                <Sparkles className="w-3 h-3 inline mr-1 opacity-60" />
                                {qp.label}
                            </button>
                        ))}
                </div>
            </div>

            {/* Prompt Input */}
            <div className="space-y-3">
                <label className="text-xs text-white/60 uppercase tracking-wider">Describe tu {generationMode === "theme" ? "Tema" : "Componente"}</label>
                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={generationMode === "theme"
                        ? "Describe el ambiente, colores y estilo (e.g., 'Cyberpunk neon city with dark vibes')..."
                        : "Describe el componente UI que quieres generar..."
                    }
                    rows={4}
                    className="w-full bg-white/3 border border-white/8 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-purple-500/40 focus:border-purple-500/30 resize-none transition-all"
                />
            </div>
            {/* Device Toggle - Only show for component mode */}
            {generationMode === "code" && (
                <div className="flex bg-white/5 p-1 rounded-xl w-fit">
                    {[
                        { id: "DESKTOP", icon: Monitor, label: "Desktop" },
                        { id: "TABLET", icon: Tablet, label: "Tablet" },
                        { id: "MOBILE", icon: Smartphone, label: "Mobile" }
                    ].map((d) => (
                        <button
                            key={d.id}
                            onClick={() => setDeviceType(d.id as any)}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all",
                                deviceType === d.id
                                    ? "bg-cyan-500/20 text-cyan-300 shadow-inner"
                                    : "text-white/50 hover:text-white/60"
                            )}
                        >
                            <d.icon className="w-3.5 h-3.5" />
                            {d.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Generate Button */}
            {/* Generate Button */}
            <div className="flex gap-2">
                <Button
                    onClick={handleGenerate}
                    disabled={!prompt.trim() || isGenerating}
                    className="flex-1 h-12 rounded-2xl text-sm font-semibold bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 transition-all border-0 disabled:opacity-40"
                >
                    {isGenerating ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generando con Stitch AI...
                        </>
                    ) : (
                        <>
                            {generationMode === "theme" ? (
                                <>
                                    <Palette className="w-4 h-4 mr-2" /> Aplicar Tema Global
                                </>
                            ) : (
                                <>
                                    <Wand2 className="w-4 h-4 mr-2" /> Generar Componente
                                </>
                            )}
                        </>
                    )}
                </Button>

                {generationMode === "theme" && (
                    <Button
                        onClick={handleSaveTheme}
                        disabled={isGenerating}
                        className="h-12 w-12 rounded-2xl bg-white/5 hover:bg-white/10 text-white border border-white/10"
                        title="Guardar Tema Actual"
                    >
                        <Save className="w-5 h-5" />
                    </Button>
                )}
            </div>

            {/* Error */}
            {
                error && (
                    <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
                        {error}
                    </div>
                )
            }

            {
                successMessage && (
                    <div className="px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm flex items-center gap-2">
                        <Check className="w-4 h-4" />
                        {successMessage}
                    </div>
                )
            }

            {/* YOUR THEMES SECTION */}
            {
                generationMode === "theme" && savedThemes.length > 0 && (
                    <div className="space-y-3 pt-4 border-t border-white/5">
                        <label className="text-xs text-white/60 uppercase tracking-wider">Tus Temas Guardados</label>
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                            {savedThemes.slice().reverse().map((theme) => (
                                <div key={theme.id} className="group flex items-center justify-between p-3 rounded-xl bg-white/3 border border-white/5 hover:bg-white/5 transition-all">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-white/5 to-white/0 flex items-center justify-center border border-white/10">
                                            <div
                                                className="w-4 h-4 rounded-full"
                                                style={{ background: theme.appearanceConfig?.palette?.primary || theme.canvasState?.palette?.primary || '#8B5CF6' }}
                                            />
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className="text-sm font-medium text-white truncate">{theme.name}</h4>
                                            <p className="text-[10px] text-white/40 truncate">
                                                {new Date(theme.date).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-white/40 hover:text-white hover:bg-white/10"
                                            onClick={() => handleLoadTheme(theme)}
                                            title="Cargar Tema"
                                        >
                                            <Play className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-white/40 hover:text-red-400 hover:bg-red-500/10"
                                            onClick={(e) => handleDeleteTheme(theme.id, e)}
                                            title="Eliminar"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            }

            {/* Fallback Indicator */}
            {
                isFallback && generatedCode && (
                    <div className="px-4 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5" />
                        Generado con template local — Stitch MCP no disponible. El código es una plantilla de referencia.
                    </div>
                )
            }

            {/* Generated Code Output */}
            {
                generatedCode && generationMode === "code" && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs text-white/60 uppercase tracking-wider">Código Generado</label>
                            <div className="flex gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleCopy}
                                    className="text-white/60 hover:text-white/70 h-7 text-xs"
                                >
                                    {copied ? <Check className="w-3.5 h-3.5 mr-1 text-green-400" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                                    {copied ? "Copiado" : "Copiar"}
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-cyan-400/60 hover:text-cyan-300 h-7 text-xs"
                                    onClick={() => {
                                        dispatch({
                                            type: "SET_STITCH_CODE",
                                            payload: { code: generatedCode, screenId: "" }
                                        });
                                    }}
                                >
                                    <Play className="w-3.5 h-3.5 mr-1" /> Aplicar Preview
                                </Button>
                            </div>
                        </div>
                        <pre className="bg-black/40 border border-white/5 rounded-2xl p-4 text-xs text-emerald-300/80 font-mono overflow-auto max-h-72 whitespace-pre-wrap">
                            {generatedCode}
                        </pre>
                    </div>
                )
            }
        </div >
    );
}

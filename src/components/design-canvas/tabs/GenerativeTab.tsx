"use client";

import React, { useState } from "react";
import { Sparkles, History, Bot, Wand2, RefreshCw, LayoutTemplate, Palette, Type, Monitor, Tablet, Smartphone, Loader2, Copy, Check, Play, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasState } from "../state-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function ThemeLibrary({ dispatch }: { dispatch: React.Dispatch<any> }) {
    const [savedThemes, setSavedThemes] = React.useState<any[]>([]);
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
        const saved = JSON.parse(localStorage.getItem("starseed-saved-themes") || "[]");
        setSavedThemes(saved.reverse()); // Show newest first
    }, []);

    const handleDelete = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const updated = savedThemes.filter(t => t.id !== id);
        setSavedThemes(updated);
        localStorage.setItem("starseed-saved-themes", JSON.stringify(updated.reverse())); // Store in original order
    };

    const handleLoad = (theme: any) => {
        if (theme.canvasState) {
            dispatch({ type: "LOAD_STATE", payload: theme.canvasState });
        }
    };

    if (!mounted) return null;

    return (
        <div className="h-full flex flex-col">
            <ScrollArea className="h-[400px] w-full rounded-xl border border-white/5 bg-black/20 p-3">
                <div className="space-y-3">
                    {savedThemes.length > 0 ? (
                        savedThemes.map((theme) => (
                            <div
                                key={theme.id}
                                className="group relative p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition-all cursor-pointer"
                                onClick={() => handleLoad(theme)}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <div>
                                        <h4 className="text-xs font-medium text-white group-hover:text-purple-300 transition-colors">{theme.name}</h4>
                                        <span className="text-[10px] text-white/40">
                                            {new Date(theme.date).toLocaleDateString()} • {new Date(theme.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-white/20 hover:text-red-400 -mr-1"
                                        onClick={(e) => handleDelete(theme.id, e)}
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                </div>
                                <div className="flex gap-1 mt-2 opacity-50 text-[9px]">
                                    <span className="px-1.5 py-0.5 rounded bg-white/10 text-white/60">
                                        {(theme.canvasState?.palette?.primary || "#?").slice(0, 7)}
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded bg-white/10 text-white/60">
                                        {theme.canvasState?.typography?.fontMain || "Default"}
                                    </span>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="flex flex-col items-center justify-center p-8 text-white/20">
                            <History className="w-8 h-8 mb-3 opacity-30" />
                            <p className="text-xs text-center">No hay temas guardados</p>
                            <p className="text-[10px] text-center mt-1">Usa el botón "Integrar" o "Guardar" para añadir a la biblioteca.</p>
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}

interface Props { state: CanvasState; dispatch: React.Dispatch<any>; }

const QUICK_PROMPTS = [
    { label: "Dashboard Cósmico", prompt: "A cosmic dashboard with glass cards, neon metrics, and floating elements on a deep space background" },
    { label: "Panel de Control", prompt: "A futuristic control panel with liquid glass sliders, toggle switches, and holographic readouts" },
    { label: "Login Cuántico", prompt: "An ethereal login form with crystalline glass input fields, floating particles, and quantum wave animations" },
    { label: "Perfil Holográfico", prompt: "A holographic user profile card with glass morphism, gradient borders, and animated data readouts" },
];

export function GenerativeTab({ state, dispatch }: Props) {
    const { aiConfig } = state;
    const [isGenerating, setIsGenerating] = useState(false);
    const [deviceType, setDeviceType] = useState<"DESKTOP" | "MOBILE" | "TABLET">("DESKTOP");
    const [generatedCode, setGeneratedCode] = useState("");
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isFallback, setIsFallback] = useState(false);

    const update = (p: Partial<CanvasState["aiConfig"]>) => {
        dispatch({ type: "SET_AI_CONFIG", payload: p });
    };

    const handleGenerate = async (type: "theme" | "layout" | "component") => {
        if (!aiConfig.lastPrompt.trim()) return;
        setIsGenerating(true);
        setError(null);
        setGeneratedCode("");
        setIsFallback(false);

        // Update history optimistically (or after success)
        const newItemId = Date.now().toString();

        try {
            if (type === "theme") {
                // Simulate AI generation for Theme
                // In real implementation, this would call an MCP tool or API
                await new Promise(resolve => setTimeout(resolve, 1500)); // Fake network delay

                const { generateMockTheme } = await import("@/lib/stitch-theme-parser");
                const newTheme = generateMockTheme(aiConfig.lastPrompt);

                // Apply the theme to the canvas state
                dispatch({ type: "IMPORT_THEME", payload: newTheme });

                setGeneratedCode(JSON.stringify(newTheme, null, 2));
            } else {
                // For now, we only support component generation via the Stitch API endpoint
                // In the future, 'theme' and 'layout' could hit different endpoints
                const res = await fetch("/api/stitch-generate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        prompt: aiConfig.lastPrompt,
                        deviceType,
                        modelId: aiConfig.model === "gemini-ultra" ? "GEMINI_3_PRO" : "GEMINI_3_FLASH", // Map to internal model IDs
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
            }

            // Update history
            const newHistoryItem = {
                id: newItemId,
                prompt: aiConfig.lastPrompt,
                type: type,
                timestamp: Date.now()
            };
            update({
                generationHistory: [newHistoryItem, ...(aiConfig.generationHistory || [])]
            });

            // Automatically apply if it's a component
            if (type === "component") {
                dispatch({
                    type: "SET_STITCH_CODE",
                    payload: {
                        code: generatedCode, // Note: this might be empty if called async, but we set it above
                        screenId: "",
                    },
                });
            }

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
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-pink-500/20 to-rose-500/20 flex items-center justify-center border border-pink-500/20">
                    <Bot className="w-5 h-5 text-pink-400" />
                </div>
                <div>
                    <h3 className="text-base font-semibold text-white">Estudio Generativo StarSeed</h3>
                    <p className="text-xs text-white/60">Orquestación de diseño y componentes vía AI</p>
                </div>
            </div>

            {/* Config Section */}
            <Tabs defaultValue="generate" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-4 bg-white/5 p-1 border border-white/5">
                    <TabsTrigger value="generate" className="text-xs data-[state=active]:bg-pink-500/20 data-[state=active]:text-pink-300">
                        <Wand2 className="w-3.5 h-3.5 mr-2" /> Estudio AI
                    </TabsTrigger>
                    <TabsTrigger value="library" className="text-xs data-[state=active]:bg-indigo-500/20 data-[state=active]:text-indigo-300">
                        <History className="w-3.5 h-3.5 mr-2" /> Mis Temas
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="generate" className="space-y-6 mt-0">
                    <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                        <div className="flex items-center gap-4">
                            <div className="flex-1 space-y-2">
                                <div className="flex justify-between">
                                    <label className="text-[10px] text-white/50">Creatividad</label>
                                    <span className="text-[10px] text-white/70">{(aiConfig.creativityLevel || 0.7).toFixed(1)}</span>
                                </div>
                                <Slider
                                    value={[aiConfig.creativityLevel || 0.7]}
                                    min={0} max={1} step={0.1}
                                    onValueChange={([v]) => update({ creativityLevel: v })}
                                    className="[&_.relative]:bg-white/10 [&_.absolute]:bg-pink-500"
                                />
                            </div>
                            <div className="flex-1 space-y-2">
                                <label className="text-[10px] text-white/50 block">Modelo</label>
                                <Select value={aiConfig.model || "gemini-pro"} onValueChange={(v: any) => update({ model: v })}>
                                    <SelectTrigger className="w-full h-8 bg-white/5 border-white/10 text-xs text-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-white/10 text-white">
                                        <SelectItem value="gemini-pro">Gemini Pro Vision</SelectItem>
                                        <SelectItem value="gemini-ultra">Gemini Ultra 1.0</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>

                    {/* Prompt Section */}
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <label className="text-xs text-white/70">Prompt de Diseño</label>
                            <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/5">
                                {([
                                    { id: "DESKTOP" as const, icon: Monitor },
                                    { id: "TABLET" as const, icon: Tablet },
                                    { id: "MOBILE" as const, icon: Smartphone },
                                ]).map(d => (
                                    <button
                                        key={d.id}
                                        onClick={() => setDeviceType(d.id)}
                                        className={cn(
                                            "p-1.5 rounded-md transition-all",
                                            deviceType === d.id
                                                ? "bg-pink-500/30 text-pink-300"
                                                : "text-white/30 hover:text-white/60"
                                        )}
                                        title={d.id}
                                    >
                                        <d.icon className="w-3.5 h-3.5" />
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="relative">
                            <textarea
                                value={aiConfig.lastPrompt}
                                onChange={(e) => update({ lastPrompt: e.target.value })}
                                placeholder="Describe el componente UI o tema que quieres generar (ej. 'Cyberpunk glass login form')..."
                                rows={4}
                                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-xs text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-pink-500/40 focus:border-pink-500/30 resize-none transition-all"
                            />
                            <div className="absolute bottom-2 right-2 flex gap-2">
                                <Button
                                    size="sm"
                                    className="h-6 text-[10px] px-2 bg-white/5 hover:bg-white/10 text-white/60 border border-white/5"
                                    onClick={() => update({ lastPrompt: "Futuristic clean minimalist dashboard, white glass, blue accents" })}
                                >
                                    <Sparkles className="w-3 h-3 mr-1" /> Enhance
                                </Button>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {QUICK_PROMPTS.map(qp => (
                                <button
                                    key={qp.label}
                                    onClick={() => update({ lastPrompt: qp.prompt })}
                                    className="px-2 py-1 rounded-lg text-[10px] font-medium transition-all border bg-white/3 border-white/5 text-white/50 hover:bg-white/5 hover:text-white/70"
                                >
                                    {qp.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="grid grid-cols-2 gap-3">
                        <Button
                            onClick={() => handleGenerate("component")}
                            disabled={isGenerating || !aiConfig.lastPrompt}
                            className="h-12 flex items-center justify-center gap-2 bg-gradient-to-br from-pink-500/20 to-purple-500/20 border border-pink-500/30 hover:border-pink-500/50 hover:from-pink-500/30 transition-all group"
                        >
                            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin text-pink-400" /> : <Wand2 className="w-4 h-4 text-pink-400 group-hover:scale-110 transition-transform" />}
                            <span className="text-xs text-pink-100">Generar Componente</span>
                        </Button>

                        <Button
                            onClick={() => handleGenerate("theme")}
                            disabled={isGenerating || !aiConfig.lastPrompt}
                            variant="outline"
                            className="h-12 flex items-center justify-center gap-2 border-white/10 hover:bg-white/5"
                        >
                            <Palette className="w-4 h-4 text-indigo-400" />
                            <span className="text-xs text-indigo-100">Generar Tema</span>
                        </Button>
                    </div>

                    {/* Results */}
                    {error && (
                        <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
                            {error}
                        </div>
                    )}

                    {generatedCode && (
                        <div className="space-y-2 pt-4 border-t border-white/5">
                            <div className="flex items-center justify-between">
                                <label className="text-xs text-white/60 uppercase tracking-wider">Código Generado</label>
                                <div className="flex gap-2">
                                    <Button variant="ghost" size="sm" onClick={handleCopy} className="h-6 text-[10px] text-white/60">
                                        {copied ? <Check className="w-3 h-3 mr-1 text-green-400" /> : <Copy className="w-3 h-3 mr-1" />}
                                        {copied ? "Copiado" : "Copiar"}
                                    </Button>
                                </div>
                            </div>
                            <ScrollArea className="h-40 rounded-xl border border-white/5 bg-black/40 p-3">
                                <pre className="text-[10px] text-emerald-300/80 font-mono whitespace-pre-wrap">
                                    {generatedCode}
                                </pre>
                            </ScrollArea>
                            {isFallback && (
                                <p className="text-[10px] text-cyan-400/60 mt-1 flex items-center gap-1">
                                    <Sparkles className="w-3 h-3" /> Usando template local (Stitch offline)
                                </p>
                            )}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="library" className="space-y-4 mt-0">
                    <ThemeLibrary dispatch={dispatch} />
                </TabsContent>
            </Tabs>
        </div>
    );
}

"use client";

import React, { useState } from "react";
import { Wand2, Loader2, Copy, Check, Play, Smartphone, Monitor, Tablet, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CanvasState } from "../DesignIntegrationCanvas";

interface StitchGeneratorTabProps {
    state: CanvasState;
    dispatch: React.Dispatch<any>;
}

const QUICK_PROMPTS = [
    { label: "Dashboard Cósmico", prompt: "A cosmic dashboard with glass cards, neon metrics, and floating elements on a deep space background" },
    { label: "Panel de Control", prompt: "A futuristic control panel with liquid glass sliders, toggle switches, and holographic readouts" },
    { label: "Login Cuántico", prompt: "An ethereal login form with crystalline glass input fields, floating particles, and quantum wave animations" },
    { label: "Perfil Holográfico", prompt: "A holographic user profile card with glass morphism, gradient borders, and animated data readouts" },
    { label: "Chat Nebular", prompt: "A chat interface with glass message bubbles, neon accents, and nebula-themed colors" },
    { label: "Galería Prismática", prompt: "A prismatic image gallery with liquid glass overlays, rainbow refractions, and smooth hover transitions" },
];

export function StitchGeneratorTab({ state, dispatch }: StitchGeneratorTabProps) {
    const [prompt, setPrompt] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [deviceType, setDeviceType] = useState<"DESKTOP" | "MOBILE" | "TABLET">("DESKTOP");
    const [generatedCode, setGeneratedCode] = useState(state.stitchCode || "");
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // The DESIGN.md context enrichment prefix
    const CONTEXT_PREFIX = `Design System: StarSeed Network — Ontocratic Cyberdelic Transhumanist aesthetic.
Color Palette: Deep space (#0F0F23) background, violet (#8B5CF6) primary, cyan (#00D4FF) accent, amber (#FBBF24) highlight.
Visual Style: Liquid glass materials, backdrop-blur, chromatic aberration, holographic gradients, smooth micro-animations.
Typography: Thin/light headers (Rajdhani 300), regular body (Inter 400), monospace code (JetBrains Mono).
Layout: Perimeter Paradigm with floating panels, macOS-style dock, side curtains, and glass containers.
Components: Crystal-mode cards, liquid glass buttons with glow, neon input borders, floating labels.

Generate the following UI component with this aesthetic:
`;

    const [isFallback, setIsFallback] = useState(false);

    const handleGenerate = async () => {
        if (!prompt.trim()) return;
        setIsGenerating(true);
        setError(null);
        setGeneratedCode("");
        setIsFallback(false);

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
            <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center border border-cyan-500/20">
                    <Wand2 className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                    <h3 className="text-base font-semibold text-white">Generador Stitch AI</h3>
                    <p className="text-xs text-white/60">Describe tu diseño y genera componentos con la estética StarSeed</p>
                </div>
            </div>

            {/* Quick Prompts */}
            <div>
                <label className="text-xs text-white/60 uppercase tracking-wider mb-2 block">Prompts Rápidos</label>
                <div className="flex flex-wrap gap-2">
                    {QUICK_PROMPTS.map(qp => (
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
                <label className="text-xs text-white/60 uppercase tracking-wider">Describe tu Diseño</label>
                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe el componente UI que quieres generar con la estética ciberdélica..."
                    rows={4}
                    className="w-full bg-white/3 border border-white/8 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-purple-500/40 focus:border-purple-500/30 resize-none transition-all"
                />
            </div>

            {/* Device Type */}
            <div className="flex items-center gap-3">
                <label className="text-xs text-white/60 uppercase tracking-wider">Dispositivo</label>
                <div className="flex bg-white/5 rounded-xl p-1 border border-white/5">
                    {([
                        { id: "DESKTOP" as const, icon: Monitor, label: "Desktop" },
                        { id: "TABLET" as const, icon: Tablet, label: "Tablet" },
                        { id: "MOBILE" as const, icon: Smartphone, label: "Mobile" },
                    ]).map(d => (
                        <button
                            key={d.id}
                            onClick={() => setDeviceType(d.id)}
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
            </div>

            {/* Generate Button */}
            <Button
                onClick={handleGenerate}
                disabled={!prompt.trim() || isGenerating}
                className="w-full h-12 rounded-2xl text-sm font-semibold bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 transition-all border-0 disabled:opacity-40"
            >
                {isGenerating ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generando con Stitch AI...
                    </>
                ) : (
                    <>
                        <Wand2 className="w-4 h-4 mr-2" /> Generar Diseño
                    </>
                )}
            </Button>

            {/* Error */}
            {error && (
                <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
                    {error}
                </div>
            )}

            {/* Fallback Indicator */}
            {isFallback && generatedCode && (
                <div className="px-4 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5" />
                    Generado con template local — Stitch MCP no disponible. El código es una plantilla de referencia.
                </div>
            )}

            {/* Generated Code Output */}
            {generatedCode && (
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
            )}
        </div>
    );
}

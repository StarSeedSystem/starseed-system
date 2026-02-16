"use client";

import React, { useState } from "react";
import { X, Download, Copy, Check, FileJson, FileCode, Zap, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CanvasState } from "./state-types";
import { mapCanvasToAppearance, applyCanvasPalette } from "./canvas-to-appearance";

interface Props {
    state: CanvasState;
    onClose: () => void;
    onApplyToContext?: (mapped: Record<string, any>) => void;
    onSaveTheme?: (name: string, config: Record<string, any>) => void;
    onImport?: (loadedState: CanvasState) => void;
}

type ExportFormat = "json" | "css" | "apply" | "import";

function stateToJSON(state: CanvasState): string {
    const { stitchCode, stitchScreenId, ...exportable } = state;
    return JSON.stringify({
        $schema: "starseed-theme/v1",
        name: "Custom Canvas Theme",
        generated: new Date().toISOString(),
        ...exportable,
    }, null, 2);
}

function stateToCSS(state: CanvasState): string {
    const { palette, typography, effects, geometry } = state;
    return `:root {
  /* ── Palette ── */
  --color-primary: ${palette.primary};
  --color-secondary: ${palette.secondary};
  --color-accent: ${palette.accent};
  --color-background: ${palette.background};
  --color-surface: ${palette.surface};
  --color-text-primary: ${palette.textPrimary};
  --color-text-secondary: ${palette.textSecondary};
  --color-glass-border: ${palette.glassBorder};

  /* Trinity Axes */
  --trinity-zenith: ${palette.trinity.zenith.active};
  --trinity-horizonte: ${palette.trinity.horizonte.active};
  --trinity-logica: ${palette.trinity.logica.active};
  --trinity-base: ${palette.trinity.base.active};

  /* ── Typography ── */
  --font-main: '${typography.fontMain}', system-ui, sans-serif;
  --font-headline: '${typography.fontHeadline}', system-ui, sans-serif;
  --font-code: '${typography.fontCode}', monospace;
  --font-size-base: ${typography.baseSize}px;
  --font-scale: ${typography.scaleRatio};
  --font-weight-header: ${typography.headerWeight};
  --font-weight-body: ${typography.bodyWeight};
  --tracking-header: ${typography.headerTracking}em;
  --tracking-body: ${typography.bodyTracking}em;

  /* ── Effects ── */
  --backdrop-blur: ${effects.backdropBlur}px;
  --glass-saturation: ${effects.glassSaturation}%;
  --glow-intensity: ${effects.glowIntensity};
  --noise-opacity: ${effects.noiseOpacity};
  --refraction-index: ${effects.refractionIndex};
  --chromatic-aberration: ${effects.chromaticAberration}px;
  --displacement-scale: ${effects.displacementScale}px;
  --elasticity: ${effects.elasticity};

  /* ── Geometry ── */
  --radius-sm: ${geometry.radiusSm}px;
  --radius-md: ${geometry.radiusMd}px;
  --radius-lg: ${geometry.radiusLg}px;
  --radius-xl: ${geometry.radiusXl}px;
  --radius-pill: ${geometry.radiusPill}px;
  --golden-ratio: ${geometry.goldenRatio};
  --dock-margin: ${geometry.dockMargin}px;
  --dock-icon-size: ${geometry.dockIconSize}px;
  --dock-magnification: ${geometry.dockMagnification};
  --panel-blur: ${geometry.panelBlur}px;
}`;
}

export function ExportPanel({ state, onClose, onApplyToContext, onSaveTheme, onImport }: Props) {
    const [format, setFormat] = useState<ExportFormat>("json");
    const [copied, setCopied] = useState(false);
    const [applied, setApplied] = useState(false);
    const [saved, setSaved] = useState(false);
    const [themeName, setThemeName] = useState("Canvas Theme");

    const output = format === "json" ? stateToJSON(state) : format === "css" ? stateToCSS(state) : "";

    const handleCopy = () => {
        navigator.clipboard.writeText(output);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = () => {
        const ext = format === "json" ? "json" : "css";
        const blob = new Blob([output], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `starseed-canvas-theme.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleApply = () => {
        const mapped = mapCanvasToAppearance(state);

        // Always apply palette colors as CSS vars
        applyCanvasPalette(state);

        if (onApplyToContext) {
            // Push through the full AppearanceProvider pipeline
            onApplyToContext(mapped);
        } else {
            // Fallback: apply CSS variables directly for non-context usage
            const { effects, geometry, typography } = state;
            const root = document.documentElement;
            root.style.setProperty("--glass-blur", `${effects.backdropBlur}px`);
            root.style.setProperty("--radius", `${geometry.radiusMd / 16}rem`);
            root.style.setProperty("--font-body", `'${typography.fontMain}', system-ui, sans-serif`);
        }

        setApplied(true);
        setTimeout(() => setApplied(false), 3000);
    };

    const handleSaveTheme = () => {
        if (onSaveTheme) {
            const mapped = mapCanvasToAppearance(state);
            onSaveTheme(themeName, mapped);
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        }
    };

    const formats: { id: ExportFormat; label: string; icon: React.ElementType; desc: string }[] = [
        { id: "json", label: "JSON", icon: FileJson, desc: "Theme package compatible" },
        { id: "css", label: "CSS Variables", icon: FileCode, desc: "Copy-paste ready" },
        { id: "apply", label: "Apply Live", icon: Zap, desc: "Push to network now" },
        { id: "import", label: "Importar", icon: Download, desc: "Load from JSON file" },
    ];

    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                // Validate basic structure if needed, or just trust the schema
                if (onImport && typeof json === 'object') {
                    // Extract canvasState if nested (from our Export format) or use root if direct
                    const stateToLoad = json.canvasState || json;
                    // Sanity check for a known property
                    if (stateToLoad.palette || stateToLoad.typography) {
                        onImport(stateToLoad);
                        setApplied(true); // Reuse applied state for success feedback
                        setTimeout(() => setApplied(false), 3000);
                    } else {
                        alert("Invalid theme file format");
                    }
                }
            } catch (err) {
                console.error("Failed to parse theme file", err);
                alert("Error parsing theme file");
            }
        };
        reader.readAsText(file);
    };

    return (
        <div className="border-b border-white/5 bg-black/30 backdrop-blur-xl animate-in slide-in-from-top duration-300">
            <div className="max-w-5xl mx-auto px-6 py-5 space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <Download className="w-4 h-4 text-cyan-400" />
                        Exportar Configuración
                    </h3>
                    <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Format Selector */}
                <div className="flex gap-2">
                    {formats.map(f => (
                        <button
                            key={f.id}
                            onClick={() => setFormat(f.id)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-all border",
                                format === f.id
                                    ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-300"
                                    : "bg-white/3 border-white/5 text-white/40 hover:bg-white/5"
                            )}
                        >
                            <f.icon className="w-3.5 h-3.5" />
                            <div className="text-left">
                                <div>{f.label}</div>
                                <div className="text-[10px] opacity-60">{f.desc}</div>
                            </div>
                        </button>
                    ))}
                </div>

                {/* Output */}
                {format === "import" ? (
                    <div className="space-y-4 py-4">
                        <div className="border-2 border-dashed border-white/10 rounded-xl p-8 flex flex-col items-center justify-center text-center hover:bg-white/5 transition-colors group cursor-pointer"
                            onClick={() => fileInputRef.current?.click()}>
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept=".json"
                                onChange={handleImportFile}
                            />
                            <Download className="w-8 h-8 text-white/20 mb-3 group-hover:text-purple-400 transition-colors" />
                            <h4 className="text-sm font-medium text-white/80">Sube tu archivo de tema</h4>
                            <p className="text-xs text-white/40 mt-1 max-w-[200px]">
                                Selecciona un archivo .json exportado previamente
                            </p>
                        </div>
                        {applied && (
                            <div className="text-center text-xs text-green-400 flex items-center justify-center gap-2 animate-in fade-in">
                                <Check className="w-3 h-3" /> Tema cargado correctamente
                            </div>
                        )}
                    </div>
                ) : format !== "apply" ? (
                    <div className="space-y-2">
                        <pre className="bg-black/40 border border-white/5 rounded-xl p-4 text-xs font-mono text-emerald-300/70 overflow-auto max-h-48">
                            {output}
                        </pre>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={handleCopy}
                                className="border-white/10 text-white/50 hover:text-white/80 text-xs">
                                {copied ? <Check className="w-3 h-3 mr-1 text-green-400" /> : <Copy className="w-3 h-3 mr-1" />}
                                {copied ? "Copiado" : "Copiar"}
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleDownload}
                                className="border-white/10 text-white/50 hover:text-white/80 text-xs">
                                <Download className="w-3 h-3 mr-1" /> Descargar
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <p className="text-xs text-white/40">
                            Aplica los estilos del lienzo directamente a la configuración global
                            del Network a través del AppearanceProvider.
                        </p>

                        {/* Apply Button */}
                        <Button
                            onClick={handleApply}
                            className={cn(
                                "w-full bg-gradient-to-r from-cyan-500 to-purple-600 text-white border-0 text-sm",
                                applied && "from-green-500 to-emerald-600"
                            )}
                        >
                            {applied ? (
                                <><Check className="w-4 h-4 mr-2" /> Aplicado al Network</>
                            ) : (
                                <><Zap className="w-4 h-4 mr-2" /> Aplicar al Network</>
                            )}
                        </Button>

                        {/* Save as Theme */}
                        {onSaveTheme && (
                            <div className="flex gap-2 items-center">
                                <input
                                    type="text"
                                    value={themeName}
                                    onChange={(e) => setThemeName(e.target.value)}
                                    placeholder="Nombre del tema..."
                                    className="flex-1 bg-white/3 border border-white/8 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-purple-500/40"
                                />
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleSaveTheme}
                                    disabled={!themeName.trim()}
                                    className={cn(
                                        "border-white/10 text-white/50 hover:text-white/80 text-xs shrink-0",
                                        saved && "border-green-500/30 text-green-400"
                                    )}
                                >
                                    {saved ? (
                                        <><Check className="w-3 h-3 mr-1" /> Guardado</>
                                    ) : (
                                        <><Save className="w-3 h-3 mr-1" /> Guardar Tema</>
                                    )}
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

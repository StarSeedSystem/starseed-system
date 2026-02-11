"use client";

import React, { useState, useRef } from 'react';
import { useAppearance } from '@/context/appearance-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Download,
    Upload,
    RefreshCcw,
    Save,
    Code,
    Palette,
    Box,
    Zap,
    Pipette
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/crystal/GlassCard';

export function StyleAdapter() {
    const { config, updateConfig, exportTheme, importTheme, saveTheme } = useAppearance();
    const [jsonInput, setJsonInput] = useState('');
    const [importError, setImportError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            await importTheme(file);
            setImportError(null);
        } catch (err) {
            setImportError("Invalid configuration file");
        }
    };

    const handleJsonImport = () => {
        try {
            const parsed = JSON.parse(jsonInput);
            updateConfig(parsed);
            setJsonInput('');
            setImportError(null);
        } catch (err) {
            setImportError("Invalid JSON format");
        }
    };

    return (
        <div className="space-y-8 p-6 max-w-5xl mx-auto pb-32">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold font-headline bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-400">
                        Universal Style Adapter
                    </h1>
                    <p className="text-white/40 mt-2 max-w-lg">
                        Import external themes, export your configuration, or fine-tune the StarSeed visual engine.
                    </p>
                </div>
                <div className="flex gap-2">
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept=".json"
                        onChange={handleFileUpload}
                    />
                    <Button
                        variant="outline"
                        className="border-white/10 hover:bg-white/5"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <Upload className="w-4 h-4 mr-2" /> Import File
                    </Button>
                    <Button
                        onClick={exportTheme}
                        className="bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-500/50"
                    >
                        <Download className="w-4 h-4 mr-2" /> Export Config
                    </Button>
                </div>
            </header>

            <Tabs defaultValue="crystal" className="w-full">
                <TabsList className="bg-black/20 border border-white/5 p-1 mb-8">
                    <TabsTrigger value="crystal" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-300">
                        <Box className="w-4 h-4 mr-2" /> Crystal Physics
                    </TabsTrigger>
                    <TabsTrigger value="neon" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300">
                        <Zap className="w-4 h-4 mr-2" /> Neon & Glow
                    </TabsTrigger>
                    <TabsTrigger value="json" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-300">
                        <Code className="w-4 h-4 mr-2" /> JSON Editor
                    </TabsTrigger>
                </TabsList>

                {/* Crystal Physics Tab */}
                <TabsContent value="crystal" className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Controls */}
                        <div className="space-y-6 bg-white/5 p-6 rounded-2xl border border-white/5">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <Box className="w-5 h-5 text-cyan-400" /> Refraction Engine
                            </h3>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <Label>Refraction Index</Label>
                                        <span className="text-cyan-300">{config.styling.refraction?.toFixed(2)}</span>
                                    </div>
                                    <Slider
                                        min={0} max={2} step={0.01}
                                        value={[config.styling.refraction || 0]}
                                        onValueChange={([v]) => updateConfig({ styling: { ...config.styling, refraction: v } })}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <Label>Chromatic Aberration</Label>
                                        <span className="text-purple-300">{config.styling.chromaticAberration}px</span>
                                    </div>
                                    <Slider
                                        min={0} max={10} step={0.5}
                                        value={[config.styling.chromaticAberration || 0]}
                                        onValueChange={([v]) => updateConfig({ styling: { ...config.styling, chromaticAberration: v } })}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <Label>Glass Blur</Label>
                                        <span className="text-white/60">{config.styling.glassIntensity}px</span>
                                    </div>
                                    <Slider
                                        min={0} max={50} step={1}
                                        value={[config.styling.glassIntensity || 0]}
                                        onValueChange={([v]) => updateConfig({ styling: { ...config.styling, glassIntensity: v } })}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <Label>Frost / Noise</Label>
                                        <span className="text-white/60">{(config.styling.glassNoise || 0) * 100}%</span>
                                    </div>
                                    <Slider
                                        min={0} max={0.5} step={0.01}
                                        value={[config.styling.glassNoise || 0]}
                                        onValueChange={([v]) => updateConfig({ styling: { ...config.styling, glassNoise: v } })}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Preview */}
                        <div className="flex items-center justify-center p-8 bg-black/40 rounded-2xl border border-white/5 border-dashed relative overflow-hidden">
                            <div className="absolute inset-0 grid grid-cols-8 grid-rows-8 opacity-20 pointer-events-none">
                                {Array.from({ length: 64 }).map((_, i) => (
                                    <div key={i} className="border-[0.5px] border-white/5" />
                                ))}
                            </div>

                            {/* Background blobs for refraction testing */}
                            <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-purple-500 rounded-full blur-xl animate-pulse" />
                            <div className="absolute bottom-1/4 right-1/4 w-24 h-24 bg-cyan-500 rounded-full blur-xl animate-pulse" style={{ animationDelay: '1s' }} />

                            <GlassCard
                                variant="intense"
                                interactive
                                className="w-64 h-40 flex flex-col items-center justify-center text-center p-4 border border-white/10"
                                style={{
                                    backdropFilter: `blur(${config.styling.glassIntensity}px)`,
                                }}
                            >
                                <span className="text-2xl font-bold">Crystal</span>
                                <span className="text-xs opacity-50 uppercase tracking-widest">Preview Mode</span>
                            </GlassCard>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="neon" className="space-y-6">
                    <div className="space-y-6 bg-white/5 p-6 rounded-2xl border border-white/5 max-w-2xl">
                        <h3 className="text-lg font-bold flex items-center gap-2">
                            <Zap className="w-5 h-5 text-purple-400" /> Neon Attributes
                        </h3>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <Label>Glow Intensity</Label>
                                    <span className="text-purple-300">{config.styling.glowIntensity}</span>
                                </div>
                                <Slider
                                    min={0} max={2} step={0.1}
                                    value={[config.styling.glowIntensity || 0]}
                                    onValueChange={([v]) => updateConfig({ styling: { ...config.styling, glowIntensity: v } })}
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <Label>Neon Ticker Animation</Label>
                                <Button
                                    variant={config.styling.neonTicker ? "default" : "outline"}
                                    onClick={() => updateConfig({ styling: { ...config.styling, neonTicker: !config.styling.neonTicker } })}
                                    className="w-24"
                                >
                                    {config.styling.neonTicker ? "On" : "Off"}
                                </Button>
                            </div>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="json" className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                            <Label>Raw Configuration (JSON)</Label>
                            <textarea
                                className="w-full h-96 bg-black/50 border border-white/10 rounded-xl p-4 font-mono text-xs text-green-400 focus:outline-none focus:border-cyan-500/50"
                                value={jsonInput}
                                onChange={(e) => setJsonInput(e.target.value)}
                                placeholder="Paste config JSON here..."
                            />
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" onClick={() => setJsonInput('')}>Clear</Button>
                                <Button onClick={handleJsonImport} disabled={!jsonInput}>Apply JSON</Button>
                            </div>
                            {importError && (
                                <p className="text-red-400 text-sm bg-red-500/10 p-2 rounded">{importError}</p>
                            )}
                        </div>
                        <div className="space-y-4">
                            <Label>Current System State</Label>
                            <div className="w-full h-96 bg-black/50 border border-white/10 rounded-xl p-4 font-mono text-xs text-white/50 overflow-auto select-all">
                                {JSON.stringify(config, null, 2)}
                            </div>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}

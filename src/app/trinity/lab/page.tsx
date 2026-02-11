"use client";

import React, { useState } from "react";
import { CrystalCard } from "@/components/crystal/CrystalCard";
import { LiquidButton } from "@/components/crystal/LiquidButton";
import { HolographicOverlay } from "@/components/crystal/HolographicOverlay";
import { LiquidTabs } from "@/components/crystal/LiquidTabs";
import { CrystalConfigurator, DEFAULT_CRYSTAL_CONFIG, CrystalConfig } from "@/components/crystal/CrystalConfigurator";
import { CrystalWindow } from "@/components/crystal/CrystalWindow";
import { CrystalMenu } from "@/components/crystal/CrystalMenu";
import { Activity, Zap, Shield, Search, Info, Home, Settings, User, Bell } from "lucide-react";

export default function CrystalLab() {
    const [activeTab, setActiveTab] = useState("foundations");
    const [isOverlayOpen, setIsOverlayOpen] = useState(false);
    const [config, setConfig] = useState<CrystalConfig>(DEFAULT_CRYSTAL_CONFIG);

    return (
        <div className="min-h-screen w-full bg-background-dark text-white font-sans overflow-x-hidden p-8 pb-32">
            {/* Background Ambience */}
            <div className="fixed inset-0 pointer-events-none -z-10">
                <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-electric-azure/10 blur-[150px] rounded-full animate-pulse-slow"></div>
                <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-solar-amber/5 blur-[150px] rounded-full"></div>
                <div className="absolute top-[40%] left-[40%] w-[30%] h-[30%] bg-emerald-green/5 blur-[120px] rounded-full mix-blend-overlay"></div>
            </div>

            <header className="mb-12 text-center">
                <h1 className="text-4xl md:text-6xl font-thin tracking-[0.2em] uppercase mb-4 text-transparent bg-clip-text bg-gradient-to-b from-white to-white/40">
                    Crystal Laboratory
                </h1>
                <p className="text-white/40 max-w-2xl mx-auto">
                    Experimental ground for "Ontocracia Ciberdélica" interface modules.
                    Verifying refraction, caustics, and elastic liquid physics.
                </p>
            </header>

            {/* Navigation */}
            <div className="max-w-md mx-auto mb-16">
                <LiquidTabs
                    activeTab={activeTab}
                    onChange={setActiveTab}
                    tabs={[
                        { id: "foundations", label: "Foundations" },
                        { id: "actions", label: "Actions" },
                        { id: "holograms", label: "Holograms" },
                        { id: "realism", label: "Realism (New)" },
                    ]}
                />
            </div>

            <div className="max-w-6xl mx-auto">
                {activeTab === "foundations" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        <CrystalCard className="min-h-[300px] flex flex-col justify-between group">
                            <div>
                                <Activity className="w-8 h-8 text-electric-azure mb-4" />
                                <h3 className="text-lg font-bold uppercase tracking-widest text-white/80 mb-2">Refraction Index</h3>
                                <p className="text-white/50 text-sm leading-relaxed">
                                    High-fidelity frosted glass simulation using displacement maps.
                                    Observe how the background gradient warps behind this card.
                                </p>
                            </div>
                            <div className="w-full h-1 bg-white/10 rounded-full mt-6 overflow-hidden">
                                <div className="w-[70%] h-full bg-electric-azure shadow-[0_0_10px_#007FFF] animate-pulse"></div>
                            </div>
                        </CrystalCard>

                        <CrystalCard className="min-h-[300px] flex flex-col justify-between" active>
                            <div>
                                <Zap className="w-8 h-8 text-solar-amber mb-4" />
                                <h3 className="text-lg font-bold uppercase tracking-widest text-white/80 mb-2">Active State</h3>
                                <p className="text-white/50 text-sm leading-relaxed">
                                    Active cards glow with inner luminescence. The border becomes a refractive prism
                                    rather than a solid line.
                                </p>
                            </div>
                            <div className="flex gap-2 mt-6">
                                <span className="px-2 py-1 rounded bg-solar-amber/20 text-solar-amber text-xs font-mono border border-solar-amber/30">
                                    ENERGY: 98%
                                </span>
                            </div>
                        </CrystalCard>

                        <div className="relative group">
                            {/* Background image to test refraction against */}
                            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center rounded-[32px] opacity-50"></div>
                            <CrystalCard className="h-full backdrop-blur-md bg-black/40">
                                <Search className="w-8 h-8 text-emerald-green mb-4" />
                                <h3 className="text-lg font-bold uppercase tracking-widest text-white/80 mb-2">Caustics Test</h3>
                                <p className="text-white/80 text-sm leading-relaxed drop-shadow-md">
                                    Move your mouse over this card if elasticity is enabled. The underlying image should distort.
                                </p>
                            </CrystalCard>
                        </div>
                    </div>
                )}

                {activeTab === "actions" && (
                    <div className="flex flex-col items-center gap-12 py-12">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
                            <div className="space-y-4 text-center">
                                <h4 className="text-xs font-bold uppercase text-white/30 tracking-widest">Primary Liquid</h4>
                                <LiquidButton variant="primary">Initiate Sequence</LiquidButton>
                            </div>
                            <div className="space-y-4 text-center">
                                <h4 className="text-xs font-bold uppercase text-white/30 tracking-widest">Secondary Morph</h4>
                                <LiquidButton variant="secondary">Create Node</LiquidButton>
                            </div>
                            <div className="space-y-4 text-center">
                                <h4 className="text-xs font-bold uppercase text-white/30 tracking-widest">Critical Mass</h4>
                                <LiquidButton variant="danger">System Purge</LiquidButton>
                            </div>
                        </div>

                        <div className="flex gap-4 p-8 rounded-3xl bg-white/5 border border-white/5 w-full justify-center">
                            <LiquidButton variant="ghost" className="w-auto px-6">Cancel</LiquidButton>
                            <LiquidButton variant="primary" className="w-auto px-6" onClick={() => setIsOverlayOpen(true)}>
                                Open Holo-Deck
                            </LiquidButton>
                        </div>
                    </div>
                )}

                {activeTab === "holograms" && (
                    <div className="flex flex-col items-center justify-center min-h-[400px]">
                        <CrystalCard className="max-w-2xl w-full text-center py-12">
                            <Shield className="w-16 h-16 text-white/20 mx-auto mb-6" />
                            <h3 className="text-2xl font-light text-white mb-4">Secure Holographic Environment</h3>
                            <p className="text-white/50 mb-8 max-w-lg mx-auto">
                                Click the button below to initialize the high-refraction holographic overlay.
                                This simulates a projected light field.
                            </p>
                            <LiquidButton onClick={() => setIsOverlayOpen(true)}>
                                Initialize Overlay
                            </LiquidButton>
                        </CrystalCard>
                    </div>
                )}

                {activeTab === "realism" && (
                    <div className="flex flex-col lg:flex-row gap-8 items-start">
                        {/* Configurator Panel */}
                        <div className="w-full lg:w-80 shrink-0 order-2 lg:order-1 sticky top-8">
                            <CrystalConfigurator
                                config={config}
                                onChange={setConfig}
                            />
                        </div>

                        {/* Preview Area */}
                        <div className="flex-1 w-full order-1 lg:order-2 space-y-12">

                            {/* Window Example */}
                            <section>
                                <h3 className="text-xl font-thin uppercase tracking-widest text-white/50 mb-6">OS Window Simulation</h3>
                                <div className="relative min-h-[500px] flex items-center justify-center p-8 rounded-[40px] border border-white/5 overflow-hidden">
                                    {/* Dynamic Background for Refraction */}
                                    <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop')] bg-cover bg-center opacity-80"></div>
                                    <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]"></div>

                                    <CrystalWindow
                                        config={config}
                                        title="Hyper-Crystal Terminal"
                                        className="w-full max-w-2xl h-[400px]"
                                    >
                                        <div className="p-8 flex flex-col items-center justify-center h-full text-center space-y-6">
                                            <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-electric-azure to-purple-500 blur-xl opacity-50 animate-pulse-slow"></div>
                                            <h2 className="text-3xl font-bold text-white drop-shadow-md">
                                                Liquid Realism
                                            </h2>
                                            <p className="text-white/70 max-w-md mx-auto leading-relaxed">
                                                Adjust the parameters on the left to confirm "Hyper-Crystal" behavior.
                                                Note how elasticity affects the window as you interact with it (if enabled).
                                            </p>

                                            <div className="flex gap-4">
                                                <button className="px-6 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all">
                                                    Explore
                                                </button>
                                                <button className="px-6 py-2 rounded-full border border-white/20 hover:bg-white/5 text-white transition-all">
                                                    Details
                                                </button>
                                            </div>
                                        </div>
                                    </CrystalWindow>
                                </div>
                            </section>

                            {/* Menu Example */}
                            <section>
                                <h3 className="text-xl font-thin uppercase tracking-widest text-white/50 mb-6">Dynamic Dock</h3>
                                <div className="relative h-40 flex items-center justify-center rounded-[40px] border border-white/5 bg-grid-white/[0.05]">
                                    <CrystalMenu
                                        config={config}
                                        items={[
                                            { icon: <Home className="w-5 h-5" />, active: true },
                                            { icon: <Search className="w-5 h-5" /> },
                                            { icon: <Bell className="w-5 h-5" />, label: "Notifications" },
                                            { icon: <User className="w-5 h-5" /> },
                                            { icon: <Settings className="w-5 h-5" /> },
                                        ]}
                                    />
                                </div>
                            </section>

                        </div>
                    </div>
                )}
            </div>

            <HolographicOverlay
                isOpen={isOverlayOpen}
                onClose={() => setIsOverlayOpen(false)}
                title="Secure Interface"
            >
                <div className="space-y-6">
                    <div className="flex items-start gap-4">
                        <Info className="w-6 h-6 text-electric-azure shrink-0 mt-1" />
                        <div>
                            <h4 className="font-bold text-white text-lg mb-2">Refraction Matrix Active</h4>
                            <p className="text-sm leading-relaxed text-white/70">
                                This overlay uses maximum aberration intensity (5.0) and a polar displacement mode to simulate
                                a curved holographic projection. Notice the rainbow separation at the edges.
                            </p>
                        </div>
                    </div>

                    <div className="h-32 bg-white/5 rounded-lg border border-white/10 flex items-center justify-center relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-12 translate-x-[-150%] group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out"></div>
                        <span className="font-mono text-xs text-electric-azure tracking-[0.3em]">SCANNING FLUX CAPACITORS...</span>
                    </div>

                    <div className="flex justify-end gap-3 mt-8">
                        <button
                            onClick={() => setIsOverlayOpen(false)}
                            className="px-4 py-2 text-sm text-white/50 hover:text-white transition-colors"
                        >
                            Dismiss
                        </button>
                        <LiquidButton className="w-auto px-6 py-2 text-sm">
                            Confirm
                        </LiquidButton>
                    </div>
                </div>
            </HolographicOverlay>

        </div>
    );
}

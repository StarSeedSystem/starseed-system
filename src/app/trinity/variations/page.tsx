import React from 'react';
import { GlassCard } from '@/components/crystal/GlassCard';
import { OrganicBlob } from '@/components/crystal/OrganicBlob';
import { Wand2, Droplets, Hexagon } from 'lucide-react';

export default function VariationsPage() {
    return (
        <div className="min-h-screen bg-[#050510] text-white p-12 relative overflow-hidden">
            {/* Background Ambient */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-purple-500/20 blur-[120px] rounded-full mix-blend-screen animate-pulse-slow" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-cyan-500/20 blur-[120px] rounded-full mix-blend-screen animate-pulse-slow" style={{ animationDelay: '2s' }} />
            </div>

            <header className="relative z-10 mb-16 text-center">
                <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 to-purple-400 mb-4 font-display">
                    Crystal Variations
                </h1>
                <p className="text-white/40 max-w-xl mx-auto">
                    Exploration of organic transparency, prismatic refractions, and fluid geometries.
                </p>
            </header>

            <main className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-12 max-w-7xl mx-auto">
                {/* Visual A: Intense Glass */}
                <section className="flex flex-col gap-6">
                    <h2 className="text-xl font-bold text-cyan-300 flex items-center gap-2">
                        <Hexagon className="w-5 h-5" /> Prismatic / Intense
                    </h2>
                    <GlassCard
                        variant="intense"
                        interactive
                        specular
                        className="h-64 flex flex-col justify-center items-center p-8 border border-white/10"
                    >
                        <div className="text-4xl font-bold mb-2">85%</div>
                        <div className="text-sm tracking-widest uppercase opacity-60">Refraction Index</div>
                        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
                    </GlassCard>
                    <p className="text-xs text-white/30">
                        High displacement (150), sharp blur (10px), specular highlights.
                    </p>
                </section>

                {/* Visual B: Organic / Fluid */}
                <section className="flex flex-col gap-6 items-center">
                    <h2 className="text-xl font-bold text-purple-300 flex items-center gap-2">
                        <Droplets className="w-5 h-5" /> Organic / Fluid
                    </h2>
                    <OrganicBlob size={320} animate={25} accentColor="#bd00ff">
                        <div className="z-10">
                            <h3 className="text-2xl font-bold">Nebula</h3>
                            <p className="text-sm opacity-70">Fluid State</p>
                        </div>
                    </OrganicBlob>
                    <p className="text-xs text-white/30 text-center">
                        Morphing border-radius, soft blur (20px), internal glow.
                    </p>
                </section>

                {/* Visual C: Subtle / Clear */}
                <section className="flex flex-col gap-6">
                    <h2 className="text-xl font-bold text-emerald-300 flex items-center gap-2">
                        <Wand2 className="w-5 h-5" /> Subtle / Clean
                    </h2>
                    <GlassCard
                        variant="subtle"
                        interactive
                        intensity={0.5}
                        className="h-64 flex flex-col justify-between p-8 border border-white/5 bg-white/5"
                    >
                        <div className="flex justify-between items-start">
                            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                <Wand2 className="w-5 h-5 text-emerald-300" />
                            </div>
                            <div className="px-3 py-1 rounded-full bg-black/20 text-xs border border-white/10">Active</div>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold">Clear View</h3>
                            <p className="text-sm opacity-50">Low distortion for readability.</p>
                        </div>
                    </GlassCard>
                    <p className="text-xs text-white/30">
                        Low displacement (15), minimal blur (2.5px), high legibility.
                    </p>
                </section>
            </main>
        </div>
    );
}

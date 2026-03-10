import React, { useState } from 'react';
import { Search, Bell, User, Layers, Settings, ZoomIn, ZoomOut, Activity, Globe, Share2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

const NODES = [
    { id: 1, x: 400, y: 250, r: 16, color: 'primary', label: 'Main Hub', latency: '1.2ms', type: 'CORE' },
    { id: 2, x: 200, y: 120, r: 10, color: 'foreground', label: 'Edge-Alpha', latency: '4.5ms', type: 'RELAY' },
    { id: 3, x: 600, y: 120, r: 10, color: 'foreground', label: 'Edge-Beta', latency: '3.8ms', type: 'RELAY' },
    { id: 4, x: 650, y: 380, r: 12, color: 'accent', label: 'Storage-01', latency: '12ms', type: 'ENDPOINT' },
    { id: 5, x: 150, y: 380, r: 10, color: 'foreground', label: 'Satellite-A', latency: '42ms', type: 'ENDPOINT' },
    { id: 6, x: 380, y: 80, r: 6, color: 'primary', label: 'Drone-X', latency: '8ms', type: 'MOBILE' },
    { id: 7, x: 420, y: 420, r: 6, color: 'accent', label: 'IoT-Gate', latency: '5ms', type: 'STATIC' },
];

const CONNECTIONS = [
    { from: 1, to: 2, color: 'primary' },
    { from: 1, to: 3, color: 'accent' },
    { from: 1, to: 4, color: 'accent' },
    { from: 1, to: 5, color: 'foreground' },
    { from: 2, to: 3, dashed: true },
    { from: 1, to: 6, color: 'primary' },
    { from: 1, to: 7, color: 'accent' },
];

export function ExploreNetworkWidget() {
    const [hoveredNode, setHoveredNode] = useState<typeof NODES[0] | null>(null);

    return (
        <div className="w-full h-full bg-card/10 backdrop-blur-3xl rounded-xl relative overflow-hidden flex flex-col p-3 md:p-5 border border-border/40 shadow-2xl text-foreground font-display group/widget">
            {/* Corner Decoration Accents */}
            <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-primary/50 rounded-tl-xl pointer-events-none transition-all group-hover/widget:w-12 group-hover/widget:h-12" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-border/20 rounded-tr-xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-border/20 rounded-bl-xl pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-primary/50 rounded-br-xl pointer-events-none transition-all group-hover/widget:w-12 group-hover/widget:h-12" />

            {/* Panel Header */}
            <div className="flex flex-row justify-between items-center z-10 gap-2 mb-3">
                <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-primary animate-pulse" />
                        <h1 className="text-lg md:text-2xl font-light tracking-tight text-foreground uppercase font-display leading-none">Topology</h1>
                    </div>
                    <p className="text-primary/70 text-[8px] md:text-[10px] tracking-[0.2em] font-bold uppercase whitespace-nowrap">Quantum Node Mapping</p>
                </div>

                <div className="flex items-center gap-2 font-mono">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex items-center gap-2.5 px-3 py-1.5 bg-primary/5 border border-primary/20 rounded-lg shadow-inner backdrop-blur-md"
                    >
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                        </span>
                        <div className="flex flex-col items-start leading-none">
                            <span className="text-[8px] text-muted-foreground font-bold uppercase">Nodes</span>
                            <span className="text-sm md:text-base font-black text-foreground tabular-nums">1,204</span>
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* 3D-Style Visualization Area */}
            <div className="flex-1 relative flex items-center justify-center min-h-[180px] w-full bg-black/20 rounded-xl border border-border/20 overflow-hidden group/viz">
                {/* Background Grid */}
                <div className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '20px 20px' }}
                />

                {/* SVG Mapping */}
                <svg className="w-full h-full filter drop-shadow-[0_0_15px_rgba(var(--primary-hsl),0.15)]" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid meet">
                    <defs>
                        <filter id="glow">
                            <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
                            <feMerge>
                                <feMergeNode in="coloredBlur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                        <linearGradient id="line-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.8" />
                            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
                        </linearGradient>
                    </defs>

                    {/* Connection Lines with animation */}
                    <g opacity="0.4">
                        {CONNECTIONS.map((conn, i) => {
                            const fromNode = NODES.find(n => n.id === conn.from)!;
                            const toNode = NODES.find(n => n.id === conn.to)!;
                            return (
                                <motion.line
                                    key={`line-${i}`}
                                    x1={fromNode.x} y1={fromNode.y}
                                    x2={toNode.x} y2={toNode.y}
                                    stroke={conn.color === 'primary' ? 'hsl(var(--primary))' : conn.color === 'accent' ? 'hsl(var(--accent))' : 'currentColor'}
                                    strokeWidth={conn.dashed ? 1 : 2}
                                    strokeDasharray={conn.dashed ? "4,4" : "0"}
                                    initial={{ pathLength: 0, opacity: 0 }}
                                    animate={{ pathLength: 1, opacity: 0.6 }}
                                    transition={{ duration: 1.5, delay: i * 0.1, ease: "easeInOut" }}
                                />
                            );
                        })}
                    </g>

                    {/* Nodes */}
                    {NODES.map((node) => (
                        <motion.g
                            key={`node-${node.id}`}
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: 'spring', stiffness: 260, damping: 20, delay: node.id * 0.05 }}
                            onHoverStart={() => setHoveredNode(node)}
                            onHoverEnd={() => setHoveredNode(null)}
                            className="cursor-pointer"
                        >
                            {/* Halo */}
                            <motion.circle
                                cx={node.x} cy={node.y} r={node.r + 4}
                                fill={node.color === 'primary' ? 'hsl(var(--primary))' : node.color === 'accent' ? 'hsl(var(--accent))' : 'currentColor'}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: hoveredNode?.id === node.id ? 0.2 : 0 }}
                            />
                            {/* Main Circle */}
                            <circle
                                cx={node.x} cy={node.y} r={node.r}
                                fill={node.color === 'primary' ? 'hsl(var(--primary))' : node.color === 'accent' ? 'hsl(var(--accent))' : 'currentColor'}
                                className={cn(
                                    "transition-all duration-300",
                                    node.color === 'primary' && "shadow-[0_0_10px_hsl(var(--primary))]",
                                    hoveredNode?.id === node.id && "filter brightness-125 scale-110"
                                )}
                            />
                            {/* Inner Dot */}
                            <circle cx={node.x} cy={node.y} r={node.r * 0.4} fill="white" opacity="0.5" />
                        </motion.g>
                    ))}
                </svg>

                {/* Floating Node Info Overlay */}
                <AnimatePresence>
                    {hoveredNode && (
                        <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.9 }}
                            className="absolute pointer-events-none bg-card/90 backdrop-blur-xl border border-primary/30 p-3 rounded-xl shadow-2xl z-30"
                            style={{
                                left: `${(hoveredNode.x / 800) * 100}%`,
                                top: `${(hoveredNode.y / 500) * 100}%`,
                                transform: 'translate(-50%, -120%)'
                            }}
                        >
                            <div className="flex flex-col gap-1 min-w-[120px]">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black text-primary uppercase tracking-tighter">{hoveredNode.type}</span>
                                    <span className="text-[10px] font-mono opacity-60">ID: {hoveredNode.id}</span>
                                </div>
                                <div className="text-sm font-bold truncate">{hoveredNode.label}</div>
                                <div className="h-[1px] bg-border/20 my-1" />
                                <div className="flex justify-between items-center text-[10px] font-mono">
                                    <span className="opacity-70">Latency:</span>
                                    <span className="text-primary font-bold">{hoveredNode.latency}</span>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* HUD Data Overlay (Bottom Right) */}
                <div className="absolute bottom-3 right-3 flex flex-col items-end pointer-events-none">
                    <div className="bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 flex flex-col items-end">
                        <span className="text-[8px] font-mono text-white/50 uppercase tracking-[0.2em]">Flux Magnitude</span>
                        <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                            <span className="text-xs font-black font-mono text-white">99.8% STABLE</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Panel Footer */}
            <div className="mt-3 flex flex-row justify-between items-center z-10 pt-3 border-t border-border/20 gap-3">
                <div className="flex items-center gap-3">
                    <div className="flex -space-x-2">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="w-6 h-6 rounded-full border border-background bg-muted flex items-center justify-center overflow-hidden">
                                <User className="w-3 h-3 text-muted-foreground" />
                            </div>
                        ))}
                        <div className="w-6 h-6 rounded-full border border-background bg-primary/20 flex items-center justify-center text-[8px] font-bold text-primary">
                            +5
                        </div>
                    </div>
                    <div className="hidden sm:block text-[9px] font-mono text-muted-foreground uppercase tracking-widest leading-none">
                        Active<br />Engineers
                    </div>
                </div>

                <div className="flex gap-2">
                    <button className="p-2 bg-muted/20 hover:bg-primary/20 rounded-lg border border-border/40 transition-colors group/btn">
                        <Share2 className="w-4 h-4 text-muted-foreground group-hover/btn:text-primary" />
                    </button>
                    <button className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-primary/20 hover:scale-105 active:scale-95">
                        Expand Map
                    </button>
                </div>
            </div>
        </div>
    );
}

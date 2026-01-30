"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAppearance } from "@/context/appearance-context";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, ShieldCheck, Activity } from "lucide-react";

// Types corresponding to the Living Graph ontology
type NodeType = "USER" | "MPC_VALIDATOR" | "IPFS_NODE";

interface Node {
    id: string;
    x: number;
    y: number;
    z: number; // Depth for holographic 2.5D effect
    vx: number;
    vy: number;
    vz: number;
    type: NodeType;
    radius: number;
    color: string;
    pulsePhase: number;
}

interface Packet {
    from: number; // Index of sender
    to: number; // Index of receiver
    progress: number; // 0 to 1
    speed: number;
}

export function HolographicGraph() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const { config } = useAppearance(); // Can be used for theming later

    // Stats state
    const [stats, setStats] = useState({ nodes: 0, connections: 0, packets: 0 });
    const [resetTrigger, setResetTrigger] = useState(0);

    const handleReset = () => {
        setResetTrigger(prev => prev + 1);
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let animationFrameId: number;
        let nodes: Node[] = [];
        let packets: Packet[] = [];

        // --- B.L.A.S.T. Configuration ---
        const CONFIG = {
            NODE_COUNT: 50,
            MPC_COUNT: 5,
            CONNECTION_DISTANCE_3D: 250, // Distance considering Z axis
            MOUSE_INFLUENCE_RADIUS: 250,
            DEPTH: 800, // Z-depth range
            PERSPECTIVE: 800, // Perspective projection distance
        };

        // --- Initialization ---
        const initNodes = (width: number, height: number) => {
            nodes = [];
            const colors = {
                USER: "#38bdf8", // Sky Blue
                MPC_VALIDATOR: "#f472b6", // Pink/Magenta for Governance
                IPFS_NODE: "#a78bfa" // Purple for storage
            };

            // Create MPC Validator Key Nodes (Fixed/Heavier)
            for (let i = 0; i < CONFIG.MPC_COUNT; i++) {
                nodes.push({
                    id: `mpc-${i}`,
                    x: (width * 0.2) + Math.random() * (width * 0.6),
                    y: (height * 0.2) + Math.random() * (height * 0.6),
                    z: Math.random() * (CONFIG.DEPTH * 0.3), // Keep MPC front-ish
                    vx: (Math.random() - 0.5) * 0.2,
                    vy: (Math.random() - 0.5) * 0.2,
                    vz: (Math.random() - 0.5) * 0.2,
                    type: "MPC_VALIDATOR",
                    radius: 6,
                    color: colors.MPC_VALIDATOR,
                    pulsePhase: Math.random() * Math.PI * 2
                });
            }

            // Create User/Data Nodes
            for (let i = 0; i < CONFIG.NODE_COUNT; i++) {
                const isIpfs = Math.random() > 0.8;
                nodes.push({
                    id: `node-${i}`,
                    x: Math.random() * width,
                    y: Math.random() * height,
                    z: Math.random() * CONFIG.DEPTH,
                    vx: (Math.random() - 0.5) * 0.5,
                    vy: (Math.random() - 0.5) * 0.5,
                    vz: (Math.random() - 0.5) * 0.5,
                    type: isIpfs ? "IPFS_NODE" : "USER",
                    radius: Math.random() * 2 + 1.5,
                    color: isIpfs ? colors.IPFS_NODE : colors.USER,
                    pulsePhase: Math.random() * Math.PI * 2
                });
            }
        };

        // --- Interaction Logic ---
        const mouse = { x: -1000, y: -1000 };
        const handleMouseMove = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            mouse.x = e.clientX - rect.left;
            mouse.y = e.clientY - rect.top;
        };

        // --- Core Loop ---
        const update = () => {
            // Handle HiDPI
            const dpr = window.devicePixelRatio || 1;
            const width = canvas.width / dpr;
            const height = canvas.height / dpr;
            const centerX = width / 2;
            const centerY = height / 2;

            ctx.clearRect(0, 0, width, height);

            // 1. Physics & Position Updates
            nodes.forEach(node => {
                node.x += node.vx;
                node.y += node.vy;
                node.z += node.vz;
                node.pulsePhase += 0.05;

                // Wall Bounds (Box containment)
                if (node.x < 0 || node.x > width) node.vx *= -1;
                if (node.y < 0 || node.y > height) node.vy *= -1;
                if (node.z < 0 || node.z > CONFIG.DEPTH) node.vz *= -1;

                // Mouse Repulsion (2D projection check)
                const scale = CONFIG.PERSPECTIVE / (CONFIG.PERSPECTIVE + node.z);
                const screenX = (node.x - centerX) * scale + centerX;
                const screenY = (node.y - centerY) * scale + centerY;

                const dx = mouse.x - screenX;
                const dy = mouse.y - screenY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < CONFIG.MOUSE_INFLUENCE_RADIUS) {
                    const force = (CONFIG.MOUSE_INFLUENCE_RADIUS - dist) / CONFIG.MOUSE_INFLUENCE_RADIUS;
                    const angle = Math.atan2(dy, dx);
                    // Push in 3D space loosely
                    node.vx -= Math.cos(angle) * force * 0.1;
                    node.vy -= Math.sin(angle) * force * 0.1;
                }
            });

            // 2. Prepare Projected Nodes
            const projected = nodes.map(node => {
                const scale = Math.max(0.1, CONFIG.PERSPECTIVE / (CONFIG.PERSPECTIVE + node.z));
                return {
                    ...node,
                    sx: (node.x - centerX) * scale + centerX,
                    sy: (node.y - centerY) * scale + centerY,
                    scale
                };
            });

            // 3. Draw Connections & Packets
            let activeConnections = 0;
            ctx.lineWidth = 1;

            for (let i = 0; i < nodes.length; i++) {
                const n1 = projected[i];
                for (let j = i + 1; j < nodes.length; j++) {
                    const n2 = projected[j];

                    // 3D Distance check
                    const dx = nodes[i].x - nodes[j].x;
                    const dy = nodes[i].y - nodes[j].y;
                    const dz = nodes[i].z - nodes[j].z;
                    const dist3d = Math.sqrt(dx * dx + dy * dy + dz * dz);

                    if (dist3d < CONFIG.CONNECTION_DISTANCE_3D) {
                        activeConnections++;
                        const opacity = Math.max(0, (1 - dist3d / CONFIG.CONNECTION_DISTANCE_3D) * Math.min(n1.scale, n2.scale));

                        // Spawn random packet
                        if (Math.random() < 0.0005) {
                            packets.push({ from: i, to: j, progress: 0, speed: 0.01 + Math.random() * 0.02 });
                        }

                        if (opacity > 0.05) {
                            ctx.beginPath();
                            ctx.moveTo(n1.sx, n1.sy);
                            ctx.lineTo(n2.sx, n2.sy);

                            const isMPC = nodes[i].type === 'MPC_VALIDATOR' || nodes[j].type === 'MPC_VALIDATOR';

                            // Visual style
                            if (isMPC) {
                                ctx.strokeStyle = `rgba(244, 114, 182, ${opacity * 0.8})`;
                            } else {
                                ctx.strokeStyle = `rgba(255, 255, 255, ${opacity * 0.15})`;
                            }
                            ctx.stroke();
                        }
                    }
                }
            }

            // 4. Draw Nodes (Back to Front)
            const sortedNodes = [...projected].sort((a, b) => b.z - a.z);

            sortedNodes.forEach(node => {
                ctx.beginPath();
                const visualRadius = node.radius * node.scale;

                // Pulsing
                const pulse = Math.sin(node.pulsePhase) * 0.2 + 1;
                ctx.arc(node.sx, node.sy, visualRadius * pulse, 0, Math.PI * 2);

                // Visuals
                const alpha = Math.min(1, Math.max(0.1, node.scale));

                if (node.type === "MPC_VALIDATOR") {
                    ctx.shadowColor = node.color;
                    ctx.shadowBlur = 10 * node.scale;
                } else {
                    ctx.shadowBlur = 0;
                }

                ctx.fillStyle = node.color;
                ctx.globalAlpha = alpha;
                ctx.fill();
                ctx.globalAlpha = 1;
                ctx.shadowBlur = 0;

                // Draw Label for MPC
                if (node.type === "MPC_VALIDATOR" && node.scale > 0.8) {
                    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
                    ctx.font = `${10 * node.scale}px monospace`;
                    ctx.fillText("MPC-VAL", node.sx + 10, node.sy);
                }
            });

            // 5. Draw Packets
            const nextPackets: Packet[] = [];
            packets.forEach(pkt => {
                pkt.progress += pkt.speed;
                if (pkt.progress < 1) {
                    const n1 = projected[pkt.from];
                    const n2 = projected[pkt.to];

                    const px = n1.sx + (n2.sx - n1.sx) * pkt.progress;
                    const py = n1.sy + (n2.sy - n1.sy) * pkt.progress;
                    const pScale = n1.scale + (n2.scale - n1.scale) * pkt.progress; // Interpolate scale

                    ctx.beginPath();
                    ctx.arc(px, py, 1.5 * pScale, 0, Math.PI * 2);
                    ctx.fillStyle = "#ffffff";
                    ctx.shadowColor = "#ffffff";
                    ctx.shadowBlur = 5;
                    ctx.fill();
                    ctx.shadowBlur = 0;

                    nextPackets.push(pkt);
                }
            });
            packets = nextPackets;

            setStats({
                nodes: nodes.length,
                connections: activeConnections,
                packets: packets.length
            });

            animationFrameId = requestAnimationFrame(update);
        };

        // Resize
        const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            const rect = container.getBoundingClientRect();

            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;

            canvas.style.width = `${rect.width}px`;
            canvas.style.height = `${rect.height}px`;

            ctx.scale(dpr, dpr);

            // Re-init if new session
            initNodes(rect.width, rect.height);
        };

        window.addEventListener('resize', resize);
        container.addEventListener('mousemove', handleMouseMove);

        resize(); // Initial call
        update(); // Start loop

        return () => {
            window.removeEventListener('resize', resize);
            container?.removeEventListener('mousemove', handleMouseMove);
            cancelAnimationFrame(animationFrameId);
        };
    }, [resetTrigger]);

    return (
        <Card className="relative w-full h-[600px] overflow-hidden border-white/5 bg-black/60 backdrop-blur-3xl shadow-2xl group transition-all duration-700 hover:border-primary/20">
            {/* Holographic Grid Overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

            {/* Header Overlay */}
            <div className="absolute top-6 left-6 z-10 space-y-2 pointer-events-none select-none">
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-cyan-500/10 backdrop-blur-md border-cyan-500/30 text-cyan-400 px-3 py-1">
                        <Activity className="w-3 h-3 mr-2 animate-pulse" />
                        SYSTEM PILOT VIEW
                    </Badge>
                    <Badge variant="outline" className="bg-pink-500/10 backdrop-blur-md border-pink-500/30 text-pink-400 px-3 py-1">
                        <ShieldCheck className="w-3 h-3 mr-2" />
                        MPC VALIDATORS: ACTIVE
                    </Badge>
                </div>

                <h2 className="text-4xl font-headline font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-200 to-transparent drop-shadow-sm">
                    Living Graph
                </h2>
            </div>

            {/* Stats Panel */}
            <div className="absolute top-6 right-6 z-10 flex flex-col gap-2 pointer-events-none fade-in slide-in-from-right-10 duration-700">
                <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-lg p-3 w-40">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Active Nodes</div>
                    <div className="text-2xl font-mono text-white">{stats.nodes}</div>
                </div>
                <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-lg p-3 w-40">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Synapses</div>
                    <div className="text-2xl font-mono text-cyan-400">{stats.connections}</div>
                </div>
                <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-lg p-3 w-40">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Data Packets</div>
                    <div className="text-2xl font-mono text-pink-400">{stats.packets}</div>
                </div>
            </div>

            {/* Canvas Layer */}
            <div ref={containerRef} className="w-full h-full cursor-crosshair relative z-0">
                <canvas ref={canvasRef} className="block w-full h-full" />
            </div>

            {/* Controls */}
            <div className="absolute bottom-6 left-6 z-10 flex gap-4">
                <Button
                    variant="outline"
                    size="sm"
                    className="bg-black/40 backdrop-blur-md border-white/10 hover:bg-white/10 text-xs"
                    onClick={handleReset}
                >
                    <RefreshCw className="w-3 h-3 mr-2" />
                    Reset Simulation
                </Button>
            </div>

            {/* Status Footer */}
            <div className="absolute bottom-6 right-6 z-10 flex items-center gap-3">
                <div className="h-px w-12 bg-gradient-to-r from-transparent to-green-500/50" />
                <span className="text-xs text-green-400 font-mono tracking-widest animate-pulse">NETWORK SYNCHRONIZED</span>
            </div>
        </Card>
    );
}

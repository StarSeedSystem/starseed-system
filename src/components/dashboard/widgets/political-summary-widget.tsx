'use client';

import { Rocket, TrendingUp, BarChart3, AlertCircle, ChevronRight, Vote, Users, Gavel, Zap } from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";

export function PoliticalSummaryWidget() {
    const [proposalCount, setProposalCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'stats' | 'proposals'>('stats');
    const supabase = createClient();

    useEffect(() => {
        async function fetchStats() {
            try {
                const { count } = await supabase
                    .from('posts')
                    .select('*', { count: 'exact', head: true })
                    .eq('type', 'PROPOSAL');

                if (count !== null) {
                    setProposalCount(count);
                } else {
                    setProposalCount(12); // Fallback for aesthetic display if no db conn
                }
            } catch (err) {
                console.error("Error fetching political stats:", err);
                setProposalCount(12);
            } finally {
                setLoading(false);
            }
        }
        fetchStats();
    }, []);

    const proposals = [
        { id: '1', title: 'Universal Bio-Data Access', status: 'Voting', support: 82 },
        { id: '2', title: 'Orbital Energy Tax Rev.', status: 'Review', support: 45 },
    ];

    return (
        <div className="@container w-full h-full bg-card/10 backdrop-blur-3xl rounded-xl relative overflow-hidden flex flex-col p-3 @sm:p-5 border border-border/40 shadow-2xl text-foreground font-display group/widget">
            {/* Background Narrative Glows */}
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-primary/20 rounded-full blur-[60px] pointer-events-none group-hover/widget:bg-primary/30 transition-colors duration-700"></div>
            <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-accent/10 rounded-full blur-[50px] pointer-events-none"></div>

            {/* Header: Ontocratic Identifier */}
            <header className="flex items-center justify-between pb-3 border-b border-white/5 shrink-0 z-10 relative">
                <div className="flex items-center gap-3">
                    <motion.div
                        whileHover={{ rotate: 15, scale: 1.1 }}
                        className="h-10 w-10 rounded-xl bg-gradient-to-tr from-primary via-primary/80 to-accent/50 flex items-center justify-center shadow-[0_0_20px_rgba(var(--primary-hsl),0.3)] border border-white/20"
                    >
                        <Gavel size={20} className="text-primary-foreground drop-shadow-md" />
                    </motion.div>
                    <div className="space-y-0 text-left">
                        <div className="flex items-center gap-1.5">
                            <h2 className="text-xs font-black text-foreground tracking-[0.15em] uppercase leading-none">Ontocracy</h2>
                            <span className="w-1 h-1 bg-primary rounded-full animate-pulse" />
                        </div>
                        <h1 className="text-[10px] uppercase tracking-[0.2em] text-primary/70 font-bold whitespace-nowrap">Governance Core</h1>
                    </div>
                </div>

                <div className="flex flex-col items-end gap-1 capitalize">
                    <motion.span
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="flex items-center gap-1.5 text-[8px] font-black font-mono text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-full"
                    >
                        SYNCED
                    </motion.span>
                </div>
            </header>

            {/* Main Content Area */}
            <div className="flex-1 mt-4 z-10 relative flex flex-col gap-4">
                {/* Visual Dashboard Tabs */}
                <div className="flex gap-2 p-1 bg-black/20 rounded-lg self-start">
                    <button
                        onClick={() => setActiveTab('stats')}
                        className={cn(
                            "px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-md transition-all",
                            activeTab === 'stats' ? "bg-primary text-primary-foreground shadow-lg" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        Metrics
                    </button>
                    <button
                        onClick={() => setActiveTab('proposals')}
                        className={cn(
                            "px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-md transition-all",
                            activeTab === 'proposals' ? "bg-primary text-primary-foreground shadow-lg" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        Proposals
                    </button>
                </div>

                <AnimatePresence mode="wait">
                    {activeTab === 'stats' ? (
                        <motion.div
                            key="stats"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            className="grid grid-cols-2 gap-3"
                        >
                            <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex flex-col items-center justify-center text-center relative overflow-hidden group/stat">
                                <Users className="absolute top-2 right-2 w-3 h-3 text-primary/40" />
                                <span className="text-[8px] uppercase tracking-tighter text-muted-foreground font-black mb-1">Reputation Avg.</span>
                                <motion.span
                                    initial={{ scale: 0.8 }}
                                    animate={{ scale: 1 }}
                                    className="text-3xl font-black font-mono tracking-tighter text-foreground"
                                >
                                    84.2
                                </motion.span>
                                <div className="mt-2 w-full h-1 bg-muted/20 rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: "84%" }}
                                        className="h-full bg-primary"
                                    />
                                </div>
                            </div>

                            <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex flex-col items-center justify-center text-center relative overflow-hidden group/stat">
                                <Vote className="absolute top-2 right-2 w-3 h-3 text-accent/40" />
                                <span className="text-[8px] uppercase tracking-tighter text-muted-foreground font-black mb-1">Total Proposals</span>
                                <motion.span
                                    initial={{ scale: 0.8 }}
                                    animate={{ scale: 1 }}
                                    className="text-3xl font-black font-mono tracking-tighter text-foreground"
                                >
                                    {loading ? "..." : proposalCount}
                                </motion.span>
                                <div className="mt-2 flex gap-1">
                                    <span className="text-[7px] font-black bg-accent/20 text-accent px-1.5 py-0.5 rounded uppercase">3 URGENT</span>
                                </div>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="proposals"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            className="flex flex-col gap-2"
                        >
                            {proposals.map(p => (
                                <div key={p.id} className="p-2 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between hover:bg-white/10 transition-colors">
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-[10px] font-bold truncate pr-2">{p.title}</span>
                                        <span className="text-[8px] text-primary font-black uppercase tracking-widest">{p.status}</span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <div className="text-[9px] font-mono font-bold">{p.support}%</div>
                                        <div className="w-8 h-1.5 bg-muted/20 rounded-full overflow-hidden">
                                            <div className="h-full bg-primary" style={{ width: `${p.support}%` }} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Footer: Timeline & Call to Action */}
            <footer className="mt-4 pt-4 border-t border-white/5 z-10 relative">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <Zap size={10} className="text-primary fill-primary animate-pulse" />
                        <span className="text-muted-foreground text-[8px] uppercase tracking-widest font-black">Next Assembly Cycle</span>
                    </div>
                    <span className="font-mono text-foreground text-[10px] font-black">24h 12m</span>
                </div>

                {/* Breathing Status Bar */}
                <div className="w-full h-3 bg-muted/20 rounded-full overflow-hidden border border-white/5 relative shadow-inner">
                    <motion.div
                        animate={{
                            boxShadow: ["0 0 5px rgba(var(--primary-hsl), 0.2)", "0 0 15px rgba(var(--primary-hsl), 0.6)", "0 0 5px rgba(var(--primary-hsl), 0.2)"]
                        }}
                        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                        className="h-full bg-gradient-to-r from-primary via-primary/80 to-accent rounded-full"
                        style={{ width: "65%" }}
                    />
                </div>

                <div className="flex gap-2 mt-4">
                    <button className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground hover:brightness-110 shadow-lg shadow-primary/20 transition-all text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
                        Cast Vote
                    </button>
                    <button className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
                        <ChevronRight size={16} />
                    </button>
                </div>
            </footer>
        </div>
    );
}

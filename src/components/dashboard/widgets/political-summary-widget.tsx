'use client';

import { Button } from "@/components/ui/button";
import { Rocket, TrendingUp, BarChart3, AlertCircle } from "lucide-react";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";

export function PoliticalSummaryWidget() {
    const [proposalCount, setProposalCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const supabase = createClient();

    useEffect(() => {
        async function fetchStats() {
            try {
                // Fetch count of posts with type = PROPOSAL
                // Note: Ensure your 'posts' table has 'type' column and 'PROPOSAL' is a valid enum value
                const { count, error } = await supabase
                    .from('posts')
                    .select('*', { count: 'exact', head: true })
                    .eq('type', 'PROPOSAL');

                if (count !== null) {
                    setProposalCount(count);
                }
            } catch (err) {
                console.error("Error fetching political stats:", err);
            } finally {
                setLoading(false);
            }
        }
        fetchStats();
    }, []);

    return (
        <div className="flex h-full flex-col p-4 bg-gradient-to-br from-card/50 to-background backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Rocket className="h-4 w-4 text-orange-500" />
                    <h3 className="text-sm font-semibold">Resumen Político</h3>
                </div>
                <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 text-[10px] font-mono text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded-full">
                        <TrendingUp className="h-3 w-3" /> +12%
                    </span>
                    <span className="text-[10px] font-mono bg-orange-500/10 text-orange-600 px-1.5 py-0.5 rounded-full ring-1 ring-orange-500/20">EN VIVO</span>
                </div>
            </div>

            <div className="flex-1 grid grid-cols-2 gap-4">
                {/* Stats Card 1 */}
                <div className="flex flex-col justify-center p-3 rounded-xl bg-orange-500/5 border border-orange-500/10 hover:border-orange-500/20 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground">Propuestas</span>
                        <BarChart3 className="h-3 w-3 text-orange-500" />
                    </div>
                    <span className="text-2xl font-bold font-mono">
                        {loading ? "..." : proposalCount}
                    </span>
                    <span className="text-[10px] text-muted-foreground mt-1">3 urgentes</span>
                </div>

                {/* Stats Card 2 */}
                <div className="flex flex-col justify-center p-3 rounded-xl bg-card border hover:border-primary/20 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground">Votaciones</span>
                        <AlertCircle className="h-3 w-3 text-blue-500" />
                    </div>
                    <span className="text-2xl font-bold font-mono">08</span>
                    <span className="text-[10px] text-muted-foreground mt-1">Pendientes</span>
                </div>
            </div>

            <div className="mt-4 pt-3 border-t border-dashed border-border/50">
                <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Próxima Asamblea:</span>
                    <span className="font-medium">Mañana, 16:00</span>
                </div>
                <div className="w-full bg-secondary h-1.5 rounded-full mt-2 overflow-hidden">
                    <div className="bg-orange-500 h-full w-[0%]" /> {/* Loading state or progress */}
                </div>
            </div>

            <Button variant="ghost" size="sm" className="w-full mt-3 text-xs h-7 hover:bg-orange-500/10 hover:text-orange-600">
                Ver Detalles
            </Button>
        </div>
    );
}

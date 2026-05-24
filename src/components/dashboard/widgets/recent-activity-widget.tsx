'use client';

import { History, FileEdit, Users, Zap, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function RecentActivityWidget() {
    const activities = [
        { id: 1, icon: FileEdit, text: "Editaste 'Jardines Comunitarios'", time: "Hace 2h", color: "text-blue-400 bg-blue-500/10 border-blue-500/30" },
        { id: 2, icon: Zap, text: "Nueva propuesta viral", time: "Hace 5h", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
        { id: 3, icon: Users, text: "Te uniste a 'Asamblea Norte'", time: "Ayer", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
        { id: 4, icon: CheckCircle2, text: "Tarea completada", time: "Ayer", color: "text-purple-400 bg-purple-500/10 border-purple-500/30" },
    ];

    return (
        <div className="@container w-full h-full bg-card/10 backdrop-blur-3xl rounded-xl relative overflow-hidden flex flex-col p-4 @sm:p-6 border border-border/40 shadow-2xl text-foreground font-display group">
            {/* Background Effects */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] bg-[conic-gradient(at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-accent/10 opacity-30 pointer-events-none group-hover:rotate-12 transition-transform duration-1000"></div>

            <header className="flex items-center justify-between pb-6 border-b border-border/10 shrink-0 z-10 relative">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-background/40 border border-border/10 flex items-center justify-center shadow-sm">
                        <History size={18} className="text-primary animate-pulse" />
                    </div>
                    <div>
                        <h2 className="text-[10px] @sm:text-xs font-black text-foreground tracking-[0.3em] uppercase">Chronicle</h2>
                        <p className="text-muted-foreground text-[8px] font-bold uppercase tracking-widest mt-0.5">Recent Cycle Log</p>
                    </div>
                </div>
            </header>

            <main className="flex-1 space-y-6 overflow-y-auto mt-6 pr-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent z-10 relative">
                {activities.map((activity, index) => (
                    <div key={activity.id} className="relative pl-10 pb-2 last:pb-0 group/item">
                        {/* Timeline line */}
                        {index !== activities.length - 1 && (
                            <div className="absolute left-[15px] top-8 bottom-[-10px] w-0.5 bg-border/20 group-hover/item:bg-primary/30 transition-colors" />
                        )}

                        {/* Timeline dot */}
                        <div className={cn(
                            "absolute left-0 top-1 h-8 w-8 rounded-xl border flex items-center justify-center z-10 shadow-sm transition-all duration-300 group-hover/item:scale-110 group-hover/item:shadow-[0_0_15px_rgba(var(--primary-hsl),0.3)]",
                            activity.id === 1 ? "bg-blue-500/10 border-blue-500/30 text-blue-500" :
                                activity.id === 2 ? "bg-amber-500/10 border-amber-500/30 text-amber-500" :
                                    activity.id === 3 ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" :
                                        "bg-purple-500/10 border-purple-500/30 text-purple-500"
                        )}>
                            <activity.icon className="h-4 w-4" />
                        </div>

                        <div className="flex flex-col pt-1 group-hover/item:translate-x-1 transition-transform">
                            <span className="text-sm font-black text-foreground/90 tracking-tight">{activity.text}</span>
                            <span className="text-[10px] text-muted-foreground/60 font-bold uppercase tracking-widest mt-1">{activity.time}</span>
                        </div>
                    </div>
                ))}
            </main>

            {/* Decorative Liquid Accents */}
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[80px] pointer-events-none"></div>
        </div>
    );
}

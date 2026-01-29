'use client';

import { History, FileEdit, Users, Zap, CheckCircle2 } from "lucide-react";

export function RecentActivityWidget() {
    const activities = [
        { id: 1, icon: FileEdit, text: "Editaste 'Jardines Comunitarios'", time: "Hace 2h", color: "text-blue-500" },
        { id: 2, icon: Zap, text: "Nueva propuesta viral", time: "Hace 5h", color: "text-yellow-500" },
        { id: 3, icon: Users, text: "Te uniste a 'Asamblea Norte'", time: "Ayer", color: "text-green-500" },
        { id: 4, icon: CheckCircle2, text: "Tarea completada", time: "Ayer", color: "text-purple-500" },
    ];

    return (
        <div className="flex h-full flex-col p-5 bg-card/40 backdrop-blur-md border border-white/5 rounded-xl">
            <div className="flex items-center gap-2 mb-4">
                <History className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Actividad Reciente</h3>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto pr-1">
                {activities.map((activity, index) => (
                    <div key={activity.id} className="relative pl-6 pb-2 last:pb-0">
                        {/* Timeline line */}
                        {index !== activities.length - 1 && (
                            <div className="absolute left-[9px] top-6 bottom-[-10px] w-px bg-border/50" />
                        )}

                        {/* Timeline dot */}
                        <div className="absolute left-0 top-1 h-5 w-5 rounded-full bg-background border border-border flex items-center justify-center z-10">
                            <activity.icon className={`h-3 w-3 ${activity.color}`} />
                        </div>

                        <div className="flex flex-col">
                            <span className="text-sm font-medium">{activity.text}</span>
                            <span className="text-xs text-muted-foreground">{activity.time}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

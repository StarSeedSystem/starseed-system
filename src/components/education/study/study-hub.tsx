"use client";

// src/components/education/study/study-hub.tsx
// Shell del "Estudio con Aurora" (Adenda 66 §9): grupos de estudio, guías
// inteligentes + itinerarios, exámenes con insignias, y tareas + proyectos.
// Se monta como pestaña de la sección Educación. Todo aditivo y opcional.

import { useState } from "react";
import { Users, BookMarked, GraduationCap, ListChecks, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { StudyGroupsPanel } from "@/components/education/study/study-groups-panel";
import { StudyGuidesPanel } from "@/components/education/study/study-guides-panel";
import { StudyExamsPanel } from "@/components/education/study/study-exams-panel";
import { StudyTasksPanel } from "@/components/education/study/study-tasks-panel";

type StudyTab = "grupos" | "guias" | "examenes" | "tareas";

const TABS: { id: StudyTab; label: string; icon: typeof Users }[] = [
    { id: "guias", label: "Guías e itinerarios", icon: BookMarked },
    { id: "examenes", label: "Exámenes", icon: GraduationCap },
    { id: "grupos", label: "Grupos de estudio", icon: Users },
    { id: "tareas", label: "Tareas y proyectos", icon: ListChecks },
];

export function StudyHub() {
    const [tab, setTab] = useState<StudyTab>("guias");

    return (
        <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-500/[0.06] to-transparent p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-400/40 bg-violet-500/10 text-violet-200">
                    <Sparkles className="h-5 w-5" />
                </span>
                <div>
                    <h2 className="text-base font-semibold text-white/90">Estudio con Aurora</h2>
                    <p className="text-sm text-muted-foreground">
                        Aprende a tu ritmo: guías e itinerarios generados por Aurora, exámenes opcionales que otorgan
                        insignias reales, grupos de estudio con chat en vivo, y tus tareas y proyectos. Todo libre y opcional.
                    </p>
                </div>
            </div>

            {/* Sub-navegación */}
            <div className="flex flex-wrap gap-1 rounded-2xl border border-white/10 bg-black/30 p-1">
                {TABS.map((t) => {
                    const Icon = t.icon;
                    const active = tab === t.id;
                    return (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={cn(
                                "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition sm:text-sm",
                                active ? "bg-violet-500/20 text-violet-100" : "text-white/55 hover:bg-white/5 hover:text-white/80",
                            )}
                        >
                            <Icon className="h-4 w-4" />
                            <span className="whitespace-nowrap">{t.label}</span>
                        </button>
                    );
                })}
            </div>

            <div className="animate-in fade-in-50 duration-300">
                {tab === "guias" && <StudyGuidesPanel />}
                {tab === "examenes" && <StudyExamsPanel />}
                {tab === "grupos" && <StudyGroupsPanel />}
                {tab === "tareas" && <StudyTasksPanel />}
            </div>
        </div>
    );
}

export default StudyHub;

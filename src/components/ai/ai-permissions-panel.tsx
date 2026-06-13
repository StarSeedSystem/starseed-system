"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
    ShieldCheck, Bot, Cpu, Eye, Layers, Palette, Brain, Network, Code,
    Boxes, RotateCcw, Lock, ChevronRight, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAiPermissions } from "@/ai/client/use-ai-permissions";
import { PERMISSION_SCOPES, type AiActor, type ScopeMeta } from "@/ai/client/ai-permissions";

// ════════════════════════════════════════════════════════════════
// AiPermissionsPanel — control de accesos del Asistente (Astraura) y
// del Nexo al sistema del usuario. Por defecto: acceso completo al
// PROPIO entorno (editable). Límite constitucional: la red y los datos
// de otros no se alteran salvo permiso (scope `net.write`, marcado).
// ════════════════════════════════════════════════════════════════

const GROUP_META: Record<ScopeMeta["group"], { label: string; icon: LucideIcon; accent: string }> = {
    lectura: { label: "Lectura y navegación", icon: Eye, accent: "#38bdf8" },
    entorno: { label: "Tu entorno (editable)", icon: Layers, accent: "#10b981" },
    inteligencia: { label: "Inteligencia y agentes", icon: Brain, accent: "#a855f7" },
    red: { label: "Red (con límites)", icon: Network, accent: "#f59e0b" },
};

const SCOPE_ICON: Record<string, LucideIcon> = {
    "read.system": Eye, "act.navigate": ChevronRight, "edit.widgets": Boxes,
    "edit.dashboards": Layers, "edit.layout": Layers, "edit.appearance": Palette,
    "edit.code": Code, "edit.memory": Brain, "manage.agents": Bot,
    "manage.providers": Cpu, "net.read": Network, "net.write": Lock,
};

function Toggle({ on, onClick, accent, disabled }: { on: boolean; onClick: () => void; accent: string; disabled?: boolean }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={cn(
                "relative h-5 w-9 shrink-0 rounded-full border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed",
                on ? "border-transparent" : "border-border/50 bg-muted/30"
            )}
            style={on ? { background: accent } : undefined}
            aria-pressed={on}
        >
            <motion.span
                className="absolute top-0.5 size-3.5 rounded-full bg-white shadow"
                animate={{ left: on ? 18 : 2 }}
                transition={{ type: "spring", stiffness: 500, damping: 32 }}
            />
        </button>
    );
}

export function AiPermissionsPanel({ defaultActor = "assistant" }: { defaultActor?: AiActor }) {
    const [actor, setActor] = useState<AiActor>(defaultActor);
    const { state, setScope, setComplexAccess, setMaxAgents, reset } = useAiPermissions(actor);

    if (!state) {
        return <div className="h-40 rounded-2xl bg-muted/15 animate-pulse" />;
    }

    const groups = (["lectura", "entorno", "inteligencia", "red"] as ScopeMeta["group"][]).map((g) => ({
        group: g,
        meta: GROUP_META[g],
        scopes: PERMISSION_SCOPES.filter((s) => s.group === g),
    }));

    return (
        <div className="flex flex-col gap-4">
            {/* Selector de actor */}
            <div className="flex items-center gap-2">
                {(["assistant", "nexus"] as AiActor[]).map((a) => {
                    const active = actor === a;
                    const Icon = a === "assistant" ? Bot : Cpu;
                    return (
                        <button
                            key={a}
                            onClick={() => setActor(a)}
                            className={cn(
                                "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer",
                                active ? "border-primary/40 bg-primary/10 text-primary" : "border-border/40 text-muted-foreground/70 hover:text-foreground"
                            )}
                        >
                            <Icon className="size-3.5" /> {a === "assistant" ? "Asistente (Astraura)" : "Nexo"}
                        </button>
                    );
                })}
                <button
                    onClick={reset}
                    className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border/40 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer"
                    title="Restablecer a acceso completo del propio entorno"
                >
                    <RotateCcw className="size-3" /> Restablecer
                </button>
            </div>

            {/* Acceso complejo (maestro) */}
            <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 to-primary/[0.02] p-4">
                <div className="flex items-start gap-3">
                    <div className="shrink-0 grid place-items-center size-10 rounded-2xl border border-primary/30 bg-primary/15">
                        <ShieldCheck className="size-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                            <h4 className="text-sm font-black">Acceso complejo al sistema</h4>
                            <Toggle on={state.complexAccess} onClick={() => setComplexAccess(!state.complexAccess)} accent="hsl(var(--primary))" />
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/70">
                            Por defecto activado: esta IA puede leer y <strong>modificar tu propio entorno</strong> (widgets, dashboards, interfaz, apariencia, memoria) y orquestar agentes. Los fundamentos del sistema y de la red, y los datos de otros usuarios, permanecen protegidos por la Constitución StarSeed.
                        </p>
                    </div>
                </div>
            </div>

            {/* Grupos de scopes */}
            <div className="grid gap-3 @md:grid-cols-2">
                {groups.map(({ group, meta, scopes }) => {
                    const GIcon = meta.icon;
                    return (
                        <div key={group} className="rounded-2xl border border-border/40 bg-white/[0.02] p-3">
                            <div className="flex items-center gap-1.5 mb-2">
                                <GIcon className="size-3.5" style={{ color: meta.accent }} />
                                <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: meta.accent }}>{meta.label}</span>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                {scopes.map((s) => {
                                    const SIcon = SCOPE_ICON[s.id] ?? Eye;
                                    const isEditOrManage = s.id.startsWith("edit.") || s.id.startsWith("manage.");
                                    const blockedByMaster = !state.complexAccess && isEditOrManage;
                                    const on = state.scopes[s.id] && !blockedByMaster;
                                    return (
                                        <div key={s.id} className="flex items-center gap-2 rounded-xl border border-border/30 bg-white/[0.01] px-2.5 py-1.5">
                                            <SIcon className="size-3.5 shrink-0 text-muted-foreground/60" />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1">
                                                    <span className="text-[11px] font-bold truncate">{s.label}</span>
                                                    {s.constrained && <Lock className="size-2.5 text-amber-400 shrink-0" />}
                                                </div>
                                                <p className="text-[9px] text-muted-foreground/55 leading-snug line-clamp-2">{s.description}</p>
                                            </div>
                                            <Toggle on={on} onClick={() => setScope(s.id, !state.scopes[s.id])} accent={meta.accent} disabled={blockedByMaster} />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Máximo de agentes */}
            <div className="rounded-2xl border border-border/40 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold">
                        <Boxes className="size-3.5 text-violet-400" /> Agentes simultáneos máximos
                    </span>
                    <span className="text-sm font-black tabular-nums text-violet-300">{state.maxAgents}</span>
                </div>
                <input
                    type="range" min={0} max={32} value={state.maxAgents}
                    onChange={(e) => setMaxAgents(Number(e.target.value))}
                    className="w-full accent-violet-500 cursor-pointer"
                />
                <p className="mt-1 text-[9px] text-muted-foreground/55">Cuántos agentes/subagentes puede desplegar esta IA a la vez para ejecutar tus peticiones.</p>
            </div>
        </div>
    );
}

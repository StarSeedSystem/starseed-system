// src/components/mando/vista-publica-mando.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Vista pública del Mando de un ámbito (contrato puente-mando-para-todos.md §5
// y §7). Pinta SOLO lo que la lista blanca de `vistaPublica` permite: nombre,
// olas con su avance, integradas recientes, salud del motor («vivo hace N min»)
// y el canal público del chat en solo lectura. Con `null` no pinta nada.
// ─────────────────────────────────────────────────────────────────────────────
"use client";

import React from "react";
import { Activity, CheckCircle2, MessageSquare, Waves } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Progress } from "@/components/ui/progress";
import type { VistaPublica } from "@/lib/mando/vista-publica";

export interface VistaPublicaMandoProps {
    /** Resultado de `vistaPublica(estado)`; `null` (ámbito no público) → nada. */
    vista: VistaPublica | null;
}

function textoMotor(vista: VistaPublica): string {
    if (vista.motor.estado !== "corriendo") return `Motor ${vista.motor.estado}`;
    if (vista.motor.haceMin <= 0) return "Motor vivo ahora mismo";
    if (vista.motor.haceMin === 1) return "Motor vivo hace 1 min";
    return `Motor vivo hace ${vista.motor.haceMin} min`;
}

export function VistaPublicaMando({ vista }: VistaPublicaMandoProps) {
    if (!vista) return null;

    return (
        <div className="space-y-6" data-testid="vista-publica-mando">
            <header className="space-y-1">
                <h2 className="font-headline text-lg font-semibold leading-tight">
                    Mando de {vista.nombre}
                </h2>
                <p className="text-xs text-muted-foreground">
                    Avance medio de las olas: {Math.round(vista.avanceMedio * 100)} %
                </p>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Activity className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
                    {textoMotor(vista)}
                </p>
            </header>

            <GlassCard className="p-[clamp(1rem,2.5vw,1.5rem)] space-y-4">
                <h3 className="flex items-center gap-2 font-headline text-base font-semibold">
                    <Waves className="h-4 w-4" aria-hidden /> Olas en marcha
                </h3>
                {vista.olas.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin olas activas ahora mismo.</p>
                ) : (
                    vista.olas.map((ola, i) => (
                        <div key={i} className="space-y-1.5">
                            <div className="flex items-center justify-between text-sm">
                                <span className="font-medium">{ola.nombre}</span>
                                <span className="tabular-nums text-muted-foreground">
                                    {Math.round(ola.avance * 100)} %
                                </span>
                            </div>
                            <Progress value={Math.round(ola.avance * 100)} />
                        </div>
                    ))
                )}
            </GlassCard>

            <GlassCard className="p-[clamp(1rem,2.5vw,1.5rem)] space-y-3">
                <h3 className="flex items-center gap-2 font-headline text-base font-semibold">
                    <CheckCircle2 className="h-4 w-4" aria-hidden /> Integradas recientes
                </h3>
                {vista.integradas.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aún no hay tareas integradas.</p>
                ) : (
                    <ul className="space-y-1.5 text-sm">
                        {vista.integradas.slice(0, 10).map((t, i) => (
                            <li key={i} className="flex items-baseline justify-between gap-3">
                                <span className="font-medium truncate">{t.titulo}</span>
                                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                                    {t.fecha.slice(0, 10)}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </GlassCard>

            <GlassCard className="p-[clamp(1rem,2.5vw,1.5rem)] space-y-3">
                <h3 className="flex items-center gap-2 font-headline text-base font-semibold">
                    <MessageSquare className="h-4 w-4" aria-hidden /> Canal público
                </h3>
                {vista.chat.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin mensajes en el canal público.</p>
                ) : (
                    <ul className="space-y-2 text-sm">
                        {vista.chat.map((m, i) => (
                            <li key={i}>
                                <span className="font-medium">{m.autor}:</span>{" "}
                                <span className="text-foreground/80">{m.texto}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </GlassCard>
        </div>
    );
}

export default VistaPublicaMando;

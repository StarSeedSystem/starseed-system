"use client";

/*
 * Modal reutilizable de "ejemplo en vivo" para los grupos de ajustes de
 * apariencia. Muestra una vista previa de los elementos afectados (botones,
 * tarjetas, tipografía…) aplicando el config actual, junto a una explicación
 * clara de qué modifica el grupo y cómo. Estética cristal coherente con el
 * design system (bordes redondeados, hsl(var(--primary)), backdrop-blur).
 *
 * Uso:
 *   <SettingExampleModal
 *     trigger={<button>…</button>}
 *     title="Tipografía"
 *     description="Controla la fuente y el tamaño base de todo el sistema."
 *     points={["Afecta a títulos, párrafos y botones", "Se guarda al instante"]}
 *   >
 *     <PreviewContent />
 *   </SettingExampleModal>
 */

import React from "react";
import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

export interface SettingExampleModalProps {
    /** Título del grupo de ajustes. */
    title: string;
    /** Explicación breve de qué controla este grupo. */
    description: string;
    /** Vista previa en vivo (elementos afectados con el config actual). */
    children: React.ReactNode;
    /** Disparador opcional; si no se pasa, se usa un botón "ojo" por defecto. */
    trigger?: React.ReactNode;
    /** Puntos explicativos extra ("qué modifica y cómo"). */
    points?: string[];
    /** className opcional para el contenido del diálogo. */
    className?: string;
}

export function SettingExampleModal({
    title,
    description,
    children,
    trigger,
    points,
    className,
}: SettingExampleModalProps) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                {trigger ?? (
                    <button
                        type="button"
                        aria-label={`Ver ejemplo en vivo: ${title}`}
                        title="Ver ejemplo en vivo"
                        className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-border/60 bg-card/40 text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/10 transition-colors cursor-pointer shrink-0"
                    >
                        <Eye className="w-3.5 h-3.5" />
                    </button>
                )}
            </DialogTrigger>
            <DialogContent className={cn("max-w-xl", className)}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 text-primary">
                            <Eye className="w-4 h-4" />
                        </span>
                        <span className="truncate">{title}</span>
                    </DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>

                {/* Vista previa en vivo */}
                <div className="rounded-2xl border border-border/60 bg-card/30 backdrop-blur-md p-4 overflow-hidden">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
                        Vista previa en vivo
                    </p>
                    <div className="min-w-0">{children}</div>
                </div>

                {/* Qué modifica y cómo */}
                {points && points.length > 0 && (
                    <ul className="space-y-1.5 mt-1">
                        {points.map((p, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-primary/70 shrink-0" />
                                <span className="leading-relaxed">{p}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </DialogContent>
        </Dialog>
    );
}

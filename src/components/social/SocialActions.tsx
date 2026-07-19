// src/components/social/SocialActions.tsx
"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { useSocialState, type SocialAction } from "@/hooks/use-social-state";
import { Check, Plus, Share2, UserPlus, CalendarCheck, Star, Send, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<SocialAction, LucideIcon> = {
    follow: UserPlus,
    join: Plus,
    request: Send,
    attend: CalendarCheck,
    interested: Star,
};

const LABELS: Record<SocialAction, { idle: string; active: string }> = {
    follow: { idle: "Seguir", active: "Siguiendo" },
    join: { idle: "Unirme", active: "Miembro" },
    request: { idle: "Solicitar unirse", active: "Solicitud enviada" },
    attend: { idle: "Asistiré", active: "Asistiré ✓" },
    interested: { idle: "Me interesa", active: "Interesado/a" },
};

/**
 * Botón de acción social real con persistencia en localStorage y feedback visual.
 * `entityKey` debe ser único por entidad (ej. el id de la página/grupo/evento).
 * `count` (opcional) se incrementa/decrementa visualmente según el estado.
 */
export function SocialActionButton({
    action,
    entityKey,
    accent,
    count,
    className,
    size = "default",
}: {
    action: SocialAction;
    entityKey: string;
    accent?: string;
    count?: number;
    className?: string;
    size?: "default" | "sm" | "lg";
}) {
    const { active, toggle } = useSocialState(action, entityKey);
    const Icon = active ? Check : ICONS[action];
    const label = active ? LABELS[action].active : LABELS[action].idle;

    const displayCount =
        typeof count === "number" ? count + (active ? 1 : 0) : undefined;

    return (
        <Button
            type="button"
            size={size}
            variant={active ? "outline" : "default"}
            onClick={toggle}
            className={cn("gap-2 cursor-pointer transition-all", className)}
            style={
                active
                    ? { borderColor: accent ? `${accent}88` : undefined, color: accent }
                    : accent
                      ? { background: accent, color: "#0b0b12", borderColor: accent }
                      : undefined
            }
            aria-pressed={active}
        >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
            {typeof displayCount === "number" && (
                <span className="tabular-nums opacity-80">
                    · {displayCount.toLocaleString("es-ES")}
                </span>
            )}
        </Button>
    );
}

/** Botón de compartir: navigator.share con fallback a copiar enlace. */
export function ShareButton({
    title,
    accent,
    size = "default",
    className,
}: {
    title?: string;
    accent?: string;
    size?: "default" | "sm" | "lg";
    className?: string;
}) {
    const [copied, setCopied] = useState(false);

    const handleShare = async () => {
        const url = typeof window !== "undefined" ? window.location.href : "";
        try {
            if (typeof navigator !== "undefined" && navigator.share) {
                await navigator.share({ title: title || "StarSeed", url });
            } else if (typeof navigator !== "undefined" && navigator.clipboard) {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
            }
        } catch {
            /* el usuario canceló el diálogo nativo */
        }
    };

    return (
        <Button
            type="button"
            size={size}
            variant="outline"
            onClick={handleShare}
            className={cn("gap-2 cursor-pointer", className)}
            style={accent ? { borderColor: `${accent}55` } : undefined}
        >
            {copied ? (
                <>
                    <Check className="h-4 w-4 text-emerald-500" />
                    <span>Enlace copiado</span>
                </>
            ) : (
                <>
                    <Share2 className="h-4 w-4" />
                    <span>Compartir</span>
                </>
            )}
        </Button>
    );
}

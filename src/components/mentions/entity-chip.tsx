"use client";

// src/components/mentions/entity-chip.tsx
// ─────────────────────────────────────────────────────────────────────────────
// EntityChip · representación visual (glass) de una mención estructurada.
//
// Renderiza `{ type, id, label }` como un chip inline con icono por tipo, el
// símbolo del disparador (@ mención / # etiqueta) y, opcionalmente, un enlace
// in-app y un botón para quitarla. Aditivo y autónomo (no toca el composer).
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import {
    User,
    IdCard,
    Users,
    Users2,
    Flag,
    FileText,
    MessageSquare,
    LayoutDashboard,
    CalendarDays,
    Award,
    ScrollText,
    BookOpen,
    Library,
    Cpu,
    Sparkles,
    X,
} from "lucide-react";
import {
    ENTITY_META,
    type EntityType,
    type MentionTrigger,
    type Mention,
} from "@/lib/mentions/mentions";

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
    User,
    IdCard,
    Users,
    Users2,
    Flag,
    FileText,
    MessageSquare,
    LayoutDashboard,
    CalendarDays,
    Award,
    ScrollText,
    BookOpen,
    Library,
    Cpu,
    Sparkles,
};

function ChipIcon({ type, className }: { type: EntityType; className?: string }) {
    const name = ENTITY_META[type]?.icon ?? "Sparkles";
    const C = ICONS[name] ?? Sparkles;
    return <C className={className} />;
}

export interface EntityChipProps {
    type: EntityType;
    id: string;
    label: string;
    /** `@` (mención) o `#` (etiqueta). Por defecto `@`. */
    trigger?: MentionTrigger;
    /** Si se pasa, muestra una X para quitar el chip. */
    onRemove?: () => void;
    /** Si true, envuelve el chip en un enlace in-app (cuando hay href). */
    linked?: boolean;
    className?: string;
}

/**
 * Chip de una entidad mencionada. Estilo "glass" alineado al composer (ámbar).
 * El símbolo (@/#) precede a la etiqueta; el color varía sutilmente por trigger.
 */
export default function EntityChip({
    type,
    id,
    label,
    trigger = "@",
    onRemove,
    linked = false,
    className,
}: EntityChipProps) {
    const meta = ENTITY_META[type];
    const href = linked && meta?.hrefBase ? `${meta.hrefBase}/${encodeURIComponent(id)}` : undefined;
    const isTag = trigger === "#";

    const inner = (
        <span
            className={cn(
                "inline-flex max-w-[16rem] items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium align-baseline transition-colors",
                isTag
                    ? "border-sky-400/40 bg-sky-400/10 text-sky-100 hover:border-sky-300/60"
                    : "border-amber-400/40 bg-amber-400/10 text-amber-100 hover:border-amber-300/60",
                className,
            )}
            title={`${trigger}${label} · ${meta?.label ?? type}`}
        >
            <span className={cn("shrink-0 font-bold", isTag ? "text-sky-300" : "text-amber-300")}>
                {trigger}
            </span>
            <ChipIcon type={type} className="h-3 w-3 shrink-0 opacity-80" />
            <span className="truncate">{label}</span>
            {onRemove && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onRemove();
                    }}
                    className="ml-0.5 shrink-0 rounded-full p-0.5 text-white/50 hover:bg-white/10 hover:text-white"
                    aria-label={`Quitar ${label}`}
                >
                    <X className="h-3 w-3" />
                </button>
            )}
        </span>
    );

    if (href) {
        return (
            <Link href={href} className="no-underline">
                {inner}
            </Link>
        );
    }
    return inner;
}

/** Conveniencia: renderiza un chip a partir de una `Mention`. */
export function MentionChip({
    mention,
    onRemove,
    linked,
}: {
    mention: Mention;
    onRemove?: () => void;
    linked?: boolean;
}) {
    return (
        <EntityChip
            type={mention.type}
            id={mention.id}
            label={mention.label}
            trigger={mention.kind}
            onRemove={onRemove}
            linked={linked}
        />
    );
}

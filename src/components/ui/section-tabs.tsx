"use client";

// ─────────────────────────────────────────────────────────────────────────────
// SectionTabs — patrón ÚNICO de pestañas/segmented-control del OS (Adenda 66 §10).
//
// Un solo lenguaje de menús para todas las áreas (Hub, Red, ajustes, cerebro…):
//   · Scroll-x limpio: `.scrollbar-hide` + máscara de fundido lateral + snap.
//   · Redondeo consistente (píldoras dentro de una barra glass), estado activo
//     claro (color primario tokenizado — o el `accent` opcional del item),
//     responsive y accesible por teclado
//     (role=tablist + roving tabindex con ← → Inicio/Fin).
//   · Dos modos: CONTROLADO (`value`/`onValueChange`, para pestañas en página)
//     y NAVEGACIÓN (`href` por item, para moverse entre rutas).
//
// No sustituye a `@/components/ui/tabs` (Radix): se puede usar como su `TabsList`
// cuando el `Tabs` raíz está controlado (value = estado propio). Estética
// Crystal Liquid Glass. Sin dependencias nuevas.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tono del estado ACTIVO de un item (Adenda 149 · ola 2 · §2.13). Opcional:
 * SIN `accent` el item se pinta exactamente igual que siempre (color primario
 * tokenizado), así los carriles ya existentes del OS no cambian ni un píxel.
 */
export type SectionTabAccent = "cyan" | "amber" | "fuchsia" | "violet" | "emerald";

export interface SectionTabItem {
    /** Identificador único (modo controlado). Ignorado si se define `href`. */
    value?: string;
    label: string;
    icon?: LucideIcon;
    /** Si se define, el item NAVEGA (Link) en lugar de seleccionar. */
    href?: string;
    /** Contador/insignia opcional a la derecha (números reales, no inventados). */
    badge?: React.ReactNode;
    /** Marca activo un item de navegación (por ruta). En modo controlado se ignora. */
    active?: boolean;
    /** Tooltip. */
    title?: string;
    /**
     * Tono del estado activo. Sin definir → `primary` (comportamiento previo,
     * idéntico). Con él, cada pestaña puede llevar el acento de SU sistema
     * (p.ej. LLM cian · Astraura ámbar · OpenVoice fucsia · Cerebro violeta ·
     * Señales esmeralda en la ventana 149).
     */
    accent?: SectionTabAccent;
}

/** Clases del estado ACTIVO por tono (píldora + icono). */
const ACCENT_ACTIVE: Record<SectionTabAccent, { pill: string; icon: string }> = {
    cyan: {
        pill: "border-cyan-400/45 bg-cyan-500/15 text-cyan-100 shadow-[0_0_12px_rgba(34,211,238,0.18)]",
        icon: "text-cyan-300",
    },
    amber: {
        pill: "border-amber-400/45 bg-amber-500/15 text-amber-100 shadow-[0_0_12px_rgba(251,191,36,0.18)]",
        icon: "text-amber-300",
    },
    fuchsia: {
        pill: "border-fuchsia-400/45 bg-fuchsia-500/15 text-fuchsia-100 shadow-[0_0_12px_rgba(232,121,249,0.18)]",
        icon: "text-fuchsia-300",
    },
    violet: {
        pill: "border-violet-400/45 bg-violet-500/15 text-violet-100 shadow-[0_0_12px_rgba(167,139,250,0.18)]",
        icon: "text-violet-300",
    },
    emerald: {
        pill: "border-emerald-400/45 bg-emerald-500/15 text-emerald-100 shadow-[0_0_12px_rgba(52,211,153,0.18)]",
        icon: "text-emerald-300",
    },
};

/** Estado activo por defecto (color primario del tema): el de SIEMPRE. */
const PRIMARY_ACTIVE = {
    pill: "border-primary/40 bg-primary/15 text-primary shadow-[0_0_12px_rgba(var(--primary-rgb),0.15)]",
    icon: "text-primary",
};

export interface SectionTabsProps {
    items: SectionTabItem[];
    /** Valor activo (modo controlado). */
    value?: string;
    onValueChange?: (value: string) => void;
    className?: string;
    /** Etiqueta accesible del grupo de pestañas. */
    ariaLabel?: string;
    /** Densidad visual. */
    size?: "sm" | "md";
}

export function SectionTabs({
    items,
    value,
    onValueChange,
    className,
    ariaLabel,
    size = "md",
}: SectionTabsProps) {
    const listRef = React.useRef<HTMLDivElement>(null);

    const isActive = (it: SectionTabItem) =>
        it.href ? Boolean(it.active) : it.value != null && it.value === value;

    // La pestaña activa SIEMPRE visible: si está fuera del carril (típico en móvil,
    // donde solo caben 3-4 de 12), se trae a la vista. Sin esto, cambiar de pestaña
    // desde otro sitio dejaba el carril mostrando una selección invisible.
    React.useEffect(() => {
        const list = listRef.current;
        if (!list) return;
        const active = list.querySelector<HTMLElement>('[aria-selected="true"]');
        if (!active) return;
        const lr = list.getBoundingClientRect();
        const ar = active.getBoundingClientRect();
        if (ar.left < lr.left || ar.right > lr.right) {
            active.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
        }
    }, [value, items.length]);

    // Roving tabindex: ← → Inicio/Fin mueven foco (y selección en modo controlado).
    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const NAV = ["ArrowRight", "ArrowLeft", "Home", "End"];
        if (!NAV.includes(e.key)) return;
        const nodes = Array.from(
            listRef.current?.querySelectorAll<HTMLElement>("[data-section-tab]") ?? [],
        );
        if (nodes.length === 0) return;
        const current = nodes.findIndex((n) => n === document.activeElement);
        let next = current;
        if (e.key === "ArrowRight") next = current < 0 ? 0 : (current + 1) % nodes.length;
        else if (e.key === "ArrowLeft") next = current <= 0 ? nodes.length - 1 : current - 1;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = nodes.length - 1;
        e.preventDefault();
        const target = nodes[next];
        target?.focus();
        target?.scrollIntoView({ block: "nearest", inline: "nearest" });
        const val = target?.getAttribute("data-value");
        if (val && onValueChange) onValueChange(val);
    };

    return (
        // `min-w-0` es OBLIGATORIO: este componente casi siempre vive dentro de un
        // hijo de flex/grid, cuyo `min-width: auto` por defecto haría que el
        // contenedor CREZCA hasta el ancho intrínseco de las pestañas en vez de
        // dejar que el carril haga scroll → las pestañas de la derecha quedan
        // INALCANZABLES (el mismo patrón que ya rompió el dock). Ver Adenda 68 §C.
        <div className={cn("relative w-full min-w-0", className)}>
            {/* Máscara de fundido lateral (indica que hay más pestañas al hacer scroll). */}
            <div
                className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 rounded-l-2xl bg-gradient-to-r from-black/25 to-transparent"
                aria-hidden
            />
            <div
                className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 rounded-r-2xl bg-gradient-to-l from-black/25 to-transparent"
                aria-hidden
            />

            <div
                ref={listRef}
                role="tablist"
                aria-label={ariaLabel}
                onKeyDown={onKeyDown}
                className="flex w-full min-w-0 items-center gap-1.5 overflow-x-auto overscroll-x-contain scrollbar-hide snap-x scroll-px-2 rounded-2xl border border-white/10 bg-black/25 p-1.5 shadow-lg backdrop-blur-md"
            >
                {items.map((it, i) => {
                    const active = isActive(it);
                    const Icon = it.icon;
                    // Sin `accent` → EXACTAMENTE las clases previas (primary).
                    const skin = (it.accent && ACCENT_ACTIVE[it.accent]) || PRIMARY_ACTIVE;
                    const cls = cn(
                        "group/tab relative inline-flex shrink-0 snap-start cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary/50",
                        // Área táctil ≥44px en móvil (WCAG 2.5.5 / HIG); en pantallas
                        // con ratón se compacta para no malgastar altura.
                        size === "sm"
                            ? "min-h-[2.25rem] px-3 py-1.5 text-xs sm:min-h-0"
                            : "min-h-[2.75rem] px-3.5 py-2 text-[13px] sm:min-h-[2.25rem]",
                        active
                            ? skin.pill
                            : "border-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground",
                    );
                    const inner = (
                        <>
                            {Icon && (
                                <Icon
                                    className={cn(
                                        "h-4 w-4 shrink-0 transition-colors",
                                        active
                                            ? skin.icon
                                            : "text-muted-foreground group-hover/tab:text-foreground",
                                    )}
                                />
                            )}
                            <span className="truncate">{it.label}</span>
                            {it.badge != null && it.badge !== "" && (
                                <span className="ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-white/10 px-1.5 text-[10px] font-bold text-foreground/80">
                                    {it.badge}
                                </span>
                            )}
                        </>
                    );

                    if (it.href) {
                        return (
                            <Link
                                key={i}
                                href={it.href}
                                title={it.title ?? it.label}
                                role="tab"
                                aria-selected={active}
                                tabIndex={active ? 0 : -1}
                                data-section-tab
                                data-value={it.value ?? undefined}
                                className={cls}
                            >
                                {inner}
                            </Link>
                        );
                    }

                    return (
                        <button
                            key={i}
                            type="button"
                            title={it.title ?? it.label}
                            role="tab"
                            aria-selected={active}
                            tabIndex={active ? 0 : -1}
                            data-section-tab
                            data-value={it.value}
                            onClick={() => it.value != null && onValueChange?.(it.value)}
                            className={cls}
                        >
                            {inner}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export default SectionTabs;

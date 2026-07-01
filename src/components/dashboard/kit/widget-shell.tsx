'use client';

// ════════════════════════════════════════════════════════════════
// WidgetShell — the universal adaptive container for every widget
// ----------------------------------------------------------------
// Responsibilities:
//   • Read `config.widgets` (bgStyle/borderStyle/headerStyle/shadows/
//     innerGlow/glassOpacity/noiseTexture) so EVERY widget inherits the
//     active theme automatically — no per-widget theming.
//   • Measure itself (useElementSize) and expose a `tier` so children
//     can change density. At "micro" the header collapses to an icon +
//     compact title; at "expanded" it shows title + subtitle + actions.
//   • Provide header (icon/title/subtitle/live badge/actions), a
//     scrollable body, and an optional footer — all adaptive.
//   • Never overflow: body is min-h-0 + overflow-auto; header/footer
//     shrink-0. Content decides its own density via the render-prop.
// ════════════════════════════════════════════════════════════════

import React from "react";
import { motion } from "framer-motion";
import { Maximize2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppearance } from "@/context/appearance-context";
import { useElementSize, type ElementSize } from "./use-element-size";

export interface WidgetShellProps {
    title: string;
    subtitle?: string;
    icon?: LucideIcon;
    /** accent color: any CSS color or hsl(var(--primary)). Defaults to primary. */
    accent?: string;
    live?: boolean;
    actions?: React.ReactNode;
    footer?: React.ReactNode | ((size: ElementSize) => React.ReactNode);
    children: React.ReactNode | ((size: ElementSize) => React.ReactNode);
    className?: string;
    bodyClassName?: string;
    /** hide header entirely (full-bleed widgets like graphs) */
    bare?: boolean;
    /**
     * Conexiones del ecosistema (inteligencia interconectada): chips compactos
     * que enlazan el widget con áreas o widgets hermanos. Opcional → si no se
     * pasa, el footer no cambia. Cada chip puede navegar (href interno) o
     * disparar una acción (onClick).
     */
    connections?: Array<{
        label: string;
        href?: string;
        onClick?: () => void;
        color?: string;
        icon?: LucideIcon;
    }>;
    /** Sigilo StarSeed tenue en la esquina (marca de identidad). Default: true. */
    sigil?: boolean;
    /** Abrir una vista ampliada en pestaña nueva (más información/complejidad). */
    expandHref?: string;
    /** Abrir una vista ampliada en ventana/modal del propio OS. */
    onExpand?: () => void;
    /**
     * Modo de diseño de ESTE widget (anula el global de config.widgets.designMode):
     *  - "theme": hereda el estilo del tema activo.
     *  - "original": identidad propia (cristal líquido teñido con su acento).
     * Si no se pasa, usa el modo global.
     */
    designMode?: "theme" | "original";
}

function bgClass(style: string, opacity: number): string {
    switch (style) {
        case "solid":
            return "bg-card";
        case "cyber":
            return "bg-gradient-to-br from-card/80 via-background/60 to-card/40 backdrop-blur-2xl";
        case "mesh":
            return "bg-[radial-gradient(circle_at_20%_20%,hsl(var(--primary)/0.12),transparent_50%),radial-gradient(circle_at_80%_80%,hsl(var(--primary)/0.08),transparent_50%)] bg-card/40 backdrop-blur-2xl";
        case "glass":
        default:
            return "bg-card/[var(--w-glass,0.5)] backdrop-blur-2xl";
    }
}

function borderClass(style: string): string {
    switch (style) {
        case "none":
            return "border-0";
        case "glow":
            return "border border-primary/30 shadow-[0_0_24px_-6px_hsl(var(--primary)/0.4)]";
        case "neon":
            return "border-2 border-primary/60 shadow-[0_0_18px_hsl(var(--primary)/0.5),inset_0_0_12px_hsl(var(--primary)/0.15)]";
        case "thin":
        default:
            return "border border-border/40";
    }
}

function shadowClass(style: string): string {
    switch (style) {
        case "none": return "";
        case "sm": return "shadow-sm";
        case "lg": return "shadow-2xl";
        case "neon": return "shadow-[0_0_30px_-4px_hsl(var(--primary)/0.45)]";
        case "md":
        default: return "shadow-xl";
    }
}

function innerGlowClass(style: string): string {
    switch (style) {
        case "subtle": return "before:absolute before:inset-0 before:rounded-[inherit] before:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] before:pointer-events-none";
        case "strong": return "before:absolute before:inset-0 before:rounded-[inherit] before:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15),inset_0_0_40px_-10px_hsl(var(--primary)/0.25)] before:pointer-events-none";
        default: return "";
    }
}

export function WidgetShell({
    title, subtitle, icon: Icon, accent, live, actions, footer, children,
    className, bodyClassName, bare = false, connections, sigil = true,
    expandHref, onExpand, designMode,
}: WidgetShellProps) {
    const { config } = useAppearance();
    const w = config.widgets;
    const { ref, size } = useElementSize<HTMLDivElement>();

    // Acento efectivo: si el widget pasa uno explícito, manda; si no, hereda el
    // acento por FUNCIÓN que el registro inyecta como --w-fn-accent (y, en último
    // término, el primary del tema). Así el look "habla por la función" sin que
    // cada widget tenga que declararlo, y sin romper los que sí lo declaran.
    const accentColor = accent ?? "var(--w-fn-accent, hsl(var(--primary)))";
    // Modo de diseño efectivo: prop del widget > global > "theme".
    const effectiveMode: "theme" | "original" = designMode ?? w.designMode ?? "theme";
    const isOriginal = effectiveMode === "original";
    // Modo compacto global (Ajustes → Apariencia → Diseño de los widgets):
    // densidad mayor (padding/typografía reducidos). Por defecto desactivado.
    const compact = w.compact === true;
    const showSubtitle = !!subtitle && size.tier !== "micro" && size.vTier !== "micro" && !compact;
    const compactHeader = size.tier === "micro" || size.vTier === "micro" || compact;

    const resolvedChildren = typeof children === "function" ? children(size) : children;
    const resolvedFooter = typeof footer === "function" ? footer(size) : footer;

    // Chips de conexión (interconexión del ecosistema). Solo en tamaños no-micro.
    const connChips = connections && connections.length && size.tier !== "micro" ? (
        <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[9px] uppercase tracking-[0.18em] font-bold text-muted-foreground/60 mr-0.5">✦ Conecta</span>
            {connections.map((c, i) => {
                const Ic = c.icon;
                const cc = c.color ?? accentColor;
                const inner = (
                    <>
                        {Ic && <Ic className="size-3 shrink-0" />}
                        <span className="truncate max-w-[10rem]">{c.label}</span>
                    </>
                );
                const cls = "group inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-all cursor-pointer hover:-translate-y-px";
                const style = { color: cc, borderColor: `color-mix(in srgb, ${cc} 40%, transparent)`, background: `color-mix(in srgb, ${cc} 12%, transparent)` } as React.CSSProperties;
                return c.href
                    ? <a key={i} href={c.href} className={cls} style={style} title={`Ir a ${c.label}`}>{inner}</a>
                    : <button key={i} type="button" onClick={c.onClick} className={cls} style={style} title={c.label}>{inner}</button>;
            })}
        </div>
    ) : null;

    return (
        <div
            ref={ref}
            style={{
                ["--w-glass" as string]: String(w.glassOpacity ?? 0.5),
                // Modo "original": cristal líquido teñido con el acento del widget,
                // independiente del tema global (identidad propia por widget).
                ...(isOriginal
                    ? {
                        background: `linear-gradient(160deg, color-mix(in srgb, ${accentColor} 16%, hsl(var(--card))) , color-mix(in srgb, ${accentColor} 6%, hsl(var(--card))) 60%, hsl(var(--card)))`,
                        borderColor: `color-mix(in srgb, ${accentColor} 38%, transparent)`,
                        boxShadow: `0 18px 44px -22px color-mix(in srgb, ${accentColor} 60%, transparent), inset 0 1px 0 rgba(255,255,255,0.10)`,
                    }
                    : {}),
            }}
            className={cn(
                // os-widget-shell: capa de calidad transversal (globals.css) —
                // hover/focus visibles, tabular-nums heredado, sombras por tema.
                "os-widget-shell @container relative w-full h-full flex flex-col overflow-hidden rounded-3xl text-foreground isolate",
                // En "original" usamos estilos inline (arriba) + backdrop-blur; en
                // "theme" heredamos las clases del tema global.
                isOriginal ? "backdrop-blur-2xl border" : bgClass(w.bgStyle, w.glassOpacity),
                isOriginal ? "" : borderClass(w.borderStyle),
                isOriginal ? "" : shadowClass(w.shadows),
                innerGlowClass(w.innerGlow),
                className
            )}
        >
            {/* Profundidad + refracción de cristal líquido (overlays propios para no
                competir con el box-shadow temático/hover del shell ni con su ::before
                (innerGlow) / ::after (sheen). Additivo, z-0, no captura punteros; el
                contenido (header/body/footer) va en z-10, siempre por encima. */}
            <span aria-hidden className="glass-depth pointer-events-none absolute inset-0 z-0 rounded-[inherit]" />
            <span aria-hidden className="glass-refraction pointer-events-none absolute inset-0 z-0 rounded-[inherit]" />

            {w.noiseTexture && (
                <div className="pointer-events-none absolute inset-0 opacity-[0.035] mix-blend-overlay [background-image:url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22><filter id=%22n%22><feTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%222%22/></filter><rect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/></svg>')]" />
            )}

            {/* Hairline de acento StarSeed en el borde superior (identidad por widget). */}
            <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-[2px] z-20 opacity-80"
                style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }}
            />

            {/* Sigilo StarSeed tenue (4 gemas cardinales en cruz) como marca de fondo. */}
            {sigil && size.tier !== "micro" && (
                <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute -right-3 -bottom-3 z-0 size-24 opacity-[0.06]">
                    <circle cx="12" cy="4.6" r="2.6" fill="currentColor" />
                    <circle cx="19.4" cy="12" r="2.6" fill="currentColor" />
                    <circle cx="12" cy="19.4" r="2.6" fill="currentColor" />
                    <circle cx="4.6" cy="12" r="2.6" fill="currentColor" />
                    <circle cx="12" cy="12" r="1.4" fill="currentColor" />
                </svg>
            )}

            {!bare && (
                <header
                    className={cn(
                        "shrink-0 z-10 flex items-center",
                        compact
                            ? "gap-2 px-2.5 pt-2 pb-1.5 @sm:px-3 @sm:pt-2.5"
                            : "gap-2.5 px-3 pt-3 pb-2.5 @sm:px-4 @sm:pt-3.5",
                        // Hairline sutil bajo la cabecera SIEMPRE (salvo cabecera
                        // "acentuada", que ya tiñe el fondo): separa el título del
                        // cuerpo con más claridad y da un aire de tarjeta más limpio,
                        // sin depender de que el tema active "underlined".
                        w.headerStyle === "underlined"
                            ? "border-b border-border/40"
                            : w.headerStyle !== "accented" && "border-b border-border/20",
                        w.headerStyle === "accented" && "rounded-t-3xl"
                    )}
                    style={
                        w.headerStyle === "accented"
                            ? { background: `linear-gradient(90deg, color-mix(in srgb, ${accentColor} 14%, transparent), transparent)` }
                            : undefined
                    }
                >
                    {Icon && (
                        <motion.div
                            whileHover={config.animations.hover ? { scale: 1.08, rotate: -4 } : undefined}
                            className={cn(
                                // ring + halo teñido del acento: el ícono se lee como una
                                // "gema" nítida y consistente en todos los widgets.
                                "shrink-0 grid place-items-center rounded-2xl border border-white/15 shadow-lg ring-1 ring-inset ring-white/10",
                                compact ? "size-7 @sm:size-8 rounded-xl" : "size-9 @sm:size-10"
                            )}
                            style={{
                                background: `linear-gradient(135deg, ${accentColor}, color-mix(in srgb, ${accentColor} 40%, transparent))`,
                                boxShadow: `0 6px 16px -6px color-mix(in srgb, ${accentColor} 70%, transparent)`,
                            }}
                        >
                            <Icon className={cn("text-white drop-shadow", compact ? "size-3.5 @sm:size-4" : "size-4 @sm:size-5")} strokeWidth={2} />
                        </motion.div>
                    )}

                    <div className="min-w-0 flex-1 text-left">
                        <h3 className={cn(
                            "font-headline font-black tracking-tight truncate leading-tight",
                            compactHeader ? "text-xs" : "text-sm @sm:text-base"
                        )}>
                            {title}
                        </h3>
                        {showSubtitle && (
                            <p className="text-[10px] @sm:text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70 truncate font-semibold">
                                {subtitle}
                            </p>
                        )}
                    </div>

                    {live && (
                        <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/25 px-2 py-1">
                            <motion.span
                                animate={config.animations.enabled ? { opacity: [0.4, 1, 0.4] } : undefined}
                                transition={{ duration: 2.4, repeat: Infinity }}
                                className="size-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]"
                            />
                            {size.tier !== "micro" && (
                                <span className="text-[9px] font-black uppercase tracking-widest text-primary">Live</span>
                            )}
                        </span>
                    )}

                    {(actions || expandHref || onExpand) && size.tier !== "micro" && (
                        <div className="shrink-0 flex items-center gap-1">
                            {actions}
                            {(expandHref || onExpand) && (
                                expandHref
                                    ? <a href={expandHref} target="_blank" rel="noopener" title="Abrir vista ampliada en una pestaña nueva" aria-label="Ampliar widget" className="grid place-items-center size-7 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer"><Maximize2 className="size-3.5" /></a>
                                    : <button type="button" onClick={onExpand} title="Abrir vista ampliada" aria-label="Ampliar widget" className="grid place-items-center size-7 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer"><Maximize2 className="size-3.5" /></button>
                            )}
                        </div>
                    )}
                </header>
            )}

            <div className={cn(
                "relative z-10 flex-1 min-h-0 overflow-auto custom-scrollbar",
                compact ? "px-2.5 pb-2.5 @sm:px-3 text-[0.92em]" : "px-3 pb-3 @sm:px-4",
                bare && "p-0",
                bodyClassName
            )}>
                {resolvedChildren}
            </div>

            {(resolvedFooter || connChips) && (
                <footer className={cn(
                    "shrink-0 z-10 border-t border-border/30",
                    compact ? "px-2.5 pb-2 pt-1 @sm:px-3 space-y-1" : "px-3 pb-3 pt-1.5 @sm:px-4 space-y-1.5"
                )}>
                    {resolvedFooter}
                    {connChips}
                </footer>
            )}
        </div>
    );
}

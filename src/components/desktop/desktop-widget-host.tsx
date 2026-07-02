'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Widget Host del escritorio
// ----------------------------------------------------------------
// Renderiza el widget REAL del sistema (widget-registry existente)
// dentro de escritorios: como ventana o como icono-preview vivo.
// Carga diferida (next/dynamic, ssr:false) + límite de errores para
// que un widget roto JAMÁS tumbe el escritorio (tolerancia a fallos).
// Solo IMPORTA el registry/manifest — no los modifica.
// ════════════════════════════════════════════════════════════════

import React from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import type { DashboardWidget, WidgetType } from "@/components/dashboard/dashboard-types";
import { WIDGET_MANIFEST } from "@/components/dashboard/widget-manifest";

const WidgetRegistryLazy = dynamic(
    () => import("@/components/dashboard/widget-registry").then((m) => m.WidgetRegistry),
    {
        ssr: false,
        loading: () => (
            <div className="flex h-full w-full items-center justify-center text-[11px] text-muted-foreground animate-pulse">
                Cargando widget…
            </div>
        ),
    },
);

// ── Límite de errores reutilizable (escritorio tolerante) ────────
interface BoundaryProps {
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

export class DesktopErrorBoundary extends React.Component<BoundaryProps, { failed: boolean }> {
    constructor(props: BoundaryProps) {
        super(props);
        this.state = { failed: false };
    }

    static getDerivedStateFromError(): { failed: boolean } {
        return { failed: true };
    }

    componentDidCatch(): void {
        /* silencioso: el fallback ya informa al usuario */
    }

    render(): React.ReactNode {
        if (this.state.failed) {
            return (
                this.props.fallback ?? (
                    <div className="flex h-full w-full items-center justify-center p-4">
                        <p className="max-w-[220px] text-center text-[11px] leading-relaxed text-muted-foreground">
                            Este contenido no se pudo cargar aquí. Puedes quitarlo y volver a añadirlo.
                        </p>
                    </div>
                )
            );
        }
        return this.props.children;
    }
}

// ── Stub de DashboardWidget (el registry exige esta forma) ───────
export function makeWidgetStub(type: string, instanceId: string): DashboardWidget {
    return {
        id: instanceId,
        dashboard_id: "desktop",
        widget_type: type as WidgetType,
        layout: { x: 0, y: 0, w: 4, h: 4 },
        settings: {},
        created_at: "2026-01-01T00:00:00.000Z",
    };
}

// ── Host ─────────────────────────────────────────────────────────
export function DesktopWidgetHost({
    type,
    instanceId,
    className,
    interactive = true,
}: {
    /** widget_type del registry (p. ej. 'CALCULATOR'). */
    type: string;
    /** Id estable de la instancia (icono o ventana). */
    instanceId: string;
    className?: string;
    /** false → preview de solo lectura (icono vivo en el escritorio). */
    interactive?: boolean;
}): React.ReactElement {
    return (
        <div
            className={cn(
                "relative h-full w-full",
                !interactive && "pointer-events-none select-none",
                className,
            )}
        >
            <DesktopErrorBoundary>
                <WidgetRegistryLazy widget={makeWidgetStub(type, instanceId)} />
            </DesktopErrorBoundary>
        </div>
    );
}

// ── Catálogo de widgets para el panel "+ Añadir" ─────────────────
export interface WidgetCatalogEntry {
    type: WidgetType;
    label: string;
    category: string;
    relevance: number;
    w: number;
    h: number;
}

/** Tipos que no tienen sentido sueltos en el escritorio. */
const EXCLUDED_TYPES = new Set<string>(["AI_GENERATED", "WEATHER_SPACE"]);

export function getWidgetCatalog(): WidgetCatalogEntry[] {
    return (Object.entries(WIDGET_MANIFEST) as Array<[WidgetType, NonNullable<(typeof WIDGET_MANIFEST)[WidgetType]>]>)
        .filter(([type, entry]) => Boolean(entry) && !EXCLUDED_TYPES.has(type))
        .map(([type, entry]) => ({
            type,
            label: entry.label,
            category: entry.category,
            relevance: entry.relevance ?? 0,
            w: entry.w,
            h: entry.h,
        }))
        .sort((a, b) => b.relevance - a.relevance || a.label.localeCompare(b.label));
}

export function widgetLabel(type: string): string {
    return WIDGET_MANIFEST[type as WidgetType]?.label ?? type;
}

/** Tamaño de ventana sugerido a partir de la huella del manifest. */
export function widgetWindowSize(type: string): { w: number; h: number } {
    const m = WIDGET_MANIFEST[type as WidgetType];
    const w = Math.min(980, Math.max(360, (m?.w ?? 4) * 150));
    const h = Math.min(700, Math.max(280, (m?.h ?? 4) * 110));
    return { w, h };
}

/** Acento por familia funcional (coherencia visual sutil del escritorio). */
const CATEGORY_ACCENT: Record<string, string> = {
    ontocracia: "#FF5C7A",
    economia: "#FFBF00",
    educacion: "#38BDF8",
    cultura: "#F472B6",
    ia: "#7C3AED",
    sistema: "#94A3B8",
    social: "#39FF14",
    red: "#10B981",
    entretenimiento: "#F97316",
    aplicaciones: "#22D3EE",
    archivos: "#EAB308",
    astrologia: "#C084FC",
    astronomia: "#818CF8",
    ubicacion: "#34D399",
    privacidad: "#F87171",
    dispositivos: "#60A5FA",
    descubrimientos: "#FBBF24",
    creatividad: "#FB7185",
    perfil: "#A3E635",
    sociedad: "#2DD4BF",
    productividad: "#4ADE80",
    comunicacion: "#007FFF",
    ayudantia: "#93C5FD",
    ciberdelia: "#A855F7",
};

export function widgetAccent(category: string | undefined): string {
    return (category && CATEGORY_ACCENT[category]) || "#007FFF";
}

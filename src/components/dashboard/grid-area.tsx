'use client';

import { useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";

import { DashboardWidget, WidgetType } from "./dashboard-types";
import { WidgetRegistry } from "./widget-registry";
import { getSizeConstraints } from "./widget-manifest";
import { AddWidgetDialog } from "./add-widget-dialog";
import { Sparkles, ChevronUp, ChevronDown } from "lucide-react";
import { shareWidget } from "@/lib/widget-sync";
import { getManifest } from "./widget-manifest";
import { useToast } from "@/components/ui/use-toast";
import { useWidth } from "@/hooks/use-width";
import { cn } from "@/lib/utils";
import { useAppearance } from "@/context/appearance-context";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

// Dynamic import with SSR disabled
const ResponsiveGridLayout = dynamic(
    () => import("react-grid-layout").then((mod) => {
        return mod.Responsive || (mod as any).default?.Responsive || (mod as any).default;
    }),
    {
        ssr: false,
        loading: () => (
            <div className="h-[500px] w-full flex flex-col items-center justify-center gap-4 text-muted-foreground">
                <div className="w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                <span className="text-sm font-medium opacity-60">Cargando Dashboard...</span>
            </div>
        )
    }
);

interface GridAreaProps {
    dashboardId: string;
    widgets: DashboardWidget[];
    setWidgets: (widgets: DashboardWidget[]) => void;
    isEditMode: boolean;
    onPinWidget?: (widget: DashboardWidget) => void;
    onAddWidget?: (dashboardId: string, type: WidgetType) => void;
    onForgeOpen?: () => void;
}

/**
 * Detección de puntero grueso (táctil). En táctil NUNCA habilitamos el arrastre
 * de react-grid-layout: deslizar = scroll y los botones del widget siempre
 * reciben su tap. El reordenamiento en táctil se hace con botones ↑/↓ explícitos.
 * En ratón (escritorio) el arrastre y la redimensión funcionan como siempre en
 * modo edición. Esto elimina por completo la clase de fallos del antiguo sistema
 * de "armado por pulsación" (que interceptaba toques y mataba los botones).
 */
function useCoarsePointer(): boolean {
    const [coarse, setCoarse] = useState(false);
    useEffect(() => {
        if (typeof window === "undefined") return;
        const mq = window.matchMedia("(pointer: coarse)");
        const update = () => setCoarse(mq.matches || "ontouchstart" in window);
        update();
        try { mq.addEventListener("change", update); } catch { /* Safari viejo */ }
        return () => { try { mq.removeEventListener("change", update); } catch { } };
    }, []);
    return coarse;
}

export function GridArea({ dashboardId, widgets, setWidgets, isEditMode, onPinWidget, onAddWidget, onForgeOpen }: GridAreaProps) {
    const { width, containerRef } = useWidth();
    const { toast } = useToast();
    const { config } = useAppearance();
    const [layouts, setLayouts] = useState<any>({});
    const [mounted, setMounted] = useState(false);
    const isCoarse = useCoarsePointer();

    // En táctil, el arrastre/redimensión de RGL se desactivan SIEMPRE. Así, en
    // cualquier pantalla táctil, los widgets jamás se mueven al tocarlos, deslizar
    // hace scroll y todos los botones funcionan. En ratón se permite en edición.
    const canDragMouse = isEditMode && !isCoarse;

    useEffect(() => {
        setMounted(true);
    }, []);

    // Sync widgets to layout format expected by RGL
    useEffect(() => {
        const layout = widgets.map(w => {
            const c = getSizeConstraints(w.widget_type);
            return {
                i: w.layout.i || w.id,
                x: w.layout.x,
                y: w.layout.y,
                w: Math.max(w.layout.w, c.minW),
                h: Math.max(w.layout.h, c.minH),
                minW: c.minW,
                minH: c.minH,
                ...(c.maxW ? { maxW: c.maxW } : {}),
                ...(c.maxH ? { maxH: c.maxH } : {}),
            };
        });
        setLayouts((prev: any) => {
            if (JSON.stringify(prev.lg) === JSON.stringify(layout)) return prev;
            return { lg: layout, md: layout, sm: layout };
        });
    }, [widgets]);

    const onLayoutChange = useCallback((currentLayout: any[], allLayouts: any) => {
        if (!isEditMode) return;
    }, [isEditMode]);

    const handleDragStop = useCallback((layout: any[], oldItem: any, newItem: any) => {
        if (!isEditMode) return;

        const updatedWidgets = widgets.map(w => {
            const layoutItem = layout.find(l => l.i === (w.layout.i || w.id));
            if (layoutItem) {
                return {
                    ...w,
                    layout: {
                        ...w.layout,
                        x: layoutItem.x,
                        y: layoutItem.y,
                        w: layoutItem.w,
                        h: layoutItem.h
                    }
                };
            }
            return w;
        });

        // Update parent state (which auto-persists to localStorage via handleSetWidgets)
        setWidgets(updatedWidgets);
    }, [isEditMode, widgets, setWidgets]);

    // Reordenamiento explícito (táctil): intercambia la posición (x,y) de este
    // widget con su vecino inmediato en el orden visual (arriba/abajo). RGL
    // compacta verticalmente, así que el resultado es un reordenamiento limpio.
    const moveWidget = useCallback((widgetId: string, dir: "up" | "down") => {
        const sorted = [...widgets].sort((a, b) =>
            (a.layout.y - b.layout.y) || (a.layout.x - b.layout.x)
        );
        const idx = sorted.findIndex(w => w.id === widgetId);
        if (idx < 0) return;
        const swapIdx = dir === "up" ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= sorted.length) return;

        const a = sorted[idx];
        const b = sorted[swapIdx];
        const updated = widgets.map(w => {
            if (w.id === a.id) return { ...w, layout: { ...w.layout, x: b.layout.x, y: b.layout.y } };
            if (w.id === b.id) return { ...w, layout: { ...w.layout, x: a.layout.x, y: a.layout.y } };
            return w;
        });
        setWidgets(updated);
    }, [widgets, setWidgets]);

    const handleDeleteWidget = (widgetId: string) => {
        const updated = widgets.filter(w => w.id !== widgetId);
        setWidgets(updated);
        toast({ title: "Widget eliminado", description: "El widget ha sido removido del dashboard." });
    };

    const handlePinWidget = (widget: DashboardWidget) => {
        if (onPinWidget) {
            onPinWidget(widget);
            toast({ title: "📌 Widget fijado", description: "El widget aparecerá flotante sobre todas las secciones." });
        }
    };

    const handleShareWidget = async (widget: DashboardWidget) => {
        const manifest = getManifest(widget.widget_type);
        const title = widget.settings?.ontology?.title || manifest?.label || widget.widget_type.replace(/_/g, " ");
        try {
            const meta = await shareWidget({
                widgetType: widget.widget_type,
                title,
                author: "local",
                visibility: "enlace",
                editMode: "bloqueado",
                settings: widget.settings || {},
            });
            try { await navigator.clipboard?.writeText(`starseed://widget/${meta.entityId}`); } catch { /* noop */ }
            toast({ title: "🔗 Widget compartido", description: `"${title}" está en tu biblioteca. Enlace copiado para compartir o replicar.` });
        } catch {
            toast({ title: "No se pudo compartir", description: "Inténtalo de nuevo.", variant: "destructive" as any });
        }
    };

    // Empty state when no widgets — invitación clara a poblar desde la biblioteca
    if (mounted && widgets.length === 0) {
        return (
            <div ref={containerRef} className="relative min-h-[500px] flex flex-col items-center justify-center gap-6 rounded-[2rem] border border-dashed border-primary/20 bg-primary/[0.02] backdrop-blur-sm overflow-hidden">
                {/* halo decorativo animado */}
                <div className="pointer-events-none absolute inset-0 opacity-60 [background:radial-gradient(circle_at_50%_40%,hsl(var(--primary)/0.10),transparent_60%)]" />
                <div className="relative flex flex-col items-center text-center space-y-4 max-w-sm px-6">
                    <div className="relative">
                        <div className="absolute inset-0 blur-2xl rounded-full bg-primary/25 animate-pulse" />
                        <div className="relative grid place-items-center size-20 rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/20 to-primary/5 backdrop-blur-xl shadow-2xl">
                            <Sparkles className="size-9 text-primary" strokeWidth={1.5} />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <h3 className="text-lg @md:text-xl font-black tracking-tight text-foreground/90">Tu tablero está listo para crecer</h3>
                        <p className="text-sm text-muted-foreground/70 leading-relaxed">
                            Añade widgets desde la biblioteca para ver datos en vivo, herramientas y experiencias adaptadas a ti. Cada widget es editable, redimensionable y se reordena con coherencia.
                        </p>
                    </div>
                    {onAddWidget ? (
                        <div className="pt-1">
                            <AddWidgetDialog
                                onAdd={(type) => onAddWidget(dashboardId, type)}
                                isEditMode={true}
                                onForgeOpen={onForgeOpen}
                            />
                        </div>
                    ) : (
                        <p className="text-xs text-muted-foreground/50">Activa el modo edición para añadir widgets.</p>
                    )}
                </div>
                <div className="relative flex gap-2 text-[10px] text-muted-foreground/40 uppercase tracking-widest">
                    <span>★</span><span>StarSeed Network</span><span>★</span>
                </div>
            </div>
        );
    }

    // ── TÁCTIL: rejilla de tarjetas NORMAL (sin react-grid-layout) ──────────
    // En cualquier pantalla táctil NO usamos react-grid-layout: posiciona en
    // absoluto con transforms y eso rompe el scroll nativo, los taps de botones
    // y el scroll interno de cada widget. Aquí los widgets son tarjetas en flujo
    // normal (rejilla responsive) → deslizar = scroll, los botones funcionan, el
    // scroll interno funciona y NADA se mueve al tocarlo. Reordenar: botones ↑/↓.
    if (mounted && isCoarse) {
        const ordered = [...widgets].sort((a, b) =>
            (a.layout.y - b.layout.y) || (a.layout.x - b.layout.x)
        );
        const ROW = 65, GAP = 18;
        return (
            <div
                id={`grid-container-${dashboardId}`}
                ref={containerRef}
                className={cn(
                    "relative min-h-[300px] w-full rounded-[clamp(1rem,2vw,2rem)] p-[clamp(0.5rem,1.5vw,1rem)] pb-[max(5rem,env(safe-area-inset-bottom))] transition-all duration-300",
                    isEditMode ? "border-2 border-dashed border-primary/20 bg-primary/[0.02]" : "bg-transparent"
                )}
                style={{ touchAction: "pan-y" }}
            >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" style={{ touchAction: "pan-y" }}>
                    {ordered.map((widget, idx) => {
                        const h = Math.max(widget.layout.h, 3);
                        const cardHeight = h * ROW + (h - 1) * GAP;
                        return (
                            <div
                                key={widget.layout.i || widget.id}
                                data-widget-key={widget.layout.i || widget.id}
                                className={cn(
                                    "relative rounded-3xl overflow-hidden bg-transparent transition-all",
                                    isEditMode && "ring-2 ring-primary/20"
                                )}
                                style={{ height: cardHeight, touchAction: "pan-y" }}
                            >
                                <div className="h-full w-full overflow-auto" style={{ touchAction: "pan-y", WebkitOverflowScrolling: "touch" as any }}>
                                    <WidgetRegistry widget={widget} />
                                </div>

                                {isEditMode && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); moveWidget(widget.id, "up"); }}
                                            disabled={idx === 0}
                                            className="absolute top-2 left-2 bg-background/80 hover:bg-background border rounded p-1 z-50 cursor-pointer transition-colors disabled:opacity-30"
                                            title="Subir / mover antes"
                                        >
                                            <ChevronUp className="w-4 h-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); moveWidget(widget.id, "down"); }}
                                            disabled={idx === ordered.length - 1}
                                            className="absolute top-2 left-12 bg-background/80 hover:bg-background border rounded p-1 z-50 cursor-pointer transition-colors disabled:opacity-30"
                                            title="Bajar / mover después"
                                        >
                                            <ChevronDown className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handlePinWidget(widget); }}
                                            className="absolute top-2 right-[5.5rem] bg-indigo-500/60 hover:bg-indigo-500 text-white border border-indigo-400/50 rounded p-1 cursor-pointer z-50 transition-colors"
                                            title="Fijar en pantalla"
                                        >📌</button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleShareWidget(widget); }}
                                            className="absolute top-2 right-12 bg-emerald-500/60 hover:bg-emerald-500 text-white border border-emerald-400/50 rounded p-1 cursor-pointer z-50 transition-colors"
                                            title="Compartir a la biblioteca"
                                        >🔗</button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteWidget(widget.id); }}
                                            className="absolute top-2 right-2 bg-destructive/80 hover:bg-destructive text-white border border-destructive rounded p-1 cursor-pointer z-50 transition-colors"
                                            title="Eliminar Widget"
                                        >✕</button>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    return (
        <div
            id={`grid-container-${dashboardId}`}
            ref={containerRef}
            onDragOver={(e) => {
                if (canDragMouse) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                }
            }}
            onDrop={(e) => {
                if (canDragMouse) {
                    e.preventDefault();
                    try {
                        const rawData = e.dataTransfer.getData('text/plain');
                        if (!rawData) return;
                        const data = JSON.parse(rawData);
                        const { widgetId, sourceDashboardId } = data;
                        if (sourceDashboardId === dashboardId) return;

                        const event = new CustomEvent('starseed:transfer-widget', {
                            detail: {
                                widgetId,
                                sourceDashboardId,
                                targetDashboardId: dashboardId,
                                clientX: e.clientX,
                                clientY: e.clientY
                            }
                        });
                        window.dispatchEvent(event);
                    } catch (err) {
                        console.error("Drop error:", err);
                    }
                }
            }}
            className={cn(
                // padding fluido (clamp) + holgura inferior para dock/FAB y safe-area:
                // legible y usable de 320px a ultrawide, en táctil y escritorio.
                // overflow-visible: el scroll lo gestiona el contenedor del panel.
                "relative min-h-[500px] flex-1 w-full rounded-[clamp(1rem,2vw,2rem)] overflow-visible p-[clamp(0.5rem,1.5vw,1rem)] pb-[max(5rem,env(safe-area-inset-bottom))] transition-all duration-500 ease-out backdrop-blur-sm",
                isEditMode ? "border-2 border-dashed border-primary/20 bg-primary/[0.02]" : "bg-transparent border border-white/5"
            )}
            // touch-action pan-y SIEMPRE: el dedo scrollea vertical; nada arrastra.
            style={{ touchAction: "pan-y" }}
        >
            {mounted && width > 0 && (
                <ResponsiveGridLayout
                    className="layout transition-all duration-500"
                    layouts={layouts}
                    breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                    cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
                    rowHeight={65} // slightly taller for better visual separation
                    width={width}
                    compactType="vertical"
                    onLayoutChange={onLayoutChange as any}
                    onDragStop={handleDragStop as any}
                    onResizeStop={handleDragStop as any}
                    // Arrastre/redimensión SOLO con ratón en modo edición. En táctil
                    // (isCoarse) ambos quedan en false → los widgets nunca se mueven al
                    // tocarlos, deslizar hace scroll y todo botón recibe su tap. El
                    // reordenamiento táctil se hace con los botones ↑/↓ del widget.
                    isDraggable={canDragMouse}
                    isResizable={canDragMouse}
                    margin={[18, 18]} // cleaner separation
                >
                    {widgets.map(widget => (
                        <div
                            key={widget.layout.i || widget.id}
                            data-widget-key={widget.layout.i || widget.id}
                            className="relative group h-full"
                            // HTML5 DnD (transferencia entre paneles) solo con ratón.
                            draggable={canDragMouse}
                            // touch-action pan-y SIEMPRE → en táctil el gesto es scroll,
                            // jamás arrastre del widget.
                            style={{
                                touchAction: "pan-y",
                                WebkitTouchCallout: "none",
                            }}
                            onDragStart={(e) => {
                                if (canDragMouse) {
                                    e.dataTransfer.setData('text/plain', JSON.stringify({
                                        widgetId: widget.id,
                                        sourceDashboardId: dashboardId
                                    }));
                                    e.dataTransfer.effectAllowed = 'move';
                                }
                            }}
                        >
                            <div className={cn(
                                `h-full w-full overflow-hidden transition-all bg-transparent rounded-3xl ${isEditMode ? 'ring-2 ring-primary/20' : 'hover:shadow-lg'}`
                            )}>
                                <WidgetRegistry widget={widget} />

                                {isEditMode && (
                                    <>
                                        {/* Reordenar (táctil y ratón): mueve el widget arriba/abajo
                                            en el orden visual sin necesidad de arrastrar. En táctil
                                            es la vía principal de reordenamiento. */}
                                        {isCoarse && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); moveWidget(widget.id, "up"); }}
                                                    className="absolute top-2 left-2 bg-background/80 hover:bg-background border rounded p-1 z-50 cursor-pointer transition-colors"
                                                    title="Subir / mover antes"
                                                >
                                                    <ChevronUp className="w-4 h-4" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); moveWidget(widget.id, "down"); }}
                                                    className="absolute top-2 left-12 bg-background/80 hover:bg-background border rounded p-1 z-50 cursor-pointer transition-colors"
                                                    title="Bajar / mover después"
                                                >
                                                    <ChevronDown className="w-4 h-4" />
                                                </button>
                                            </>
                                        )}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handlePinWidget(widget);
                                            }}
                                            className="absolute top-2 right-[5.5rem] bg-indigo-500/60 hover:bg-indigo-500 text-white border border-indigo-400/50 rounded p-1 cursor-pointer z-50 transition-colors"
                                            title="Fijar en pantalla"
                                        >
                                            📌
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleShareWidget(widget);
                                            }}
                                            className="absolute top-2 right-12 bg-emerald-500/60 hover:bg-emerald-500 text-white border border-emerald-400/50 rounded p-1 cursor-pointer z-50 transition-colors"
                                            title="Compartir a la biblioteca"
                                        >
                                            🔗
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteWidget(widget.id);
                                            }}
                                            className="absolute top-2 right-2 bg-destructive/80 hover:bg-destructive text-white border border-destructive rounded p-1 cursor-pointer z-50 transition-colors"
                                            title="Eliminar Widget"
                                        >
                                            ✕
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </ResponsiveGridLayout>
            )}
        </div>
    );
}

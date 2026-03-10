'use client';

import { useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";

import { DashboardWidget } from "./dashboard-types";
import { WidgetRegistry } from "./widget-registry";
import { useToast } from "@/components/ui/use-toast";
import { useWidth } from "@/hooks/use-width";
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
}

export function GridArea({ dashboardId, widgets, setWidgets, isEditMode, onPinWidget }: GridAreaProps) {
    const { width, containerRef } = useWidth();
    const { toast } = useToast();
    const [layouts, setLayouts] = useState<any>({});
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Sync widgets to layout format expected by RGL
    useEffect(() => {
        const layout = widgets.map(w => ({
            i: w.layout.i || w.id,
            x: w.layout.x,
            y: w.layout.y,
            w: w.layout.w,
            h: w.layout.h
        }));
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

    // Empty state when no widgets
    if (mounted && widgets.length === 0) {
        return (
            <div ref={containerRef} className="relative min-h-[500px] flex flex-col items-center justify-center gap-6 rounded-2xl border border-dashed border-primary/20 bg-primary/[0.02] backdrop-blur-sm">
                <div className="text-center space-y-3 max-w-xs px-4">
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center text-2xl">
                        ✦
                    </div>
                    <h3 className="text-lg font-bold text-foreground/80">Dashboard Vacío</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        Activa el modo edición y añade widgets para personalizar tu panel de control.
                    </p>
                </div>
                <div className="flex gap-2 text-[10px] text-muted-foreground/40 uppercase tracking-widest">
                    <span>★</span><span>StarSeed Network</span><span>★</span>
                </div>
            </div>
        );
    }

    return (
        <div ref={containerRef} className={isEditMode ? "relative border-2 border-dashed border-primary/20 rounded-xl p-4 min-h-[500px] liquid-glass-panel" : "relative min-h-[500px] liquid-glass-panel"}>
            {mounted && width > 0 && (
                <ResponsiveGridLayout
                    className="layout"
                    layouts={layouts}
                    breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                    cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
                    rowHeight={60}
                    width={width}
                    onLayoutChange={onLayoutChange as any}
                    onDragStop={handleDragStop as any}
                    onResizeStop={handleDragStop as any}
                    isDraggable={isEditMode}
                    isResizable={isEditMode}
                    draggableHandle=".drag-handle"
                    margin={[16, 16]}
                >
                    {widgets.map(widget => (
                        <div key={widget.layout.i || widget.id} className="relative group h-full">
                            <div className={`h-full w-full overflow-hidden transition-all bg-transparent rounded-3xl ${isEditMode ? 'ring-2 ring-primary/20' : 'hover:shadow-lg'}`}>
                                <WidgetRegistry widget={widget} />

                                {isEditMode && (
                                    <>
                                        <div className="drag-handle absolute top-2 right-[5.5rem] bg-background/80 hover:bg-background border rounded p-1 cursor-grab active:cursor-grabbing z-50 transition-colors">
                                            ✋
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handlePinWidget(widget);
                                            }}
                                            className="absolute top-2 right-12 bg-indigo-500/60 hover:bg-indigo-500 text-white border border-indigo-400/50 rounded p-1 cursor-pointer z-50 transition-colors"
                                            title="Fijar en pantalla"
                                        >
                                            📌
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


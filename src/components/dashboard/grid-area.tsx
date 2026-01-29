'use client';

import { useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";

import { DashboardWidget } from "./dashboard-types";
import { WidgetRegistry } from "./widget-registry";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { useWidth } from "@/hooks/use-width";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

// Dynamic import with SSR disabled to avoid "Window is not defined" and generic hydration errors
// Also helps with the "Invalid hook call" if it was due to generic SSR checks in RGL
const ResponsiveGridLayout = dynamic(
    () => import("react-grid-layout").then((mod) => {
        // Robustly finding the specific export
        return mod.Responsive || (mod as any).default?.Responsive || (mod as any).default;
    }),
    {
        ssr: false,
        loading: () => <div className="h-[500px] w-full flex items-center justify-center text-muted-foreground">Loading Dashboard...</div>
    }
);

interface GridAreaProps {
    dashboardId: string;
    widgets: DashboardWidget[];
    setWidgets: (widgets: DashboardWidget[]) => void;
    isEditMode: boolean;
}

export function GridArea({ dashboardId, widgets, setWidgets, isEditMode }: GridAreaProps) {
    const { width, containerRef } = useWidth();
    const supabase = createClient();
    const { toast } = useToast();
    const [layouts, setLayouts] = useState<any>({});
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Sync widgets to layout format expected by RGL
    // IMPORTANT: Only update if the widget count or IDs change to avoid infinite loops with layout state
    useEffect(() => {
        const layout = widgets.map(w => ({
            i: w.layout.i || w.id,
            x: w.layout.x,
            y: w.layout.y,
            w: w.layout.w,
            h: w.layout.h
        }));
        setLayouts((prev: any) => {
            // Simple equality check to prevent unnecessary updates
            // In a real app, use deep comparison or a stable ID check
            if (JSON.stringify(prev.lg) === JSON.stringify(layout)) return prev;
            return { lg: layout, md: layout, sm: layout };
        });
    }, [widgets]);

    const onLayoutChange = useCallback(async (currentLayout: any[], allLayouts: any) => {
        if (!isEditMode) return;

        // Debounce or verify if change is meaningful
        // For now, we update local state but avoid re-triggering the parent unnecessarily if possible
    }, [isEditMode]);

    const handleDragStop = useCallback(async (layout: any[], oldItem: any, newItem: any) => {
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

        // Update parent state
        setWidgets(updatedWidgets);

        // Persist to DB
        const changedWidget = updatedWidgets.find(w => (w.layout.i || w.id) === newItem.i);
        if (changedWidget) {
            await supabase.from('dashboard_widgets').update({
                layout: changedWidget.layout
            }).eq('id', changedWidget.id);
        }
    }, [isEditMode, widgets, setWidgets, supabase]);

    const handleDeleteWidget = async (widgetId: string) => {
        const { error } = await supabase.from('dashboard_widgets').delete().eq('id', widgetId);

        if (error) {
            toast({ title: "Error", description: "No se pudo eliminar el widget", variant: "destructive" });
        } else {
            setWidgets(widgets.filter(w => w.id !== widgetId));
            toast({ title: "Widget eliminado", description: "El widget ha sido removido del dashboard." });
        }
    };

    return (
        <div ref={containerRef} className={isEditMode ? "border-2 border-dashed border-primary/20 rounded-xl p-4 min-h-[500px]" : "min-h-[500px]"}>
            {mounted && width > 0 && (
                <ResponsiveGridLayout
                    className="layout"
                    layouts={layouts}
                    breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                    cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
                    rowHeight={60}
                    width={width}
                    onLayoutChange={onLayoutChange}
                    onDragStop={handleDragStop}
                    onResizeStop={handleDragStop}
                    isDraggable={isEditMode}
                    isResizable={isEditMode}
                    draggableHandle=".drag-handle"
                    margin={[16, 16]}
                >
                    {widgets.map(widget => (
                        <div key={widget.layout.i || widget.id} className="relative group h-full">
                            <div className={`h-full w-full overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm transition-all ${isEditMode ? 'ring-2 ring-primary/20' : 'hover:shadow-md'}`}>
                                <WidgetRegistry widget={widget} />

                                {isEditMode && (
                                    <>
                                        <div className="drag-handle absolute top-2 right-12 bg-background/80 hover:bg-background border rounded p-1 cursor-grab active:cursor-grabbing z-50 transition-colors">
                                            ✋
                                        </div>
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

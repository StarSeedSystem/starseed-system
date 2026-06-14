'use client';

import { useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";

import { DashboardWidget, WidgetType } from "./dashboard-types";
import { WidgetRegistry } from "./widget-registry";
import { getSizeConstraints } from "./widget-manifest";
import { AddWidgetDialog } from "./add-widget-dialog";
import { Sparkles } from "lucide-react";
import { shareWidget } from "@/lib/widget-sync";
import { getManifest } from "./widget-manifest";
import { useToast } from "@/components/ui/use-toast";
import { useWidth } from "@/hooks/use-width";
import { cn } from "@/lib/utils";
import { useTouchDragArming } from "./use-touch-drag-arming";
import { useAppearance } from "@/context/appearance-context";
import touchStyles from "./grid-area-touch.module.css";
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

export function GridArea({ dashboardId, widgets, setWidgets, isEditMode, onPinWidget, onAddWidget, onForgeOpen }: GridAreaProps) {
    const { width, containerRef } = useWidth();
    const { toast } = useToast();
    const { config } = useAppearance();
    const [layouts, setLayouts] = useState<any>({});
    const [mounted, setMounted] = useState(false);

    // Trinity Móvil · Bloque 1 — en táctil el widget solo entra en modo
    // arrastre tras pulsación mantenida (3 s por defecto, configurable en
    // Ajustes → Trinity); deslizar = scroll. Ratón/escritorio: idéntico a antes.
    // Ver use-touch-drag-arming.ts y SOP.
    const {
        armedId,
        isCoarsePointer,
        containerTouchProps,
        notifyDragStart,
        notifyDragStop,
    } = useTouchDragArming(isEditMode, {
        holdMs: config?.trinity?.touch?.holdMs,
        haptics: config?.trinity?.touch?.haptics,
    });

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
        notifyDragStop(); // desarma el modo táctil (no-op con ratón) y asienta con spring
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
    }, [isEditMode, widgets, setWidgets, notifyDragStop]);

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

    return (
        <div 
            id={`grid-container-${dashboardId}`}
            ref={containerRef} 
            onDragOver={(e) => {
                if (isEditMode) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                }
            }}
            onDrop={(e) => {
                if (isEditMode) {
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
                // overflow-visible: el scroll lo gestiona el contenedor del panel
                // (un solo scroller → sin doble barra y el auto-hide de la barra
                // superior funciona con la dirección del scroll real).
                "relative min-h-[500px] flex-1 w-full rounded-[clamp(1rem,2vw,2rem)] overflow-visible p-[clamp(0.5rem,1.5vw,1rem)] pb-[max(5rem,env(safe-area-inset-bottom))] transition-all duration-500 ease-out backdrop-blur-sm",
                isEditMode ? "border-2 border-dashed border-primary/20 bg-primary/[0.02]" : "bg-transparent border border-white/5"
            )}
            style={{ touchAction: "pan-y" }}
            {...containerTouchProps}
        >
            {mounted && width > 0 && (
                <ResponsiveGridLayout
                    className="layout transition-all duration-500"
                    layouts={layouts}
                    breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                    cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
                    rowHeight={65} // slightly taller for better visual separation
                    width={width}
                    onLayoutChange={onLayoutChange as any}
                    onDragStart={notifyDragStart as any}
                    onDragStop={handleDragStop as any}
                    onResizeStop={handleDragStop as any}
                    // Los controles interactivos NUNCA inician arrastre: garantiza que
                    // cada botón/enlace/campo del widget reciba su click normal.
                    draggableCancel={'button, a, input, textarea, select, label, [role="button"], [role="slider"], [contenteditable="true"], .rgl-cancel'}
                    // Anti-arrastre táctil A PRUEBA DE FALLOS: el arrastre SIEMPRE se
                    // limita a `.drag-handle` (nunca al cuerpo). Tocar una zona vacía
                    // del widget NO lo mueve — solo hace scroll. Para mover/redimensionar
                    // con el dedo, se mantiene pulsado 3 s sobre la zona vacía: eso ARMA
                    // el widget y renderiza un `.drag-handle` que cubre todo (ver abajo),
                    // permitiendo arrastrarlo. Con ratón, la ✋ (un .drag-handle pequeño)
                    // permite arrastrar al instante. No depende de detección de puntero.
                    isDraggable={isEditMode}
                    isResizable={isEditMode}
                    draggableHandle=".drag-handle"
                    margin={[18, 18]} // cleaner separation
                >
                    {widgets.map(widget => (
                        <div
                            key={widget.layout.i || widget.id}
                            data-widget-key={widget.layout.i || widget.id}
                            className="relative group h-full"
                            // HTML5 DnD (transferencia entre paneles) solo con ratón:
                            // en táctil secuestraba el gesto de scroll (drag nativo iOS).
                            draggable={isEditMode && !isCoarsePointer}
                            // touch-action: pan-y SIEMPRE → el navegador reserva el
                            // scroll vertical; el widget solo bloquea el scroll
                            // ("none") cuando está ARMADO por la pulsación de 3 s.
                            // Así, en táctil, deslizar para hacer scroll nunca lo arrastra.
                            style={{
                                touchAction: armedId === (widget.layout.i || widget.id) ? "none" : "pan-y",
                                WebkitTouchCallout: "none",
                                WebkitUserSelect: "none",
                            }}
                            onDragStart={(e) => {
                                if (isEditMode) {
                                    e.dataTransfer.setData('text/plain', JSON.stringify({
                                        widgetId: widget.id,
                                        sourceDashboardId: dashboardId
                                    }));
                                    e.dataTransfer.effectAllowed = 'move';
                                }
                            }}
                        >
                            <div className={cn(
                                `h-full w-full overflow-hidden transition-all bg-transparent rounded-3xl ${isEditMode ? 'ring-2 ring-primary/20' : 'hover:shadow-lg'}`,
                                isEditMode && touchStyles.touchLift,
                                armedId === (widget.layout.i || widget.id) && touchStyles.touchLiftArmed
                            )}>
                                <WidgetRegistry widget={widget} />

                                {/* Al ARMAR con la pulsación de 3 s, todo el widget se
                                    convierte en zona de arrastre (.drag-handle de cubierta
                                    total). Antes de armar, el cuerpo NUNCA arrastra → el
                                    dedo solo hace scroll. */}
                                {isEditMode && armedId === (widget.layout.i || widget.id) && (
                                    <div className="drag-handle absolute inset-0 z-40 cursor-grabbing rounded-3xl" aria-hidden />
                                )}

                                {isEditMode && (
                                    <>
                                        <div className="drag-handle absolute top-2 right-[8rem] bg-background/80 hover:bg-background border rounded p-1 cursor-grab active:cursor-grabbing z-50 transition-colors">
                                            ✋
                                        </div>
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


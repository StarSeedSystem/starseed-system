'use client';

import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";

import { DashboardWidget, WidgetType } from "./dashboard-types";
import { WidgetRegistry } from "./widget-registry";
import { getSizeConstraints } from "./widget-manifest";
import { AddWidgetDialog } from "./add-widget-dialog";
import { Sparkles, ChevronUp, ChevronDown, Scaling, Pin, Share2, X, Lock, LockOpen } from "lucide-react";
import { WidgetConfigPopover } from "./kit/widget-config-popover";
import { shareWidget } from "@/lib/widget-sync";
import { getManifest } from "./widget-manifest";
import { useToast } from "@/components/ui/use-toast";
import { useWidth } from "@/hooks/use-width";
import { cn } from "@/lib/utils";
import { useAppearance } from "@/context/appearance-context";
import { acomodosPorPantalla } from "@/lib/dashboard/acomodo-pantalla";
import { motion, useReducedMotion } from "framer-motion";
import { nextSize, sizeFromWH, dimsForSize, type WidgetSize } from "./dashboard-size";
// (2026-09-28) Editor superior: bloqueo de widgets, cuadrícula visible y soltar desde el catálogo.
import { conBloqueo, estaBloqueado, columnasPara } from "./editor-superior/acomodo";
import { arrastreCatalogoActual, esArrastreCatalogo, leerCargaCatalogo, terminarArrastreCatalogo } from "./editor-superior/arrastre-catalogo";
import type { TallaEditor } from "./editor-superior/tipos";
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
    /** Enseña las celdas de la rejilla (solo tiene efecto en edición). */
    cuadricula?: boolean;
    /** Soltar una ficha del catálogo del editor: tipo, talla y celda (si se soltó en escritorio). */
    onSoltarCatalogo?: (type: WidgetType, talla: TallaEditor, posicion?: { x: number; y: number }) => void;
}

const ALTO_FILA = 65;
const MARGEN = 12;

/** Fondo con las celdas de la rejilla (columnas teñidas y filas separadas). */
function fondoCuadricula(ancho: number): React.CSSProperties {
    const cols = columnasPara(ancho);
    const col = Math.max(8, (ancho - MARGEN * (cols - 1)) / cols);
    return {
        backgroundImage: [
            `linear-gradient(180deg, transparent 0 ${ALTO_FILA}px, rgba(8,10,24,.55) ${ALTO_FILA}px ${ALTO_FILA + MARGEN}px)`,
            `linear-gradient(90deg, rgba(124,92,255,.10) 0 ${col}px, transparent ${col}px ${col + MARGEN}px)`,
        ].join(", "),
        backgroundSize: `100% ${ALTO_FILA + MARGEN}px, ${col + MARGEN}px 100%`,
        backgroundRepeat: "repeat",
        borderRadius: 12,
    };
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

/**
 * Pantalla chica (< 640px, mismo umbral que el `sm` de Tailwind). Se usa SOLO
 * para escalar la altura en píxeles de las tarjetas de la rejilla táctil
 * (cálculo en JS, fuera del alcance de las clases `max-sm:`): en un teléfono
 * la rejilla pasa a una columna y cada fila de la cuadrícula (h) ocupa menos
 * píxeles, así un widget bajo (un reloj) no reserva la misma altura fija que
 * en una tablet ancha. Encima de 640px el resultado es IDÉNTICO a como era.
 */
function useNarrowViewport(): boolean {
    const [narrow, setNarrow] = useState(false);
    useEffect(() => {
        if (typeof window === "undefined") return;
        const mq = window.matchMedia("(max-width: 639px)");
        const update = () => setNarrow(mq.matches);
        update();
        try { mq.addEventListener("change", update); } catch { /* Safari viejo */ }
        return () => { try { mq.removeEventListener("change", update); } catch { } };
    }, []);
    return narrow;
}

export function GridArea({ dashboardId, widgets, setWidgets, isEditMode, onPinWidget, onAddWidget, onForgeOpen, cuadricula, onSoltarCatalogo }: GridAreaProps) {
    const { width, containerRef } = useWidth();
    const { toast } = useToast();
    const { config } = useAppearance();
    // (Ola 383) Marco libre: la celda no recorta ni sombrea — el halo de la forma respira fuera.
    const libre = config.widgets?.marco !== "clasico";
    const [layouts, setLayouts] = useState<any>({});
    const puntoActual = useRef<string>("lg");
    const [mounted, setMounted] = useState(false);
    const isCoarse = useCoarsePointer();
    const isNarrow = useNarrowViewport();
    // Respeta prefers-reduced-motion: sin entrada escalonada si el usuario la desactivó.
    const shouldReduceMotion = useReducedMotion();

    // En táctil, el arrastre/redimensión de RGL se desactivan SIEMPRE. Así, en
    // cualquier pantalla táctil, los widgets jamás se mueven al tocarlos, deslizar
    // hace scroll y todos los botones funcionan. En ratón se permite en edición.
    const canDragMouse = isEditMode && !isCoarse;
    const puedeSoltarCatalogo = canDragMouse && !!onSoltarCatalogo;

    // Bloquear/desbloquear un widget: fija sitio y tamaño (la rejilla lo trata como estático).
    const alternarBloqueo = useCallback((widgetId: string) => {
        const w = widgets.find((x) => x.id === widgetId);
        if (!w) return;
        setWidgets(conBloqueo(widgets, [widgetId], !estaBloqueado(w)));
    }, [widgets, setWidgets]);

    // Soltar en la rejilla: una ficha del catálogo se añade; un widget de otro panel se traslada
    // (la rejilla detiene la propagación del evento, así que el traslado se reenvía desde aquí).
    const alSoltarEnRejilla = useCallback((_layout: unknown, item: { x: number; y: number } | undefined, e: Event) => {
        const dt = (e as DragEvent).dataTransfer ?? null;
        const carga = leerCargaCatalogo(dt);
        terminarArrastreCatalogo();
        if (carga && onSoltarCatalogo) {
            const posicion = item && puntoActual.current === "lg" ? { x: item.x, y: item.y } : undefined;
            onSoltarCatalogo(carga.type, carga.talla, posicion);
            return;
        }
        try {
            const raw = dt?.getData("text/plain");
            if (!raw) return;
            const { widgetId, sourceDashboardId } = JSON.parse(raw);
            if (!widgetId || sourceDashboardId === dashboardId) return;
            const ev = e as DragEvent;
            window.dispatchEvent(new CustomEvent('starseed:transfer-widget', {
                detail: { widgetId, sourceDashboardId, targetDashboardId: dashboardId, clientX: ev.clientX, clientY: ev.clientY },
            }));
        } catch { /* datos ajenos */ }
    }, [onSoltarCatalogo, dashboardId]);

    // Persiste un patch parcial en `widget.settings` (lo usa el panel de estilo
    // por widget · WidgetConfigPopover). Fusiona sobre las settings actuales.
    const applyWidgetSettings = useCallback((widgetId: string, patch: Record<string, any>) => {
        setWidgets(widgets.map((w) => (
            w.id === widgetId ? { ...w, settings: { ...(w.settings || {}), ...patch } } : w
        )));
    }, [widgets, setWidgets]);

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
                // Bloqueado: ni se arrastra ni se redimensiona; los demás fluyen a su alrededor.
                ...(estaBloqueado(w) ? { static: true } : {}),
            };
        });
        setLayouts((prev: any) => {
            if (JSON.stringify(prev.lg) === JSON.stringify(layout)) return prev;
            // (2026-09-28) Cada pantalla recibe SU acomodo derivado del de escritorio (antes se
            // pasaba el mismo a md y sm y la rejilla lo recortaba). Ver acomodo-pantalla.ts.
            return acomodosPorPantalla(layout);
        });
    }, [widgets]);

    const onLayoutChange = useCallback((currentLayout: any[], allLayouts: any) => {
        if (!isEditMode) return;
    }, [isEditMode]);

    const handleDragStop = useCallback((layout: any[], oldItem: any, newItem: any) => {
        if (!isEditMode) return;
        // Solo el acomodo de escritorio (12 columnas) se guarda; los demás se derivan de él.
        if (puntoActual.current !== "lg") return;

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
        // Un widget bloqueado no se mueve, ni siquiera al intercambiarse con un vecino.
        if (estaBloqueado(a) || estaBloqueado(b)) return;
        const updated = widgets.map(w => {
            if (w.id === a.id) return { ...w, layout: { ...w.layout, x: b.layout.x, y: b.layout.y } };
            if (w.id === b.id) return { ...w, layout: { ...w.layout, x: a.layout.x, y: a.layout.y } };
            return w;
        });
        setWidgets(updated);
    }, [widgets, setWidgets]);

    /** Talla actual del widget: la declarada (`size`) o, si falta (widgets
     *  legado), la más cercana a su footprint w/h actual. */
    const widgetSize = useCallback((widget: DashboardWidget): WidgetSize => {
        return widget.size ?? sizeFromWH(widget.layout.w, widget.layout.h);
    }, []);

    // Cambiar tamaño (modo edición, táctil y ratón): ciclo S → M → L → XL → S.
    // Complementa el arrastre/redimensión de ratón (react-grid-layout) y da al
    // táctil una forma explícita de redimensionar (isResizable va siempre en
    // false ahí). El resultado se recorta a los mínimos del widget-manifest.
    const cycleWidgetSize = useCallback((widgetId: string) => {
        const widget = widgets.find(w => w.id === widgetId);
        if (!widget) return;
        const next = nextSize(widgetSize(widget));
        const dims = dimsForSize(widget.widget_type, next);
        const updated = widgets.map(w =>
            w.id === widgetId
                ? { ...w, size: next, layout: { ...w.layout, w: dims.w, h: dims.h } }
                : w
        );
        setWidgets(updated);
    }, [widgets, setWidgets, widgetSize]);

    const handleDeleteWidget = (widgetId: string) => {
        const updated = widgets.filter(w => w.id !== widgetId);
        setWidgets(updated);
        toast({ title: "Widget eliminado", description: "El widget ha sido removido del dashboard." });
    };

    const handlePinWidget = (widget: DashboardWidget) => {
        if (onPinWidget) {
            onPinWidget(widget);
            toast({ title: "Widget fijado", description: "El widget aparecerá flotante sobre todas las secciones." });
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
            toast({ title: "Widget compartido", description: `"${title}" está en tu biblioteca. Enlace copiado para compartir o replicar.` });
        } catch {
            toast({ title: "No se pudo compartir", description: "Inténtalo de nuevo.", variant: "destructive" as any });
        }
    };

    // Empty state when no widgets — invitación clara a poblar desde la biblioteca
    if (mounted && widgets.length === 0) {
        return (
            <div
                ref={containerRef}
                // Un tablero vacío también acepta fichas arrastradas desde el catálogo del editor.
                onDragOver={(e) => { if (puedeSoltarCatalogo && esArrastreCatalogo(e.dataTransfer)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
                onDrop={(e) => {
                    if (!puedeSoltarCatalogo) return;
                    const carga = leerCargaCatalogo(e.dataTransfer);
                    terminarArrastreCatalogo();
                    if (carga) { e.preventDefault(); onSoltarCatalogo?.(carga.type, carga.talla, { x: 0, y: 0 }); }
                }}
                className="relative min-h-[500px] flex flex-col items-center justify-center gap-6 rounded-2xl border border-dashed border-primary/20 bg-primary/[0.02] backdrop-blur-sm overflow-hidden"
            >
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
        // En pantalla chica (< 640px) cada fila de la cuadrícula pesa menos
        // píxeles: con una sola columna (ancho completo) el mismo contenido
        // cabe en una tarjeta más baja — un widget con h=5 (p. ej. Reloj y
        // Fecha, plantilla "L") ya no reserva ~400px de alto por defecto.
        const ROW = isNarrow ? 40 : 65, GAP = isNarrow ? 10 : 18;
        return (
            <div
                id={`grid-container-${dashboardId}`}
                ref={containerRef}
                className={cn(
                    // box-border: el padding no desborda el ancho en táctil (móvil).
                    // Full-bleed (gen10): margen exterior mínimo (~4-8px) y radio
                    // --screen-corner (0 en navegador; ~12px como app instalada) →
                    // el lienzo casa con la esquina física del dispositivo sin
                    // "encoger" la pantalla ni dejar bandas muertas.
                    "box-border relative min-h-[300px] w-full rounded-[var(--screen-corner)] p-[clamp(0.25rem,0.9vw,0.5rem)] pb-[max(4rem,env(safe-area-inset-bottom))] transition-all duration-300 motion-reduce:transition-none",
                    isEditMode ? "border-2 border-dashed border-primary/20 bg-primary/[0.02]" : "bg-transparent"
                )}
                style={{ touchAction: "pan-y" }}
            >
                {/* Rejilla fluida tipo pantalla de inicio (móvil/tablet/desktop):
                    UNA sola columna en teléfono (< 640px: ancho completo, sin
                    contenido apretado en ~170px), 2 en tablet, 3 en tablet grande
                    y 4 en pantallas anchas. Los widgets anchos (footprint ≥ 10/12
                    en el grid, p. ej. el folder-dock de apps o accesos rápidos)
                    ocupan la hilera completa. Sin recortes: box-border + separación
                    uniforme. */}
                {/* (2026-09-28) Dos columnas en el teléfono: antes era grid-cols-1, pero los widgets
                    «anchos» llevaban col-span-2 y creaban una segunda columna implícita desigual
                    (138 px + 224 px medidos): todo quedaba apretado. Ahora lo grande (L/XL) ocupa la
                    fila y lo mediano y lo pequeño van de dos en dos, igual que el acomodo automático. */}
                <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-4 gap-2 sm:gap-3 box-border" style={{ touchAction: "pan-y" }}>
                    {ordered.map((widget, idx) => {
                        const h = Math.max(widget.layout.h, 3);
                        // En móvil nunca por debajo de 200 px: con filas de 40 px un widget bajo
                        // (Accesos rápidos, h=3) quedaba en 140 px y su contenido se montaba.
                        const grande = widget.layout.w >= 6;
                        const cardHeight = isNarrow ? Math.max(h * ROW + (h - 1) * GAP, grande ? 300 : 190) : h * ROW + (h - 1) * GAP;
                        // Widgets anchos (ocupaban casi toda la fila del grid de 12) o
                        // folders/lanzaderas de apps → hilera completa también en la
                        // rejilla táctil, para que respiren y no queden aplastados.
                        // En una sola columna (móvil) esto ya no cambia nada visible
                        // (col-span-1 y col-span-2 caen en la misma columna única).
                        const spanFull = widget.layout.w >= 10
                            || widget.widget_type === "APP_LAUNCHER"
                            || widget.widget_type === "QUICK_ACCESS";
                        return (
                            <motion.div
                                key={widget.layout.i || widget.id}
                                data-widget-key={widget.layout.i || widget.id}
                                initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.3, delay: Math.min(idx * 0.04, 0.45), ease: [0.22, 1, 0.36, 1] }}
                                className={cn(
                                    // Radio moderado (16px): menos esquina "sobrante" y
                                    // mejor aprovechamiento del ancho en cada tarjeta.
                                    "relative rounded-2xl bg-transparent transition-all motion-reduce:transition-none box-border",
                                    libre ? "overflow-visible" : "overflow-hidden",
                                    spanFull ? "col-span-2 md:col-span-3 2xl:col-span-4" : grande && "col-span-2",
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
                                            disabled={idx === 0 || estaBloqueado(widget)}
                                            aria-label="Subir el widget en el orden"
                                            className="absolute top-2 left-2 grid place-items-center min-h-[36px] min-w-[36px] bg-background/80 hover:bg-background border rounded-lg z-50 cursor-pointer transition-colors disabled:opacity-30"
                                            title="Subir / mover antes"
                                        >
                                            <ChevronUp className="w-4 h-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); moveWidget(widget.id, "down"); }}
                                            disabled={idx === ordered.length - 1 || estaBloqueado(widget)}
                                            aria-label="Bajar el widget en el orden"
                                            className="absolute top-2 left-[3.25rem] grid place-items-center min-h-[36px] min-w-[36px] bg-background/80 hover:bg-background border rounded-lg z-50 cursor-pointer transition-colors disabled:opacity-30"
                                            title="Bajar / mover después"
                                        >
                                            <ChevronDown className="w-4 h-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); alternarBloqueo(widget.id); }}
                                            aria-pressed={estaBloqueado(widget)}
                                            aria-label={estaBloqueado(widget) ? "Desbloquear el widget" : "Bloquear el widget (fija su sitio y su tamaño)"}
                                            className={cn("absolute bottom-2 left-2 grid place-items-center min-h-[36px] min-w-[36px] border rounded-lg z-50 cursor-pointer transition-colors", estaBloqueado(widget) ? "bg-amber-500/80 hover:bg-amber-500 text-black border-amber-300" : "bg-background/80 hover:bg-background")}
                                            title={estaBloqueado(widget) ? "Desbloquear" : "Bloquear sitio y tamaño"}
                                        >
                                            {estaBloqueado(widget) ? <Lock className="w-4 h-4" /> : <LockOpen className="w-4 h-4" />}
                                        </button>
                                        <button
                                            type="button"
                                            disabled={estaBloqueado(widget)}
                                            onClick={(e) => { e.stopPropagation(); cycleWidgetSize(widget.id); }}
                                            aria-label={`Cambiar tamaño del widget (actual: ${widgetSize(widget)})`}
                                            className="disabled:opacity-40 disabled:cursor-not-allowed absolute bottom-2 left-[3.25rem] flex items-center gap-1 min-h-[36px] bg-background/80 hover:bg-background border rounded-lg px-2 py-1 z-50 cursor-pointer transition-colors text-[10px] font-bold"
                                            title="Cambiar tamaño (S/M/L/XL)"
                                        >
                                            <Scaling className="w-3.5 h-3.5" />
                                            {widgetSize(widget)}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); handlePinWidget(widget); }}
                                            aria-label="Fijar el widget en pantalla"
                                            className="absolute top-2 right-[6.75rem] grid place-items-center min-h-[36px] min-w-[36px] bg-indigo-500/60 hover:bg-indigo-500 text-white border border-indigo-400/50 rounded-lg cursor-pointer z-50 transition-colors"
                                            title="Fijar en pantalla"
                                        >
                                            <Pin className="w-4 h-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); handleShareWidget(widget); }}
                                            aria-label="Compartir el widget a la biblioteca"
                                            className="absolute top-2 right-[3.5rem] grid place-items-center min-h-[36px] min-w-[36px] bg-emerald-500/60 hover:bg-emerald-500 text-white border border-emerald-400/50 rounded-lg cursor-pointer z-50 transition-colors"
                                            title="Compartir a la biblioteca"
                                        >
                                            <Share2 className="w-4 h-4" />
                                        </button>
                                        {!estaBloqueado(widget) && (
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); handleDeleteWidget(widget.id); }}
                                                aria-label="Eliminar el widget"
                                                className="absolute top-2 right-2 grid place-items-center min-h-[36px] min-w-[36px] bg-destructive/80 hover:bg-destructive text-white border border-destructive rounded-lg cursor-pointer z-50 transition-colors"
                                                title="Eliminar Widget"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        )}
                                        {/* Config del widget (estilo: cristal/sólido/transparente/Trinity). */}
                                        <WidgetConfigPopover
                                            widget={widget}
                                            onChangeSettings={(patch) => applyWidgetSettings(widget.id, patch)}
                                            className="absolute bottom-2 right-2 min-h-[36px] min-w-[36px]"
                                            side="top"
                                            align="end"
                                        />
                                    </>
                                )}
                            </motion.div>
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
                // box-border: el padding cuenta DENTRO del ancho → el lienzo no se
                // desborda ni "encoge" la pantalla. Sin borde propio en reposo (el
                // marco del workspace ya lo aporta): evita el doble borde que robaba
                // espacio visible; solo el modo edición dibuja su guía punteada.
                // Full-bleed (gen10): margen exterior mínimo (4-8px) y radio
                // --screen-corner (0 en navegador; ~12px como app instalada) para
                // casar con la esquina física → sin bandas muertas en ningún tamaño.
                "box-border relative min-h-[500px] flex-1 w-full rounded-[var(--screen-corner)] overflow-visible p-[clamp(0.25rem,0.9vw,0.5rem)] pb-[max(4rem,env(safe-area-inset-bottom))] transition-all duration-300 ease-out backdrop-blur-sm motion-reduce:transition-none",
                isEditMode ? "border-2 border-dashed border-primary/20 bg-primary/[0.02]" : "bg-transparent border-0"
            )}
            // touch-action pan-y SIEMPRE: el dedo scrollea vertical; nada arrastra.
            style={{ touchAction: "pan-y" }}
        >
            {mounted && width > 0 && (
                // (2026-09-28) Envoltura con la cuadrícula visible del editor (solo en edición).
                <div className="relative" style={cuadricula && isEditMode ? fondoCuadricula(width) : undefined} data-cuadricula={cuadricula && isEditMode ? "" : undefined}>
                <ResponsiveGridLayout
                    className="layout transition-all duration-500"
                    layouts={layouts}
                    breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                    cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
                    rowHeight={ALTO_FILA} // slightly taller for better visual separation
                    width={width}
                    // compactType es la API clásica (v1); la v2 compacta en vertical por
                    // defecto (`compactor`). Se conserva por compatibilidad.
                    {...({ compactType: "vertical" } as any)}
                    onLayoutChange={onLayoutChange as any}
                    onBreakpointChange={((p: string) => { puntoActual.current = p; }) as any}
                    onDragStop={handleDragStop as any}
                    onResizeStop={handleDragStop as any}
                    // Arrastre/redimensión SOLO con ratón en modo edición. En táctil
                    // (isCoarse) ambos quedan en false → los widgets nunca se mueven al
                    // tocarlos, deslizar hace scroll y todo botón recibe su tap. El
                    // reordenamiento táctil se hace con los botones ↑/↓ del widget.
                    // ⚠️ react-grid-layout v2 IGNORA isDraggable/isResizable (antes se podía
                    // arrastrar fuera de edición y el cambio no se guardaba): la v2 lee
                    // dragConfig/resizeConfig. Se pasan ambas formas.
                    isDraggable={canDragMouse}
                    isResizable={canDragMouse}
                    dragConfig={{ enabled: canDragMouse, threshold: 4, cancel: "input, textarea, select, [contenteditable='true'], .ss-no-arrastre" }}
                    resizeConfig={{ enabled: canDragMouse }}
                    // Soltar fichas del catálogo del editor superior (con su tamaño).
                    dropConfig={{
                        enabled: puedeSoltarCatalogo,
                        defaultItem: { w: 4, h: 4 },
                        onDragOver: (e: DragEvent) => {
                            if (!esArrastreCatalogo(e.dataTransfer)) return false;
                            const c = arrastreCatalogoActual();
                            return c ? { w: c.w, h: c.h } : undefined;
                        },
                    }}
                    onDrop={alSoltarEnRejilla as any}
                    margin={[MARGEN, MARGEN]} // separación compacta entre widgets
                    // Sin padding extra del grid: por defecto react-grid-layout usa
                    // containerPadding = margin (18px muertos por lado). A 0, los
                    // widgets llegan hasta el borde del lienzo (que ya aporta su
                    // margen mínimo) → sin bandas muertas alrededor.
                    containerPadding={[0, 0]}
                >
                    {widgets.map((widget, idx) => (
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
                            {/* motion.div SOLO en el contenido interno: react-grid-layout
                                clona y posiciona el <div> EXTERIOR (transform absoluto para
                                x/y del grid) — animar ese nodo chocaría con su transform.
                                Aquí solo se anima opacidad/escala del contenido, a salvo. */}
                            <motion.div
                                initial={shouldReduceMotion ? false : { opacity: 0, y: 10, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.28, delay: Math.min(idx * 0.035, 0.4), ease: [0.22, 1, 0.36, 1] }}
                                className={cn(
                                    // Radio moderado (16px) en la tarjeta contenedora: menos
                                    // esquina "sobrante" y mejor aprovechamiento del área.
                                    `h-full w-full transition-all motion-reduce:transition-none bg-transparent rounded-2xl ${libre ? 'overflow-visible' : 'overflow-hidden'} ${isEditMode ? 'ring-2 ring-primary/20' : libre ? '' : 'hover:shadow-lg'}`
                                )}
                            >
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
                                                    disabled={estaBloqueado(widget)}
                                                    aria-label="Subir el widget en el orden"
                                                    className="absolute top-2 left-2 grid place-items-center min-h-[36px] min-w-[36px] bg-background/80 hover:bg-background border rounded-lg z-50 cursor-pointer transition-colors"
                                                    title="Subir / mover antes"
                                                >
                                                    <ChevronUp className="w-4 h-4" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); moveWidget(widget.id, "down"); }}
                                                    disabled={estaBloqueado(widget)}
                                                    aria-label="Bajar el widget en el orden"
                                                    className="absolute top-2 left-[3.25rem] grid place-items-center min-h-[36px] min-w-[36px] bg-background/80 hover:bg-background border rounded-lg z-50 cursor-pointer transition-colors"
                                                    title="Bajar / mover después"
                                                >
                                                    <ChevronDown className="w-4 h-4" />
                                                </button>
                                            </>
                                        )}
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); alternarBloqueo(widget.id); }}
                                            aria-pressed={estaBloqueado(widget)}
                                            aria-label={estaBloqueado(widget) ? "Desbloquear el widget" : "Bloquear el widget (fija su sitio y su tamaño)"}
                                            className={cn("absolute bottom-2 left-2 grid place-items-center min-h-[36px] min-w-[36px] border rounded-lg z-50 cursor-pointer transition-colors", estaBloqueado(widget) ? "bg-amber-500/80 hover:bg-amber-500 text-black border-amber-300" : "bg-background/80 hover:bg-background")}
                                            title={estaBloqueado(widget) ? "Desbloquear" : "Bloquear sitio y tamaño"}
                                        >
                                            {estaBloqueado(widget) ? <Lock className="w-4 h-4" /> : <LockOpen className="w-4 h-4" />}
                                        </button>
                                        <button
                                            type="button"
                                            disabled={estaBloqueado(widget)}
                                            onClick={(e) => { e.stopPropagation(); cycleWidgetSize(widget.id); }}
                                            aria-label={`Cambiar tamaño del widget (actual: ${widgetSize(widget)})`}
                                            className="disabled:opacity-40 disabled:cursor-not-allowed absolute bottom-2 left-[3.25rem] flex items-center gap-1 min-h-[36px] bg-background/80 hover:bg-background border rounded-lg px-2 py-1 z-50 cursor-pointer transition-colors text-[10px] font-bold"
                                            title="Cambiar tamaño (S/M/L/XL)"
                                        >
                                            <Scaling className="w-3.5 h-3.5" />
                                            {widgetSize(widget)}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handlePinWidget(widget);
                                            }}
                                            aria-label="Fijar el widget en pantalla"
                                            className="absolute top-2 right-[6.75rem] grid place-items-center min-h-[36px] min-w-[36px] bg-indigo-500/60 hover:bg-indigo-500 text-white border border-indigo-400/50 rounded-lg cursor-pointer z-50 transition-colors"
                                            title="Fijar en pantalla"
                                        >
                                            <Pin className="w-4 h-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleShareWidget(widget);
                                            }}
                                            aria-label="Compartir el widget a la biblioteca"
                                            className="absolute top-2 right-[3.5rem] grid place-items-center min-h-[36px] min-w-[36px] bg-emerald-500/60 hover:bg-emerald-500 text-white border border-emerald-400/50 rounded-lg cursor-pointer z-50 transition-colors"
                                            title="Compartir a la biblioteca"
                                        >
                                            <Share2 className="w-4 h-4" />
                                        </button>
                                        {!estaBloqueado(widget) && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteWidget(widget.id);
                                                }}
                                                aria-label="Eliminar el widget"
                                                className="absolute top-2 right-2 grid place-items-center min-h-[36px] min-w-[36px] bg-destructive/80 hover:bg-destructive text-white border border-destructive rounded-lg cursor-pointer z-50 transition-colors"
                                                title="Eliminar Widget"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        )}
                                        {/* Config del widget (estilo: cristal/sólido/transparente/Trinity). */}
                                        <WidgetConfigPopover
                                            widget={widget}
                                            onChangeSettings={(patch) => applyWidgetSettings(widget.id, patch)}
                                            className="absolute bottom-2 right-2"
                                            side="top"
                                            align="end"
                                        />
                                    </>
                                )}
                            </motion.div>
                        </div>
                    ))}
                </ResponsiveGridLayout>
                </div>
            )}
        </div>
    );
}

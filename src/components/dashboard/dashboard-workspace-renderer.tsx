"use client";

import React, { useMemo, useRef, useState, useCallback } from "react";
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from "react-resizable-panels";
import { useWorkspace } from "./dashboard-workspace-context";
import { WorkspaceNode, PanelNode } from "./dashboard-workspace-types";
import { Dashboard } from "./dashboard-types";
import { DashboardPanelHeader } from "./dashboard-panel-header";
import { GridArea } from "./grid-area";
import { AddWidgetDialog } from "./add-widget-dialog";
import { DashboardAiSuggestions } from "./dashboard-ai-suggestions";
import { DashboardWidget, WidgetType, DeviceType } from "./dashboard-types";
import { cn } from "@/lib/utils";
import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { LayoutPanelLeft, Plus } from "lucide-react";

interface WorkspaceRendererProps {
    dashboards: Dashboard[];
    isEditMode: boolean;
    widgetsMap: Record<string, DashboardWidget[]>;
    setWidgets: React.Dispatch<React.SetStateAction<DashboardWidget[]>>;
    onPinWidget: (widget: DashboardWidget) => void;
    onAddWidget: (dashId: string, type: WidgetType) => void;
    onForgeOpen: () => void;
    onCreateDashboard?: () => void;
    onDeleteDashboard?: (id: string) => void;
    onRenameDashboard?: (id: string) => void;
    onCreateFromTemplate?: (categoryId: string, name: string) => void;
    /** Tipo de dispositivo actual (resalta tableros afines en la barra). */
    currentDevice?: DeviceType;
    /** Etiqueta un tablero por tipo de dispositivo (agrupación por dispositivo). */
    onSetDeviceTags?: (id: string, tags: DeviceType[]) => void;
    /** Abre el gestor de dispositivos y sincronización. */
    onOpenDeviceManager?: () => void;
}

export function DashboardWorkspaceRenderer(props: WorkspaceRendererProps) {
    const { state } = useWorkspace();

    return (
        <div className="w-full h-full flex flex-col flex-1 min-h-0 bg-transparent rounded-3xl border border-white/5 overflow-hidden">
            <NodeRenderer node={state.root} {...props} />
        </div>
    );
}

function NodeRenderer({ node, ...props }: { node: WorkspaceNode } & WorkspaceRendererProps) {
    const { setState } = useWorkspace();

    if (node.type === 'panel') {
        return <DashboardPanel node={node} {...props} />;
    }

    if (node.type === 'split') {
        return (
            <PanelGroup 
                orientation={node.direction} 
                className="w-full h-full"
                onLayoutChange={(layout) => {
                    // Upate sizes in state if needed
                    setState((prev) => {
                        const newState = JSON.parse(JSON.stringify(prev));
                        const updateSizes = (n: WorkspaceNode): WorkspaceNode => {
                            if (n.type === 'split' && n.id === node.id) {
                                // Extract sizes array in order of children using layout object
                                const newSizes = n.children.map(child => layout[child.id] || 0);
                                return { ...n, sizes: newSizes };
                            }
                            if (n.type === 'split') {
                                return { ...n, children: n.children.map(updateSizes) };
                            }
                            return n;
                        };
                        newState.root = updateSizes(newState.root);
                        return newState;
                    });
                }}
            >
                {node.children.map((child, index) => (
                    <React.Fragment key={child.id}>
                        <Panel 
                            id={child.id}
                            defaultSize={node.sizes[index] || (100 / node.children.length)}
                            minSize={15}
                        >
                            <NodeRenderer node={child} {...props} />
                        </Panel>
                        {index < node.children.length - 1 && (
                            <PanelResizeHandle className={cn(
                                "relative flex items-center justify-center transition-all",
                                node.direction === 'horizontal' ? "w-2 hover:w-3 cursor-col-resize" : "h-2 hover:h-3 cursor-row-resize"
                            )}>
                                <div className={cn(
                                    "bg-white/10 hover:bg-cyan-500/50 transition-colors shadow-[0_0_10px_rgba(34,211,238,0)] hover:shadow-[0_0_10px_rgba(34,211,238,0.5)]",
                                    node.direction === 'horizontal' ? "w-0.5 h-1/3 rounded-full" : "h-0.5 w-1/3 rounded-full"
                                )} />
                            </PanelResizeHandle>
                        )}
                    </React.Fragment>
                ))}
            </PanelGroup>
        );
    }

    return null;
}

function DashboardPanel({ node, dashboards, isEditMode, widgetsMap, setWidgets, onPinWidget, onAddWidget, onForgeOpen, onCreateDashboard, onDeleteDashboard, onRenameDashboard, onCreateFromTemplate, currentDevice, onSetDeviceTags, onOpenDeviceManager }: { node: PanelNode } & WorkspaceRendererProps) {
    const { activeDashboardId, dashboardIds } = node;
    const activeDashboard = dashboards.find(d => d.id === activeDashboardId);
    const panelDashboards = dashboards.filter(d => dashboardIds.includes(d.id));

    const { openDashboardInPanel } = useWorkspace();

    if (dashboardIds.length === 0 || !activeDashboard) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-black/50 border border-dashed border-white/10 rounded-[2rem] p-6 m-2 backdrop-blur-xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl" />
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl" />
                
                <div className="z-10 text-center max-w-xs space-y-4">
                    <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mx-auto text-cyan-400">
                        <LayoutPanelLeft className="w-5 h-5" />
                    </div>
                    <div>
                        <h4 className="text-xs font-mono uppercase tracking-[0.2em] text-white/60">Añadir Ventana de Dashboard</h4>
                        <p className="text-[10px] text-white/30 mt-1 leading-normal">
                            Selecciona un dashboard existente o crea uno nuevo para esta sección.
                        </p>
                    </div>

                    <div className="flex flex-col gap-2 pt-2">
                        {dashboards.length > 0 && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-9 rounded-xl text-xs gap-1.5 border-white/10 hover:bg-white/5 text-white/70">
                                        Abrir Dashboard Existente
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="center" className="bg-black/95 border-white/10 backdrop-blur-xl max-h-[200px] overflow-y-auto">
                                    {dashboards.map(d => (
                                        <DropdownMenuItem 
                                            key={d.id} 
                                            onClick={() => openDashboardInPanel(d.id, node.id)}
                                            className="text-xs text-white hover:bg-white/10 cursor-pointer focus:bg-white/10"
                                        >
                                            {d.name}
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}

                        {onCreateDashboard && (
                            <Button 
                                onClick={onCreateDashboard}
                                size="sm" 
                                className="h-9 rounded-xl text-xs gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-medium shadow-[0_0_15px_rgba(6,182,212,0.3)] border-transparent"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                Crear Nuevo Dashboard
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    const activeWidgets = widgetsMap[activeDashboard.id] || [];

    // Barra superior (pestañas de ventanas de dashboard) inteligente: se oculta
    // al hacer scroll hacia abajo y reaparece al subir o al llegar arriba. El
    // scroll real ocurre en este contenedor interno (no en window).
    const scrollRef = useRef<HTMLDivElement>(null);
    const lastYRef = useRef(0);
    const [headerHidden, setHeaderHidden] = useState(false);
    const onScroll = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        const y = el.scrollTop;
        if (y < 24) setHeaderHidden(false);                       // siempre visible arriba
        else if (y > lastYRef.current + 8) setHeaderHidden(true); // baja → ocultar
        else if (y < lastYRef.current - 8) setHeaderHidden(false);// sube → mostrar
        lastYRef.current = y;
    }, []);

    return (
        <div className="w-full h-full flex flex-col bg-transparent relative">
            <div
                className={cn(
                    "shrink-0 overflow-hidden transition-all duration-300 ease-out",
                    headerHidden ? "max-h-0 opacity-0 -translate-y-2 pointer-events-none" : "max-h-28 opacity-100"
                )}
            >
                <DashboardPanelHeader
                    panelId={node.id}
                    dashboards={panelDashboards}
                    activeId={activeDashboardId}
                    allDashboards={dashboards}
                    isEditMode={isEditMode}
                    widgetCounts={Object.fromEntries(
                        panelDashboards.map((d) => [d.id, (widgetsMap[d.id] || []).length])
                    )}
                    currentDevice={currentDevice}
                    onCreateDashboard={onCreateDashboard}
                    onDeleteDashboard={onDeleteDashboard}
                    onRenameDashboard={onRenameDashboard}
                    onSetDeviceTags={onSetDeviceTags}
                    onOpenDeviceManager={onOpenDeviceManager}
                />
            </div>
            {/* Zona-pista para revelar la barra cuando está oculta (hover/tap arriba) */}
            {headerHidden && (
                <button
                    type="button"
                    aria-label="Mostrar barra de dashboards"
                    onMouseEnter={() => setHeaderHidden(false)}
                    onClick={() => setHeaderHidden(false)}
                    className="absolute top-0 inset-x-0 z-20 h-3 flex items-center justify-center group"
                >
                    <span className="h-1 w-10 rounded-full bg-foreground/20 group-hover:bg-primary/60 transition-colors" />
                </button>
            )}

            {/* box-border + padding reducido: el scroll interno del panel ya no
                duplica el padding del lienzo (GridArea aporta el suyo), devolviendo
                ancho útil a los widgets. overflow-x-hidden evita barras horizontales
                accidentales por hijos que se salgan durante una animación. */}
            <div ref={scrollRef} onScroll={onScroll} style={{ touchAction: "pan-y" }} className="box-border flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar relative px-1.5 py-2 sm:px-2">
                <GridArea
                    dashboardId={activeDashboard.id}
                    widgets={activeWidgets}
                    setWidgets={(newWidgets: DashboardWidget[]) => {
                        setWidgets(prev => [
                            ...prev.filter(w => w.dashboard_id !== activeDashboard.id),
                            ...newWidgets
                        ]);
                    }}
                    isEditMode={isEditMode}
                    onPinWidget={onPinWidget}
                    onAddWidget={onAddWidget}
                    onForgeOpen={onForgeOpen}
                />

                {isEditMode && (
                    <div className="mt-6 pb-12 flex flex-col items-center gap-4">
                        {/* Astraura — sugerencias proactivas para este tablero */}
                        <div className="w-full max-w-md">
                            <DashboardAiSuggestions
                                widgets={activeWidgets}
                                dashboardName={activeDashboard.name}
                                onAddWidget={(type) => onAddWidget(activeDashboard.id, type)}
                                onCreateFromTemplate={onCreateFromTemplate}
                            />
                        </div>
                        <div className="opacity-50 hover:opacity-100 transition-opacity">
                            <AddWidgetDialog
                                isEditMode={isEditMode}
                                onAdd={(type: WidgetType) => onAddWidget(activeDashboard.id, type)}
                                onForgeOpen={onForgeOpen}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

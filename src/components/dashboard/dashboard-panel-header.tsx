"use client";

import React from "react";
import { Dashboard } from "./dashboard-types";
import { useWorkspace } from "./dashboard-workspace-context";
import { cn } from "@/lib/utils";
import { LayoutPanelLeft, LayoutPanelTop, X, Star, Plus, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface HeaderProps {
    panelId: string;
    dashboards: Dashboard[];
    activeId: string;
    allDashboards: Dashboard[];
    isEditMode?: boolean;
    /** nº de widgets por dashboard (para la insignia de "carpeta"). Opcional. */
    widgetCounts?: Record<string, number>;
    onCreateDashboard?: () => void;
    onDeleteDashboard?: (id: string) => void;
    onRenameDashboard?: (id: string) => void;
}

function SortableTab({
    dashboard, isActive, count, onClick,
}: { dashboard: Dashboard; isActive: boolean; count?: number; onClick: () => void }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dashboard.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        // El elemento arrastrado va por encima para que no lo recorten sus vecinos.
        zIndex: isDragging ? 30 : undefined,
    };

    return (
        <button
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={onClick}
            title={dashboard.name}
            className={cn(
                // box-border + shrink-0: cada "carpeta" (pestaña) conserva su tamaño y
                // NUNCA se recorta; el track las desplaza horizontalmente con scroll.
                "box-border shrink-0 cursor-pointer flex items-center gap-1.5 px-3.5 py-2 rounded-t-xl text-xs font-medium transition-all duration-200 max-w-[180px] border-x border-t relative group",
                isDragging && "opacity-80 scale-[1.02]",
                isActive
                    ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/25 shadow-[0_-6px_18px_-6px_rgba(34,211,238,0.28)]"
                    : "bg-transparent text-white/45 border-transparent hover:bg-white/5 hover:text-white/75 hover:border-white/10"
            )}
        >
            {/* Punto de estado de "carpeta activa" (claridad visual del tab activo). */}
            <span
                aria-hidden
                className={cn(
                    "size-1.5 rounded-full shrink-0 transition-colors",
                    isActive ? "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" : "bg-white/20 group-hover:bg-white/40"
                )}
            />
            <span className="truncate select-none">{dashboard.name}</span>
            {typeof count === "number" && count > 0 && (
                <span
                    className={cn(
                        "shrink-0 tabular-nums text-[9px] font-bold leading-none rounded-full px-1.5 py-0.5 border transition-colors",
                        isActive
                            ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-200"
                            : "bg-white/5 border-white/10 text-white/40 group-hover:text-white/60"
                    )}
                    title={`${count} widget${count === 1 ? "" : "s"} en esta carpeta`}
                >
                    {count}
                </span>
            )}
            {dashboard.is_default && <Star className="w-3 h-3 fill-yellow-400 text-yellow-400 shrink-0" />}
            {/* Subrayado de acento del tab activo (asienta la "carpeta" sobre el lienzo). */}
            {isActive && (
                <span aria-hidden className="pointer-events-none absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent" />
            )}
        </button>
    );
}

export function DashboardPanelHeader({ panelId, dashboards, activeId, allDashboards, isEditMode, widgetCounts, onCreateDashboard, onDeleteDashboard, onRenameDashboard }: HeaderProps) {
    const { setActiveDashboard, closePanel, splitPanel, setState } = useWorkspace();

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            setState((prev) => {
                const newState = JSON.parse(JSON.stringify(prev));
                
                const updatePanel = (node: any): any => {
                    if (node.type === 'panel' && node.id === panelId) {
                        const oldIndex = node.dashboardIds.indexOf(active.id as string);
                        const newIndex = node.dashboardIds.indexOf(over.id as string);
                        return {
                            ...node,
                            dashboardIds: arrayMove(node.dashboardIds, oldIndex, newIndex)
                        };
                    }
                    if (node.type === 'split') {
                        return { ...node, children: node.children.map(updatePanel) };
                    }
                    return node;
                };

                newState.root = updatePanel(newState.root);
                return newState;
            });
        }
    };

    return (
        // box-border + w-full + overflow-hidden en el contenedor externo: la barra
        // (menú de "carpetas") NUNCA excede el ancho del panel ni empuja el lienzo.
        // El scroll horizontal vive SOLO en el track de pestañas (abajo), y los
        // controles del panel quedan fijados (no se recortan cuando hay muchas
        // carpetas). Antes: doble overflow-x-auto + justify-between recortaba los
        // botones de la derecha y encogía el área visible.
        <div className="box-border w-full flex items-stretch gap-1 px-2 pt-2 pb-0 bg-black/60 border-b border-white/5 shrink-0 overflow-hidden">
            {/* Tabs Area — ÚNICA zona con scroll horizontal. min-w-0 permite encoger
                el track para que los controles de la derecha siempre quepan. */}
            <div className="flex-1 min-w-0 flex items-end gap-1 overflow-x-auto overflow-y-hidden pb-1 custom-scrollbar overscroll-x-contain">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={dashboards.map(d => d.id)} strategy={horizontalListSortingStrategy}>
                        {dashboards.map(d => (
                            <SortableTab
                                key={d.id}
                                dashboard={d}
                                isActive={d.id === activeId}
                                count={widgetCounts?.[d.id]}
                                onClick={() => setActiveDashboard(panelId, d.id)}
                            />
                        ))}
                    </SortableContext>
                </DndContext>

                {isEditMode && onCreateDashboard && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7 rounded-full ml-1 mb-1 text-white/40 hover:text-cyan-400 hover:bg-cyan-500/10 border border-dashed border-white/20 shrink-0 cursor-pointer"
                        onClick={onCreateDashboard}
                        title="Crear carpeta / dashboard"
                    >
                        <Plus className="w-3.5 h-3.5" />
                    </Button>
                )}
            </div>

            {/* Panel Controls — fijados a la derecha; nunca se recortan. Un separador
                degradado marca el borde con el track de carpetas cuando hay scroll. */}
            <div className="shrink-0 flex items-center gap-1 pb-2 pl-2 self-center border-l border-white/5">
                {isEditMode && activeId && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="w-7 h-7 rounded-lg text-white/30 hover:text-cyan-400 hover:bg-cyan-500/10 cursor-pointer"
                                title="Configuración de Dashboard (carpeta)"
                            >
                                <Settings2 className="w-3.5 h-3.5" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-black/90 border-white/10 backdrop-blur-xl">
                            <DropdownMenuItem
                                className="text-white hover:bg-white/10 cursor-pointer"
                                onClick={() => onRenameDashboard?.(activeId)}
                            >
                                Renombrar Dashboard
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-white hover:bg-white/10 cursor-pointer">
                                Configurar Grilla
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-white/10" />
                            <DropdownMenuItem 
                                className="text-red-400 hover:bg-red-500/20 cursor-pointer focus:text-red-300"
                                onClick={() => onDeleteDashboard?.(activeId)}
                            >
                                <Trash2 className="w-3.5 h-3.5 mr-2" />
                                Eliminar Dashboard
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}

                {isEditMode && activeId && <div className="w-px h-4 bg-white/10 mx-1 shrink-0" />}

                <Button
                    variant="ghost"
                    size="icon"
                    className="w-7 h-7 rounded-lg text-white/30 hover:text-cyan-400 hover:bg-cyan-500/10 cursor-pointer"
                    onClick={() => splitPanel(panelId, 'horizontal')}
                    title="Dividir Horizontalmente"
                >
                    <LayoutPanelLeft className="w-3.5 h-3.5" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="w-7 h-7 rounded-lg text-white/30 hover:text-cyan-400 hover:bg-cyan-500/10 cursor-pointer"
                    onClick={() => splitPanel(panelId, 'vertical')}
                    title="Dividir Verticalmente"
                >
                    <LayoutPanelTop className="w-3.5 h-3.5" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="w-7 h-7 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 ml-1 cursor-pointer"
                    onClick={() => closePanel(panelId)}
                    title="Cerrar Panel"
                >
                    <X className="w-4 h-4" />
                </Button>
            </div>
        </div>
    );
}

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
    onCreateDashboard?: () => void;
    onDeleteDashboard?: (id: string) => void;
    onRenameDashboard?: (id: string) => void;
}

function SortableTab({ dashboard, isActive, onClick }: { dashboard: Dashboard; isActive: boolean; onClick: () => void }) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: dashboard.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <button
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={onClick}
            className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-t-xl text-xs font-medium transition-all duration-300 max-w-[160px] border-x border-t border-transparent relative group",
                isActive 
                    ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20 shadow-[0_-5px_15px_-5px_rgba(34,211,238,0.2)]" 
                    : "bg-transparent text-white/40 hover:bg-white/5 hover:text-white/70"
            )}
        >
            <span className="truncate select-none">{dashboard.name}</span>
            {dashboard.is_default && <Star className="w-3 h-3 fill-yellow-400 text-yellow-400 shrink-0" />}
        </button>
    );
}

export function DashboardPanelHeader({ panelId, dashboards, activeId, allDashboards, isEditMode, onCreateDashboard, onDeleteDashboard, onRenameDashboard }: HeaderProps) {
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
        <div className="flex items-center justify-between px-2 pt-2 pb-0 bg-black/60 border-b border-white/5 shrink-0 overflow-x-auto custom-scrollbar">
            {/* Tabs Area */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={dashboards.map(d => d.id)} strategy={horizontalListSortingStrategy}>
                        {dashboards.map(d => (
                            <SortableTab 
                                key={d.id} 
                                dashboard={d} 
                                isActive={d.id === activeId} 
                                onClick={() => setActiveDashboard(panelId, d.id)} 
                            />
                        ))}
                    </SortableContext>
                </DndContext>

                {isEditMode && onCreateDashboard && (
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="w-7 h-7 rounded-full ml-2 text-white/40 hover:text-cyan-400 hover:bg-cyan-500/10 border border-dashed border-white/20 shrink-0"
                        onClick={onCreateDashboard}
                        title="Crear Dashboard"
                    >
                        <Plus className="w-3.5 h-3.5" />
                    </Button>
                )}
            </div>

            {/* Panel Controls */}
            <div className="flex items-center gap-1 pb-2 pr-2 shrink-0">
                {isEditMode && activeId && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="w-7 h-7 rounded-lg text-white/30 hover:text-cyan-400 hover:bg-cyan-500/10"
                                title="Configuración de Dashboard"
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
                
                <div className="w-px h-4 bg-white/10 mx-1" />

                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="w-7 h-7 rounded-lg text-white/30 hover:text-cyan-400 hover:bg-cyan-500/10"
                    onClick={() => splitPanel(panelId, 'horizontal')}
                    title="Dividir Horizontalmente"
                >
                    <LayoutPanelLeft className="w-3.5 h-3.5" />
                </Button>
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="w-7 h-7 rounded-lg text-white/30 hover:text-cyan-400 hover:bg-cyan-500/10"
                    onClick={() => splitPanel(panelId, 'vertical')}
                    title="Dividir Verticalmente"
                >
                    <LayoutPanelTop className="w-3.5 h-3.5" />
                </Button>
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="w-7 h-7 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 ml-1"
                    onClick={() => closePanel(panelId)}
                    title="Cerrar Panel"
                >
                    <X className="w-4 h-4" />
                </Button>
            </div>
        </div>
    );
}

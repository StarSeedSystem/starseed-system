"use client";

import React from "react";
import { Dashboard, DeviceType } from "./dashboard-types";
import { useWorkspace } from "./dashboard-workspace-context";
import { cn } from "@/lib/utils";
import { LayoutPanelLeft, LayoutPanelTop, X, Star, Plus, Settings2, Trash2, MonitorSmartphone, Check, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { DEVICE_TYPES, deviceTypeById } from "./dashboard-devices";

interface HeaderProps {
    panelId: string;
    dashboards: Dashboard[];
    activeId: string;
    allDashboards: Dashboard[];
    isEditMode?: boolean;
    /** nº de widgets por dashboard (para la insignia de "folder"). Opcional. */
    widgetCounts?: Record<string, number>;
    /** Tipo de dispositivo actual (para resaltar los tableros afines). Opcional. */
    currentDevice?: DeviceType;
    onCreateDashboard?: () => void;
    onDeleteDashboard?: (id: string) => void;
    onRenameDashboard?: (id: string) => void;
    /** Abre el diálogo universal de permisos/compartición del tablero (Adenda 63 §5). */
    onShareDashboard?: (id: string) => void;
    /** Etiqueta un tablero para un tipo de dispositivo (agrupación por dispositivo). */
    onSetDeviceTags?: (id: string, tags: DeviceType[]) => void;
    /** Abre el gestor de dispositivos/sincronización. Opcional. */
    onOpenDeviceManager?: () => void;
}

// Insignia compacta del tipo de dispositivo de una pestaña (si está etiquetada).
function DeviceBadge({ tags, active }: { tags?: DeviceType[]; active: boolean }) {
    const t = (tags ?? []).find((x) => x !== "all");
    if (!t) return null;
    const def = deviceTypeById(t);
    if (!def) return null;
    const Icon = def.icon;
    return (
        <span
            title={`Dispositivo: ${def.label}`}
            className={cn(
                "shrink-0 grid place-items-center size-4 rounded-full border transition-colors",
                active ? "border-white/25" : "border-white/10"
            )}
            style={{ color: def.accent, background: `color-mix(in srgb, ${def.accent} 14%, transparent)` }}
        >
            <Icon className="size-2.5" />
        </span>
    );
}

function SortableTab({
    dashboard, isActive, count, highlight, onClick, deviceMenu,
}: {
    dashboard: Dashboard;
    isActive: boolean;
    count?: number;
    /** Resaltar suavemente porque coincide con el dispositivo actual. */
    highlight?: boolean;
    onClick: () => void;
    deviceMenu?: React.ReactNode;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dashboard.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        // El elemento arrastrado va por encima para que no lo recorten sus vecinos.
        zIndex: isDragging ? 30 : undefined,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                // box-border + shrink-0: cada "folder" (pestaña) conserva su tamaño y
                // NUNCA se recorta; el track las desplaza horizontalmente con scroll.
                // rounded-t-lg (esquinas superiores) + borde inferior transparente en
                // activo → la pestaña se ASIENTA sobre el lienzo sin dejar hueco muerto
                // en las esquinas (el problema que teníamos con rounded-t-xl aislado).
                "box-border shrink-0 flex items-stretch rounded-t-lg text-xs font-medium transition-all duration-200 border-x border-t relative group",
                isDragging && "opacity-80 scale-[1.02]",
                isActive
                    ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/25 shadow-[0_-6px_18px_-6px_rgba(34,211,238,0.28)]"
                    : cn(
                        "bg-transparent text-white/45 border-transparent hover:bg-white/5 hover:text-white/75 hover:border-white/10",
                        highlight && "ring-1 ring-inset ring-emerald-400/25"
                    )
            )}
        >
            <button
                {...attributes}
                {...listeners}
                onClick={onClick}
                title={dashboard.name}
                className="box-border cursor-pointer flex items-center gap-1.5 pl-3 pr-2 py-2 max-w-[180px] min-w-0"
            >
                {/* Punto de estado de "folder activo" (claridad visual del tab activo). */}
                <span
                    aria-hidden
                    className={cn(
                        "size-1.5 rounded-full shrink-0 transition-colors",
                        isActive ? "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" : "bg-white/20 group-hover:bg-white/40"
                    )}
                />
                <DeviceBadge tags={dashboard.deviceTags} active={isActive} />
                <span className="truncate select-none">{dashboard.name}</span>
                {typeof count === "number" && count > 0 && (
                    <span
                        className={cn(
                            "shrink-0 tabular-nums text-[9px] font-bold leading-none rounded-full px-1.5 py-0.5 border transition-colors",
                            isActive
                                ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-200"
                                : "bg-white/5 border-white/10 text-white/40 group-hover:text-white/60"
                        )}
                        title={`${count} widget${count === 1 ? "" : "s"} en este folder`}
                    >
                        {count}
                    </span>
                )}
                {dashboard.is_default && <Star className="w-3 h-3 fill-yellow-400 text-yellow-400 shrink-0" />}
            </button>

            {/* Menú de dispositivo por pestaña (sólo en edición) — no anidado en el
                botón para no interferir con el arrastre/click de selección. */}
            {deviceMenu}

            {/* Subrayado de acento del tab activo (asienta el "folder" sobre el lienzo). */}
            {isActive && (
                <span aria-hidden className="pointer-events-none absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent" />
            )}
        </div>
    );
}

// Menú desplegable para etiquetar una pestaña por tipo de dispositivo.
function TabDeviceMenu({ dashboard, onSetDeviceTags }: {
    dashboard: Dashboard;
    onSetDeviceTags: (id: string, tags: DeviceType[]) => void;
}) {
    const tags = dashboard.deviceTags ?? [];
    const toggle = (t: DeviceType) => {
        if (t === "all") { onSetDeviceTags(dashboard.id, []); return; }
        const set = new Set(tags.filter((x) => x !== "all"));
        if (set.has(t)) set.delete(t); else set.add(t);
        onSetDeviceTags(dashboard.id, Array.from(set));
    };
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    title="Agrupar por dispositivo"
                    aria-label="Agrupar por dispositivo"
                    className="grid place-items-center px-1.5 rounded-r-lg text-white/30 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors cursor-pointer"
                >
                    <MonitorSmartphone className="w-3.5 h-3.5" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="bg-black/90 border-white/10 backdrop-blur-xl">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-white/40">Dispositivos del tablero</DropdownMenuLabel>
                {DEVICE_TYPES.map((d) => {
                    const on = d.id === "all" ? tags.length === 0 : tags.includes(d.id);
                    const Icon = d.icon;
                    return (
                        <DropdownMenuItem
                            key={d.id}
                            onClick={(e) => { e.preventDefault(); toggle(d.id); }}
                            className="text-white hover:bg-white/10 cursor-pointer gap-2 text-xs"
                        >
                            <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: d.accent }} />
                            <span className="flex-1">{d.label}</span>
                            {on && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export function DashboardPanelHeader({
    panelId, dashboards, activeId, allDashboards, isEditMode, widgetCounts, currentDevice,
    onCreateDashboard, onDeleteDashboard, onRenameDashboard, onShareDashboard, onSetDeviceTags, onOpenDeviceManager,
}: HeaderProps) {
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
        // (menú de "folders") NUNCA excede el ancho del panel ni empuja el lienzo.
        // px reducido (px-1.5) para no desperdiciar espacio en los bordes; el track
        // de pestañas llega casi al borde y los controles quedan fijados a la derecha
        // sin recortarse. El scroll horizontal vive SOLO en el track de pestañas.
        <div className="box-border w-full flex items-stretch gap-0.5 px-1.5 pt-1.5 pb-0 bg-black/60 border-b border-white/5 shrink-0 overflow-hidden">
            {/* Tabs Area — ÚNICA zona con scroll horizontal. min-w-0 permite encoger
                el track para que los controles de la derecha siempre quepan. Los tabs
                se asientan sobre el lienzo (pb-0) sin hueco muerto en las esquinas. */}
            <div className="flex-1 min-w-0 flex items-end gap-0.5 overflow-x-auto overflow-y-hidden custom-scrollbar overscroll-x-contain">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={dashboards.map(d => d.id)} strategy={horizontalListSortingStrategy}>
                        {dashboards.map(d => {
                            const highlight = !!currentDevice && !!d.deviceTags?.length
                                && !d.deviceTags.includes("all") && d.deviceTags.includes(currentDevice);
                            return (
                                <SortableTab
                                    key={d.id}
                                    dashboard={d}
                                    isActive={d.id === activeId}
                                    count={widgetCounts?.[d.id]}
                                    highlight={highlight}
                                    onClick={() => setActiveDashboard(panelId, d.id)}
                                    deviceMenu={isEditMode && onSetDeviceTags ? (
                                        <TabDeviceMenu dashboard={d} onSetDeviceTags={onSetDeviceTags} />
                                    ) : undefined}
                                />
                            );
                        })}
                    </SortableContext>
                </DndContext>

                {isEditMode && onCreateDashboard && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7 rounded-lg ml-0.5 mb-1 text-white/40 hover:text-cyan-400 hover:bg-cyan-500/10 border border-dashed border-white/20 shrink-0 cursor-pointer"
                        onClick={onCreateDashboard}
                        title="Crear folder / dashboard"
                    >
                        <Plus className="w-3.5 h-3.5" />
                    </Button>
                )}
            </div>

            {/* Panel Controls — fijados a la derecha; nunca se recortan. Un separador
                marca el borde con el track de folders cuando hay scroll. */}
            <div className="shrink-0 flex items-center gap-0.5 pb-1.5 pl-1.5 self-center border-l border-white/5">
                {/* Gestor de dispositivos / sincronización (visible siempre; discreto). */}
                {onOpenDeviceManager && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7 rounded-lg text-white/30 hover:text-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
                        onClick={onOpenDeviceManager}
                        title="Dispositivos y sincronización"
                    >
                        <MonitorSmartphone className="w-3.5 h-3.5" />
                    </Button>
                )}

                {isEditMode && activeId && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="w-7 h-7 rounded-lg text-white/30 hover:text-cyan-400 hover:bg-cyan-500/10 cursor-pointer"
                                title="Configuración de Dashboard (folder)"
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
                            {onShareDashboard && (
                                <DropdownMenuItem
                                    className="text-white hover:bg-white/10 cursor-pointer"
                                    onClick={() => onShareDashboard(activeId)}
                                >
                                    <Share2 className="w-3.5 h-3.5 mr-2" />
                                    Compartir
                                </DropdownMenuItem>
                            )}
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

                {isEditMode && activeId && <div className="w-px h-4 bg-white/10 mx-0.5 shrink-0" />}

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
                    className="w-7 h-7 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 ml-0.5 cursor-pointer"
                    onClick={() => closePanel(panelId)}
                    title="Cerrar Panel"
                >
                    <X className="w-4 h-4" />
                </Button>
            </div>
        </div>
    );
}

"use client";
/**
 * Barra de pestañas de los dashboards (rediseño 2026-09-29).
 *
 * Alex: «dale otra pasada de diseño… a cada pestaña de dashboards». Cada pestaña lleva la
 * identidad de su tema (icono y luz de su familia, o los que la persona eligió), su NOMBRE
 * COMPLETO en una línea (con «…» si no cabe y deslizándose al pasar el cursor, como en el dock) y
 * un punto cuando su tema tiene un diseño nuevo que aún no estrenó. Lo que no cabe NUNCA se
 * convierte en una tira con scroll: pasa al menú «Más», una lista vertical con los nombres enteros.
 *
 *  · Cambiar rápido: clic, flechas ←/→ entre pestañas (foco itinerante), Alt+1…9, Alt+[ y Alt+],
 *    y deslizar en táctil (en el panel, ver dashboard-workspace-renderer).
 *  · Reordenar: arrastrando (ratón), desde el menú de la pestaña o con Alt+Mayús+[ / ].
 *  · Menú de cada pestaña (botón «Opciones», clic derecho o la tecla de menú): renombrar, icono y
 *    color, duplicar, mover, principal, estrenar o restablecer su diseño, compartir, exportar,
 *    dispositivos y eliminar. Es una lista vertical.
 *  · Teléfono (< 640 px): un botón con la pestaña actual abre la lista completa en una hoja.
 */
import React from "react";
import { Dashboard, DeviceType } from "./dashboard-types";
import { useWorkspace } from "./dashboard-workspace-context";
import { cn } from "@/lib/utils";
import {
    LayoutPanelLeft, LayoutPanelTop, X, Star, Plus, Trash2, MonitorSmartphone, Check, Share2, Pencil, MoreHorizontal,
    ChevronDown, Copy, MoveLeft, MoveRight, Palette, Sparkles, RotateCcw, Download, Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuShortcut,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DEVICE_TYPES, deviceTypeById } from "./dashboard-devices";
import { MenuListaMovil } from "@/components/ui/menu-lista-movil";
import { EtiquetaDeslizante } from "@/components/layout/etiqueta-deslizante";
import type { DashboardConAspecto } from "./editor-superior/tipos";
import { aspectoDe, conAlfa } from "./pestanas/temas";
import { accionDeAtajo, anchoEstimado, repartirPestanas } from "./pestanas/navegacion";

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
    /** (2026-09-28) Entra o sale del editor superior (botón «Editar» / «Listo» de la barra). */
    onAlternarEdicion?: () => void;
    /** (2026-09-28) Reordenar pestañas con arrastre: persiste el orden en la lista de tableros. */
    onReordenar?: (activoId: string, sobreId: string) => void;
    // ── (2026-09-29) Menú de cada pestaña ──
    onDuplicar?: (id: string) => void;
    onMover?: (id: string, direccion: "izquierda" | "derecha") => void;
    onPrincipal?: (id: string) => void;
    onExportar?: (id: string) => void;
    /** Abre el editor en «Pestaña» para elegir icono y color. */
    onEditarAspecto?: (id: string) => void;
    onRestablecerDiseno?: (id: string) => void;
    onAplicarNovedad?: (id: string) => void;
    onDescartarNovedad?: (id: string) => void;
    /** Pestañas con un diseño nuevo de su tema aún sin estrenar. */
    novedades?: ReadonlySet<string>;
    /** Pestañas que salen de una plantilla temática (se pueden restablecer). */
    predeterminadas?: ReadonlySet<string>;
    /** Esta barra atiende los atajos de teclado (solo la del panel enfocado). */
    atajos?: boolean;
}

/** true si el foco está en un campo de texto (ahí las teclas son del campo). */
function escribiendo(el: Element | null): boolean {
    if (!el) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement).isContentEditable === true;
}

// Insignia compacta del tipo de dispositivo de una pestaña (si está etiquetada).
function DeviceBadge({ tags }: { tags?: DeviceType[] }) {
    const t = (tags ?? []).find((x) => x !== "all");
    if (!t) return null;
    const def = deviceTypeById(t);
    if (!def) return null;
    const Icon = def.icon;
    return (
        <span
            title={`Dispositivo: ${def.label}`}
            className="shrink-0 grid place-items-center size-4 rounded-full border border-white/15"
            style={{ color: def.accent, background: `color-mix(in srgb, ${def.accent} 14%, transparent)` }}
        >
            <Icon className="size-2.5" aria-hidden />
        </span>
    );
}

interface AccionesMenu {
    onRenombrar?: (id: string) => void;
    onEditarAspecto?: (id: string) => void;
    onDuplicar?: (id: string) => void;
    onMover?: (id: string, d: "izquierda" | "derecha") => void;
    onPrincipal?: (id: string) => void;
    onAplicarNovedad?: (id: string) => void;
    onDescartarNovedad?: (id: string) => void;
    onRestablecerDiseno?: (id: string) => void;
    onCompartir?: (id: string) => void;
    onExportar?: (id: string) => void;
    onDispositivos?: (id: string, tags: DeviceType[]) => void;
    onEliminar?: (id: string) => void;
}

const ITEM = "gap-2.5 text-[13px] text-white/90 cursor-pointer focus:bg-white/10 focus:text-white min-h-9";

/** Contenido del menú de una pestaña: lista vertical, completa y con los nombres enteros. */
function ContenidoMenuPestana({ d, indice, total, novedad, predeterminada, acciones }: {
    d: DashboardConAspecto; indice: number; total: number; novedad: boolean; predeterminada: boolean; acciones: AccionesMenu;
}) {
    const aspecto = aspectoDe(d);
    const tags = d.deviceTags ?? [];
    const alternarDispositivo = (t: DeviceType) => {
        if (!acciones.onDispositivos) return;
        if (t === "all") { acciones.onDispositivos(d.id, []); return; }
        const set = new Set(tags.filter((x) => x !== "all"));
        if (set.has(t)) set.delete(t); else set.add(t);
        acciones.onDispositivos(d.id, Array.from(set));
    };
    return (
        <DropdownMenuContent align="start" sideOffset={6} className="w-72 max-w-[calc(100vw-24px)] rounded-2xl border-white/10 bg-[#0b0e1d]/95 p-1.5 backdrop-blur-xl">
            <DropdownMenuLabel className="flex items-start gap-2.5 px-2 py-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-xl" style={{ background: conAlfa(aspecto.acento, 0.14), boxShadow: `inset 0 0 0 1px ${conAlfa(aspecto.acento, 0.4)}` }}>
                    {aspecto.icono ? <aspecto.icono className="size-4" style={{ color: aspecto.acento }} aria-hidden /> : null}
                </span>
                <span className="min-w-0">
                    <span className="block break-words text-[13.5px] font-semibold leading-tight text-white">{d.name}</span>
                    <span className="mt-0.5 block text-[11.5px] font-normal leading-snug text-white/50">{aspecto.tema.lema}</span>
                </span>
            </DropdownMenuLabel>
            {novedad && (
                <>
                    <DropdownMenuSeparator className="bg-white/10" />
                    {acciones.onAplicarNovedad && (
                        <DropdownMenuItem className={cn(ITEM, "text-white")} onSelect={() => acciones.onAplicarNovedad?.(d.id)} style={{ background: conAlfa(aspecto.acento, 0.12) }}>
                            <Sparkles className="size-4" style={{ color: aspecto.acento }} aria-hidden />
                            <span className="flex-1">Estrenar el diseño nuevo</span>
                        </DropdownMenuItem>
                    )}
                    {acciones.onDescartarNovedad && (
                        <DropdownMenuItem className={ITEM} onSelect={() => acciones.onDescartarNovedad?.(d.id)}>
                            <Undo2 className="size-4 text-white/60" aria-hidden /> Mantener mi versión
                        </DropdownMenuItem>
                    )}
                </>
            )}
            <DropdownMenuSeparator className="bg-white/10" />
            {acciones.onRenombrar && (
                <DropdownMenuItem className={ITEM} onSelect={() => acciones.onRenombrar?.(d.id)}>
                    <Pencil className="size-4 text-white/60" aria-hidden /> Renombrar…
                </DropdownMenuItem>
            )}
            {acciones.onEditarAspecto && (
                <DropdownMenuItem className={ITEM} onSelect={() => acciones.onEditarAspecto?.(d.id)}>
                    <Palette className="size-4 text-white/60" aria-hidden /> Icono, color y fondo…
                </DropdownMenuItem>
            )}
            {acciones.onDuplicar && (
                <DropdownMenuItem className={ITEM} onSelect={() => acciones.onDuplicar?.(d.id)}>
                    <Copy className="size-4 text-white/60" aria-hidden /> Duplicar
                </DropdownMenuItem>
            )}
            {acciones.onMover && (
                <>
                    <DropdownMenuItem className={ITEM} disabled={indice <= 0} onSelect={() => acciones.onMover?.(d.id, "izquierda")}>
                        <MoveLeft className="size-4 text-white/60" aria-hidden /> Mover a la izquierda
                        <DropdownMenuShortcut>Alt⇧[</DropdownMenuShortcut>
                    </DropdownMenuItem>
                    <DropdownMenuItem className={ITEM} disabled={indice >= total - 1} onSelect={() => acciones.onMover?.(d.id, "derecha")}>
                        <MoveRight className="size-4 text-white/60" aria-hidden /> Mover a la derecha
                        <DropdownMenuShortcut>Alt⇧]</DropdownMenuShortcut>
                    </DropdownMenuItem>
                </>
            )}
            {acciones.onPrincipal && (
                <DropdownMenuItem className={ITEM} disabled={d.is_default} onSelect={() => acciones.onPrincipal?.(d.id)}>
                    <Star className="size-4 text-yellow-300" aria-hidden /> {d.is_default ? "Es la principal" : "Marcar como principal"}
                </DropdownMenuItem>
            )}
            {predeterminada && acciones.onRestablecerDiseno && (
                <DropdownMenuItem className={ITEM} onSelect={() => acciones.onRestablecerDiseno?.(d.id)}>
                    <RotateCcw className="size-4 text-white/60" aria-hidden /> Restablecer su diseño de fábrica
                </DropdownMenuItem>
            )}
            <DropdownMenuSeparator className="bg-white/10" />
            {acciones.onCompartir && (
                <DropdownMenuItem className={ITEM} onSelect={() => acciones.onCompartir?.(d.id)}>
                    <Share2 className="size-4 text-white/60" aria-hidden /> Compartir…
                </DropdownMenuItem>
            )}
            {acciones.onExportar && (
                <DropdownMenuItem className={ITEM} onSelect={() => acciones.onExportar?.(d.id)}>
                    <Download className="size-4 text-white/60" aria-hidden /> Exportar (.json)
                </DropdownMenuItem>
            )}
            {acciones.onDispositivos && (
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger className={ITEM}>
                        <MonitorSmartphone className="size-4 text-white/60" aria-hidden /> Para qué dispositivos
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="rounded-2xl border-white/10 bg-[#0b0e1d]/95 p-1.5 backdrop-blur-xl">
                        {DEVICE_TYPES.map((dev) => {
                            const on = dev.id === "all" ? tags.length === 0 : tags.includes(dev.id);
                            const Icon = dev.icon;
                            return (
                                <DropdownMenuCheckboxItem
                                    key={dev.id}
                                    checked={on}
                                    onSelect={(e) => { e.preventDefault(); alternarDispositivo(dev.id); }}
                                    className={cn(ITEM, "pl-8")}
                                >
                                    <Icon className="size-4 shrink-0" style={{ color: dev.accent }} aria-hidden /> {dev.label}
                                </DropdownMenuCheckboxItem>
                            );
                        })}
                    </DropdownMenuSubContent>
                </DropdownMenuSub>
            )}
            {acciones.onEliminar && (
                <>
                    <DropdownMenuSeparator className="bg-white/10" />
                    <DropdownMenuItem className={cn(ITEM, "text-red-300 focus:bg-red-500/15 focus:text-red-200")} disabled={total <= 1} onSelect={() => acciones.onEliminar?.(d.id)}>
                        <Trash2 className="size-4" aria-hidden /> Eliminar pestaña…
                    </DropdownMenuItem>
                </>
            )}
        </DropdownMenuContent>
    );
}

function SortableTab({
    dashboard, isActive, count, highlight, novedad, onClick, onTecla, refBoton, menu, abrirMenu,
}: {
    dashboard: Dashboard;
    isActive: boolean;
    count?: number;
    /** Resaltar suavemente porque coincide con el dispositivo actual. */
    highlight?: boolean;
    novedad?: boolean;
    onClick: () => void;
    onTecla: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
    refBoton: (el: HTMLButtonElement | null) => void;
    menu?: React.ReactNode;
    abrirMenu?: () => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dashboard.id });
    const aspecto = aspectoDe(dashboard as DashboardConAspecto);
    const Icono = aspecto.icono;
    const acento = aspecto.acento;

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        // El elemento arrastrado va por encima para que no lo recorten sus vecinos.
        zIndex: isDragging ? 30 : undefined,
        ...(isActive
            ? {
                background: `linear-gradient(180deg, ${conAlfa(acento, 0.2)}, ${conAlfa(acento, 0.07)})`,
                boxShadow: `inset 0 1px 0 ${conAlfa("#ffffff", 0.08)}, inset 0 0 0 1px ${conAlfa(acento, 0.32)}, 0 -8px 22px -12px ${acento}`,
            }
            : highlight ? { boxShadow: `inset 0 0 0 1px ${conAlfa("#34d399", 0.25)}` } : {}),
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            data-pestana={dashboard.id}
            className={cn(
                "group box-border shrink-0 flex items-stretch rounded-t-xl text-[13px] font-semibold transition-[background,box-shadow,color] duration-200 relative",
                isDragging && "opacity-80 scale-[1.02]",
                isActive ? "text-white" : "text-white/55 hover:bg-white/[0.05] hover:text-white/85",
            )}
            onContextMenu={abrirMenu ? (e) => { e.preventDefault(); abrirMenu(); } : undefined}
        >
            <button
                {...attributes}
                {...listeners}
                ref={refBoton}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={`${dashboard.name}${novedad ? " · diseño nuevo disponible" : ""}`}
                tabIndex={isActive ? 0 : -1}
                onClick={onClick}
                onKeyDown={(e) => {
                    onTecla(e);
                    // dnd-kit también escucha teclas en el botón; aquí solo navegamos.
                }}
                title={dashboard.name}
                className="box-border cursor-pointer flex min-w-0 max-w-[13.5rem] items-center gap-2 py-2 pl-3 pr-2.5 outline-none focus-visible:ring-2 focus-visible:ring-inset rounded-t-xl"
                style={{ ["--tw-ring-color" as string]: conAlfa(acento, 0.8) }}
            >
                {Icono ? (
                    <Icono
                        aria-hidden
                        className="size-4 shrink-0 transition-opacity duration-200"
                        style={{ color: acento, opacity: isActive ? 1 : 0.75, filter: isActive ? `drop-shadow(0 0 6px ${conAlfa(acento, 0.7)})` : undefined }}
                    />
                ) : (
                    <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: acento }} />
                )}
                <DeviceBadge tags={dashboard.deviceTags} />
                <EtiquetaDeslizante texto={dashboard.name} className="min-w-0 select-none leading-5" activo={isActive} />
                {dashboard.is_default && <Star className="size-3 shrink-0 fill-yellow-400 text-yellow-400" aria-label="Principal" />}
                {novedad && (
                    <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: acento, boxShadow: `0 0 8px ${acento}` }} />
                )}
                {isActive && typeof count === "number" && count > 0 && (
                    <span
                        className="shrink-0 tabular-nums text-[10px] font-bold leading-none rounded-full px-1.5 py-0.5"
                        style={{ background: conAlfa(acento, 0.18), color: "rgba(255,255,255,.85)" }}
                        title={`${count} widget${count === 1 ? "" : "s"} en esta pestaña`}
                    >
                        {count}
                    </span>
                )}
            </button>

            {menu}

            {/* Subrayado de acento de la pestaña activa (la asienta sobre el lienzo). */}
            {isActive && (
                <span aria-hidden className="pointer-events-none absolute inset-x-2 -bottom-px h-0.5 rounded-full" style={{ background: `linear-gradient(90deg, transparent, ${acento}, transparent)` }} />
            )}
        </div>
    );
}

/** Botón «Opciones» de una pestaña: siempre visible en la activa; en las demás, al pasar o enfocar. */
function DisparadorMenu({ nombre, visible, abierto, acento }: { nombre: string; visible: boolean; abierto: boolean; acento: string }) {
    return (
        <DropdownMenuTrigger asChild>
            <button
                type="button"
                aria-label={`Opciones de la pestaña ${nombre}`}
                title={`Opciones de «${nombre}»`}
                className={cn(
                    "ss-redondo my-1 mr-1 grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-white/55 transition-[opacity,background,color] duration-200 hover:bg-white/10 hover:text-white focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2",
                    visible || abierto ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
                )}
                style={{ outlineColor: acento }}
            >
                <MoreHorizontal className="size-4" aria-hidden />
            </button>
        </DropdownMenuTrigger>
    );
}

export function DashboardPanelHeader({
    panelId, dashboards, activeId, allDashboards, isEditMode, widgetCounts, currentDevice,
    onCreateDashboard, onDeleteDashboard, onRenameDashboard, onShareDashboard, onSetDeviceTags, onOpenDeviceManager,
    onAlternarEdicion, onReordenar, onDuplicar, onMover, onPrincipal, onExportar, onEditarAspecto, onRestablecerDiseno,
    onAplicarNovedad, onDescartarNovedad, novedades, predeterminadas, atajos,
}: HeaderProps) {
    const { setActiveDashboard, closePanel, splitPanel, setState } = useWorkspace();
    void allDashboards;

    // Ratón: el arrastre se activa tras mover 5px. Táctil: requiere una pulsación
    // SOSTENIDA (220ms) antes de arrastrar, de modo que un deslizamiento rápido
    // no reordena por accidente.
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    );

    const indiceActivo = dashboards.findIndex((d) => d.id === activeId);
    const [menuAbierto, setMenuAbierto] = React.useState<string | null>(null);

    // ── Qué cabe en la barra (el resto va al menú «Más») ──
    const carrilRef = React.useRef<HTMLDivElement>(null);
    const [disponible, setDisponible] = React.useState(0);
    const [medidos, setMedidos] = React.useState<Record<string, number>>({});
    const botonesRef = React.useRef(new Map<string, HTMLButtonElement>());
    React.useLayoutEffect(() => {
        const el = carrilRef.current;
        if (!el) return;
        const medir = () => setDisponible((prev) => (Math.abs(prev - el.clientWidth) < 2 ? prev : el.clientWidth));
        medir();
        if (typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(medir);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    const anchos = dashboards.map((d) => {
        const m = medidos[d.id];
        // Pestaña + su botón de opciones (28 px) si es la activa o si se ve el suyo.
        return (m && m > 0 ? m : anchoEstimado(d.name)) + (d.id === activeId ? 32 : 0);
    });
    const hueco = Math.max(0, disponible - (isEditMode && onCreateDashboard ? 40 : 0));
    const reparto = repartirPestanas(anchos, hueco, indiceActivo, 96);
    const visibles = reparto.visibles.map((i) => dashboards[i]);
    const ocultas = reparto.ocultas.map((i) => dashboards[i]);
    // Mide las pestañas pintadas (su ancho real) para repartir mejor en la próxima pasada.
    React.useLayoutEffect(() => {
        let cambio = false;
        const siguiente: Record<string, number> = { ...medidos };
        for (const d of visibles) {
            const b = botonesRef.current.get(d.id);
            const ancho = b?.parentElement?.offsetWidth ?? 0;
            const sinMenu = ancho - (d.id === activeId ? 32 : 0);
            if (sinMenu > 0 && Math.abs((medidos[d.id] ?? 0) - sinMenu) > 1) { siguiente[d.id] = sinMenu; cambio = true; }
        }
        if (cambio) setMedidos(siguiente);
    });

    const irA = React.useCallback((id: string) => setActiveDashboard(panelId, id), [panelId, setActiveDashboard]);

    // ── Atajos de teclado (solo la barra del panel enfocado) ──
    React.useEffect(() => {
        if (!atajos) return;
        const alTeclado = (e: KeyboardEvent) => {
            if (escribiendo(document.activeElement)) return;
            const accion = accionDeAtajo(e, dashboards.length, indiceActivo);
            if (!accion) return;
            e.preventDefault();
            if (accion.tipo === "ir") {
                const destino = dashboards[accion.indice];
                if (destino) irA(destino.id);
            } else if (onMover && activeId) {
                onMover(activeId, accion.direccion < 0 ? "izquierda" : "derecha");
            }
        };
        window.addEventListener("keydown", alTeclado);
        return () => window.removeEventListener("keydown", alTeclado);
    }, [atajos, dashboards, indiceActivo, irA, onMover, activeId]);

    // Flechas entre pestañas visibles (foco itinerante del tablist) y tecla de menú.
    const alTeclaPestana = (id: string) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) { e.preventDefault(); setMenuAbierto(id); return; }
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
        const i = visibles.findIndex((d) => d.id === id);
        if (i < 0) return;
        e.preventDefault();
        const j = e.key === "Home" ? 0 : e.key === "End" ? visibles.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + visibles.length) % visibles.length;
        const destino = visibles[j];
        if (!destino) return;
        irA(destino.id);
        botonesRef.current.get(destino.id)?.focus();
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            // Las pestañas se pintan en el orden de la lista de tableros: sin esto el arrastre no
            // se veía (solo cambiaba el orden interno del panel) ni se guardaba.
            onReordenar?.(String(active.id), String(over.id));
            setState((prev) => {
                const newState = JSON.parse(JSON.stringify(prev));
                const updatePanel = (node: any): any => {
                    if (node.type === 'panel' && node.id === panelId) {
                        const oldIndex = node.dashboardIds.indexOf(active.id as string);
                        const newIndex = node.dashboardIds.indexOf(over.id as string);
                        return { ...node, dashboardIds: arrayMove(node.dashboardIds, oldIndex, newIndex) };
                    }
                    if (node.type === 'split') return { ...node, children: node.children.map(updatePanel) };
                    return node;
                };
                newState.root = updatePanel(newState.root);
                return newState;
            });
        }
    };

    const acciones: AccionesMenu = {
        onRenombrar: onRenameDashboard,
        onEditarAspecto,
        onDuplicar,
        onMover,
        onPrincipal,
        onAplicarNovedad,
        onDescartarNovedad,
        onRestablecerDiseno,
        onCompartir: onShareDashboard,
        onExportar,
        onDispositivos: onSetDeviceTags,
        onEliminar: onDeleteDashboard,
    };
    const hayMenu = Object.values(acciones).some(Boolean);
    const activo = dashboards[indiceActivo] as DashboardConAspecto | undefined;
    const aspectoActivo = activo ? aspectoDe(activo) : null;

    // `clave` separa el menú de la barra (id) del de la hoja del teléfono («movil:id»): los dos
    // existen en el DOM y no deben abrirse a la vez.
    const menuDe = (d: Dashboard, siempre: boolean, clave: string = d.id) => {
        if (!hayMenu) return undefined;
        const i = dashboards.findIndex((x) => x.id === d.id);
        const abierto = menuAbierto === clave;
        return (
            <DropdownMenu open={abierto} onOpenChange={(o) => setMenuAbierto(o ? clave : null)}>
                <DisparadorMenu nombre={d.name} visible={siempre} abierto={abierto} acento={aspectoDe(d as DashboardConAspecto).acento} />
                {abierto && (
                    <ContenidoMenuPestana
                        d={d as DashboardConAspecto}
                        indice={i}
                        total={dashboards.length}
                        novedad={!!novedades?.has(d.id)}
                        predeterminada={!!predeterminadas?.has(d.id)}
                        acciones={acciones}
                    />
                )}
            </DropdownMenu>
        );
    };

    return (
        // box-border + w-full + overflow-hidden en el contenedor externo: la barra NUNCA excede el
        // ancho del panel ni empuja el lienzo. El cristal lleva la luz de la pestaña activa.
        <div
            className="box-border w-full flex items-stretch gap-1 px-1.5 pt-1.5 pb-1.5 sm:pb-0 shrink-0 overflow-hidden backdrop-blur-xl"
            style={{
                background: "linear-gradient(180deg, rgba(8,10,24,.82), rgba(8,10,24,.6))",
                boxShadow: aspectoActivo ? `inset 0 -1px 0 ${conAlfa(aspectoActivo.acento, 0.28)}` : "inset 0 -1px 0 rgba(255,255,255,.05)",
            }}
        >
            {/* Móvil (< 640px): un botón con la pestaña actual abre la lista completa (nombre entero,
                icono del tema y su lema) en una hoja inferior. */}
            <div className="min-w-0 flex-1 flex items-center gap-1.5 sm:hidden">
                <MenuListaMovil
                    opciones={dashboards.map((d) => {
                        const count = widgetCounts?.[d.id];
                        const a = aspectoDe(d as DashboardConAspecto);
                        return {
                            id: d.id,
                            label: d.name,
                            icon: a.icono ?? (d.is_default ? Star : undefined),
                            hint: novedades?.has(d.id) ? `${a.tema.lema} · diseño nuevo disponible` : a.tema.lema,
                            badge: typeof count === "number" && count > 0 ? count : undefined,
                        };
                    })}
                    valor={activeId}
                    onCambiar={(id) => setActiveDashboard(panelId, id)}
                    titulo="Pestañas"
                    className="h-10"
                />
                {activo && menuDe(activo, true, `movil:${activo.id}`)}
                {isEditMode && onCreateDashboard && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="size-10 shrink-0 rounded-xl text-white/50 hover:text-cyan-400 hover:bg-cyan-500/10 border border-dashed border-white/20 cursor-pointer"
                        onClick={onCreateDashboard}
                        title="Crear pestaña"
                        aria-label="Crear pestaña"
                    >
                        <Plus className="w-4 h-4" />
                    </Button>
                )}
            </div>

            {/* Escritorio y tablet (≥ 640px): pestañas con su identidad; lo que no cabe, en «Más». */}
            <div ref={carrilRef} className="hidden sm:flex flex-1 min-w-0 items-end gap-0.5 overflow-hidden">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={visibles.map(d => d.id)} strategy={horizontalListSortingStrategy}>
                        <div role="tablist" aria-label="Pestañas del panel" aria-orientation="horizontal" className="flex min-w-0 items-end gap-0.5">
                            {visibles.map(d => {
                                const highlight = !!currentDevice && !!d.deviceTags?.length
                                    && !d.deviceTags.includes("all") && d.deviceTags.includes(currentDevice);
                                const activa = d.id === activeId;
                                return (
                                    <SortableTab
                                        key={d.id}
                                        dashboard={d}
                                        isActive={activa}
                                        count={widgetCounts?.[d.id]}
                                        highlight={highlight}
                                        novedad={!!novedades?.has(d.id)}
                                        onClick={() => irA(d.id)}
                                        onTecla={alTeclaPestana(d.id)}
                                        refBoton={(el) => { if (el) botonesRef.current.set(d.id, el); else botonesRef.current.delete(d.id); }}
                                        menu={menuDe(d, activa)}
                                        abrirMenu={hayMenu ? () => setMenuAbierto(d.id) : undefined}
                                    />
                                );
                            })}
                        </div>
                    </SortableContext>
                </DndContext>

                {ocultas.length > 0 && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                aria-label={`Más pestañas (${ocultas.length})`}
                                className="ss-redondo mb-1 ml-0.5 inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-full px-3 text-[12.5px] font-semibold text-white/75 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                                style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,.1)" }}
                            >
                                Más <span className="tabular-nums text-white/45">{ocultas.length}</span>
                                <ChevronDown className="size-3.5" aria-hidden />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" sideOffset={6} className="w-72 max-w-[calc(100vw-24px)] max-h-[min(70vh,520px)] overflow-y-auto rounded-2xl border-white/10 bg-[#0b0e1d]/95 p-1.5 backdrop-blur-xl">
                            <DropdownMenuLabel className="px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">Más pestañas</DropdownMenuLabel>
                            {ocultas.map((d) => {
                                const a = aspectoDe(d as DashboardConAspecto);
                                const n = widgetCounts?.[d.id];
                                const i = dashboards.findIndex((x) => x.id === d.id);
                                return (
                                    <DropdownMenuItem key={d.id} className={cn(ITEM, "py-2")} onSelect={() => irA(d.id)}>
                                        <span className="grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: conAlfa(a.acento, 0.14) }}>
                                            {a.icono ? <a.icono className="size-4" style={{ color: a.acento }} aria-hidden /> : null}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block break-words leading-tight">{d.name}</span>
                                            <span className="block text-[11px] leading-snug text-white/45">{a.tema.lema}{typeof n === "number" ? ` · ${n} widget${n === 1 ? "" : "s"}` : ""}</span>
                                        </span>
                                        {novedades?.has(d.id) && <span aria-label="Diseño nuevo" className="size-1.5 shrink-0 rounded-full" style={{ background: a.acento }} />}
                                        {i < 9 && <DropdownMenuShortcut>Alt{i === dashboards.length - 1 ? 9 : i + 1}</DropdownMenuShortcut>}
                                    </DropdownMenuItem>
                                );
                            })}
                            {onCreateDashboard && (
                                <>
                                    <DropdownMenuSeparator className="bg-white/10" />
                                    <DropdownMenuItem className={ITEM} onSelect={onCreateDashboard}>
                                        <Plus className="size-4 text-emerald-300" aria-hidden /> Nueva pestaña…
                                    </DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}

                {isEditMode && onCreateDashboard && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 rounded-lg ml-0.5 mb-1 text-white/45 hover:text-cyan-400 hover:bg-cyan-500/10 border border-dashed border-white/20 shrink-0 cursor-pointer"
                        onClick={onCreateDashboard}
                        title="Crear pestaña"
                        aria-label="Crear pestaña"
                    >
                        <Plus className="w-4 h-4" />
                    </Button>
                )}
            </div>

            {/* Controles del panel — fijados a la derecha; nunca se recortan. */}
            <div className="shrink-0 flex items-center gap-0.5 pb-1.5 max-sm:pb-0 pl-1.5 self-center border-l border-white/5">
                {/* Entrada al editor superior: «Editar» abre la barra de edición bajo estas pestañas;
                    en edición se vuelve «Listo». Pastilla con texto completo. */}
                {onAlternarEdicion && (
                    <button
                        type="button"
                        onClick={onAlternarEdicion}
                        aria-pressed={!!isEditMode}
                        aria-label={isEditMode ? "Listo: terminar la edición del tablero" : "Editar el tablero"}
                        className={cn(
                            "ss-redondo mr-1 inline-flex h-8 max-sm:h-10 items-center gap-1.5 rounded-full px-3 text-[12.5px] max-sm:text-[13px] font-semibold cursor-pointer transition-[background,box-shadow,color] duration-200",
                            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                            isEditMode ? "text-white" : "text-white/80 hover:text-white"
                        )}
                        style={isEditMode
                            ? { background: "#10B9812e", boxShadow: "inset 0 0 0 1px #10B98188, 0 0 14px -4px #10B981", outlineColor: "#10B981" }
                            : { background: "#7C5CFF1f", boxShadow: "inset 0 0 0 1px #7C5CFF66", outlineColor: "#7C5CFF" }}
                    >
                        {isEditMode ? <Check className="size-3.5" aria-hidden /> : <Pencil className="size-3.5" aria-hidden />}
                        {isEditMode ? "Listo" : "Editar"}
                    </button>
                )}
                {/* Gestor de dispositivos / sincronización (visible siempre; discreto). */}
                {onOpenDeviceManager && (
                    <Button
                        variant="ghost"
                        size="icon"
                        // En el teléfono vive en el editor (Pestaña → Dispositivos y sincronización).
                        className="size-8 max-sm:hidden rounded-lg text-white/40 hover:text-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
                        aria-label="Dispositivos y sincronización"
                        onClick={onOpenDeviceManager}
                        title="Dispositivos y sincronización"
                    >
                        <MonitorSmartphone className="w-4 h-4" />
                    </Button>
                )}

                <div className="w-px h-4 bg-white/10 mx-0.5 shrink-0 max-sm:hidden" />

                <Button
                    variant="ghost"
                    size="icon"
                    // Dividir no cabe en un teléfono (dos paneles de 180 px): solo desde 640 px.
                    className="size-8 max-sm:hidden rounded-lg text-white/40 hover:text-cyan-400 hover:bg-cyan-500/10 cursor-pointer"
                    aria-label={"Dividir horizontalmente"}
                    onClick={() => splitPanel(panelId, 'horizontal')}
                    title="Dividir horizontalmente"
                >
                    <LayoutPanelLeft className="w-4 h-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 max-sm:hidden rounded-lg text-white/40 hover:text-cyan-400 hover:bg-cyan-500/10 cursor-pointer"
                    aria-label={"Dividir verticalmente"}
                    onClick={() => splitPanel(panelId, 'vertical')}
                    title="Dividir verticalmente"
                >
                    <LayoutPanelTop className="w-4 h-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 max-sm:size-10 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 ml-0.5 cursor-pointer"
                    onClick={() => closePanel(panelId)}
                    title="Cerrar panel"
                    aria-label="Cerrar el panel"
                >
                    <X className="w-4 h-4 max-sm:size-[18px]" />
                </Button>
            </div>
        </div>
    );
}

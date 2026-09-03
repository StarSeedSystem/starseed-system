"use client";

import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePerimeter } from "@/context/perimeter-context";
import { useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
    // ── Iconos de secciones del dock (uno único por concepto) ──
    LayoutDashboard, CircleUser, MessagesSquare, Bell, Users, BookOpen, Library,
    Network, BrainCircuit, Settings, Compass, PenLine, ShieldCheck, LayoutGrid,
    Server, Vote, Lightbulb, Cpu, Brain, ShoppingBag, Award, AppWindow,
    CalendarClock, GitBranch, Sparkles, Zap, Wrench, Plug, Eye, HardDrive, Boxes,
    Camera, Images,
    // ── Controles del propio dock / editor ──
    Plus, Pencil, Check, RotateCcw, X, ArrowLeft, ArrowRight,
    ChevronLeft, ChevronRight, GripVertical,
    // ── Folders expandibles ──
    Folder, FolderOpen, FolderPlus, Trash2, ChevronDown,
} from "lucide-react";

import { useAppearance } from "@/context/appearance-context";
import { useRitoActivo } from "@/lib/ui/rito-activo";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { TrinityFab } from "./trinity-fab";
import {
    loadDockConfig,
    saveDockConfig,
    resetDockConfig,
    DOCK_PRESETS,
    loadDockFolders,
    saveDockFolders,
    resetDockFolders,
    loadDockFolderOpenState,
    saveDockFolderOpenState,
    DOCK_ICON_MAP as ICON_MAP,
    DOCK_FALLBACK_ICON as FALLBACK_ICON,
    type DockItemConfig,
    type DockIconKey,
    type DockFolderConfig,
} from "./dock-config";

export function OmniDock() {
    const confirm = useConfirm();
    const { activeEdge } = usePerimeter();
    const { config } = useAppearance();
    const router = useRouter();
    const pathname = usePathname();

    // ¿La ruta actual corresponde a este item del dock? (resalta la sección abierta)
    const isActivePath = (p: string) => {
        if (!p || p === "#") return false;
        if (p === "/") return pathname === "/";
        return pathname === p || pathname.startsWith(p + "/");
    };

    const { dockBehavior = "anchor-only", dockDensity = "comfortable" } = config?.trinity || {};
    const compact = dockDensity === "compact";

    let isVisible = false;
    if (dockBehavior === "always-visible") isVisible = true;
    else isVisible = activeEdge === "anchor";
    // En /login y /auth el dock se oculta: no tapa las tarjetas de acceso y
    // ninguna de sus rutas es útil sin sesión (Adenda 63).
    if (pathname === "/login" || pathname?.startsWith("/auth")) isVisible = false;

    const [items, setItems] = useState<DockItemConfig[]>(DOCK_PRESETS);
    const [editMode, setEditMode] = useState(false);

    // ── Folders expandibles del dock ──
    const [folders, setFolders] = useState<DockFolderConfig[]>([]);
    const [folderOpen, setFolderOpen] = useState<Record<string, boolean>>({});

    // Sombras de scroll del dock: indican que hay MÁS opciones al deslizar.
    const stripRef = useRef<HTMLDivElement | null>(null);
    const [shadow, setShadow] = useState<{ l: boolean; r: boolean }>({ l: false, r: false });
    const updateShadows = useCallback(() => {
        const el = stripRef.current;
        if (!el) return;
        const max = el.scrollWidth - el.clientWidth;
        const next = { l: el.scrollLeft > 4, r: el.scrollLeft < max - 4 };
        // Guarda anti-bucle: solo re-renderiza si el valor CAMBIA. El
        // ResizeObserver de abajo mide en cada render; sin esta comparación
        // (medir → setState → render → medir…) se realimentaría solo.
        setShadow((prev) => (prev.l === next.l && prev.r === next.r ? prev : next));
    }, []);

    // Carga inicial + REACTIVIDAD (Adenda 118): recarga el dock cuando llegan
    // cambios sincronizados de otra neurona (starseed:sync:apply), de otra
    // pestaña (storage) o un cambio local del dock (starseed:dock). Sin esto el
    // dock se leía UNA sola vez al montar y "no cambiaba" hasta recargar la
    // página — rompía la regla dorada de descubribilidad (§11).
    //
    // Adenda 149 · tanda 3: se añade `starseed:profile` (cambio de perfil de la
    // cuenta). Cada recarga vuelve a pasar por `loadDockConfig()`, que aplica la
    // garantía de botones predeterminados (`normalizeDockState`), así que este
    // listener es también la vía por la que un cambio de perfil converge.
    useEffect(() => {
        const reload = () => {
            setItems(loadDockConfig());
            setFolders(loadDockFolders());
            setFolderOpen(loadDockFolderOpenState());
        };
        reload();
        window.addEventListener("storage", reload);
        window.addEventListener("starseed:sync:apply", reload);
        window.addEventListener("starseed:dock", reload);
        window.addEventListener("starseed:profile", reload);
        return () => {
            window.removeEventListener("storage", reload);
            window.removeEventListener("starseed:sync:apply", reload);
            window.removeEventListener("starseed:dock", reload);
            window.removeEventListener("starseed:profile", reload);
        };
    }, []);

    // Recalcula las sombras al abrir el dock, cambiar items o redimensionar.
    useEffect(() => {
        if (!isVisible) return;
        const id = window.setTimeout(updateShadows, 60); // tras la animación de entrada
        window.addEventListener("resize", updateShadows);
        return () => { window.clearTimeout(id); window.removeEventListener("resize", updateShadows); };
    }, [isVisible, items, editMode, updateShadows]);

    // El `resize` de window NO se dispara al girar un tablet dentro de una app
    // instalada, ni al abrirse/cerrarse un folder, ni al cambiar la densidad del
    // dock: el carril cambia de tamaño sin que la ventana lo haga. El
    // ResizeObserver sí lo ve, así que las flechas "hay más" nunca mienten.
    useEffect(() => {
        if (!isVisible || typeof ResizeObserver === "undefined") return;
        const el = stripRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => updateShadows());
        ro.observe(el);
        return () => ro.disconnect();
    }, [isVisible, updateShadows]);

    /* ── Deslizar el carril ────────────────────────────────────────────────
     * Táctil y rueda funcionan solos (overflow-x:auto en .omni-dock-strip).
     * Falta el RATÓN: aquí se añade arrastrar-para-desplazar, que además es lo
     * que espera quien usa un tablet con teclado/trackpad o un portátil.
     * Solo se intercepta `pointerType === "mouse"`: secuestrar el táctil
     * rompería el momentum nativo y el scroll-snap de iOS/Android. */
    const drag = useRef({ active: false, startX: 0, startLeft: 0, moved: false });
    const justDragged = useRef(false);

    const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        justDragged.current = false; // limpia un arrastre anterior que no acabó en click
        if (e.pointerType !== "mouse" || e.button !== 0) return;
        const el = stripRef.current;
        if (!el || el.scrollWidth <= el.clientWidth) return; // si cabe todo, no hay nada que arrastrar
        drag.current = { active: true, startX: e.clientX, startLeft: el.scrollLeft, moved: false };
    }, []);

    const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        const el = stripRef.current;
        const d = drag.current;
        if (!d.active || !el) return;
        const dx = e.clientX - d.startX;
        if (!d.moved) {
            if (Math.abs(dx) <= 4) return; // umbral: por debajo sigue siendo un click
            d.moved = true;
            el.classList.add("omni-dock-strip--dragging");
            // Capturamos el puntero: el arrastre continúa aunque el cursor salga del carril.
            try { el.setPointerCapture(e.pointerId); } catch { /* navegador sin capture: degrada bien */ }
        }
        el.scrollLeft = d.startLeft - dx;
        updateShadows();
    }, [updateShadows]);

    const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        const el = stripRef.current;
        const d = drag.current;
        if (!d.active || !el) return;
        try { el.releasePointerCapture(e.pointerId); } catch { /* noop */ }
        el.classList.remove("omni-dock-strip--dragging");
        // Si hubo arrastre REAL, el click que el navegador emite al soltar se
        // descarta (si no, soltar encima de un icono navegaría sin querer).
        justDragged.current = d.moved;
        drag.current = { active: false, startX: 0, startLeft: 0, moved: false };
    }, []);

    const onClickCapture = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!justDragged.current) return;
        justDragged.current = false;
        e.stopPropagation();
        e.preventDefault();
    }, []);

    /** Salta ~una pantalla de items (flechas «hay más»). */
    const scrollByPage = useCallback((dir: -1 | 1) => {
        const el = stripRef.current;
        if (!el) return;
        el.scrollBy({ left: dir * Math.max(160, el.clientWidth * 0.8), behavior: "smooth" });
    }, []);

    const persist = (next: DockItemConfig[]) => {
        setItems(next);
        saveDockConfig(next);
    };

    const toggleEnabled = (id: string) => {
        persist(items.map((it) => (it.id === id ? { ...it, enabled: !it.enabled } : it)));
    };

    const move = (id: string, direction: -1 | 1) => {
        const idx = items.findIndex((it) => it.id === id);
        if (idx < 0) return;
        const newIdx = idx + direction;
        if (newIdx < 0 || newIdx >= items.length) return;
        const next = [...items];
        const [el] = next.splice(idx, 1);
        next.splice(newIdx, 0, el);
        persist(next);
    };

    // Reordenamiento por arrastre (drag & pointer) en el editor: mueve
    // `sourceId` a la posición de `targetId`. Complementa (no sustituye) los
    // botones ←→, que siguen siendo la vía accesible por teclado.
    const reorder = (sourceId: string, targetId: string) => {
        if (sourceId === targetId) return;
        const from = items.findIndex((it) => it.id === sourceId);
        const to = items.findIndex((it) => it.id === targetId);
        if (from < 0 || to < 0) return;
        const next = [...items];
        const [el] = next.splice(from, 1);
        next.splice(to, 0, el);
        persist(next);
    };

    const reset = async () => {
        if (await confirm({ title: "Restablecer dock", description: "¿Restablecer el dock a su configuración por defecto?", destructive: true })) {
            resetDockConfig();
            setItems(DOCK_PRESETS);
            resetDockFolders();
            setFolders([]);
            saveDockFolderOpenState({});
            setFolderOpen({});
        }
    };

    // ── Persistencia de folders ──
    const persistFolders = (next: DockFolderConfig[]) => {
        setFolders(next);
        saveDockFolders(next);
    };

    // Abre/cierra un folder (estado persistido aparte de su definición).
    const toggleFolderOpen = (id: string) => {
        setFolderOpen((prev) => {
            const next = { ...prev, [id]: !prev[id] };
            saveDockFolderOpenState(next);
            return next;
        });
    };

    const addFolder = () => {
        const id = `folder-${Date.now().toString(36)}`;
        const next: DockFolderConfig = {
            id,
            label: 'Nuevo folder',
            iconKey: 'LayoutGrid',
            color: 'neutral',
            itemIds: [],
            enabled: true,
        };
        persistFolders([...folders, next]);
    };

    const renameFolder = (id: string, label: string) => {
        persistFolders(folders.map((f) => (f.id === id ? { ...f, label } : f)));
    };

    const removeFolder = (id: string) => {
        persistFolders(folders.filter((f) => f.id !== id));
        setFolderOpen((prev) => {
            const next = { ...prev };
            delete next[id];
            saveDockFolderOpenState(next);
            return next;
        });
    };

    // Añade/quita un item de un folder (un item solo puede estar en un folder).
    const toggleItemInFolder = (folderId: string, itemId: string) => {
        persistFolders(
            folders.map((f) => {
                if (f.id === folderId) {
                    const has = f.itemIds.includes(itemId);
                    return { ...f, itemIds: has ? f.itemIds.filter((x) => x !== itemId) : [...f.itemIds, itemId] };
                }
                // Garantiza exclusividad: el item sale de cualquier otro folder.
                return f.itemIds.includes(itemId) ? { ...f, itemIds: f.itemIds.filter((x) => x !== itemId) } : f;
            })
        );
    };

    // Items habilitados, indexados por id (para resolver el contenido de folders).
    const itemById = useMemo(() => {
        const map = new Map<string, DockItemConfig>();
        items.forEach((it) => map.set(it.id, it));
        return map;
    }, [items]);

    // Folders activos y los ids de item que "consumen" (sacándolos del strip raíz).
    const activeFolders = useMemo(() => folders.filter((f) => f.enabled), [folders]);
    const foldedItemIds = useMemo(() => {
        const s = new Set<string>();
        activeFolders.forEach((f) => f.itemIds.forEach((id) => s.add(id)));
        return s;
    }, [activeFolders]);

    // Estructura de render del strip: cada entrada es un item suelto o un folder.
    // Mantiene el orden de `items` para los sueltos; los folders se intercalan en
    // la posición de su PRIMER item, de modo que el orden general se respeta.
    type DockEntry =
        | { kind: 'item'; item: DockItemConfig }
        | { kind: 'folder'; folder: DockFolderConfig; children: DockItemConfig[] };

    const dockEntries = useMemo<DockEntry[]>(() => {
        const entries: DockEntry[] = [];
        const placedFolders = new Set<string>();
        for (const it of items) {
            if (!it.enabled) continue;
            // ¿Pertenece a un folder activo? → coloca el folder en la posición
            // de su primer item presente y no añadas el item suelto.
            if (foldedItemIds.has(it.id)) {
                const owner = activeFolders.find((f) => f.itemIds.includes(it.id));
                if (owner && !placedFolders.has(owner.id)) {
                    placedFolders.add(owner.id);
                    const children = owner.itemIds
                        .map((id) => itemById.get(id))
                        .filter((x): x is DockItemConfig => !!x && x.enabled);
                    entries.push({ kind: 'folder', folder: owner, children });
                }
                continue;
            }
            entries.push({ kind: 'item', item: it });
        }
        // Folders activos cuyos items no están presentes igualmente se muestran
        // (vacías o con hijos deshabilitados) al final, para poder gestionarlas.
        for (const f of activeFolders) {
            if (placedFolders.has(f.id)) continue;
            const children = f.itemIds
                .map((id) => itemById.get(id))
                .filter((x): x is DockItemConfig => !!x && x.enabled);
            entries.push({ kind: 'folder', folder: f, children });
        }
        return entries;
    }, [items, activeFolders, foldedItemIds, itemById]);

    // (Ola 227) Rito de verdad en primer plano: el dock NO puede salir
    // (ni siquiera el FAB Trinity; él también se auto-oculta por su cuenta).
    const rito = useRitoActivo();
    if (rito) return null;

    return (
        <>
        {/* Trinity Móvil · Bloque 2 — FAB de acceso a los 4 menús cardinales.
            Se monta aquí (mismo árbol que el dock, layout raíz) para existir en
            todas las páginas. Él mismo decide si renderizarse (auto/on/off). */}
        <TrinityFab />
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ y: "100%", opacity: 0 }}
                    animate={{ y: "0%", opacity: 1 }}
                    exit={{ y: "100%", opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="fixed bottom-0 left-0 right-0 z-[70] flex flex-col items-center pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-8 pointer-events-none data-omnidock-root"
                    data-omnidock="1"
                >
                    {editMode && (
                        <div className="pointer-events-auto mb-3 w-full max-w-3xl px-4">
                            <DockEditor
                                items={items}
                                folders={folders}
                                onToggle={toggleEnabled}
                                onMove={move}
                                onReorder={reorder}
                                onReset={reset}
                                onClose={() => setEditMode(false)}
                                onAddFolder={addFolder}
                                onRenameFolder={renameFolder}
                                onRemoveFolder={removeFolder}
                                onToggleItemInFolder={toggleItemInFolder}
                            />
                        </div>
                    )}

                    {/*
                        Píldora del dock: el borde/cristal queda intacto; dentro, un carril
                        (.omni-dock-strip, ver globals.css) con scroll-x REAL + scroll-snap en
                        TODOS los anchos — móvil, tablet y escritorio. Con 22 items por defecto
                        el contenido no cabe en ninguna pantalla realista, así que el carril
                        siempre tiene que poder deslizarse: táctil, rueda, arrastre con ratón y
                        las flechas laterales. En <lg los items van compactos (48px, ≥44px
                        táctil); en ≥lg, diseño original.
                    */}
                    <div className={cn(
                        "omni-dock-pill glass-depth glass-edge glass-sheen-slow pointer-events-auto",
                        "bg-card/40 dark:bg-black/40 backdrop-blur-3xl border border-foreground/10",
                        // En móvil un radio moderado (los extremos redondeados de
                        // `rounded-full` empujaban el primer/último botón fuera del marco);
                        // en ≥sm vuelve al pill completo. Más margen lateral en móvil.
                        "rounded-3xl sm:rounded-[--radius-full]",
                        "shadow-[0_10px_40px_rgba(0,0,0,0.2)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.5)]",
                        "mb-2 sm:mb-4 max-w-[calc(100vw-16px)] sm:max-w-[calc(100vw-8px)] lg:max-w-[96vw] relative",
                        // Densidad (Ajustes → Trinity → Tamaño del dock): compacto reduce el
                        // padding también en desktop; cómodo mantiene el tamaño histórico.
                        compact ? "p-1.5 lg:p-2.5" : "p-2 lg:p-5",
                    )}>
                        {/* Sombras de scroll: aparecen del lado donde hay más opciones */}
                        <div
                            aria-hidden
                            className={cn(
                                "pointer-events-none absolute inset-y-2 left-0 w-10 rounded-l-[--radius-full] z-10 transition-opacity duration-300",
                                "bg-gradient-to-r from-black/45 to-transparent",
                                shadow.l ? "opacity-100" : "opacity-0"
                            )}
                        />
                        <div
                            aria-hidden
                            className={cn(
                                "pointer-events-none absolute inset-y-2 right-0 w-10 rounded-r-[--radius-full] z-10 transition-opacity duration-300",
                                "bg-gradient-to-l from-black/45 to-transparent",
                                shadow.r ? "opacity-100" : "opacity-0"
                            )}
                        />
                        {/* Flechas «hay más»: ahora son BOTONES REALES (antes solo
                            adorno con pointer-events-none). Con ratón o dedo, un
                            toque salta una pantalla de items — otra vía más para
                            que nada quede inalcanzable. */}
                        {shadow.r && (
                            <button
                                type="button"
                                onClick={() => scrollByPage(1)}
                                aria-label="Ver más accesos a la derecha"
                                title="Ver más accesos"
                                className="pointer-events-auto absolute right-1.5 top-1/2 -translate-y-1/2 z-20 grid size-6 place-items-center rounded-full text-foreground/50 transition-colors duration-200 hover:bg-foreground/10 hover:text-foreground cursor-pointer"
                            >
                                <ChevronRight className="w-4 h-4 animate-pulse" />
                            </button>
                        )}
                        {shadow.l && (
                            <button
                                type="button"
                                onClick={() => scrollByPage(-1)}
                                aria-label="Ver más accesos a la izquierda"
                                title="Ver más accesos"
                                className="pointer-events-auto absolute left-1.5 top-1/2 -translate-y-1/2 z-20 grid size-6 place-items-center rounded-full text-foreground/50 transition-colors duration-200 hover:bg-foreground/10 hover:text-foreground cursor-pointer"
                            >
                                <ChevronLeft className="w-4 h-4 animate-pulse" />
                            </button>
                        )}
                        <div
                            ref={stripRef}
                            onScroll={updateShadows}
                            onPointerDown={onPointerDown}
                            onPointerMove={onPointerMove}
                            onPointerUp={endDrag}
                            onPointerCancel={endDrag}
                            onClickCapture={onClickCapture}
                            role="group"
                            aria-label="Accesos del dock (desliza para ver más)"
                            // Carril deslizable en TODOS los anchos (móvil, tablet y
                            // escritorio): ver .omni-dock-strip en globals.css, donde
                            // está explicada la causa raíz del bug de tablet (la vieja
                            // regla `overflow: visible` en ≥1024px anulaba el scroll y
                            // dejaba los items de más fuera de la pantalla). Nunca más
                            // ancho que el viewport (max-w + box-border) y con padding
                            // consciente de las safe-areas laterales (notch).
                            className={cn(
                                "omni-dock-strip flex items-end overflow-x-auto max-w-full box-border",
                                // Padding lateral mayor en móvil + scroll-padding para que el
                                // primer/último botón queden DENTRO del marco redondeado y el
                                // snap los alinee sin que se salgan por los lados.
                                "pl-[max(0.6rem,env(safe-area-inset-left))] pr-[max(0.6rem,env(safe-area-inset-right))] scroll-px-2 sm:pl-[max(0.25rem,env(safe-area-inset-left))] sm:pr-[max(0.25rem,env(safe-area-inset-right))]",
                                compact ? "gap-1 lg:gap-2" : "gap-1.5 lg:gap-4",
                            )}
                        >
                            {dockEntries.map((entry) => {
                                const iconSizeCls = compact ? "w-4 h-4 lg:w-5 lg:h-5" : "w-5 h-5 lg:w-7 lg:h-7";
                                if (entry.kind === 'item') {
                                    const item = entry.item;
                                    const Icon = ICON_MAP[item.iconKey] ?? FALLBACK_ICON;
                                    return (
                                        <DockItem
                                            key={item.id}
                                            icon={<Icon className={iconSizeCls} />}
                                            label={item.label}
                                            color={item.color}
                                            active={isActivePath(item.path)}
                                            compact={compact}
                                            onClick={() => router.push(item.path)}
                                        />
                                    );
                                }
                                // Folder expandible: el tile lo abre/cierra; al estar
                                // abierta, sus hijos aparecen en línea a continuación.
                                const f = entry.folder;
                                const isOpen = !!folderOpen[f.id];
                                const FolderIcon = isOpen ? FolderOpen : (ICON_MAP[f.iconKey] ?? Folder);
                                const anyChildActive = entry.children.some((c) => isActivePath(c.path));
                                return (
                                    <React.Fragment key={f.id}>
                                        <DockItem
                                            icon={<FolderIcon className={iconSizeCls} />}
                                            label={f.label}
                                            color={f.color}
                                            active={anyChildActive}
                                            compact={compact}
                                            badge={isOpen ? undefined : entry.children.length || undefined}
                                            indicator={
                                                <ChevronDown
                                                    className={cn(
                                                        "w-3 h-3 transition-transform duration-300",
                                                        isOpen ? "rotate-180" : "rotate-0"
                                                    )}
                                                />
                                            }
                                            onClick={() => toggleFolderOpen(f.id)}
                                        />
                                        <AnimatePresence initial={false}>
                                            {isOpen && entry.children.length > 0 && (
                                                <motion.div
                                                    key={`${f.id}-children`}
                                                    initial={{ opacity: 0, width: 0 }}
                                                    animate={{ opacity: 1, width: "auto" }}
                                                    exit={{ opacity: 0, width: 0 }}
                                                    transition={{ type: "spring", stiffness: 320, damping: 32 }}
                                                    className={cn(
                                                        "flex items-end overflow-hidden rounded-2xl bg-foreground/[0.04] ring-1 ring-inset ring-foreground/10",
                                                        compact ? "gap-1 lg:gap-2 px-1 lg:px-1.5" : "gap-1.5 lg:gap-4 px-1.5 lg:px-2",
                                                    )}
                                                >
                                                    {entry.children.map((child) => {
                                                        const CIcon = ICON_MAP[child.iconKey] ?? FALLBACK_ICON;
                                                        return (
                                                            <DockItem
                                                                key={child.id}
                                                                icon={<CIcon className={iconSizeCls} />}
                                                                label={child.label}
                                                                color={child.color}
                                                                active={isActivePath(child.path)}
                                                                compact={compact}
                                                                onClick={() => router.push(child.path)}
                                                            />
                                                        );
                                                    })}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </React.Fragment>
                                );
                            })}

                            <div className={cn(
                                "w-px bg-foreground/10 self-center rounded-full shrink-0",
                                compact ? "h-8 lg:h-11 mx-0.5 lg:mx-1.5" : "h-10 lg:h-14 mx-1 lg:mx-2",
                            )} aria-hidden />

                            <DockItem
                                icon={<Pencil className={compact ? "w-4 h-4 lg:w-5 lg:h-5" : "w-5 h-5 lg:w-7 lg:h-7"} />}
                                label={editMode ? "Cerrar editor" : "Personalizar dock"}
                                color="neutral"
                                compact={compact}
                                onClick={() => setEditMode((v) => !v)}
                            />
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
        </>
    );
}

type DockColor = "neutral" | "cyan" | "crimson" | "amber" | "emerald" | "purple";

const DOCK_PALETTE: Record<DockColor, { text: string; ring: string; glow: string; bg: string; activeBg: string }> = {
    neutral: { text: "text-foreground/80", ring: "ring-foreground/40", glow: "shadow-[0_0_18px_rgba(255,255,255,0.18)]", bg: "from-foreground/10 to-foreground/[0.02]", activeBg: "from-foreground/20 to-foreground/5" },
    cyan: { text: "text-cyan-300", ring: "ring-cyan-400/70", glow: "shadow-[0_0_18px_rgba(34,211,238,0.45)]", bg: "from-cyan-500/15 to-cyan-500/0", activeBg: "from-cyan-500/30 to-cyan-500/5" },
    crimson: { text: "text-red-300", ring: "ring-red-400/70", glow: "shadow-[0_0_18px_rgba(248,113,113,0.45)]", bg: "from-red-500/15 to-red-500/0", activeBg: "from-red-500/30 to-red-500/5" },
    amber: { text: "text-amber-300", ring: "ring-amber-400/70", glow: "shadow-[0_0_18px_rgba(251,191,36,0.45)]", bg: "from-amber-500/15 to-amber-500/0", activeBg: "from-amber-500/30 to-amber-500/5" },
    emerald: { text: "text-emerald-300", ring: "ring-emerald-400/70", glow: "shadow-[0_0_18px_rgba(52,211,153,0.45)]", bg: "from-emerald-500/15 to-emerald-500/0", activeBg: "from-emerald-500/30 to-emerald-500/5" },
    purple: { text: "text-purple-300", ring: "ring-purple-400/70", glow: "shadow-[0_0_18px_rgba(168,85,247,0.45)]", bg: "from-purple-500/15 to-purple-500/0", activeBg: "from-purple-500/30 to-purple-500/5" },
};

function DockItem({ icon, label, onClick, color = "neutral", active = false, badge, indicator, compact = false }: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    color?: DockColor;
    active?: boolean;
    /** Contador opcional (p.ej. nº de accesos dentro de un folder cerrado). */
    badge?: number;
    /** Indicador opcional bajo el icono (p.ej. chevron de folder). */
    indicator?: React.ReactNode;
    /** Densidad compacta (Ajustes → Trinity → Tamaño del dock). */
    compact?: boolean;
}) {
    const p = DOCK_PALETTE[color];
    // (Adenda 190) Forma de los iconos: REDONDOS por defecto (el diseño
    // clásico); "square" (cuadrado redondeado) es opción de tema por perfil.
    const { config: cfgForma } = useAppearance();
    const redondo = ((cfgForma?.trinity as { dockIconShape?: string } | undefined)?.dockIconShape ?? "round") !== "square";

    return (
        <div className={cn(
            "group relative flex shrink-0 snap-center flex-col items-center gap-1",
            compact ? "w-[46px] lg:w-[60px]" : "w-[58px] lg:w-[78px]",
        )}>
            <button
                onClick={onClick}
                aria-current={active ? "page" : undefined}
                title={label}
                className={cn(
                    // Contenedor de icono "cristal" unificado (misma familia que
                    // biblioteca/hub vía .ss-icon-3d--sheen: barrido especular al
                    // hover/focus, 260ms, respeta prefers-reduced-motion y data-perf=eco).
                    "relative flex items-center justify-center cursor-pointer ss-icon-3d--sheen",
                    // (Adenda 191) !important: una regla CSS global fijaba 8px y
                    // pisaba el radio — por eso el dock se veía "cuadrado" aunque
                    // la preferencia dijera redondo. El diseño clásico circular
                    // vuelve a mandar; "square" queda como variante de tema.
                    redondo ? "!rounded-full" : "!rounded-2xl",
                    compact ? "w-9 h-9 lg:w-12 lg:h-12" : "w-12 h-12 lg:w-16 lg:h-16",
                    // Transiciones 150–300ms (guía de diseño): micro-interacción viva.
                    "transition-[transform,box-shadow,background-color,border-color] duration-200 ease-out",
                    "active:scale-95 group-hover:scale-105 group-hover:-translate-y-0.5",
                    // Foco accesible por teclado.
                    "outline-none focus-visible:ring-2 focus-visible:ring-offset-0 focus-visible:ring-white/60",
                    "bg-gradient-to-br ring-1 ring-inset",
                    p.text,
                    active
                        ? cn(p.activeBg, "ring-2", p.ring, p.glow, "scale-105")
                        // Hover más claro: sube el brillo del acento y el anillo.
                        : cn(p.bg, "ring-white/10 group-hover:ring-white/30 group-hover:shadow-[0_6px_20px_rgba(0,0,0,0.35)]"),
                )}
            >
                {/* Brillo de cristal sutil que aparece al pasar el cursor (Liquid Glass). */}
                <span
                    aria-hidden
                    className={cn(
                        "pointer-events-none absolute inset-0 bg-gradient-to-t from-transparent via-white/0 to-white/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100",
                        redondo ? "!rounded-full" : "!rounded-2xl",
                    )}
                />
                {icon}
                {active && (
                    <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-current shadow-[0_0_8px_currentColor]" aria-hidden />
                )}
                {typeof badge === "number" && badge > 0 && (
                    <span
                        aria-hidden
                        className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 grid place-items-center rounded-full bg-foreground/85 text-background text-[9px] font-bold tabular-nums shadow"
                    >
                        {badge}
                    </span>
                )}
                {indicator && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-current/70" aria-hidden>
                        {indicator}
                    </span>
                )}
            </button>
            {!compact && (
                <span
                    className={cn(
                        "max-w-[58px] lg:max-w-[78px] truncate text-center text-[9px] lg:text-[11px] leading-tight transition-colors",
                        active ? cn(p.text, "font-semibold") : "text-foreground/55 group-hover:text-foreground/85",
                    )}
                >
                    {label}
                </span>
            )}
        </div>
    );
}

function DockEditor({
    items, folders, onToggle, onMove, onReorder, onReset, onClose,
    onAddFolder, onRenameFolder, onRemoveFolder, onToggleItemInFolder,
}: {
    items: DockItemConfig[];
    folders: DockFolderConfig[];
    onToggle: (id: string) => void;
    onMove: (id: string, direction: -1 | 1) => void;
    /** Arrastra `sourceId` hasta la posición de `targetId`. */
    onReorder: (sourceId: string, targetId: string) => void;
    onReset: () => void;
    onClose: () => void;
    onAddFolder: () => void;
    onRenameFolder: (id: string, label: string) => void;
    onRemoveFolder: (id: string) => void;
    onToggleItemInFolder: (folderId: string, itemId: string) => void;
}) {
    // ¿En qué folder está cada item? (para mostrarlo en su fila).
    const folderOfItem = (itemId: string) => folders.find((f) => f.itemIds.includes(itemId));

    // ── Arrastrar para reordenar (drag & drop nativo, complementa ←→) ──
    const [dragId, setDragId] = useState<string | null>(null);
    const [overId, setOverId] = useState<string | null>(null);

    return (
        <div className="bg-card/60 backdrop-blur-2xl border border-foreground/15 rounded-3xl p-4 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs uppercase tracking-wider font-bold text-foreground/80">
                    Personalizar dock
                </h4>
                <div className="flex gap-1.5">
                    <button onClick={onReset} className="text-[10px] flex items-center gap-1 px-2 py-1 rounded-full border border-foreground/10 hover:bg-foreground/5">
                        <RotateCcw className="w-3 h-3" /> Restablecer
                    </button>
                    <button onClick={onClose} className="text-[10px] flex items-center gap-1 px-2 py-1 rounded-full border border-foreground/10 hover:bg-foreground/5">
                        <Check className="w-3 h-3" /> Listo
                    </button>
                </div>
            </div>
            <p className="text-[10px] text-muted-foreground mb-3">
                Activa o desactiva los iconos y reordénalos. Agrúpalos en folders expandibles: en el dock, un folder se toca para desplegar sus accesos y se vuelve a plegar. Los items "Hermes" (Agente, Cerebro, Skills, Tools, Sentidos, MCPs) son opciones predeterminadas que puedes mostrar u ocultar.
            </p>

            {/* ── Folders expandibles ── */}
            <div className="mb-3 rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-2.5">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-foreground/70 flex items-center gap-1.5">
                        <Folder className="w-3.5 h-3.5" /> Folders
                    </span>
                    <button
                        onClick={onAddFolder}
                        className="text-[10px] flex items-center gap-1 px-2 py-1 rounded-full border border-foreground/10 hover:bg-foreground/5"
                    >
                        <FolderPlus className="w-3 h-3" /> Nuevo folder
                    </button>
                </div>
                {folders.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground/70 px-1 py-1">
                        Aún no tienes folders. Crea uno y asígnale accesos desde la lista de abajo para agruparlos.
                    </p>
                ) : (
                    <div className="space-y-2">
                        {folders.map((f) => {
                            const FIcon = ICON_MAP[f.iconKey] ?? Folder;
                            const childLabels = f.itemIds
                                .map((id) => items.find((it) => it.id === id)?.label)
                                .filter(Boolean) as string[];
                            return (
                                <div key={f.id} className="rounded-xl border border-foreground/10 bg-foreground/[0.03] p-2">
                                    <div className="flex items-center gap-2">
                                        <FIcon className="w-4 h-4 shrink-0 text-foreground/70" />
                                        <input
                                            value={f.label}
                                            onChange={(e) => onRenameFolder(f.id, e.target.value)}
                                            className="flex-1 min-w-0 bg-transparent border-b border-foreground/15 focus:border-foreground/40 outline-none text-xs font-medium px-0.5 py-0.5"
                                            placeholder="Nombre del folder"
                                        />
                                        <span className="text-[9px] text-muted-foreground/60 tabular-nums">{childLabels.length}</span>
                                        <button
                                            onClick={() => onRemoveFolder(f.id)}
                                            title="Eliminar folder (sus accesos vuelven al dock)"
                                            className="p-1 hover:bg-rose-500/15 hover:text-rose-300 rounded"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                    {childLabels.length > 0 && (
                                        <div className="mt-1.5 flex flex-wrap gap-1">
                                            {childLabels.map((l, i) => (
                                                <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full bg-foreground/10 text-foreground/70">{l}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <p className="text-[9px] text-muted-foreground/70 mb-1.5 flex items-center gap-1">
                <GripVertical className="w-2.5 h-2.5" /> Arrastra el asa para reordenar, o usa las flechas.
            </p>
            <div className="grid sm:grid-cols-2 gap-1.5 max-h-72 overflow-y-auto">
                {items.map((it) => {
                    const Icon = ICON_MAP[it.iconKey] ?? FALLBACK_ICON;
                    const inFolder = folderOfItem(it.id);
                    return (
                        <div
                            key={it.id}
                            draggable
                            onDragStart={(e) => { setDragId(it.id); try { e.dataTransfer.effectAllowed = 'move'; } catch { /* noop */ } }}
                            onDragEnter={() => { if (dragId && dragId !== it.id) setOverId(it.id); }}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                                e.preventDefault();
                                if (dragId && dragId !== it.id) onReorder(dragId, it.id);
                                setDragId(null);
                                setOverId(null);
                            }}
                            onDragEnd={() => { setDragId(null); setOverId(null); }}
                            className={cn(
                                'flex items-center gap-2 px-2 py-1.5 rounded-lg border text-xs transition-colors duration-150',
                                it.enabled
                                    ? 'border-foreground/15 bg-foreground/[0.03]'
                                    : 'border-foreground/5 bg-foreground/[0.01] opacity-60',
                                dragId === it.id && 'opacity-40',
                                overId === it.id && 'border-primary/50 bg-primary/10',
                            )}
                        >
                            <span
                                className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground touch-none"
                                title="Arrastrar para reordenar"
                                aria-hidden
                            >
                                <GripVertical className="w-3.5 h-3.5" />
                            </span>
                            <Icon className="w-4 h-4 shrink-0" />
                            <span className="flex-1 truncate font-medium">
                                {it.label}
                                {inFolder && (
                                    <span className="ml-1 inline-flex items-center gap-0.5 text-[8px] text-muted-foreground/70 align-middle">
                                        <Folder className="w-2.5 h-2.5" />{inFolder.label}
                                    </span>
                                )}
                            </span>
                            {/* Asignar a folder (si hay folders). */}
                            {folders.length > 0 && (
                                <select
                                    value={inFolder?.id ?? ''}
                                    onChange={(e) => {
                                        const target = e.target.value;
                                        if (!target) {
                                            // Quitar de su folder actual (si lo hay).
                                            if (inFolder) onToggleItemInFolder(inFolder.id, it.id);
                                        } else {
                                            onToggleItemInFolder(target, it.id);
                                        }
                                    }}
                                    title="Asignar este acceso a un folder"
                                    className="max-w-[84px] bg-foreground/5 border border-foreground/10 rounded px-1 py-0.5 text-[9px] text-foreground/80 outline-none"
                                >
                                    <option value="">Sin folder</option>
                                    {folders.map((f) => (
                                        <option key={f.id} value={f.id}>{f.label}</option>
                                    ))}
                                </select>
                            )}
                            <button onClick={() => onMove(it.id, -1)} className="p-1 hover:bg-foreground/10 rounded">
                                <ArrowLeft className="w-3 h-3" />
                            </button>
                            <button onClick={() => onMove(it.id, 1)} className="p-1 hover:bg-foreground/10 rounded">
                                <ArrowRight className="w-3 h-3" />
                            </button>
                            <button onClick={() => onToggle(it.id)} className="p-1 hover:bg-foreground/10 rounded">
                                {it.enabled ? <Check className="w-3 h-3 text-emerald-400" /> : <X className="w-3 h-3 text-muted-foreground" />}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

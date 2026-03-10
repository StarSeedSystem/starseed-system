'use client';

import { useState, useEffect, useCallback } from "react";
import { Dashboard, DashboardWidget, WidgetType } from "./dashboard-types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Plus, Settings, LayoutGrid, Star, ArrowLeft, ArrowRight, Trash2, Search, Sparkles } from "lucide-react";
import { GridArea } from "./grid-area";
import { useToast } from "@/components/ui/use-toast";
import { AddWidgetDialog } from "./add-widget-dialog";
import { WidgetForgeDialog } from "./widget-forge/widget-forge-dialog";
import { WeatherLocationProvider } from "@/modules/weather/context/weather-location-context";
import { LocationSelector } from "./location-selector";
import { DEFAULT_DASHBOARD_TEMPLATES, ALL_DASHBOARD_TEMPLATES } from "./dashboard-defaults";
import { WIDGET_CATEGORIES, getCategoryById } from "./widget-categories";

import { cn } from "@/lib/utils";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ── LocalStorage Keys ────────────────────────────────────────────
const LS_DASHBOARDS = 'starseed_dashboards';
const LS_WIDGETS = 'starseed_widgets';
const LS_ORDER = 'dashboard_order';
const LS_INITIALIZED = 'starseed_dashboards_initialized';

// ── LocalStorage Helpers ─────────────────────────────────────────
function loadDashboards(): Dashboard[] {
    try {
        const raw = localStorage.getItem(LS_DASHBOARDS);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function saveDashboards(dashboards: Dashboard[]) {
    localStorage.setItem(LS_DASHBOARDS, JSON.stringify(dashboards));
}

function loadAllWidgets(): Record<string, DashboardWidget[]> {
    try {
        const raw = localStorage.getItem(LS_WIDGETS);
        return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
}

function saveAllWidgets(widgetMap: Record<string, DashboardWidget[]>) {
    localStorage.setItem(LS_WIDGETS, JSON.stringify(widgetMap));
}

function loadWidgetsForDashboard(dashboardId: string): DashboardWidget[] {
    const all = loadAllWidgets();
    return all[dashboardId] || [];
}

function saveWidgetsForDashboard(dashboardId: string, widgets: DashboardWidget[]) {
    const all = loadAllWidgets();
    all[dashboardId] = widgets;
    saveAllWidgets(all);
}

function removeWidgetsForDashboard(dashboardId: string) {
    const all = loadAllWidgets();
    delete all[dashboardId];
    saveAllWidgets(all);
}

// ── Generate Default Dashboards (once) ───────────────────────────
function generateDefaultDashboards(): { dashboards: Dashboard[], widgetMap: Record<string, DashboardWidget[]> } {
    const dashboards: Dashboard[] = [];
    const widgetMap: Record<string, DashboardWidget[]> = {};
    const now = new Date().toISOString();

    for (const template of DEFAULT_DASHBOARD_TEMPLATES) {
        const dashId = crypto.randomUUID();
        dashboards.push({
            id: dashId,
            profile_id: 'local',
            name: template.name,
            is_default: !!template.isDefault,
            category: template.categoryId,
            created_at: now,
            updated_at: now,
        });

        widgetMap[dashId] = template.widgets.map(w => ({
            id: crypto.randomUUID(),
            dashboard_id: dashId,
            widget_type: w.type as any,
            layout: { x: w.x, y: w.y, w: w.w, h: w.h, i: crypto.randomUUID() },
            settings: {},
            created_at: now,
        }));
    }

    return { dashboards, widgetMap };
}

// ═════════════════════════════════════════════════════════════════
// ██  DashboardLayout Component (100% LocalStorage)  █████████████
// ═════════════════════════════════════════════════════════════════
export function DashboardLayout() {
    const [dashboards, setDashboards] = useState<Dashboard[]>([]);
    const [activeDashboardId, setActiveDashboardId] = useState<string | null>(null);
    const [widgets, setWidgets] = useState<DashboardWidget[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditMode, setIsEditMode] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState(DEFAULT_DASHBOARD_TEMPLATES[0]?.categoryId || 'social');
    const [templateSearch, setTemplateSearch] = useState('');

    // Dialog State
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [newDashboardName, setNewDashboardName] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const [isForgeOpen, setIsForgeOpen] = useState(false);

    const { toast } = useToast();

    // ── Initialize on mount ──────────────────────────────────────
    useEffect(() => {
        const initialized = localStorage.getItem(LS_INITIALIZED);

        if (!initialized) {
            // First time: generate all 17 default dashboards
            const { dashboards: defaults, widgetMap } = generateDefaultDashboards();
            saveDashboards(defaults);
            saveAllWidgets(widgetMap);
            localStorage.setItem(LS_INITIALIZED, 'true');

            const sorted = sortDashboards(defaults);
            setDashboards(sorted);
            if (sorted.length > 0) {
                setActiveDashboardId(sorted[0].id);
                setWidgets(widgetMap[sorted[0].id] || []);
            }
        } else {
            // Load from localStorage
            const stored = loadDashboards();
            if (stored.length > 0) {
                const sorted = sortDashboards(stored);
                setDashboards(sorted);
                setActiveDashboardId(sorted[0].id);
                setWidgets(loadWidgetsForDashboard(sorted[0].id));
            } else {
                // Somehow empty, regenerate
                const { dashboards: defaults, widgetMap } = generateDefaultDashboards();
                saveDashboards(defaults);
                saveAllWidgets(widgetMap);

                const sorted = sortDashboards(defaults);
                setDashboards(sorted);
                if (sorted.length > 0) {
                    setActiveDashboardId(sorted[0].id);
                    setWidgets(widgetMap[sorted[0].id] || []);
                }
            }
        }

        setLoading(false);
    }, []);

    // ── Listen for forge open event from Trinity panel ──────────
    useEffect(() => {
        const handler = () => setIsForgeOpen(true);
        window.addEventListener('starseed:open-forge', handler);
        return () => window.removeEventListener('starseed:open-forge', handler);
    }, []);

    // ── Load widgets when active dashboard changes ───────────────
    useEffect(() => {
        if (activeDashboardId) {
            setWidgets(loadWidgetsForDashboard(activeDashboardId));
        }
    }, [activeDashboardId]);

    // ── Sort dashboards ──────────────────────────────────────────
    const sortDashboards = (data: Dashboard[]) => {
        const savedOrder = localStorage.getItem(LS_ORDER);
        let orderMap: string[] = [];
        if (savedOrder) {
            try { orderMap = JSON.parse(savedOrder); } catch { }
        }

        return [...data].sort((a, b) => {
            if (a.is_default && !b.is_default) return -1;
            if (!a.is_default && b.is_default) return 1;

            const idxA = orderMap.indexOf(a.id);
            const idxB = orderMap.indexOf(b.id);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;

            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        });
    };

    const saveOrder = (newDashboards: Dashboard[]) => {
        localStorage.setItem(LS_ORDER, JSON.stringify(newDashboards.map(d => d.id)));
    };

    // ── Add Widget ───────────────────────────────────────────────
    const handleAddWidget = (dashboardId: string, type: WidgetType) => {
        const y = widgets.length > 0 ? Math.max(...widgets.map(w => w.layout.y + w.layout.h)) : 0;

        const newWidget: DashboardWidget = {
            id: crypto.randomUUID(),
            dashboard_id: dashboardId,
            widget_type: type as any,
            layout: { x: 0, y, w: 4, h: 4, i: crypto.randomUUID() },
            settings: {},
            created_at: new Date().toISOString(),
        };

        const updated = [...widgets, newWidget];
        setWidgets(updated);
        saveWidgetsForDashboard(dashboardId, updated);
        toast({ title: "Widget añadido", description: "Personaliza su posición en el modo edición." });
    };

    // ── Add AI-Generated Widget (from La Fragua) ─────────────────
    const handleAddAiWidget = useCallback((widgetData: {
        customHtml: string;
        ontology: { title: string; description: string; themeColor: string };
        widgetConfig: any;
        forgePrompt: string;
        selectedLayout: string;
        selectedImage?: string;
    }) => {
        if (!activeDashboardId) return;
        const y = widgets.length > 0 ? Math.max(...widgets.map(w => w.layout.y + w.layout.h)) : 0;

        const newWidget: DashboardWidget = {
            id: crypto.randomUUID(),
            dashboard_id: activeDashboardId,
            widget_type: 'AI_GENERATED',
            layout: { x: 0, y, w: 6, h: 5, i: crypto.randomUUID() },
            settings: {
                customHtml: widgetData.customHtml,
                ontology: widgetData.ontology,
                widgetConfig: widgetData.widgetConfig,
                forgePrompt: widgetData.forgePrompt,
                selectedLayout: widgetData.selectedLayout,
                selectedImage: widgetData.selectedImage,
            },
            created_at: new Date().toISOString(),
        };

        const updated = [...widgets, newWidget];
        setWidgets(updated);
        saveWidgetsForDashboard(activeDashboardId, updated);
        toast({ title: "🔮 Widget Forjado", description: `"${widgetData.ontology.title}" añadido al dashboard.` });
    }, [activeDashboardId, widgets, toast]);

    // ── Widget state updater (called from GridArea) ──────────────
    const handleSetWidgets = useCallback((newWidgets: DashboardWidget[]) => {
        setWidgets(newWidgets);
        if (activeDashboardId) {
            saveWidgetsForDashboard(activeDashboardId, newWidgets);
        }
    }, [activeDashboardId]);

    // ── Create Dashboard ─────────────────────────────────────────
    const handleCreateDashboard = () => {
        if (!newDashboardName.trim()) return;
        setIsCreating(true);

        try {
            const now = new Date().toISOString();
            const dashId = crypto.randomUUID();

            const newDashboard: Dashboard = {
                id: dashId,
                profile_id: 'local',
                name: newDashboardName,
                is_default: false,
                category: selectedTemplate,
                created_at: now,
                updated_at: now,
            };

            // Seed widgets from template
            const template = ALL_DASHBOARD_TEMPLATES.find(t => t.categoryId === selectedTemplate);
            const seededWidgets: DashboardWidget[] = (template?.widgets || []).map(w => ({
                id: crypto.randomUUID(),
                dashboard_id: dashId,
                widget_type: w.type as any,
                layout: { x: w.x, y: w.y, w: w.w, h: w.h, i: crypto.randomUUID() },
                settings: {},
                created_at: now,
            }));

            // Persist
            const allDashboards = [...dashboards, newDashboard];
            saveDashboards(allDashboards);
            saveWidgetsForDashboard(dashId, seededWidgets);

            setDashboards(allDashboards);
            setActiveDashboardId(dashId);
            setWidgets(seededWidgets);

            toast({ title: "Dashboard creado", description: `Se ha creado "${newDashboardName}"` });
            setNewDashboardName("");
            setIsCreateDialogOpen(false);
        } catch (err) {
            console.error("Error creating dashboard:", err);
            toast({ title: "Error", description: "Error al crear el dashboard.", variant: "destructive" });
        } finally {
            setIsCreating(false);
        }
    };

    // ── Set Default ──────────────────────────────────────────────
    const handleSetDefault = (dashboardId: string) => {
        const updated = dashboards.map(d => ({
            ...d,
            is_default: d.id === dashboardId
        }));
        const sorted = sortDashboards(updated);
        setDashboards(sorted);
        saveDashboards(sorted);
        toast({ title: "Principal actualizado", description: "Dashboard asignado como principal." });
    };

    // ── Move Dashboard ───────────────────────────────────────────
    const handleMoveDashboard = (index: number, direction: 'left' | 'right') => {
        const newIndex = direction === 'left' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= dashboards.length) return;

        const newDashboards = [...dashboards];
        [newDashboards[index], newDashboards[newIndex]] = [newDashboards[newIndex], newDashboards[index]];

        setDashboards(newDashboards);
        saveOrder(newDashboards);
        saveDashboards(newDashboards);
    };

    // ── Delete Dashboard ─────────────────────────────────────────
    const handleDeleteDashboard = (id: string) => {
        if (dashboards.length <= 1) {
            toast({ title: "Acción bloqueada", description: "No puedes eliminar el único dashboard.", variant: "destructive" });
            return;
        }

        const confirm = window.confirm("¿Estás seguro de eliminar este dashboard?");
        if (!confirm) return;

        removeWidgetsForDashboard(id);
        const remaining = dashboards.filter(d => d.id !== id);
        setDashboards(remaining);
        saveDashboards(remaining);

        if (activeDashboardId === id && remaining.length > 0) {
            setActiveDashboardId(remaining[0].id);
        }

        toast({ title: "Eliminado", description: "Dashboard eliminado correctamente." });
    };

    // ── Loading state ────────────────────────────────────────────
    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            </div>
        );
    }

    return (
        <WeatherLocationProvider>
            <div className="flex flex-col gap-6">
                {/* ── Header con título animado y toolbar ── */}
                <div className="flex flex-col items-center gap-4">
                    <div className="text-center">
                        <h1 className="text-4xl md:text-5xl font-bold font-headline text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-cyan-400 to-fuchsia-400 animate-gradient-x">
                            Dashboards
                        </h1>
                        <p className="text-[10px] font-mono text-white/25 uppercase tracking-[0.3em] mt-1">OS StarSeed // Panel de Control</p>
                    </div>
                    <div className="flex items-center gap-2 bg-black/20 backdrop-blur-xl border border-white/[0.06] rounded-full px-3 py-1.5">
                        <LocationSelector />
                        <div className="w-px h-5 bg-white/10" />
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsForgeOpen(true)}
                            className="gap-2 text-indigo-300 hover:text-indigo-200 hover:bg-indigo-500/10 rounded-full h-8 px-3 text-xs"
                        >
                            <Sparkles className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Forjar Widget</span>
                        </Button>
                        <div className="w-px h-5 bg-white/10" />
                        <Button
                            variant={isEditMode ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => setIsEditMode(!isEditMode)}
                            className={cn(
                                "gap-2 transition-all rounded-full h-8 px-3 text-xs",
                                isEditMode && "bg-white/10 ring-1 ring-primary/50"
                            )}
                        >
                            <LayoutGrid className="h-3.5 w-3.5" />
                            {isEditMode ? "Terminar" : "Editar"}
                        </Button>
                    </div>
                </div>

                <Tabs
                    value={activeDashboardId || ""}
                    onValueChange={setActiveDashboardId}
                    className="w-full"
                >
                    <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2 min-h-[3rem]">
                        <TabsList className="bg-background/20 backdrop-blur-md border border-white/10 h-auto p-1 flex items-center gap-1 w-max">
                            {dashboards.map((d, index) => (
                                <div key={d.id} className="flex items-center group relative">
                                    <TabsTrigger
                                        value={d.id}
                                        className={cn(
                                            "h-9 gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all duration-300 px-4",
                                            isEditMode && "pr-8"
                                        )}
                                    >
                                        {d.name}
                                        {d.is_default && <Star className="w-3 h-3 fill-yellow-400 text-yellow-400 ml-1" />}
                                    </TabsTrigger>

                                    {isEditMode && (
                                        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 pl-2 bg-black/40 rounded-full backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                            {!d.is_default && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleSetDefault(d.id); }}
                                                    className="p-1 hover:text-yellow-400 text-muted-foreground transition-colors"
                                                    title="Hacer Principal"
                                                >
                                                    <Star className="w-3 h-3" />
                                                </button>
                                            )}
                                            {index > 0 && !d.is_default && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleMoveDashboard(index, 'left'); }}
                                                    className="p-1 hover:text-white text-muted-foreground transition-colors"
                                                >
                                                    <ArrowLeft className="w-3 h-3" />
                                                </button>
                                            )}
                                            {index < dashboards.length - 1 && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleMoveDashboard(index, 'right'); }}
                                                    className="p-1 hover:text-white text-muted-foreground transition-colors"
                                                >
                                                    <ArrowRight className="w-3 h-3" />
                                                </button>
                                            )}
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDeleteDashboard(d.id); }}
                                                className="p-1 hover:text-red-400 text-muted-foreground transition-colors"
                                                title="Eliminar"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </TabsList>

                        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                            <DialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 hover:bg-white/10 border border-dashed border-white/20">
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="w-[90vw] max-w-[800px] flex flex-col p-6 sm:p-8">
                                <DialogHeader className="text-center sm:text-center shrink-0 mb-4">
                                    <DialogTitle className="text-2xl font-bold">Crear nuevo dashboard</DialogTitle>
                                    <DialogDescription className="text-sm">
                                        Organiza tus widgets en un nuevo espacio expandido.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-6 py-6 items-center justify-center max-w-2xl mx-auto w-full">
                                    <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 w-full">
                                        <Label htmlFor="name" className="sm:text-right font-semibold">
                                            Nombre
                                        </Label>
                                        <Input
                                            id="name"
                                            value={newDashboardName}
                                            onChange={(e) => setNewDashboardName(e.target.value)}
                                            className="col-span-1 sm:col-span-3 text-center sm:text-left h-12"
                                            placeholder="Ej. Finanzas Cuánticas"
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-4 items-start gap-4 w-full">
                                        <Label className="sm:text-right font-semibold pt-3">Categoría</Label>
                                        <div className="col-span-1 sm:col-span-3 space-y-3">
                                            <div className="relative">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                <Input
                                                    placeholder="Buscar categoría..."
                                                    value={templateSearch}
                                                    onChange={(e) => setTemplateSearch(e.target.value)}
                                                    className="pl-9 h-10"
                                                />
                                            </div>
                                            <div className="flex flex-wrap justify-center sm:justify-start gap-2 max-h-[200px] overflow-y-auto pr-1 scrollbar-thin">
                                                {ALL_DASHBOARD_TEMPLATES
                                                    .filter(t => {
                                                        if (!templateSearch.trim()) return true;
                                                        const cat = getCategoryById(t.categoryId);
                                                        const q = templateSearch.toLowerCase();
                                                        return t.name.toLowerCase().includes(q) ||
                                                            cat?.tags.some(tag => tag.includes(q)) || false;
                                                    })
                                                    .map((t) => {
                                                        const cat = getCategoryById(t.categoryId);
                                                        const Icon = cat?.icon;
                                                        const widgetCount = t.widgets.length;
                                                        return (
                                                            <Button
                                                                key={t.categoryId}
                                                                variant={selectedTemplate === t.categoryId ? "default" : "outline"}
                                                                size="sm"
                                                                onClick={() => setSelectedTemplate(t.categoryId)}
                                                                className={cn(
                                                                    "gap-1.5 transition-all",
                                                                    widgetCount === 0 && "opacity-50"
                                                                )}
                                                                title={cat?.description}
                                                            >
                                                                {Icon && <Icon className="h-3.5 w-3.5" />}
                                                                {t.name}
                                                                {widgetCount > 0 && (
                                                                    <span className="text-[10px] opacity-60">({widgetCount})</span>
                                                                )}
                                                            </Button>
                                                        );
                                                    })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <DialogFooter className="sm:justify-center mt-4 border-t border-border/50 pt-6">
                                    <Button type="submit" onClick={handleCreateDashboard} disabled={isCreating} className="w-full sm:w-auto min-w-[200px] h-12 text-base font-semibold">
                                        {isCreating ? "Creando..." : "Crear Dashboard"}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>

                    {dashboards.map(d => (
                        <TabsContent key={d.id} value={d.id} className="mt-0 space-y-4">
                            <GridArea
                                dashboardId={d.id}
                                widgets={widgets}
                                setWidgets={handleSetWidgets}
                                isEditMode={isEditMode}
                                onPinWidget={(widget) => {
                                    // Dispatch event for the global PinnedWidgetOverlay to handle
                                    const htmlCode = widget.widget_type === 'AI_GENERATED'
                                        ? widget.settings?.customHtml || '<div style="padding:20px;color:white;">Widget</div>'
                                        : `<div style="background:rgba(20,20,30,0.9);padding:24px;border-radius:20px;color:white;border:1px solid rgba(255,255,255,0.08);"><h3 style="font-size:16px;font-weight:600;margin:0 0 8px;">${widget.widget_type.replace(/_/g, ' ')}</h3><p style="color:rgba(255,255,255,0.4);font-size:12px;margin:0;">Widget fijado desde el dashboard</p></div>`;
                                    const title = widget.settings?.ontology?.title || widget.widget_type.replace(/_/g, ' ');
                                    const themeColor = widget.settings?.ontology?.themeColor || '#8b5cf6';

                                    // Load existing, add, save directly to localStorage
                                    const STORAGE_KEY = 'starseed_pinned_widgets';
                                    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
                                    if (existing.find((w: any) => w.id === widget.id)) return;
                                    existing.push({
                                        id: widget.id,
                                        htmlCode,
                                        title,
                                        themeColor,
                                        position: { x: 60 + existing.length * 30, y: 60 + existing.length * 30, width: 420, height: 340 },
                                    });
                                    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
                                    // Force the overlay to re-read
                                    window.dispatchEvent(new Event('storage'));
                                }}
                            />
                            {isEditMode && (
                                <div className="flex justify-center mt-6 pb-12 opacity-50 hover:opacity-100 transition-opacity">
                                    <AddWidgetDialog
                                        isEditMode={isEditMode}
                                        onAdd={(type) => {
                                            handleAddWidget(d.id, type);
                                        }}
                                        onForgeOpen={() => setIsForgeOpen(true)}
                                    />
                                </div>
                            )}
                        </TabsContent>
                    ))}
                </Tabs>

                    {/* ── Widget Forge Dialog ── */}
                    <WidgetForgeDialog
                        open={isForgeOpen}
                        onOpenChange={setIsForgeOpen}
                        onWidgetCreated={handleAddAiWidget}
                    />
                </div>
            </WeatherLocationProvider>
        );
    }

'use client';

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { Dashboard, DashboardWidget } from "./dashboard-types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Plus, Settings, LayoutGrid, Star, ArrowLeft, ArrowRight, Trash2 } from "lucide-react";
import { GridArea } from "./grid-area";
import { useToast } from "@/components/ui/use-toast";
import { AddWidgetDialog } from "./add-widget-dialog";
import { WidgetType } from "./dashboard-types";
import { cn } from "@/lib/utils";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DashboardLayout() {
    const [dashboards, setDashboards] = useState<Dashboard[]>([]);
    const [activeDashboardId, setActiveDashboardId] = useState<string | null>(null);
    const [widgets, setWidgets] = useState<DashboardWidget[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditMode, setIsEditMode] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(true);

    // Dialog State
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [newDashboardName, setNewDashboardName] = useState("");
    const [isCreating, setIsCreating] = useState(false);

    const supabase = createClient();
    const { toast } = useToast();

    useEffect(() => {
        fetchDashboards();
    }, []);

    useEffect(() => {
        if (activeDashboardId) {
            fetchWidgets(activeDashboardId);
        }
    }, [activeDashboardId]);

    const ensureProfile = async (user: any) => {
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id')
            .eq('user_id', user.id)
            .limit(1);

        if (profiles && profiles.length > 0) {
            return profiles[0];
        }

        // Create profile if missing
        console.log("Creating missing profile for user...");
        const { data: newProfile, error } = await supabase
            .from('profiles')
            .insert({
                user_id: user.id,
                type: 'OFFICIAL',
                handle: `user_${user.id.substring(0, 8)}`,
                display_name: user.email?.split('@')[0] || 'User',
                badges: [],
                stats: { "reputation": 0, "contributions": 0 }
            })
            .select('id')
            .single();

        if (error) {
            console.error("Error creating profile:", error);
            // If error is duplicate handle, maybe we failed to find the profile but it exists (edge case)
            // returning null here is safest to avoid crash
            return null;
        }
        return newProfile;
    };

    const sortDashboards = (data: Dashboard[]) => {
        // Load order from local storage
        const savedOrder = localStorage.getItem('dashboard_order');
        let orderMap: string[] = [];
        if (savedOrder) {
            try {
                orderMap = JSON.parse(savedOrder);
            } catch (e) { console.error(e); }
        }

        return [...data].sort((a, b) => {
            // 1. Default (Primary) always first
            if (a.is_default && !b.is_default) return -1;
            if (!a.is_default && b.is_default) return 1;

            // 2. Custom Order
            const idxA = orderMap.indexOf(a.id);
            const idxB = orderMap.indexOf(b.id);

            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1; // Prioritize sorted items
            if (idxB !== -1) return 1;

            // 3. Fallback to Created At
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        });
    };

    const saveOrder = (newDashboards: Dashboard[]) => {
        const orderIds = newDashboards.map(d => d.id);
        localStorage.setItem('dashboard_order', JSON.stringify(orderIds));
    };

    const fetchDashboards = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                console.warn("No user found in DashboardLayout");
                setIsAuthenticated(false);
                return;
            }

            const profile = await ensureProfile(user);

            if (!profile) {
                console.error("No profile found for user and failed to create one.");
                return;
            }

            const { data, error } = await supabase
                .from('dashboards')
                .select('*')
                .eq('profile_id', profile.id);

            if (error) {
                console.error("Error fetching dashboards:", error);
                return;
            }

            if (data && data.length > 0) {
                const sorted = sortDashboards(data);
                setDashboards(sorted);
                // Set active to the first one (usually default) if not set
                if (!activeDashboardId) {
                    setActiveDashboardId(sorted[0].id);
                }
            } else {
                // New user with no dashboards? Create a default one
                if (data?.length === 0) {
                    await createDefaultDashboard(profile.id);
                }
            }
        } catch (error) {
            console.error("Unexpected error in fetchDashboards:", error);
        } finally {
            setLoading(false);
        }
    };

    const createDefaultDashboard = async (profileId: string) => {
        const { data: dashboard, error } = await supabase
            .from('dashboards')
            .insert({
                profile_id: profileId,
                name: "Principal",
                is_default: true
            })
            .select()
            .single();

        if (dashboard) {
            setDashboards([dashboard]);
            setActiveDashboardId(dashboard.id);
            // Seed default widgets for the default dashboard
            const defaultWidgets = [
                {
                    dashboard_id: dashboard.id,
                    widget_type: 'EXPLORE_NETWORK',
                    layout: { x: 0, y: 0, w: 6, h: 4 },
                    settings: {}
                },
                {
                    dashboard_id: dashboard.id,
                    widget_type: 'MY_PAGES',
                    layout: { x: 6, y: 0, w: 4, h: 4 },
                    settings: {}
                },
                {
                    dashboard_id: dashboard.id,
                    widget_type: 'POLITICAL_SUMMARY',
                    layout: { x: 0, y: 4, w: 10, h: 3 },
                    settings: {}
                }
            ];
            await supabase.from('dashboard_widgets').insert(defaultWidgets);
            await fetchWidgets(dashboard.id);
        }
    };

    const fetchWidgets = async (dashboardId: string) => {
        setLoading(true);
        const { data, error } = await supabase
            .from('dashboard_widgets')
            .select('*')
            .eq('dashboard_id', dashboardId);

        if (error) {
            console.error("Error fetching widgets:", error);
        } else {
            setWidgets(data || []);
        }
        setLoading(false);
    };

    const handleAddWidget = async (dashboardId: string, type: WidgetType) => {
        // Calculate next position (naive approach: place at bottom)
        const y = widgets.length > 0 ? Math.max(...widgets.map(w => w.layout.y + w.layout.h)) : 0;

        const newWidget = {
            dashboard_id: dashboardId,
            widget_type: type,
            layout: { x: 0, y: y, w: 4, h: 4, i: crypto.randomUUID() }, // Default size, will be adjustable
            settings: {}
        };

        const { data, error } = await supabase
            .from('dashboard_widgets')
            .insert(newWidget)
            .select()
            .single();

        if (error) {
            console.error("Error adding widget:", error);
            toast({ title: "Error", description: "No se pudo añadir el widget", variant: "destructive" });
        } else if (data) {
            setWidgets([...widgets, data]);
            toast({ title: "Widget añadido", description: "Personaliza su posición en el modo edición." });
        }
    };

    const handleCreateDashboard = async () => {
        if (!newDashboardName.trim()) return;
        setIsCreating(true);

        try {
            console.log("DEBUG: Creating dashboard", newDashboardName);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                console.error("DEBUG: No user found during creation");
                return;
            }

            const profile = await ensureProfile(user);

            if (!profile) {
                console.error("DEBUG: No profile found during creation");
                toast({ title: "Error", description: "No se encontró el perfil de usuario", variant: "destructive" });
                return;
            }

            const { data: dashboard, error } = await supabase
                .from('dashboards')
                .insert({
                    profile_id: profile.id,
                    name: newDashboardName,
                    is_default: false
                })
                .select()
                .single();

            if (error) {
                console.error("DEBUG: Error creating dashboard", error);
                toast({ title: "Error", description: error.message, variant: "destructive" });
            } else if (dashboard) {
                console.log("DEBUG: Dashboard created", dashboard);
                // Seed default widgets
                const defaultWidgets = [
                    {
                        dashboard_id: dashboard.id,
                        widget_type: 'EXPLORE_NETWORK',
                        layout: { x: 0, y: 0, w: 6, h: 4 },
                        settings: {}
                    },
                    {
                        dashboard_id: dashboard.id,
                        widget_type: 'MY_PAGES',
                        layout: { x: 6, y: 0, w: 4, h: 4 },
                        settings: {}
                    },
                    {
                        dashboard_id: dashboard.id,
                        widget_type: 'POLITICAL_SUMMARY',
                        layout: { x: 0, y: 4, w: 10, h: 3 },
                        settings: {}
                    }
                ];

                const { error: widgetError } = await supabase
                    .from('dashboard_widgets')
                    .insert(defaultWidgets);

                if (widgetError) {
                    console.error("Error seeding widgets:", widgetError);
                    toast({ title: "Advertencia", description: "Dashboard creado pero hubo un error al crear widgets iniciales." });
                }

                setDashboards([...dashboards, dashboard]);
                setActiveDashboardId(dashboard.id);
                toast({ title: "Dashboard creado", description: `Se ha creado "${newDashboardName}"` });
                setNewDashboardName("");
                setIsCreateDialogOpen(false);

                // Refresh widgets for the new dashboard
                await fetchWidgets(dashboard.id); // Explicitly fetch/wait
            }
        } catch (err) {
            console.error("DEBUG: Unexpected error creating dashboard", err);
            toast({ title: "Error crítico", description: "Ocurrió un error inesperado al crear el dashboard.", variant: "destructive" });
        } finally {
            setIsCreating(false);
        }
    };

    const handleSetDefault = async (dashboardId: string) => {
        // Optimistic update
        const newDashboards = dashboards.map(d => ({
            ...d,
            is_default: d.id === dashboardId
        }));
        // Re-sort to put new default at top
        const sorted = sortDashboards(newDashboards);
        setDashboards(sorted);

        // Convert to DB updates
        // We need 2 calls: Set new default TRUE, Set all others (for this profile) FALSE.
        // Or simpler: set all false, then set one true.
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const profile = await ensureProfile(user); // Should be cached/fast

            if (!profile) return;

            await supabase.from('dashboards').update({ is_default: false }).eq('profile_id', profile.id);
            await supabase.from('dashboards').update({ is_default: true }).eq('id', dashboardId);

            toast({ title: "Principal actualizado", description: "Dashboard asignado como principal." });
        } catch (e) {
            console.error(e);
            toast({ title: "Error", description: "Error al actualizar en servidor", variant: "destructive" });
        }
    };

    const handleMoveDashboard = (index: number, direction: 'left' | 'right') => {
        const newIndex = direction === 'left' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= dashboards.length) return;

        const newDashboards = [...dashboards];
        // Swap
        [newDashboards[index], newDashboards[newIndex]] = [newDashboards[newIndex], newDashboards[index]];

        setDashboards(newDashboards);
        saveOrder(newDashboards);
    };

    const handleDeleteDashboard = async (id: string) => {
        if (dashboards.length <= 1) {
            toast({ title: "Acción bloqueada", description: "No puedes eliminar el único dashboard.", variant: "destructive" });
            return;
        }

        const confirm = window.confirm("¿Estás seguro de eliminar este dashboard?");
        if (!confirm) return;

        try {
            await supabase.from('dashboard_widgets').delete().eq('dashboard_id', id);
            await supabase.from('dashboards').delete().eq('id', id);

            setDashboards(prev => prev.filter(d => d.id !== id));
            if (activeDashboardId === id) {
                setActiveDashboardId(dashboards[0].id); // Fallback
            }
            toast({ title: "Eliminado", description: "Dashboard eliminado correctamente." });
        } catch (e) {
            console.error(e);
        }
    };

    // ... handleCreateDashboard (unchanged)

    // ... render block for loading/auth

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <h1 className="text-4xl font-bold font-headline text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-500 shadow-sm">
                    Dashboards
                </h1>
                <div className="flex items-center gap-2">
                    <Button
                        variant={isEditMode ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => setIsEditMode(!isEditMode)}
                        className={cn("gap-2 transition-all", isEditMode && "bg-white/10 ring-1 ring-primary/50")}
                    >
                        <LayoutGrid className="h-4 w-4" />
                        {isEditMode ? "Terminar Edición" : "Editar"}
                    </Button>
                    {/* Settings button removed/kept minimal */}
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
                                        isEditMode && "pr-8" // Make room for controls
                                    )}
                                >
                                    {d.name}
                                    {d.is_default && <Star className="w-3 h-3 fill-yellow-400 text-yellow-400 ml-1" />}
                                </TabsTrigger>

                                {/* Edit Mode Controls Overlay */}
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
                                        {index > 0 && !d.is_default && ( // Can't move left if first. If default, active sort forces it first anyway
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleMoveDashboard(index, 'left'); }}
                                                className="p-1 hover:text-white text-muted-foreground transition-colors"
                                            >
                                                <ArrowLeft className="w-3 h-3" />
                                            </button>
                                        )}
                                        {index < dashboards.length - 1 && !dashboards[index + 1].is_default && ( // Can't move right if next is default (shouldnt happen)
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
                        <DialogContent className="sm:max-w-[425px]">
                            <DialogHeader>
                                <DialogTitle>Crear nuevo dashboard</DialogTitle>
                                <DialogDescription>
                                    Organiza tus widgets en un nuevo espacio.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="name" className="text-right">
                                        Nombre
                                    </Label>
                                    <Input
                                        id="name"
                                        value={newDashboardName}
                                        onChange={(e) => setNewDashboardName(e.target.value)}
                                        className="col-span-3"
                                        placeholder="Ej. Finanzas"
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button type="submit" onClick={handleCreateDashboard} disabled={isCreating}>
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
                            setWidgets={setWidgets}
                            isEditMode={isEditMode}
                        />
                        {isEditMode && (
                            <div className="flex justify-center mt-6 pb-12 opacity-50 hover:opacity-100 transition-opacity">
                                <AddWidgetDialog
                                    isEditMode={isEditMode}
                                    onAdd={(type) => {
                                        handleAddWidget(d.id, type);
                                    }}
                                />
                            </div>
                        )}
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
}

'use client';

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { Dashboard, DashboardWidget } from "./dashboard-types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Plus, Settings, LayoutGrid } from "lucide-react";
import { GridArea } from "./grid-area";
import { useToast } from "@/components/ui/use-toast";
import { AddWidgetDialog } from "./add-widget-dialog";
import { WidgetType } from "./dashboard-types";

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
        // ... (rest of ensureProfile remains same, but omitted here for brevity if allowed, but cleaner to replace whole block if safe)
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
                .eq('profile_id', profile.id)
                .order('is_default', { ascending: false })
                .order('created_at', { ascending: true });

            if (error) {
                console.error("Error fetching dashboards:", error);
                return;
            }

            if (data && data.length > 0) {
                setDashboards(data);
                // Set active to the first one (usually default) if not set
                if (!activeDashboardId) {
                    setActiveDashboardId(data[0].id);
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

    // REPLACE THIS RENDER BLOCK
    if (loading && dashboards.length === 0) {
        return <div className="p-8 text-center text-muted-foreground animate-pulse">Cargando centro de mando...</div>;
    }

    if (!isAuthenticated) {
        return (
            <div className="flex flex-col items-center justify-center p-12 gap-4 text-center">
                <div className="rounded-full bg-destructive/10 p-4 text-destructive">
                    <Settings className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold">Acceso Requerido</h2>
                <p className="text-muted-foreground max-w-sm">No hemos podido verificar tu sesión. Por favor inicia sesión nuevamente para acceder al dashboard.</p>
                <Button onClick={() => window.location.href = '/login'}>Ir a Iniciar Sesión</Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-headline font-bold text-gradient">Centro de Mando</h1>
                <div className="flex items-center gap-2">
                    <Button
                        variant={isEditMode ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => setIsEditMode(!isEditMode)}
                        className="gap-2"
                    >
                        <LayoutGrid className="h-4 w-4" />
                        {isEditMode ? "Terminar Edición" : "Editar Distribución"}
                    </Button>
                    <Button variant="outline" size="icon">
                        <Settings className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <Tabs
                value={activeDashboardId || ""}
                onValueChange={setActiveDashboardId}
                className="w-full"
            >
                <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2">
                    <TabsList className="bg-background/50 backdrop-blur border">
                        {dashboards.map(d => (
                            <TabsTrigger
                                key={d.id}
                                value={d.id}
                                className="gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all duration-300"
                            >
                                {d.name}
                                {d.is_default && <span className="text-[10px] opacity-50">★</span>}
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                        <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 hover:bg-muted">
                                <Plus className="h-4 w-4" />
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[425px]">
                            <DialogHeader>
                                <DialogTitle>Crear nuevo espacio</DialogTitle>
                                <DialogDescription>
                                    Personaliza un nuevo tablero para organizar tus widgets.
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
                                        placeholder="Ej. Análisis de Red"
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
                        <AddWidgetDialog
                            isEditMode={isEditMode}
                            onAdd={(type) => {
                                // We need a way to add this to the DB.
                                // Since logic is mixed, let's wrap this in a handler in the parent for now or pass context.
                                // Actually, better to expose a handler for this.
                                handleAddWidget(d.id, type);
                            }}
                        />
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
}

'use client';

import { useState, useEffect, useCallback, useMemo } from "react";
import { Dashboard, DashboardWidget, WidgetType } from "./dashboard-types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { 
    Plus, Settings, LayoutGrid, Star, ArrowLeft, ArrowRight, Trash2, Search, 
    Sparkles, Maximize2, Minimize2, User, Cpu, Shield, Globe, Database, 
    Sliders, RefreshCw, Hammer, Compass, HardDrive, Lock, Zap, Wifi, Play, HelpCircle,
    Palette, X, MapPin, ChevronLeft, ChevronRight
} from "lucide-react";
import { GridArea } from "./grid-area";
import { useToast } from "@/components/ui/use-toast";
import { AddWidgetDialog } from "./add-widget-dialog";
import { WidgetForgeDialog } from "./widget-forge/widget-forge-dialog";
import { WeatherLocationProvider } from "@/modules/weather/context/weather-location-context";
import { DEFAULT_DASHBOARD_TEMPLATES, ALL_DASHBOARD_TEMPLATES } from "./dashboard-defaults";
import { WIDGET_CATEGORIES, getCategoryById } from "./widget-categories";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";
import { useUserContext } from "@/context/user-context";
import { useAppearance } from "@/context/appearance-context";
import { curatedPresets } from "@/lib/themes/curated-presets";

import { WorkspaceProvider } from "./dashboard-workspace-context";
import { DashboardWorkspaceRenderer } from "./dashboard-workspace-renderer";

// ── LocalStorage Keys ────────────────────────────────────────────
const LS_DASHBOARDS = 'starseed_dashboards';
const LS_WIDGETS = 'starseed_widgets';
const LS_ORDER = 'dashboard_order';
const LS_INITIALIZED = 'starseed_dashboards_initialized';
const LS_ACTIVE_PROFILE = 'starseed_active_profile_v1';
const LS_AI_PROVIDER = 'starseed_ai_provider_v1';
const LS_SERVERS = 'starseed_internet_servers_v1';

// ── Types for local state ────────────────────────────────────────
interface UserProfile {
    id: string;
    type: "OFFICIAL" | "ARTISTIC" | "ANONYMOUS";
    displayName: string;
    handle: string;
    avatarUrl: string;
    bio: string;
    reputation: number;
}

const PROFILES: UserProfile[] = [
    { id: "prof-1", type: "OFFICIAL", displayName: "Alex Bordón Garrigós", handle: "alexbordon", avatarUrl: "https://placehold.co/80x80/007fff/ffffff?text=AB", bio: "Arquitecto de StarSeed OS. Ontócrata ciberdélico.", reputation: 980 },
    { id: "prof-2", type: "ARTISTIC", displayName: "Aether Wave", handle: "aetherwave", avatarUrl: "https://placehold.co/80x80/10b981/ffffff?text=AW", bio: "Musa generativa del multiverso. Shaders de cristal.", reputation: 720 },
    { id: "prof-3", type: "ANONYMOUS", displayName: "Agent 404", handle: "agent404", avatarUrl: "https://placehold.co/80x80/DC143C/ffffff?text=404", bio: "Nodo soberano en modo fantasma.", reputation: 350 }
];

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

export function DashboardLayout() {
    const [dashboards, setDashboards] = useState<Dashboard[]>([]);
    const [activeDashboardId, setActiveDashboardId] = useState<string | null>(null);
    const [widgets, setWidgets] = useState<DashboardWidget[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditMode, setIsEditMode] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState(DEFAULT_DASHBOARD_TEMPLATES[0]?.categoryId || 'social');
    const [templateSearch, setTemplateSearch] = useState('');

    // --- Overhaul and Fullscreen State ---
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isTitleVisible, setIsTitleVisible] = useState(true);

    // --- Side Toolbar / Panel State ---
    const [activeToolbarTab, setActiveToolbarTab] = useState<string | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [activeProfile, setActiveProfile] = useState<UserProfile>(PROFILES[0]);
    
    // Cognitive memory context integration
    const { memory, addMemory } = useUserContext();
    const { updateConfig, config } = useAppearance();

    // AI Providers configs
    const [aiProvider, setAiProvider] = useState<"ollama" | "gemini" | "openai">("ollama");
    const [aiTemperature, setAiTemperature] = useState<number[]>([0.7]);
    const [aiAgent, setAiAgent] = useState<string>("central");

    // Connections configs
    const [services, setServices] = useState({
        supabase: true,
        ipfs: false,
        github: true,
        vercel: true
    });

    // Curated themes sort
    const [themeSort, setThemeSort] = useState<"recent" | "custom">("recent");
    const [recentThemes, setRecentThemes] = useState<string[]>(["Tokyo Midnight", "Solarpunk Aurora"]);

    // Server Selection and VPN
    const [selectedServers, setSelectedServers] = useState<string[]>(["vercel"]);
    const [vpnEnabled, setVpnEnabled] = useState(false);
    const [torPrivacy, setTorPrivacy] = useState(false);
    const [zkpSecurity, setZkpSecurity] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState(0);

    // Dialog State
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [newDashboardName, setNewDashboardName] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const [isForgeOpen, setIsForgeOpen] = useState(false);

    const { toast } = useToast();

    // Load active settings on mount
    useEffect(() => {
        const storedProfile = localStorage.getItem(LS_ACTIVE_PROFILE);
        if (storedProfile) {
            const found = PROFILES.find(p => p.id === storedProfile);
            if (found) setActiveProfile(found);
        }

        const storedProvider = localStorage.getItem(LS_AI_PROVIDER);
        if (storedProvider) setAiProvider(storedProvider as any);

        const storedServers = localStorage.getItem(LS_SERVERS);
        if (storedServers) {
            try { setSelectedServers(JSON.parse(storedServers)); } catch {}
        }
    }, []);

    // ── Initialize dashboards ──────────────────────────────────────
    useEffect(() => {
        const initialized = localStorage.getItem(LS_INITIALIZED);

        if (!initialized) {
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
            const stored = loadDashboards();
            if (stored.length > 0) {
                const sorted = sortDashboards(stored);
                setDashboards(sorted);
                setActiveDashboardId(sorted[0].id);
                setWidgets(loadWidgetsForDashboard(sorted[0].id));
            } else {
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

    // ── Auto-Fullscreen Effect ─────────────────────────────────────
    useEffect(() => {
        const timer = setTimeout(() => {
            setIsFullscreen(true);
        }, 2500);
        return () => clearTimeout(timer);
    }, []);

    // ── Listen for forge open or fullscreen events ─────────────
    useEffect(() => {
        const forgeHandler = () => setIsForgeOpen(true);
        const fullscreenHandler = (e: any) => {
            if (e.detail?.active !== undefined) {
                setIsFullscreen(e.detail.active);
            } else {
                setIsFullscreen(prev => !prev);
            }
        };

        window.addEventListener('starseed:open-forge', forgeHandler);
        window.addEventListener('starseed:toggle-fullscreen', fullscreenHandler);
        
        return () => {
            window.removeEventListener('starseed:open-forge', forgeHandler);
            window.removeEventListener('starseed:toggle-fullscreen', fullscreenHandler);
        };
    }, []);

    // ── Listen for widget transfers between dashboard windows ────────
    useEffect(() => {
        const handleTransfer = (e: any) => {
            const { widgetId, sourceDashboardId, targetDashboardId, clientX, clientY } = e.detail;

            // Load all widgets safely to update all dashboards
            const allWidgets = loadAllWidgets();
            const sourceWidgets = allWidgets[sourceDashboardId] || [];
            const targetWidgets = allWidgets[targetDashboardId] || [];

            const widgetToMove = sourceWidgets.find(w => w.id === widgetId);
            if (!widgetToMove) return;

            // Remove from source
            const nextSourceWidgets = sourceWidgets.filter(w => w.id !== widgetId);
            allWidgets[sourceDashboardId] = nextSourceWidgets;

            // Calculate dropped position in target grid
            const targetElement = document.getElementById(`grid-container-${targetDashboardId}`);
            let dropX = 0;
            let dropY = targetWidgets.length > 0 ? Math.max(...targetWidgets.map(w => w.layout.y + w.layout.h)) : 0;

            if (targetElement) {
                const rect = targetElement.getBoundingClientRect();
                const relativeX = clientX - rect.left;
                const relativeY = clientY - rect.top;
                
                const colWidth = rect.width / 12;
                dropX = Math.max(0, Math.min(8, Math.floor(relativeX / colWidth)));
                dropY = Math.max(0, Math.floor(relativeY / 65));
            }

            const updatedWidget = {
                ...widgetToMove,
                dashboard_id: targetDashboardId,
                layout: {
                    ...widgetToMove.layout,
                    x: dropX,
                    y: dropY,
                    i: crypto.randomUUID() // ensure unique RGL key
                }
            };

            const nextTargetWidgets = [...targetWidgets, updatedWidget];
            allWidgets[targetDashboardId] = nextTargetWidgets;

            // Save to localStorage
            saveAllWidgets(allWidgets);

            // Update active state of current dashboards
            if (activeDashboardId === sourceDashboardId) {
                setWidgets(nextSourceWidgets);
            } else if (activeDashboardId === targetDashboardId) {
                setWidgets(nextTargetWidgets);
            } else {
                setWidgets(loadWidgetsForDashboard(activeDashboardId || ''));
            }

            toast({
                title: "Widget Trasladado",
                description: `El widget se ha movido inteligentemente a este dashboard en la posición (${dropX}, ${dropY}).`
            });
        };

        window.addEventListener('starseed:transfer-widget', handleTransfer);
        return () => window.removeEventListener('starseed:transfer-widget', handleTransfer);
    }, [activeDashboardId, toast]);

    // Load widgets when active dashboard changes
    useEffect(() => {
        if (activeDashboardId) {
            setWidgets(loadWidgetsForDashboard(activeDashboardId));
        }
    }, [activeDashboardId]);

    // Auto-hide title on scroll
    useEffect(() => {
        const handleScroll = () => {
            const scrollY = window.scrollY;
            setIsTitleVisible(scrollY < 60);
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Sort dashboards
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

    // Add Widget
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

    // Add AI-Generated Widget
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

    const handleSetWidgets = useCallback((newWidgets: DashboardWidget[]) => {
        setWidgets(newWidgets);
        if (activeDashboardId) {
            saveWidgetsForDashboard(activeDashboardId, newWidgets);
        }
    }, [activeDashboardId]);

    // Create Dashboard
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

            const template = ALL_DASHBOARD_TEMPLATES.find(t => t.categoryId === selectedTemplate);
            const seededWidgets: DashboardWidget[] = (template?.widgets || []).map(w => ({
                id: crypto.randomUUID(),
                dashboard_id: dashId,
                widget_type: w.type as any,
                layout: { x: w.x, y: w.y, w: w.w, h: w.h, i: crypto.randomUUID() },
                settings: {},
                created_at: now,
            }));

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

    const handleSetDefault = (dashboardId: string) => {
        const updated = dashboards.map(d => ({ ...d, is_default: d.id === dashboardId }));
        const sorted = sortDashboards(updated);
        setDashboards(sorted);
        saveDashboards(sorted);
        toast({ title: "Principal actualizado", description: "Dashboard asignado como principal." });
    };

    const handleMoveDashboard = (index: number, direction: 'left' | 'right') => {
        const newIndex = direction === 'left' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= dashboards.length) return;

        const newDashboards = [...dashboards];
        [newDashboards[index], newDashboards[newIndex]] = [newDashboards[newIndex], newDashboards[index]];

        setDashboards(newDashboards);
        saveOrder(newDashboards);
        saveDashboards(newDashboards);
    };

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

    // Change profile helper
    const handleProfileChange = (profile: UserProfile) => {
        setActiveProfile(profile);
        localStorage.setItem(LS_ACTIVE_PROFILE, profile.id);
        addMemory("interaction", `Cambiado perfil activo a ${profile.displayName} (${profile.type})`, 0.7, "system:profile-switch");
        toast({ title: "Perfil Sincronizado", description: `Activo: ${profile.displayName} (${profile.type})` });
    };

    // Toggle server helper
    const handleServerToggle = (serverId: string) => {
        const next = selectedServers.includes(serverId)
            ? selectedServers.filter(s => s !== serverId)
            : [...selectedServers, serverId];
        setSelectedServers(next);
        localStorage.setItem(LS_SERVERS, JSON.stringify(next));
    };

    // Sync progress simulation
    const handleSync = () => {
        if (isSyncing) return;
        setIsSyncing(true);
        setSyncProgress(0);
        
        addMemory("interaction", "Iniciada sincronización federada VPN", 0.8, "system:sync-vpn");

        const interval = setInterval(() => {
            setSyncProgress(prev => {
                if (prev >= 100) {
                    clearInterval(interval);
                    setTimeout(() => {
                        setIsSyncing(false);
                        toast({ 
                            title: "Fusión de Nodos Completa", 
                            description: `Sincronizados ${selectedServers.length} servidores exitosamente con protección VPN/ZK.` 
                        });
                    }, 500);
                    return 100;
                }
                return prev + 10;
            });
        }, 150);
    };

    // Active theme picker preset helper
    const applyTheme = (themeName: string) => {
        // Encontrar tema curado
        const preset = curatedPresets.find(t => t.id === themeName || t.name === themeName);
        if (preset) {
            updateConfig(preset.config);
            setRecentThemes(prev => [themeName, ...prev.filter(t => t !== themeName)].slice(0, 4));
            toast({ title: `Tema Aplicado`, description: `Sistema cargado con preset "${preset.name}"` });
        }
    };

    // Loading State
    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            </div>
        );
    }

    return (
        <WeatherLocationProvider>
            <div className={cn(
                "relative flex flex-row w-full select-none min-h-screen transition-all duration-500",
                isFullscreen ? "gap-0 p-0" : "gap-6 pl-16 md:pl-20"
            )}>
                
                {/* ── CIBERDELIC SIDE BAR TOOLBAR (Left side, absolute / sticky float) ── */}
                <div className="fixed left-4 top-1/2 -translate-y-1/2 z-[80] flex flex-row items-center pointer-events-none gap-3">
                    
                    {/* Collapsed / Icons Bar */}
                    <AnimatePresence>
                        {isSidebarOpen && (
                            <motion.div
                                initial={{ opacity: 0, x: -50, scale: 0.9 }}
                                animate={{ opacity: 1, x: 0, scale: 1 }}
                                exit={{ opacity: 0, x: -50, scale: 0.9 }}
                                transition={{ type: "spring", stiffness: 350, damping: 25 }}
                                className="pointer-events-auto flex flex-col items-center gap-2 p-3 bg-black/40 border border-white/10 rounded-3xl backdrop-blur-2xl shadow-xl w-14 shrink-0"
                            >
                                {/* Profile selector icon */}
                                <SidebarIconButton 
                                    icon={<User className="w-5 h-5" />} 
                                    label="Perfiles" 
                                    color="cyan"
                                    active={activeToolbarTab === "profiles"}
                                    onClick={() => setActiveToolbarTab(activeToolbarTab === "profiles" ? null : "profiles")}
                                />
                                {/* Cognitive local memory */}
                                <SidebarIconButton 
                                    icon={<HardDrive className="w-5 h-5" />} 
                                    label="Memoria local" 
                                    color="emerald"
                                    active={activeToolbarTab === "memory"}
                                    onClick={() => setActiveToolbarTab(activeToolbarTab === "memory" ? null : "memory")}
                                />
                                {/* AI / Exocortex service config */}
                                <SidebarIconButton 
                                    icon={<Cpu className="w-5 h-5" />} 
                                    label="Servicio de IA" 
                                    color="cyan"
                                    active={activeToolbarTab === "ai"}
                                    onClick={() => setActiveToolbarTab(activeToolbarTab === "ai" ? null : "ai")}
                                />
                                {/* Active Service Toggles */}
                                <SidebarIconButton 
                                    icon={<Wifi className="w-5 h-5" />} 
                                    label="Conexiones" 
                                    color="purple"
                                    active={activeToolbarTab === "connections"}
                                    onClick={() => setActiveToolbarTab(activeToolbarTab === "connections" ? null : "connections")}
                                />
                                {/* Quick Theme Picker */}
                                <SidebarIconButton 
                                    icon={<Palette className="w-5 h-5" />} 
                                    label="Temas rápidos" 
                                    color="amber"
                                    active={activeToolbarTab === "themes"}
                                    onClick={() => setActiveToolbarTab(activeToolbarTab === "themes" ? null : "themes")}
                                />
                                {/* Internet servers, Tor, VPN */}
                                <SidebarIconButton 
                                    icon={<Globe className="w-5 h-5" />} 
                                    label="Internet / VPN" 
                                    color="crimson"
                                    active={activeToolbarTab === "servers"}
                                    onClick={() => setActiveToolbarTab(activeToolbarTab === "servers" ? null : "servers")}
                                />

                                {/* Divider */}
                                <div className="w-8 h-px bg-white/10 my-1 rounded-full" />

                                {/* Standard Controls direct access in sidebar */}
                                <SidebarIconButton 
                                    icon={<MapPin className="w-5 h-5" />} 
                                    label="Ubicación" 
                                    color="cyan" 
                                    onClick={() => {
                                        const event = new CustomEvent('starseed:open-location');
                                        window.dispatchEvent(event);
                                    }}
                                />
                                <SidebarIconButton 
                                    icon={<Hammer className="w-5 h-5 text-indigo-300" />} 
                                    label="Forjar Widget" 
                                    color="neutral" 
                                    onClick={() => setIsForgeOpen(true)} 
                                />
                                <SidebarIconButton 
                                    icon={<LayoutGrid className="w-5 h-5" />} 
                                    label={isEditMode ? "Terminar" : "Editar"} 
                                    color={isEditMode ? "emerald" : "neutral"} 
                                    onClick={() => setIsEditMode(!isEditMode)} 
                                />
                                <SidebarIconButton 
                                    icon={isFullscreen ? <Minimize2 className="w-5 h-5 text-amber-400" /> : <Maximize2 className="w-5 h-5" />} 
                                    label={isFullscreen ? "Salir Pantalla Completa" : "Pantalla Completa"} 
                                    color="neutral" 
                                    onClick={() => setIsFullscreen(!isFullscreen)} 
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Floating Toggle Button */}
                    <motion.div 
                        layout 
                        className="pointer-events-auto shrink-0 z-50"
                    >
                        <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                                setIsSidebarOpen(!isSidebarOpen);
                                if (isSidebarOpen) {
                                    setActiveToolbarTab(null);
                                }
                            }}
                            className={cn(
                                "w-10 h-10 rounded-full bg-black/60 border border-white/10 backdrop-blur-md text-cyan-400 hover:bg-cyan-500/20 hover:text-white transition-all shadow-lg hover:shadow-[0_0_15px_rgba(6,182,212,0.4)]",
                                !isSidebarOpen && "animate-pulse"
                            )}
                            title={isSidebarOpen ? "Ocultar menú lateral" : "Mostrar menú lateral"}
                        >
                            {isSidebarOpen ? (
                                <ChevronLeft className="w-5 h-5 text-cyan-300" />
                            ) : (
                                <ChevronRight className="w-5 h-5 text-cyan-300" />
                            )}
                        </Button>
                    </motion.div>

                    {/* Expandible flyout card */}
                    <AnimatePresence>
                        {isSidebarOpen && activeToolbarTab && (
                            <motion.div
                                initial={{ opacity: 0, x: -30, scale: 0.95 }}
                                animate={{ opacity: 1, x: 0, scale: 1 }}
                                exit={{ opacity: 0, x: -30, scale: 0.95 }}
                                transition={{ type: "spring", stiffness: 350, damping: 25 }}
                                className="pointer-events-auto w-[280px] sm:w-[320px] bg-black/80 backdrop-blur-3xl border border-white/10 p-5 rounded-[2rem] shadow-2xl flex flex-col gap-4 text-white overflow-hidden relative"
                            >
                                <div className="absolute top-0 right-0 w-36 h-36 bg-primary/5 rounded-full blur-2xl pointer-events-none" />
                                
                                <div className="flex items-center justify-between border-b border-white/5 pb-2 shrink-0">
                                    <h4 className="text-xs uppercase tracking-widest font-mono text-white/50 flex items-center gap-2">
                                        ✦ {activeToolbarTab === "profiles" ? "Selector de Perfiles" : 
                                            activeToolbarTab === "memory" ? "Memoria Cognitiva" :
                                            activeToolbarTab === "ai" ? "Motor Exocórtex AI" :
                                            activeToolbarTab === "connections" ? "Conexiones Activas" :
                                            activeToolbarTab === "themes" ? "Temas Curados" :
                                            "Seguridad y Sincronización"}
                                    </h4>
                                    <button onClick={() => setActiveToolbarTab(null)} className="p-1 hover:bg-white/5 rounded-full text-white/40 hover:text-white transition-all">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto max-h-[360px] pr-1 scrollbar-thin">
                                    {/* Profiles Tab Content */}
                                    {activeToolbarTab === "profiles" && (
                                        <div className="space-y-3">
                                            {PROFILES.map((p) => {
                                                const colors = {
                                                    OFFICIAL: "border-blue-500 bg-blue-500/10 text-blue-300",
                                                    ARTISTIC: "border-emerald-500 bg-emerald-500/10 text-emerald-300",
                                                    ANONYMOUS: "border-red-500 bg-red-500/10 text-red-300"
                                                };
                                                const isActive = activeProfile.id === p.id;
                                                return (
                                                    <div 
                                                        key={p.id}
                                                        onClick={() => handleProfileChange(p)}
                                                        className={cn(
                                                            "flex items-center gap-3 p-3 rounded-2xl border transition-all cursor-pointer",
                                                            isActive ? "border-amber-500/30 bg-amber-500/5 ring-1 ring-amber-500/20" : "border-white/5 bg-white/[0.01] hover:bg-white/5"
                                                        )}
                                                    >
                                                        <img src={p.avatarUrl} className="w-10 h-10 rounded-full border border-white/10 shrink-0" alt="" />
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-1.5 justify-between">
                                                                <span className="text-xs font-semibold leading-none truncate">{p.displayName}</span>
                                                                <span className={cn("text-[8px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded border leading-none shrink-0", colors[p.type])}>
                                                                    {p.type}
                                                                </span>
                                                            </div>
                                                            <p className="text-[10px] text-white/40 truncate mt-1">@{p.handle}</p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* Memory Tab Content */}
                                    {activeToolbarTab === "memory" && (
                                        <div className="space-y-3">
                                            <div className="p-3 bg-white/[0.02] border border-white/5 rounded-2xl">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="text-[10px] uppercase font-mono text-emerald-400">Estado Cognitivo</span>
                                                    <span className="text-xs font-bold font-mono">{memory.length} nodos</span>
                                                </div>
                                                <p className="text-[10px] text-white/50 leading-relaxed">
                                                    Tu Exocórtex registra rasgos cognitivos del usuario local de forma cifrada.
                                                </p>
                                            </div>

                                            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                                                {memory.slice(-4).map((m) => (
                                                    <div key={m.id} className="p-2 border border-white/5 rounded-xl bg-black/40 text-[9px] font-mono leading-normal flex items-start gap-2">
                                                        <span className="text-emerald-400">✦</span>
                                                        <div className="min-w-0 flex-1">
                                                            <span className="text-emerald-300 font-bold mr-1">[{m.type}]</span>
                                                            {m.value}
                                                            {m.source && <span className="block text-[8px] text-white/30 truncate mt-0.5">{m.source}</span>}
                                                        </div>
                                                    </div>
                                                ))}
                                                {memory.length === 0 && (
                                                    <div className="text-center py-6 text-xs text-white/30">Memoria local vacía. Tabula Rasa.</div>
                                                )}
                                            </div>

                                            <Button 
                                                variant="outline" 
                                                size="sm"
                                                onClick={() => {
                                                    addMemory("trait", "Foco visual avanzado", 0.8, "ui:manual-trigger");
                                                    toast({ title: "Rasgo Agregado", description: "Agregado rasgo cognitivo a memoria local." });
                                                }}
                                                className="w-full text-[10px] h-8 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20 text-emerald-300"
                                            >
                                                + Forzar rasgo cognitivo
                                            </Button>
                                        </div>
                                    )}

                                    {/* AI Tab Content */}
                                    {activeToolbarTab === "ai" && (
                                        <div className="space-y-4">
                                            <div className="space-y-1">
                                                <Label className="text-[10px] text-white/50 uppercase tracking-wider font-mono">Proveedor de IA</Label>
                                                <Select value={aiProvider} onValueChange={(v: any) => setAiProvider(v)}>
                                                    <SelectTrigger className="w-full bg-black/40 border-white/5 h-9 rounded-xl text-xs">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="ollama">Ollama (Local Offline)</SelectItem>
                                                        <SelectItem value="gemini">Google Gemini API</SelectItem>
                                                        <SelectItem value="openai">OpenAI / Compatibles</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="space-y-1">
                                                <div className="flex justify-between items-center text-[10px] text-white/50 uppercase tracking-wider font-mono">
                                                    <span>Temperatura</span>
                                                    <span className="font-bold text-cyan-400">{aiTemperature[0]}</span>
                                                </div>
                                                <Slider 
                                                    value={aiTemperature} 
                                                    onValueChange={setAiTemperature} 
                                                    max={1.5} 
                                                    min={0.1} 
                                                    step={0.1}
                                                    className="py-2"
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <Label className="text-[10px] text-white/50 uppercase tracking-wider font-mono">Agente Activo</Label>
                                                <Select value={aiAgent} onValueChange={setAiAgent}>
                                                    <SelectTrigger className="w-full bg-black/40 border-white/5 h-9 rounded-xl text-xs">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="central">Central (Núcleo StarSeed)</SelectItem>
                                                        <SelectItem value="creative">Musa Creativa (Horizon)</SelectItem>
                                                        <SelectItem value="logic">Control Panel (Logic)</SelectItem>
                                                        <SelectItem value="pilot">System Pilot (Exocórtex)</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                    )}

                                    {/* Connections Tab Content */}
                                    {activeToolbarTab === "connections" && (
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between p-2 rounded-xl bg-white/[0.02]">
                                                <div className="flex items-center gap-2">
                                                    <Database className="w-4 h-4 text-blue-400" />
                                                    <span className="text-xs">Base de datos Supabase</span>
                                                </div>
                                                <Switch checked={services.supabase} onCheckedChange={(v) => setServices(prev => ({ ...prev, supabase: v }))} />
                                            </div>
                                            <div className="flex items-center justify-between p-2 rounded-xl bg-white/[0.02]">
                                                <div className="flex items-center gap-2">
                                                    <Globe className="w-4 h-4 text-emerald-400" />
                                                    <span className="text-xs">IPFS P2P Network</span>
                                                </div>
                                                <Switch checked={services.ipfs} onCheckedChange={(v) => setServices(prev => ({ ...prev, ipfs: v }))} />
                                            </div>
                                            <div className="flex items-center justify-between p-2 rounded-xl bg-white/[0.02]">
                                                <div className="flex items-center gap-2">
                                                    <GithubIcon className="w-4 h-4 text-white" />
                                                    <span className="text-xs">GitHub Repository</span>
                                                </div>
                                                <Switch checked={services.github} onCheckedChange={(v) => setServices(prev => ({ ...prev, github: v }))} />
                                            </div>
                                            <div className="flex items-center justify-between p-2 rounded-xl bg-white/[0.02]">
                                                <div className="flex items-center gap-2">
                                                    <Zap className="w-4 h-4 text-purple-400" />
                                                    <span className="text-xs">Vercel Auto-deploy</span>
                                                </div>
                                                <Switch checked={services.vercel} onCheckedChange={(v) => setServices(prev => ({ ...prev, vercel: v }))} />
                                            </div>
                                        </div>
                                    )}

                                    {/* Themes Tab Content */}
                                    {activeToolbarTab === "themes" && (
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center text-[10px] text-white/50 font-mono mb-2">
                                                <span>Acomodo Rápido</span>
                                                <div className="flex gap-2">
                                                    <button onClick={() => setThemeSort("recent")} className={cn(themeSort === "recent" ? "text-amber-400" : "opacity-40")}>Recientes</button>
                                                    <button onClick={() => setThemeSort("custom")} className={cn(themeSort === "custom" ? "text-amber-400" : "opacity-40")}>Personalizado</button>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2 max-h-[220px] overflow-y-auto pr-1">
                                                {curatedPresets.map((theme) => {
                                                    const isRecent = recentThemes.includes(theme.name);
                                                    if (themeSort === "recent" && !isRecent) return null;
                                                    return (
                                                        <button
                                                            key={theme.name}
                                                            onClick={() => applyTheme(theme.name)}
                                                            className="p-2 border border-white/5 rounded-xl bg-black/40 hover:bg-white/5 hover:border-white/10 text-center transition-all group flex flex-col items-center gap-1"
                                                        >
                                                            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-primary to-purple-500 scale-95 group-hover:scale-100 transition-transform" />
                                                            <span className="text-[10px] truncate max-w-full text-white/80">{theme.name}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Servers & VPN Tab Content */}
                                    {activeToolbarTab === "servers" && (
                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <Label className="text-[10px] text-white/50 uppercase tracking-wider font-mono">Selector Múltiple de Servidores</Label>
                                                <div className="space-y-2">
                                                    {[
                                                        { id: "vercel", label: "Servidor Principal Vercel" },
                                                        { id: "supabase", label: "Supabase DB redundante" },
                                                        { id: "ipfs", label: "Nodo IPFS Akáshico" }
                                                    ].map((s) => (
                                                        <div 
                                                            key={s.id}
                                                            onClick={() => handleServerToggle(s.id)}
                                                            className={cn(
                                                                "flex items-center gap-2 p-2 border rounded-xl text-xs cursor-pointer transition-all",
                                                                selectedServers.includes(s.id) ? "border-red-500/40 bg-red-500/5 text-red-300" : "border-white/5 text-white/60 hover:bg-white/5"
                                                            )}
                                                        >
                                                            <div className={cn("w-2 h-2 rounded-full", selectedServers.includes(s.id) ? "bg-red-400" : "bg-white/20")} />
                                                            {s.label}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="space-y-2 pt-2 border-t border-white/5">
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="flex items-center gap-1"><Lock className="w-3.5 h-3.5 text-red-400" /> VPN / Tunneling</span>
                                                    <Switch checked={vpnEnabled} onCheckedChange={setVpnEnabled} />
                                                </div>
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="flex items-center gap-1"><Globe className="w-3.5 h-3.5 text-red-400" /> Red Tor / Onion</span>
                                                    <Switch checked={torPrivacy} onCheckedChange={setTorPrivacy} />
                                                </div>
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5 text-red-400" /> Cifrado ZKP</span>
                                                    <Switch checked={zkpSecurity} onCheckedChange={setZkpSecurity} />
                                                </div>
                                            </div>

                                            {/* Liquidation / Sync merging button */}
                                            <div className="space-y-2 pt-2">
                                                <Button 
                                                    disabled={isSyncing}
                                                    onClick={handleSync}
                                                    className="w-full h-10 rounded-xl bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-xs font-bold gap-2 text-white relative overflow-hidden"
                                                >
                                                    {isSyncing ? (
                                                        <>
                                                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                                            Fusionando... {syncProgress}%
                                                        </>
                                                    ) : (
                                                        <>
                                                            <RefreshCw className="w-3.5 h-3.5" />
                                                            Sincronizar y Fusionar
                                                        </>
                                                    )}
                                                </Button>

                                                {/* Liquid Progress Bar */}
                                                {isSyncing && (
                                                    <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden relative">
                                                        <motion.div 
                                                            className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-red-500 to-amber-500"
                                                            initial={{ width: 0 }}
                                                            animate={{ width: `${syncProgress}%` }}
                                                            transition={{ duration: 0.15 }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* ── MAIN CONTENT CONTAINER (Widget view & header) ── */}
                <div className={cn(
                    "flex-1 flex flex-col w-full min-w-0 transition-all duration-500",
                    isFullscreen ? "gap-0" : "gap-4"
                )}>
                    
                    {/* Header: Animates smoothly out of view on scroll or Fullscreen */}
                    <AnimatePresence>
                        {!isFullscreen && isTitleVisible && (
                            <motion.div 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0, overflow: "hidden", marginBottom: 0 }}
                                transition={{ type: "spring", stiffness: 260, damping: 28 }}
                                className="flex flex-col items-center gap-3 flex-shrink-0 overflow-hidden"
                            >
                                <div className="text-center mt-2">
                                    <h1 className="text-4xl md:text-5xl font-bold font-headline text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-cyan-400 to-fuchsia-400 animate-gradient-x">
                                        Dashboards
                                    </h1>
                                    <p className="text-[10px] font-mono text-white/25 uppercase tracking-[0.3em] mt-1">OS StarSeed // Panel de Control</p>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>



                    {/* Workspace Window Manager — stretches to fill screen bottom */}
                    <div className={cn(
                        "flex-1 flex flex-col transition-all duration-500 pb-0",
                        isFullscreen ? "min-h-screen" : "min-h-[calc(100vh-40px)] flex-grow"
                    )}>
                        <WorkspaceProvider initialDashboards={dashboards.map(d => d.id)}>
                            <DashboardWorkspaceRenderer
                                dashboards={dashboards}
                                isEditMode={isEditMode}
                                setWidgets={setWidgets}
                                widgetsMap={dashboards.reduce((acc, d) => {
                                    acc[d.id] = widgets.filter(w => w.dashboard_id === d.id);
                                    return acc;
                                }, {} as any)}
                                onPinWidget={(widget) => {
                                    const htmlCode = widget.widget_type === 'AI_GENERATED'
                                        ? widget.settings?.customHtml || '<div style="padding:20px;color:white;">Widget</div>'
                                        : `<div style="background:rgba(20,20,30,0.9);padding:24px;border-radius:20px;color:white;border:1px solid rgba(255,255,255,0.08);"><h3 style="font-size:16px;font-weight:600;margin:0 0 8px;">${widget.widget_type.replace(/_/g, ' ')}</h3><p style="color:rgba(255,255,255,0.4);font-size:12px;margin:0;">Widget fijado desde el dashboard</p></div>`;
                                    const title = widget.settings?.ontology?.title || widget.widget_type.replace(/_/g, ' ');
                                    const themeColor = widget.settings?.ontology?.themeColor || '#8b5cf6';

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
                                    window.dispatchEvent(new Event('storage'));
                                }}
                                onAddWidget={(dashId, type) => handleAddWidget(dashId, type)}
                                onForgeOpen={() => setIsForgeOpen(true)}
                                onCreateDashboard={() => setIsCreateDialogOpen(true)}
                            />
                        </WorkspaceProvider>
                    </div>

                    {/* Hidden Create Dashboard Dialog (triggered via props) */}
                    <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
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
                                                            className={cn("gap-1.5 transition-all", widgetCount === 0 && "opacity-50")}
                                                            title={cat?.description}
                                                        >
                                                            {Icon && <Icon className="h-3.5 w-3.5" />}
                                                            {t.name}
                                                            {widgetCount > 0 && <span className="text-[10px] opacity-60">({widgetCount})</span>}
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

                    {/* Widget Forge Dialog */}
                    <WidgetForgeDialog
                        open={isForgeOpen}
                        onOpenChange={setIsForgeOpen}
                        onWidgetCreated={handleAddAiWidget}
                    />
                </div>
            </div>
        </WeatherLocationProvider>
    );
}

// --- Internal Helper Icon button for side control dock ---
interface SidebarIconButtonProps {
    icon: React.ReactNode;
    label: string;
    color: "neutral" | "cyan" | "emerald" | "purple" | "amber" | "crimson";
    active?: boolean;
    onClick: () => void;
}

function SidebarIconButton({ icon, label, color, active, onClick }: SidebarIconButtonProps) {
    const colors = {
        neutral: "text-white/60 hover:text-white hover:bg-white/10",
        cyan: "text-cyan-400 hover:bg-cyan-500/20 hover:shadow-[0_0_15px_rgba(34,211,238,0.4)]",
        emerald: "text-emerald-400 hover:bg-emerald-500/20 hover:shadow-[0_0_15px_rgba(16,185,129,0.4)]",
        purple: "text-purple-400 hover:bg-purple-500/20 hover:shadow-[0_0_15px_rgba(168,85,247,0.4)]",
        amber: "text-amber-400 hover:bg-amber-500/20 hover:shadow-[0_0_15px_rgba(245,158,11,0.4)]",
        crimson: "text-red-400 hover:bg-red-500/20 hover:shadow-[0_0_15px_rgba(239,68,68,0.4)]"
    };

    return (
        <div className="relative group shrink-0">
            <Button
                size="icon"
                variant="ghost"
                onClick={onClick}
                className={cn(
                    "w-10 h-10 rounded-xl backdrop-blur-md border border-white/5 transition-all duration-300",
                    colors[color],
                    active && "ring-1 ring-amber-500/40 bg-white/10 scale-105"
                )}
            >
                {icon}
            </Button>
            
            {/* Tooltip */}
            <span className="absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-black/90 text-white border border-white/10 text-[10px] px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-md z-[100]">
                {label}
            </span>
        </div>
    );
}

// Internal Location selector button wrapper
// LocationSelectorIcon removed — replaced by a SidebarIconButton with MapPin icon

// Inline temporary GitHub icon
function GithubIcon(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
            <path d="M9 18c-4.51 2-5-2-7-2" />
        </svg>
    );
}

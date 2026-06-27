'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Dashboard, DashboardWidget, WidgetType } from "./dashboard-types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { 
    Plus, Settings, LayoutGrid, Star, ArrowLeft, ArrowRight, Trash2, Search, 
    Sparkles, Maximize2, Minimize2, User, Cpu, Shield, Globe, Database, 
    Sliders, RefreshCw, Hammer, Compass, HardDrive, Lock, Zap, Wifi, Play, HelpCircle,
    Palette, X, MapPin, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Eye, EyeOff, ArrowUp, ArrowDown, Settings2
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
import { useAccount } from "@/context/account-context";
import { useAppearance } from "@/context/appearance-context";
import { curatedPresets } from "@/lib/themes/curated-presets";

import { WorkspaceProvider } from "./dashboard-workspace-context";
import { DashboardWorkspaceRenderer } from "./dashboard-workspace-renderer";
import { DashboardAiSuggestions } from "./dashboard-ai-suggestions";

// ── Sincronización ENTRE DISPOSITIVOS (Supabase, aditiva sobre localStorage) ──
// localStorage sigue siendo la caché/fallback; Supabase añade sync multi-dispositivo
// + realtime. Si no hay sesión/red, todo degrada en silencio a la ruta local.
import { useRealtime } from "@/lib/realtime/realtime";
import {
    loadRemoteDashboardState,
    saveRemoteDashboardState,
    mergeIntoLocal,
    collectLocal,
} from "@/lib/dashboard/dashboard-sync";

// ── LocalStorage Keys ────────────────────────────────────────────
const LS_DASHBOARDS = 'starseed_dashboards';
const LS_WIDGETS = 'starseed_widgets';
const LS_ORDER = 'dashboard_order';
const LS_INITIALIZED = 'starseed_dashboards_initialized';
// Versión del catálogo de dashboards predeterminados. Súbela cada vez que cambie
// el acomodo/los widgets por defecto para que las instalaciones existentes
// re-siembren los tableros predeterminados (preservando los tableros propios).
const LS_DEFAULTS_VERSION = 'starseed_defaults_version';
const DEFAULTS_VERSION = 'gen8-2026-06-20-apps-media-datos';
const LS_ACTIVE_PROFILE = 'starseed_active_profile_v1';
const LS_AI_PROVIDER = 'starseed_ai_provider_v1';
const LS_SERVERS = 'starseed_internet_servers_v1';

// ── Cross-tab realtime (difusión entre pestañas) ─────────────────
// PERSISTENCIA: dashboards y widgets viven en localStorage (NO en las tablas
// Supabase `dashboards`/`dashboard_widgets`). Para que los cambios se reflejen
// en vivo en otras pestañas del mismo navegador, difundimos un ping ligero por
// BroadcastChannel('starseed-dashboard') tras cada escritura. Las otras pestañas
// recargan su estado desde localStorage. Mínimo, aditivo y SSR-safe. El evento
// nativo `storage` cubre además el caso sin BroadcastChannel.
let __dashboardChannel: BroadcastChannel | null = null;
function getDashboardChannel(): BroadcastChannel | null {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
    if (!__dashboardChannel) {
        try { __dashboardChannel = new BroadcastChannel("starseed-dashboard"); }
        catch { __dashboardChannel = null; }
    }
    return __dashboardChannel;
}
function broadcastDashboardChange(scope: "dashboards" | "widgets") {
    try { getDashboardChannel()?.postMessage({ type: "data:changed", scope, at: Date.now() }); }
    catch { /* best-effort */ }
}

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

// Sin perfiles de ejemplo. Los perfiles reales del usuario se derivan de la
// sesión soberana (useAccount → profiles/cafe_profiles vía Supabase).
const PROFILES: UserProfile[] = [];

const BUTTON_LABELS: Record<string, string> = {
    profiles: "Selector de Perfiles",
    memory: "Memoria Local",
    ai: "Servicio de IA Exocórtex",
    connections: "Conexiones",
    themes: "Temas Rápidos",
    servers: "Internet / VPN",
    location: "Selector de Ubicación",
    forge: "Forjar Widget",
    edit: "Modo Edición",
    fullscreen: "Pantalla Completa",
    settings: "Ajustes de Menú"
};

// ── LocalStorage Helpers ─────────────────────────────────────────
function loadDashboards(): Dashboard[] {
    try {
        const raw = localStorage.getItem(LS_DASHBOARDS);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function saveDashboards(dashboards: Dashboard[]) {
    localStorage.setItem(LS_DASHBOARDS, JSON.stringify(dashboards));
    broadcastDashboardChange("dashboards");
}

function loadAllWidgets(): Record<string, DashboardWidget[]> {
    try {
        const raw = localStorage.getItem(LS_WIDGETS);
        return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
}

function saveAllWidgets(widgetMap: Record<string, DashboardWidget[]>) {
    localStorage.setItem(LS_WIDGETS, JSON.stringify(widgetMap));
    broadcastDashboardChange("widgets");
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
            settings: (w as any).settings ?? {},
            created_at: now,
        }));
    }

    return { dashboards, widgetMap };
}

// Re-siembra los dashboards predeterminados con el acomodo más reciente,
// preservando los tableros que el usuario creó (categorías no predeterminadas).
// Devuelve la lista combinada y persiste dashboards + widgets + versión.
function reseedDefaultDashboards(): { dashboards: Dashboard[], widgetMap: Record<string, DashboardWidget[]> } {
    const defaultCategoryIds = new Set(DEFAULT_DASHBOARD_TEMPLATES.map(t => t.categoryId));
    const stored = loadDashboards();
    const storedWidgets = loadAllWidgets();

    // Tableros 100% personalizados del usuario (categoría no predeterminada): se conservan.
    const customDashboards = stored.filter(d => !d.category || !defaultCategoryIds.has(d.category as any));
    const preservedWidgetMap: Record<string, DashboardWidget[]> = {};
    for (const d of customDashboards) {
        if (storedWidgets[d.id]) preservedWidgetMap[d.id] = storedWidgets[d.id];
    }

    // Regenera todos los predeterminados frescos (nuevo acomodo gen4/gen5).
    const { dashboards: freshDefaults, widgetMap: freshWidgets } = generateDefaultDashboards();

    const merged = [...freshDefaults, ...customDashboards];
    const mergedWidgets = { ...freshWidgets, ...preservedWidgetMap };

    saveDashboards(merged);
    saveAllWidgets(mergedWidgets);
    // Reinicia el orden para que el nuevo conjunto se ordene por defecto.
    try { localStorage.removeItem(LS_ORDER); } catch {}
    localStorage.setItem(LS_DEFAULTS_VERSION, DEFAULTS_VERSION);
    return { dashboards: merged, widgetMap: mergedWidgets };
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
    // Auto-pantalla completa al entrar: el OS abre en modo inmersivo desde el inicio.
    const [isFullscreen, setIsFullscreen] = useState(true);
    const [isTitleVisible, setIsTitleVisible] = useState(true);

    // --- Side Toolbar / Panel State ---
    const [activeToolbarTab, setActiveToolbarTab] = useState<string | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    // --- Customizable Sidebar State ---
    const DEFAULT_BUTTON_ORDER = useMemo(() => [
        "profiles", "memory", "ai", "connections", "themes", "servers", 
        "divider", "location", "forge", "edit", "fullscreen", "settings"
    ], []);

    const [sidebarConfig, setSidebarConfig] = useState<{
        position: 'left' | 'right' | 'top' | 'bottom';
        theme: 'liquid-crystal' | 'cyber-neon' | 'aurora-minimal';
        buttonOrder: string[];
        hiddenButtons: string[];
    }>({
        position: 'left',
        theme: 'liquid-crystal',
        buttonOrder: [
            "profiles", "memory", "ai", "connections", "themes", "servers", 
            "divider", "location", "forge", "edit", "fullscreen", "settings"
        ],
        hiddenButtons: []
    });

    const saveSidebarConfig = useCallback((newConfig: typeof sidebarConfig) => {
        setSidebarConfig(newConfig);
        localStorage.setItem('starseed_sidebar_config_v1', JSON.stringify(newConfig));
    }, []);

    const [activeProfile, setActiveProfile] = useState<UserProfile | null>(PROFILES[0] ?? null);
    
    // Cognitive memory context integration
    const { memory, addMemory } = useUserContext();
    const { updateConfig, config } = useAppearance();

    // ── Perfiles REALES del usuario (sesión soberana) ───────────────────────────
    // Construye el perfil OFICIAL a partir de la cuenta logueada en Supabase.
    // Sin sesión → lista vacía (el selector muestra un estado vacío real).
    const { user: accountUser, profile: accountProfile } = useAccount();
    const profiles = useMemo<UserProfile[]>(() => {
        if (!accountUser) return [];
        const displayName =
            (accountProfile?.display_name as string | undefined) ||
            (accountProfile?.full_name as string | undefined) ||
            (accountProfile?.handle as string | undefined) ||
            (accountProfile?.username as string | undefined) ||
            (accountUser.user_metadata?.full_name as string | undefined) ||
            (accountUser.email?.split("@")[0] ?? "Cuenta");
        const handle =
            (accountProfile?.handle as string | undefined) ||
            (accountProfile?.username as string | undefined) ||
            (accountUser.email?.split("@")[0] ?? "");
        const avatarUrl =
            (accountProfile?.avatar_url as string | undefined) ||
            (accountUser.user_metadata?.avatar_url as string | undefined) ||
            "";
        return [
            {
                id: accountUser.id,
                type: "OFFICIAL",
                displayName,
                handle,
                avatarUrl,
                bio: (accountProfile?.bio as string | undefined) ?? "",
                reputation: 0,
            },
        ];
    }, [accountUser, accountProfile]);

    // Sincroniza el perfil activo con la cuenta real cuando llega/cambia.
    useEffect(() => {
        if (profiles.length === 0) {
            setActiveProfile(null);
            return;
        }
        setActiveProfile((curr) => profiles.find((p) => p.id === curr?.id) ?? profiles[0]);
    }, [profiles]);

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
    // Renombrar dashboard (rellena la opción "Renombrar Dashboard" del menú de panel).
    const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");

    const { toast } = useToast();

    // ── Re-hidratación desde localStorage (fuente de verdad local) ──────────────
    // Relee la lista de tableros y los widgets del tablero activo desde
    // localStorage. Se reutiliza tanto para la sincronización entre pestañas
    // (BroadcastChannel / storage) como para la sincronización ENTRE DISPOSITIVOS
    // (Supabase realtime, tras volcar el blob remoto a localStorage).
    const rehydrateFromLocal = useCallback(() => {
        const stored = loadDashboards();
        if (stored.length > 0) {
            const sorted = sortDashboards(stored);
            setDashboards(sorted);
            setActiveDashboardId((curr) => {
                const stillExists = curr && sorted.some((d) => d.id === curr);
                const nextActive = stillExists ? curr : sorted[0]?.id ?? null;
                if (nextActive) setWidgets(loadWidgetsForDashboard(nextActive));
                return nextActive;
            });
        }
    }, []);

    // ── Sincronización ENTRE DISPOSITIVOS (Supabase) ────────────────────────────
    // UID de la sesión (para filtrar el canal realtime). Sin sesión → undefined,
    // y toda la capa Supabase queda inerte (solo localStorage + BroadcastChannel).
    const [syncUid, setSyncUid] = useState<string | undefined>(undefined);
    // Timer de debounce para el upsert remoto (write-through).
    const remoteSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Evita re-subir inmediatamente lo que acabamos de hidratar desde remoto.
    const hydratingFromRemote = useRef(false);

    // Load active settings on mount
    useEffect(() => {
        const storedProfile = localStorage.getItem(LS_ACTIVE_PROFILE);
        if (storedProfile) {
            const found = profiles.find(p => p.id === storedProfile);
            if (found) setActiveProfile(found);
        }

        const storedProvider = localStorage.getItem(LS_AI_PROVIDER);
        if (storedProvider) setAiProvider(storedProvider as any);

        const storedServers = localStorage.getItem(LS_SERVERS);
        if (storedServers) {
            try { setSelectedServers(JSON.parse(storedServers)); } catch {}
        }

        // Load sidebar config
        try {
            const raw = localStorage.getItem('starseed_sidebar_config_v1');
            if (raw) {
                const parsed = JSON.parse(raw);
                setSidebarConfig({
                    position: parsed.position || 'left',
                    theme: parsed.theme || 'liquid-crystal',
                    buttonOrder: parsed.buttonOrder || [
                        "profiles", "memory", "ai", "connections", "themes", "servers", 
                        "divider", "location", "forge", "edit", "fullscreen", "settings"
                    ],
                    hiddenButtons: parsed.hiddenButtons || []
                });
            }
        } catch (e) {
            console.error("Error loading sidebar config:", e);
        }
    }, []);

    // ── Edición de ajustes de widgets ──────────────────────────────
    // Un widget (p. ej. el launcher) emite 'starseed:update-widget-settings'
    // con { id, settings } y aquí lo persistimos (todas las cuentas) + refresco.
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail as { id?: string; settings?: Record<string, any> } | undefined;
            if (!detail?.id || !detail.settings) return;
            const { id, settings: patch } = detail;
            try {
                const all = loadAllWidgets();
                let changed = false;
                for (const k of Object.keys(all)) {
                    all[k] = all[k].map((w) => {
                        if (w.id === id) { changed = true; return { ...w, settings: { ...(w.settings || {}), ...patch } }; }
                        return w;
                    });
                }
                if (changed) saveAllWidgets(all);
            } catch { /* noop */ }
            setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, settings: { ...(w.settings || {}), ...patch } } : w)));
        };
        window.addEventListener('starseed:update-widget-settings', handler as EventListener);
        return () => window.removeEventListener('starseed:update-widget-settings', handler as EventListener);
    }, []);

    // ── Initialize dashboards ──────────────────────────────────────
    useEffect(() => {
        const initialized = localStorage.getItem(LS_INITIALIZED);

        if (!initialized) {
            const { dashboards: defaults, widgetMap } = generateDefaultDashboards();
            saveDashboards(defaults);
            saveAllWidgets(widgetMap);
            localStorage.setItem(LS_INITIALIZED, 'true');
            localStorage.setItem(LS_DEFAULTS_VERSION, DEFAULTS_VERSION);

            const sorted = sortDashboards(defaults);
            setDashboards(sorted);
            if (sorted.length > 0) {
                setActiveDashboardId(sorted[0].id);
                setWidgets(widgetMap[sorted[0].id] || []);
            }
        } else {
            // Re-siembra versionada: si cambió el catálogo de defaults, regenera los
            // tableros predeterminados con el nuevo acomodo (conservando los propios).
            const storedVersion = localStorage.getItem(LS_DEFAULTS_VERSION);
            if (storedVersion !== DEFAULTS_VERSION && loadDashboards().length > 0) {
                const { dashboards: merged, widgetMap } = reseedDefaultDashboards();
                const sorted = sortDashboards(merged);
                setDashboards(sorted);
                if (sorted.length > 0) {
                    setActiveDashboardId(sorted[0].id);
                    setWidgets(widgetMap[sorted[0].id] || []);
                }
                setLoading(false);
                return;
            }

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

    // ── [Sync multi-dispositivo] Resolver UID de sesión (para el filtro realtime) ──
    // Aditivo: si no hay sesión, syncUid queda undefined y la capa Supabase es inerte.
    useEffect(() => {
        let active = true;
        void (async () => {
            try {
                const { createClient } = await import("@/utils/supabase/client");
                const supabase = createClient();
                const { data } = await supabase.auth.getUser();
                if (active) setSyncUid(data?.user?.id ?? undefined);
                // Reaccionar a inicio/cierre de sesión sin recargar.
                const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
                    setSyncUid(session?.user?.id ?? undefined);
                });
                if (!active) { try { sub.subscription.unsubscribe(); } catch {} }
            } catch {
                /* sin Supabase: nos quedamos en modo local */
            }
        })();
        return () => { active = false; };
    }, []);

    // ── [Sync multi-dispositivo] Hidratar desde Supabase al montar ─────────────
    // Tras la carga inicial de localStorage, si Supabase tiene una fila del usuario,
    // volcamos el blob remoto a localStorage y re-leemos el estado (así un
    // dispositivo nuevo recibe los tableros del usuario). Defensivo y SSR-safe:
    // si no hay sesión/fila/red, no hace nada y se conserva la ruta local.
    useEffect(() => {
        if (typeof window === "undefined") return;
        let active = true;
        void (async () => {
            try {
                const remote = await loadRemoteDashboardState();
                if (!active || !remote) return;
                hydratingFromRemote.current = true;
                const wrote = mergeIntoLocal(remote.data);
                if (wrote) rehydrateFromLocal();
            } catch {
                /* best-effort: el fallback local ya está cargado */
            }
        })();
        return () => { active = false; };
    }, [rehydrateFromLocal]);

    // ── [Sync multi-dispositivo] Write-through con debounce (~800ms) ───────────
    // Cuando cambian los tableros/widgets en memoria, subimos el blob completo de
    // localStorage a Supabase (upsert). El debounce agrupa ráfagas de ediciones.
    // Saltamos el primer disparo provocado por una hidratación remota para evitar
    // un eco innecesario. Nunca rompe: sin sesión es no-op silencioso (solo local).
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (loading) return; // no subir durante la carga/siembra inicial
        if (hydratingFromRemote.current) {
            // Este cambio proviene de una hidratación remota: no lo reenviamos.
            hydratingFromRemote.current = false;
            return;
        }
        if (remoteSaveTimer.current) clearTimeout(remoteSaveTimer.current);
        remoteSaveTimer.current = setTimeout(() => {
            void saveRemoteDashboardState(collectLocal());
        }, 800);
        return () => {
            if (remoteSaveTimer.current) clearTimeout(remoteSaveTimer.current);
        };
    }, [dashboards, widgets, loading]);

    // ── [Sync multi-dispositivo] Realtime: re-hidratar ante cambios remotos ────
    // Escucha la fila `dashboard_state` del usuario; cuando otro dispositivo la
    // actualiza, recargamos el blob remoto → localStorage → estado. SSR-safe; si
    // no hay sesión/red, useRealtime es no-op y se conserva la sincronización local.
    useRealtime(
        "dashboard_state",
        { filter: syncUid ? `owner=eq.${syncUid}` : undefined },
        () => {
            void (async () => {
                try {
                    const remote = await loadRemoteDashboardState();
                    if (!remote) return;
                    hydratingFromRemote.current = true;
                    const wrote = mergeIntoLocal(remote.data);
                    if (wrote) rehydrateFromLocal();
                } catch {
                    /* best-effort */
                }
            })();
        },
    );

    // ── Auto-Fullscreen Effect ─────────────────────────────────────
    useEffect(() => {
        const timer = setTimeout(() => {
            setIsFullscreen(true);
        }, 2500);
        return () => clearTimeout(timer);
    }, []);

    // Al entrar en pantalla completa, oculta la barra lateral de ajustes
    // (se conserva el botón de expansión para volver a mostrarla).
    useEffect(() => {
        if (isFullscreen) setIsSidebarOpen(false);
    }, [isFullscreen]);

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

    // ── Cross-tab realtime: recarga al cambiar datos en otra pestaña ────────────
    // Escucha BroadcastChannel('starseed-dashboard') y el evento nativo `storage`.
    // Cuando otra pestaña modifica dashboards/widgets, refrescamos la lista de
    // tableros y los widgets del tablero activo desde localStorage (fuente de
    // verdad). Aditivo y SSR-safe; no altera la persistencia existente.
    useEffect(() => {
        if (typeof window === "undefined") return;

        const refreshFromStorage = () => rehydrateFromLocal();

        let ch: BroadcastChannel | null = null;
        if (typeof BroadcastChannel !== "undefined") {
            try {
                ch = new BroadcastChannel("starseed-dashboard");
                ch.onmessage = (ev) => {
                    if (ev?.data?.type === "data:changed") refreshFromStorage();
                };
            } catch { ch = null; }
        }

        const onStorage = (e: StorageEvent) => {
            if (e.key === LS_DASHBOARDS || e.key === LS_WIDGETS || e.key === LS_ORDER) {
                refreshFromStorage();
            }
        };
        window.addEventListener("storage", onStorage);

        return () => {
            window.removeEventListener("storage", onStorage);
            try { ch?.close(); } catch { /* best-effort */ }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
            const show = scrollY < 60;
            setIsTitleVisible(show);
            // La barra lateral de ajustes se oculta/auto-revela junto con el título.
            setIsSidebarOpen(show);
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

    // Restablece los dashboards predeterminados al acomodo más reciente,
    // conservando los tableros propios del usuario. Vía manual de re-siembra.
    const handleResetLayout = () => {
        if (typeof window !== "undefined" && !window.confirm("¿Restablecer los tableros predeterminados al acomodo más reciente? Tus tableros personalizados se conservan.")) return;
        const { dashboards: merged, widgetMap } = reseedDefaultDashboards();
        const sorted = sortDashboards(merged);
        setDashboards(sorted);
        if (sorted.length > 0) {
            setActiveDashboardId(sorted[0].id);
            setWidgets(widgetMap[sorted[0].id] || []);
        }
        toast({ title: "Tableros restablecidos", description: "Se aplicó el acomodo predeterminado más reciente." });
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

    // Crea un dashboard directamente desde una categoría/plantilla (usado por las
    // sugerencias de Astraura). Reutiliza la siembra de plantillas existente.
    const handleCreateDashboardFromTemplate = useCallback((categoryId: string, name: string) => {
        const now = new Date().toISOString();
        const dashId = crypto.randomUUID();
        const template = ALL_DASHBOARD_TEMPLATES.find((t) => t.categoryId === categoryId);
        const newDashboard: Dashboard = {
            id: dashId,
            profile_id: 'local',
            name: name?.trim() || template?.name || 'Nuevo Dashboard',
            is_default: false,
            category: categoryId,
            created_at: now,
            updated_at: now,
        };
        const seededWidgets: DashboardWidget[] = (template?.widgets || []).map((w) => ({
            id: crypto.randomUUID(),
            dashboard_id: dashId,
            widget_type: w.type as any,
            layout: { x: w.x, y: w.y, w: w.w, h: w.h, i: crypto.randomUUID() },
            settings: (w as any).settings ?? {},
            created_at: now,
        }));
        setDashboards((prev) => {
            const all = [...prev, newDashboard];
            saveDashboards(all);
            return all;
        });
        saveWidgetsForDashboard(dashId, seededWidgets);
        setActiveDashboardId(dashId);
        setWidgets(seededWidgets);
        toast({ title: "Dashboard creado", description: `Astraura preparó "${newDashboard.name}".` });
    }, [toast]);

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

    // Abre el diálogo de renombrado para un tablero concreto.
    const handleOpenRename = (id: string) => {
        const d = dashboards.find((x) => x.id === id) ?? dashboards.find((x) => x.id === activeDashboardId);
        if (!d) return;
        setRenameTargetId(d.id);
        setRenameValue(d.name);
    };

    // Persiste el nuevo nombre del tablero (localStorage + difusión cross-tab).
    const handleRenameDashboard = () => {
        const name = renameValue.trim();
        if (!renameTargetId || !name) return;
        const now = new Date().toISOString();
        const updated = dashboards.map((d) => (d.id === renameTargetId ? { ...d, name, updated_at: now } : d));
        setDashboards(updated);
        saveDashboards(updated);
        toast({ title: "Dashboard renombrado", description: `Ahora se llama "${name}".` });
        setRenameTargetId(null);
        setRenameValue("");
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

    // --- Header (dynamic title) derived data ---
    const activeDashboard = useMemo(
        () => dashboards.find(d => d.id === activeDashboardId) ?? dashboards[0],
        [dashboards, activeDashboardId]
    );
    const activeCategory = useMemo(
        () => activeDashboard ? getCategoryById(activeDashboard.category as any) : undefined,
        [activeDashboard]
    );
    const totalWidgets = widgets.length;

    // --- Customizable Sidebar Computed Properties ---
    const isVertical = useMemo(() => sidebarConfig.position === 'left' || sidebarConfig.position === 'right', [sidebarConfig.position]);

    const mainPaddingClass = useMemo(() => {
        if (isFullscreen) return "gap-0 p-0";
        if (!isSidebarOpen) {
            // When menu is closed, keep a small margin to make sure workspace elements aren't overlapping the floating toggle button.
            switch (sidebarConfig.position) {
                case 'left': return "gap-6 pl-16 pr-6 py-6";
                case 'right': return "gap-6 pr-16 pl-6 py-6";
                case 'top': return "gap-6 pt-16 pb-6 px-6";
                case 'bottom': return "gap-6 pb-16 pt-6 px-6";
                default: return "gap-6 pl-16 pr-6 py-6";
            }
        }
        
        switch (sidebarConfig.position) {
            case 'left': return "gap-6 pl-20 md:pl-24 pr-6 py-6";
            case 'right': return "gap-6 pr-20 md:pr-24 pl-6 py-6";
            case 'top': return "gap-6 pt-20 md:pt-24 pb-6 px-6";
            case 'bottom': return "gap-6 pb-20 md:pb-24 pt-6 px-6";
            default: return "gap-6 pl-20 md:pl-24 pr-6 py-6";
        }
    }, [isFullscreen, isSidebarOpen, sidebarConfig.position]);

    const fixedContainerClass = useMemo(() => {
        switch (sidebarConfig.position) {
            case 'right':
                return "fixed right-4 top-1/2 -translate-y-1/2 z-[80] flex flex-row-reverse items-center pointer-events-none gap-3";
            case 'top':
                return "fixed top-4 left-1/2 -translate-x-1/2 z-[80] flex flex-col items-center pointer-events-none gap-3";
            case 'bottom':
                return "fixed bottom-4 left-1/2 -translate-x-1/2 z-[80] flex flex-col-reverse items-center pointer-events-none gap-3";
            case 'left':
            default:
                return "fixed left-4 top-1/2 -translate-y-1/2 z-[80] flex flex-row items-center pointer-events-none gap-3";
        }
    }, [sidebarConfig.position]);

    const barThemeClass = useMemo(() => {
        const layoutCls = isVertical
            ? "flex-col w-14 h-auto p-3 rounded-3xl"
            : "flex-row h-14 w-auto p-3 rounded-3xl";

        switch (sidebarConfig.theme) {
            case 'cyber-neon':
                return cn(
                    "pointer-events-auto flex items-center gap-2 bg-slate-950/95 border border-cyan-500/40 shadow-[0_0_20px_rgba(6,182,212,0.25)] backdrop-blur-xl shrink-0 transition-all duration-300",
                    layoutCls
                );
            case 'aurora-minimal':
                return cn(
                    "pointer-events-auto flex items-center gap-2 bg-gradient-to-br from-purple-950/20 to-emerald-950/20 border border-white/5 shadow-lg backdrop-blur-2xl shrink-0 transition-all duration-300",
                    layoutCls
                );
            case 'liquid-crystal':
            default:
                return cn(
                    "pointer-events-auto flex items-center gap-2 bg-black/40 border border-white/10 shadow-xl backdrop-blur-2xl shrink-0 transition-all duration-300",
                    layoutCls
                );
        }
    }, [isVertical, sidebarConfig.theme]);

    const toggleButtonThemeClass = useMemo(() => {
        const base = "w-10 h-10 rounded-full border backdrop-blur-md transition-all shadow-lg hover:shadow-[0_0_15px_rgba(6,182,212,0.4)] pointer-events-auto shrink-0 z-50 flex items-center justify-center cursor-pointer";
        
        switch (sidebarConfig.theme) {
            case 'cyber-neon':
                return cn(
                    base,
                    "bg-slate-950/95 border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/20 hover:text-white hover:border-cyan-400"
                );
            case 'aurora-minimal':
                return cn(
                    base,
                    "bg-black/30 border-white/5 text-emerald-400 hover:bg-emerald-500/20 hover:text-white hover:border-emerald-400/50"
                );
            case 'liquid-crystal':
            default:
                return cn(
                    base,
                    "bg-black/60 border-white/10 text-cyan-400 hover:bg-cyan-500/20 hover:text-white hover:border-white/20"
                );
        }
    }, [sidebarConfig.theme]);

    const toggleIcon = useMemo(() => {
        if (isSidebarOpen) {
            if (sidebarConfig.position === 'left') return <ChevronLeft className="w-5 h-5" />;
            if (sidebarConfig.position === 'right') return <ChevronRight className="w-5 h-5" />;
            if (sidebarConfig.position === 'top') return <ChevronUp className="w-5 h-5" />;
            return <ChevronDown className="w-5 h-5" />;
        } else {
            if (sidebarConfig.position === 'left') return <ChevronRight className="w-5 h-5" />;
            if (sidebarConfig.position === 'right') return <ChevronLeft className="w-5 h-5" />;
            if (sidebarConfig.position === 'top') return <ChevronDown className="w-5 h-5" />;
            return <ChevronUp className="w-5 h-5" />;
        }
    }, [isSidebarOpen, sidebarConfig.position]);

    const motionInitial = useMemo(() => {
        if (sidebarConfig.position === 'left') return { opacity: 0, x: -50, y: 0, scale: 0.9 };
        if (sidebarConfig.position === 'right') return { opacity: 0, x: 50, y: 0, scale: 0.9 };
        if (sidebarConfig.position === 'top') return { opacity: 0, x: 0, y: -50, scale: 0.9 };
        return { opacity: 0, x: 0, y: 50, scale: 0.9 };
    }, [sidebarConfig.position]);

    const flyoutInitial = useMemo(() => {
        if (sidebarConfig.position === 'left') return { opacity: 0, x: -30, y: 0, scale: 0.95 };
        if (sidebarConfig.position === 'right') return { opacity: 0, x: 30, y: 0, scale: 0.95 };
        if (sidebarConfig.position === 'top') return { opacity: 0, x: 0, y: -30, scale: 0.95 };
        return { opacity: 0, x: 0, y: 30, scale: 0.95 };
    }, [sidebarConfig.position]);

    const renderSidebarButton = useCallback((buttonId: string) => {
        if (sidebarConfig.hiddenButtons.includes(buttonId)) return null;

        switch (buttonId) {
            case "profiles":
                return (
                    <SidebarIconButton 
                        key="profiles"
                        icon={<User className="w-5 h-5" />} 
                        label="Perfiles" 
                        color="cyan"
                        active={activeToolbarTab === "profiles"}
                        onClick={() => setActiveToolbarTab(activeToolbarTab === "profiles" ? null : "profiles")}
                    />
                );
            case "memory":
                return (
                    <SidebarIconButton 
                        key="memory"
                        icon={<HardDrive className="w-5 h-5" />} 
                        label="Memoria local" 
                        color="emerald"
                        active={activeToolbarTab === "memory"}
                        onClick={() => setActiveToolbarTab(activeToolbarTab === "memory" ? null : "memory")}
                    />
                );
            case "ai":
                return (
                    <SidebarIconButton 
                        key="ai"
                        icon={<Cpu className="w-5 h-5" />} 
                        label="Servicio de IA" 
                        color="cyan"
                        active={activeToolbarTab === "ai"}
                        onClick={() => setActiveToolbarTab(activeToolbarTab === "ai" ? null : "ai")}
                    />
                );
            case "connections":
                return (
                    <SidebarIconButton 
                        key="connections"
                        icon={<Wifi className="w-5 h-5" />} 
                        label="Conexiones" 
                        color="purple"
                        active={activeToolbarTab === "connections"}
                        onClick={() => setActiveToolbarTab(activeToolbarTab === "connections" ? null : "connections")}
                    />
                );
            case "themes":
                return (
                    <SidebarIconButton 
                        key="themes"
                        icon={<Palette className="w-5 h-5" />} 
                        label="Temas rápidos" 
                        color="amber"
                        active={activeToolbarTab === "themes"}
                        onClick={() => setActiveToolbarTab(activeToolbarTab === "themes" ? null : "themes")}
                    />
                );
            case "servers":
                return (
                    <SidebarIconButton 
                        key="servers"
                        icon={<Globe className="w-5 h-5" />} 
                        label="Internet / VPN" 
                        color="crimson"
                        active={activeToolbarTab === "servers"}
                        onClick={() => setActiveToolbarTab(activeToolbarTab === "servers" ? null : "servers")}
                    />
                );
            case "divider":
                return (
                    <div 
                        key="divider"
                        className={cn(
                            isVertical ? "w-8 h-px my-1" : "h-8 w-px mx-1", 
                            "bg-white/10 rounded-full shrink-0"
                        )} 
                    />
                );
            case "location":
                return (
                    <SidebarIconButton 
                        key="location"
                        icon={<MapPin className="w-5 h-5" />} 
                        label="Ubicación" 
                        color="cyan" 
                        onClick={() => {
                            const event = new CustomEvent('starseed:open-location');
                            window.dispatchEvent(event);
                        }}
                    />
                );
            case "forge":
                return (
                    <SidebarIconButton 
                        key="forge"
                        icon={<Hammer className="w-5 h-5 text-indigo-300" />} 
                        label="Forjar Widget" 
                        color="neutral" 
                        onClick={() => setIsForgeOpen(true)} 
                    />
                );
            case "edit":
                return (
                    <SidebarIconButton 
                        key="edit"
                        icon={<LayoutGrid className="w-5 h-5" />} 
                        label={isEditMode ? "Terminar" : "Editar"} 
                        color={isEditMode ? "emerald" : "neutral"} 
                        active={isEditMode}
                        onClick={() => setIsEditMode(!isEditMode)} 
                    />
                );
            case "fullscreen":
                return (
                    <SidebarIconButton 
                        key="fullscreen"
                        icon={isFullscreen ? <Minimize2 className="w-5 h-5 text-amber-400" /> : <Maximize2 className="w-5 h-5" />} 
                        label={isFullscreen ? "Salir Pantalla Completa" : "Pantalla Completa"} 
                        color="neutral" 
                        onClick={() => setIsFullscreen(!isFullscreen)} 
                    />
                );
            case "settings":
                return (
                    <SidebarIconButton 
                        key="settings"
                        icon={<Settings className="w-5 h-5 text-slate-300" />} 
                        label="Ajustes Menú" 
                        color="cyan" 
                        active={activeToolbarTab === "settings"}
                        onClick={() => setActiveToolbarTab(activeToolbarTab === "settings" ? null : "settings")} 
                    />
                );
            default:
                return null;
        }
    }, [activeToolbarTab, isEditMode, isFullscreen, isVertical, sidebarConfig.hiddenButtons, sidebarConfig.position, sidebarConfig.theme]);

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
            {/* Sello de versión (confirmar caché). Esquina inf-izq, no estorba al FAB. */}
            <div data-build="STARSEED_BUILD_BADGE" className="fixed bottom-1 left-1 z-[95] pointer-events-none select-none text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/45 text-white/55 backdrop-blur-sm">
                build · 2026-06-14 · likes-comentarios+areas3 v18
            </div>
            <div className={cn(
                "relative flex flex-row w-full select-none min-h-screen transition-all duration-500",
                mainPaddingClass
            )}>
                
                {/* ── CIBERDELIC SIDE BAR TOOLBAR (Left side, absolute / sticky float) ── */}
                <div className={fixedContainerClass}>
                    
                    {/* Collapsed / Icons Bar */}
                    <AnimatePresence>
                        {isSidebarOpen && (
                            <motion.div
                                initial={motionInitial}
                                animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                                exit={motionInitial}
                                transition={{ type: "spring", stiffness: 350, damping: 25 }}
                                className={barThemeClass}
                            >
                                {sidebarConfig.buttonOrder.map(buttonId => renderSidebarButton(buttonId))}
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
                            className={toggleButtonThemeClass}
                            title={isSidebarOpen ? "Ocultar menú lateral" : "Mostrar menú lateral"}
                        >
                            {toggleIcon}
                        </Button>
                    </motion.div>

                    {/* Expandible flyout card */}
                    <AnimatePresence>
                        {isSidebarOpen && activeToolbarTab && (
                            <motion.div
                                initial={flyoutInitial}
                                animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                                exit={flyoutInitial}
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
                                            activeToolbarTab === "servers" ? "Seguridad y Sincronización" :
                                            "Ajustes de Barra Lateral"}
                                    </h4>
                                    <button onClick={() => setActiveToolbarTab(null)} className="p-1 hover:bg-white/5 rounded-full text-white/40 hover:text-white transition-all">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto max-h-[360px] pr-1 scrollbar-thin">
                                    {/* Profiles Tab Content */}
                                    {activeToolbarTab === "profiles" && (
                                        <div className="space-y-3">
                                            {profiles.length === 0 && (
                                                <div className="text-center py-6 text-xs text-white/40">
                                                    Inicia sesión para ver y gestionar tus perfiles.
                                                </div>
                                            )}
                                            {profiles.map((p) => {
                                                const colors = {
                                                    OFFICIAL: "border-blue-500 bg-blue-500/10 text-blue-300",
                                                    ARTISTIC: "border-emerald-500 bg-emerald-500/10 text-emerald-300",
                                                    ANONYMOUS: "border-red-500 bg-red-500/10 text-red-300"
                                                };
                                                const isActive = activeProfile?.id === p.id;
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

                                            {/* Sync sync button */}
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

                                    {/* Settings Tab Content */}
                                    {activeToolbarTab === "settings" && (
                                        <div className="space-y-4">
                                            {/* POSITION SELECTOR */}
                                            <div className="space-y-2">
                                                <Label className="text-[10px] text-white/50 uppercase tracking-wider font-mono">Posición del Menú</Label>
                                                <div className="grid grid-cols-2 gap-1.5">
                                                    {(['left', 'right', 'top', 'bottom'] as const).map((pos) => (
                                                        <button
                                                            key={pos}
                                                            onClick={() => saveSidebarConfig({ ...sidebarConfig, position: pos })}
                                                            className={cn(
                                                                "py-1.5 px-3 rounded-xl border text-[10px] uppercase font-mono transition-all text-center",
                                                                sidebarConfig.position === pos
                                                                    ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]"
                                                                    : "border-white/5 bg-white/[0.02] text-white/50 hover:bg-white/5 hover:text-white"
                                                            )}
                                                        >
                                                            {pos === 'left' ? 'Izquierda' : pos === 'right' ? 'Derecha' : pos === 'top' ? 'Arriba' : 'Abajo'}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* THEME SELECTOR */}
                                            <div className="space-y-2">
                                                <Label className="text-[10px] text-white/50 uppercase tracking-wider font-mono">Diseño Estético</Label>
                                                <div className="space-y-1.5">
                                                    {[
                                                        { id: 'liquid-crystal', name: 'Cristal Líquido', desc: 'Vidrio translúcido ciberdélico' },
                                                        { id: 'cyber-neon', name: 'Ciber Neón', desc: 'Líneas neón cian brillantes' },
                                                        { id: 'aurora-minimal', name: 'Aurora Sutil', desc: 'Suaves degradados cósmicos' }
                                                    ].map((t) => (
                                                        <button
                                                            key={t.id}
                                                            onClick={() => saveSidebarConfig({ ...sidebarConfig, theme: t.id as any })}
                                                            className={cn(
                                                                "w-full p-2 rounded-xl border transition-all text-left flex flex-col gap-0.5",
                                                                sidebarConfig.theme === t.id
                                                                    ? "border-cyan-500/50 bg-cyan-500/10 shadow-[0_0_10px_rgba(6,182,212,0.15)]"
                                                                    : "border-white/5 bg-white/[0.02] hover:bg-white/5"
                                                            )}
                                                        >
                                                            <span className={cn("text-[10px] font-semibold", sidebarConfig.theme === t.id ? "text-cyan-300" : "text-white/80")}>
                                                                {t.name}
                                                            </span>
                                                            <span className="text-[8px] text-white/40">{t.desc}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* BUTTONS ORDER AND VISIBILITY */}
                                            <div className="space-y-2">
                                                <Label className="text-[10px] text-white/50 uppercase tracking-wider font-mono">Acomodo de Opciones</Label>
                                                <div className="space-y-1 bg-black/40 border border-white/5 p-2 rounded-2xl max-h-[180px] overflow-y-auto pr-1 scrollbar-thin">
                                                    {sidebarConfig.buttonOrder.map((buttonId, idx) => {
                                                        if (buttonId === 'divider') return null;
                                                        const label = BUTTON_LABELS[buttonId] || buttonId;
                                                        const isHidden = sidebarConfig.hiddenButtons.includes(buttonId);

                                                        const handleMoveUp = (e: React.MouseEvent) => {
                                                            e.stopPropagation();
                                                            if (idx === 0) return;
                                                            const newOrder = [...sidebarConfig.buttonOrder];
                                                            const temp = newOrder[idx];
                                                            newOrder[idx] = newOrder[idx - 1];
                                                            newOrder[idx - 1] = temp;
                                                            saveSidebarConfig({ ...sidebarConfig, buttonOrder: newOrder });
                                                        };

                                                        const handleMoveDown = (e: React.MouseEvent) => {
                                                            e.stopPropagation();
                                                            if (idx === sidebarConfig.buttonOrder.length - 1) return;
                                                            const newOrder = [...sidebarConfig.buttonOrder];
                                                            const temp = newOrder[idx];
                                                            newOrder[idx] = newOrder[idx + 1];
                                                            newOrder[idx + 1] = temp;
                                                            saveSidebarConfig({ ...sidebarConfig, buttonOrder: newOrder });
                                                        };

                                                        const handleToggleVisibility = (e: React.MouseEvent) => {
                                                            e.stopPropagation();
                                                            const newHidden = isHidden
                                                                ? sidebarConfig.hiddenButtons.filter(b => b !== buttonId)
                                                                : [...sidebarConfig.hiddenButtons, buttonId];
                                                            saveSidebarConfig({ ...sidebarConfig, hiddenButtons: newHidden });
                                                        };

                                                        return (
                                                            <div 
                                                                key={buttonId}
                                                                className="flex items-center justify-between p-1.5 rounded-xl border border-white/5 bg-white/[0.01] text-[9px] hover:bg-white/5"
                                                            >
                                                                <span className="truncate max-w-[130px] font-medium text-white/80">{label}</span>
                                                                <div className="flex items-center gap-1 shrink-0">
                                                                    <button
                                                                        onClick={handleMoveUp}
                                                                        disabled={idx === 0}
                                                                        className="p-1 hover:bg-white/10 rounded disabled:opacity-20 text-white/60 hover:text-white"
                                                                    >
                                                                        <ArrowUp className="w-2.5 h-2.5" />
                                                                    </button>
                                                                    <button
                                                                        onClick={handleMoveDown}
                                                                        disabled={idx === sidebarConfig.buttonOrder.length - 1}
                                                                        className="p-1 hover:bg-white/10 rounded disabled:opacity-20 text-white/60 hover:text-white"
                                                                    >
                                                                        <ArrowDown className="w-2.5 h-2.5" />
                                                                    </button>
                                                                    <button
                                                                        onClick={handleToggleVisibility}
                                                                        className="p-1 hover:bg-white/10 rounded text-cyan-400 hover:text-cyan-300"
                                                                    >
                                                                        {isHidden ? <EyeOff className="w-2.5 h-2.5 text-white/30" /> : <Eye className="w-2.5 h-2.5 text-cyan-400" />}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {/* RESET BUTTON */}
                                            <Button
                                                onClick={() => {
                                                    const resetConfig = {
                                                        position: 'left' as const,
                                                        theme: 'liquid-crystal' as const,
                                                        buttonOrder: DEFAULT_BUTTON_ORDER,
                                                        hiddenButtons: []
                                                    };
                                                    saveSidebarConfig(resetConfig);
                                                    toast({ title: "Configuración Restablecida", description: "El menú ha vuelto a su diseño y acomodo predeterminados." });
                                                }}
                                                variant="outline"
                                                size="sm"
                                                className="w-full text-[10px] h-8 rounded-xl border-white/10 hover:bg-white/5 text-white/70"
                                            >
                                                Restablecer Predeterminados
                                            </Button>
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
                                className="flex flex-col items-center gap-4 flex-shrink-0 overflow-hidden"
                            >
                                <div className="flex flex-col items-center text-center mt-2">
                                    {/* Eyebrow — categoría activa dinámica */}
                                    <AnimatePresence mode="wait">
                                        <motion.div
                                            key={activeCategory?.id ?? "all"}
                                            initial={{ opacity: 0, y: -6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 6 }}
                                            transition={{ duration: 0.25 }}
                                            className="flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/[0.03] backdrop-blur-md mb-3"
                                        >
                                            {activeCategory?.icon && (
                                                <activeCategory.icon className="w-3.5 h-3.5 text-cyan-300" />
                                            )}
                                            <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-white/50">
                                                {activeCategory?.name ?? "Panel de Control"}
                                            </span>
                                            <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                                            <span className="text-[10px] font-mono text-white/40">
                                                {dashboards.length} paneles · {totalWidgets} widgets
                                            </span>
                                        </motion.div>
                                    </AnimatePresence>

                                    {/* Título dinámico — nombre del dashboard activo */}
                                    <AnimatePresence mode="wait">
                                        <motion.h1
                                            key={activeDashboard?.id ?? "dashboards"}
                                            initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
                                            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                                            exit={{ opacity: 0, y: -10, filter: "blur(6px)" }}
                                            transition={{ type: "spring", stiffness: 280, damping: 26 }}
                                            className="text-4xl md:text-5xl font-bold font-headline text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-cyan-400 to-fuchsia-400 animate-gradient-x"
                                        >
                                            {activeDashboard?.name ?? "Dashboards"}
                                        </motion.h1>
                                    </AnimatePresence>

                                    {/* Texto y botones bajo el título eliminados por petición:
                                        la cabecera queda limpia (solo el título). Las acciones
                                        (editar, pantalla completa, forjar, restablecer) viven en
                                        la barra lateral de ajustes. */}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>



                    {/* Workspace Window Manager — se ajusta automáticamente al límite de
                        cada pantalla. En pantalla completa usa la altura dinámica del
                        viewport (100dvh) para que el área inferior llegue exactamente al
                        borde; fuera de ella deja espacio para la cabecera. */}
                    <div className={cn(
                        "flex flex-col transition-all duration-500 pb-0",
                        isFullscreen
                            ? "h-[100dvh] min-h-[100dvh]"
                            : "flex-1 flex-grow min-h-[calc(100dvh-40px)]"
                    )}>
                        <WorkspaceProvider initialDashboards={dashboards.map(d => d.id)}>
                            <DashboardWorkspaceRenderer
                                dashboards={dashboards}
                                isEditMode={isEditMode}
                                setWidgets={setWidgets}
                                widgetsMap={(() => {
                                    // Cada dashboard muestra SUS widgets: los del activo vienen del
                                    // estado en vivo; los demás se leen de almacenamiento para que
                                    // todas las pestañas aparezcan ya acomodadas por defecto.
                                    const all = loadAllWidgets();
                                    const map: Record<string, DashboardWidget[]> = {};
                                    for (const d of dashboards) {
                                        map[d.id] = (activeDashboardId && d.id === activeDashboardId)
                                            ? widgets
                                            : (all[d.id] || []);
                                    }
                                    return map;
                                })()}
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
                                onDeleteDashboard={handleDeleteDashboard}
                                onRenameDashboard={handleOpenRename}
                                onCreateFromTemplate={handleCreateDashboardFromTemplate}
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

                    {/* Rename Dashboard Dialog (activa la opción "Renombrar Dashboard") */}
                    <Dialog open={!!renameTargetId} onOpenChange={(o) => { if (!o) { setRenameTargetId(null); setRenameValue(""); } }}>
                        <DialogContent className="w-[90vw] max-w-[440px] p-6">
                            <DialogHeader>
                                <DialogTitle className="text-xl font-bold">Renombrar dashboard</DialogTitle>
                                <DialogDescription className="text-sm">
                                    Elige un nombre claro para identificar este tablero.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="py-4">
                                <Label htmlFor="rename" className="text-xs font-semibold text-muted-foreground">Nombre</Label>
                                <Input
                                    id="rename"
                                    value={renameValue}
                                    onChange={(e) => setRenameValue(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") handleRenameDashboard(); }}
                                    className="mt-2 h-11"
                                    placeholder="Ej. Estudio Profundo"
                                    autoFocus
                                />
                            </div>
                            <DialogFooter className="gap-2 sm:justify-end">
                                <Button variant="ghost" onClick={() => { setRenameTargetId(null); setRenameValue(""); }}>Cancelar</Button>
                                <Button onClick={handleRenameDashboard} disabled={!renameValue.trim()} className="min-w-[120px]">Guardar</Button>
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

// --- Header quick-action pill button ---
interface HeaderActionProps {
    icon: React.ReactNode;
    label: string;
    tone: "neutral" | "cyan" | "emerald" | "indigo";
    active?: boolean;
    onClick: () => void;
}

function HeaderAction({ icon, label, tone, active, onClick }: HeaderActionProps) {
    const tones = {
        neutral: "border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/10 hover:text-white",
        cyan: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20 hover:shadow-[0_0_18px_rgba(34,211,238,0.3)]",
        emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 hover:shadow-[0_0_18px_rgba(16,185,129,0.3)]",
        indigo: "border-indigo-500/30 bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/20 hover:shadow-[0_0_18px_rgba(99,102,241,0.35)]",
    } as const;

    return (
        <button
            onClick={onClick}
            className={cn(
                "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border backdrop-blur-md text-xs font-medium transition-all duration-200 cursor-pointer active:scale-95",
                tones[tone],
                active && "ring-1 ring-emerald-400/40 scale-[1.03]"
            )}
        >
            {icon}
            {label}
        </button>
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

'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Dashboard, DashboardWidget, WidgetType } from "./dashboard-types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Search, Cpu, Wifi } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { WidgetForgeDialog } from "./widget-forge/widget-forge-dialog";
import { WeatherLocationProvider } from "@/modules/weather/context/weather-location-context";
import { DEFAULT_DASHBOARD_TEMPLATES, ALL_DASHBOARD_TEMPLATES, type DefaultDashboardTemplate } from "./dashboard-defaults";
import { getCategoryById } from "./widget-categories";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { motion, AnimatePresence } from "framer-motion";
import { useUserContext } from "@/context/user-context";
import { useAccount } from "@/context/account-context";
import { useAppearance } from "@/context/appearance-context";
import { curatedPresets } from "@/lib/themes/curated-presets";

import { WorkspaceProvider } from "./dashboard-workspace-context";
import { DashboardWorkspaceRenderer } from "./dashboard-workspace-renderer";
// Permisos universales (Adenda 63 §5): opción "Compartir" del menú del tablero.
import { ShareAccessDialog } from "@/components/sharing/share-access-dialog";

// ── Dispositivos y sincronización (pantalla principal adaptativa) ──
import type { DeviceType } from "./dashboard-types";
import {
    DEVICE_TYPES,
    detectCurrentDeviceType,
    loadDevices,
    loadSyncOptions,
    saveSyncOptions,
    type UserDevice,
    type DeviceSyncOptions,
} from "./dashboard-devices";

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

// ── Editor superior (2026-09-28): el editor que se desplegaba desde la IZQUIERDA vive ahora
// ARRIBA, acoplado bajo la barra de pestañas de los dashboards. Ver editor-superior/. ──
import { EditorSuperior } from "./editor-superior/editor-superior";
import type { AccionesEditor, AspectoPestana, DashboardConAspecto, EstiloBarra, GrupoEditor, OpcionesAnadir, TallaEditor } from "./editor-superior/tipos";
import { GRUPOS_EDITOR } from "./editor-superior/tipos";
import { dimsTalla, TALLAS_EDITOR } from "./editor-superior/tallas";
import { colocarEmpujando, mejorHueco } from "./editor-superior/acomodo";
import {
    deshacer as deshacerHistorial,
    historialVacio,
    registrar as registrarHistorial,
    rehacer as rehacerHistorial,
    type Historial,
} from "./editor-superior/historial";
import type { PropsSistema } from "./editor-superior/panel-sistema";
import { ADD_WIDGET_SIZE_HINT_EVENT, type AddWidgetSizeHintDetail } from "./dashboard-size";
import { getManifest } from "./widget-manifest";

// ── LocalStorage Keys ────────────────────────────────────────────
const LS_DASHBOARDS = 'starseed_dashboards';
const LS_WIDGETS = 'starseed_widgets';
const LS_ORDER = 'dashboard_order';
const LS_INITIALIZED = 'starseed_dashboards_initialized';
// Versión del catálogo de dashboards predeterminados. Súbela cada vez que cambie
// el acomodo/los widgets por defecto para que las instalaciones existentes
// re-siembren los tableros predeterminados (preservando los tableros propios).
// REGLA DE MIGRACIÓN (patrón idéntico al dock, ver layout/dock-config.ts): al
// montar, se compara `storedVersion` (localStorage) contra esta constante. Si
// difieren, `reseedDefaultDashboards()` regenera SOLO los tableros cuya
// `category` coincide con una plantilla predeterminada actual (fresco, con el
// acomodo más reciente) y conserva intactos, al final de la lista, los
// tableros del usuario (categoría ajena al catálogo). Es idempotente: una vez
// igualada la versión, no vuelve a re-sembrar hasta el próximo bump. La
// versión viaja también con la cuenta (SYNCED_KEYS en lib/settings-sync.ts +
// el blob de lib/dashboard/dashboard-sync.ts) para que un dispositivo nuevo
// no dispare una re-siembra local espuria si la cuenta ya migró.
//
// gen11 (2026-07-11): cabecera con saludo + acciones (añadir widget/
// plantillas/editar), sistema de tallas S/M/L/XL (dashboard-size.ts) y
// composiciones predeterminadas rediseñadas para "Inicio", "Red", "Sistema"
// y el nuevo "Creativo" (promovido desde plantillas futuras).
const LS_DEFAULTS_VERSION = 'starseed_defaults_version';
const DEFAULTS_VERSION = 'gen11-2026-07-11-cabecera-plantillas-tamanos';
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

// Preferencias del editor superior en ESTE navegador (cuadrícula visible). El estilo de la barra
// sigue en la clave de la antigua barra lateral (`theme`) para no perder la elección guardada.
const LS_EDITOR = 'starseed.dashboard.editor.v1';
const LS_BARRA = 'starseed_sidebar_config_v1';
const ESTILOS_BARRA: readonly EstiloBarra[] = ['liquid-crystal', 'cyber-neon', 'aurora-minimal'];

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

// Siembra los DashboardWidget[] de un dashboard a partir de una plantilla
// (DefaultDashboardTemplate). Único punto que traduce `template.widgets` →
// `DashboardWidget`: lo usan generateDefaultDashboards, handleCreateDashboard,
// handleCreateDashboardFromTemplate y handleApplyTemplateToCurrentDashboard,
// así el campo `size` (S/M/L/XL) siempre viaja igual y no se duplica la lógica.
function seedWidgetsFromTemplate(
    template: Pick<DefaultDashboardTemplate, "widgets">,
    dashboardId: string,
    now: string = new Date().toISOString(),
): DashboardWidget[] {
    return template.widgets.map((w) => ({
        id: crypto.randomUUID(),
        dashboard_id: dashboardId,
        widget_type: w.type as any,
        layout: { x: w.x, y: w.y, w: w.w, h: w.h, i: crypto.randomUUID() },
        settings: (w as any).settings ?? {},
        size: (w as any).size,
        created_at: now,
    }));
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

        widgetMap[dashId] = seedWidgetsFromTemplate(template, dashId, now);
    }

    return { dashboards, widgetMap };
}

// (2026-09-28) Completa los tableros PREDETERMINADOS que falten (Política, Educación, Clima…),
// sin tocar los que existen ni los que la persona borró a propósito. Antes solo se sembraban en
// el primer arranque o al cambiar DEFAULTS_VERSION: una cuenta cuyo blob remoto (dashboard_state)
// nació con menos tableros no veía nunca las pestañas temáticas. Devuelve true si añadió alguno.
const LS_RETIRADOS = 'starseed_dashboards_retirados';
function leerRetirados(): Set<string> {
    try { const v = JSON.parse(localStorage.getItem(LS_RETIRADOS) || '[]'); return new Set(Array.isArray(v) ? v : []); } catch { return new Set(); }
}
function retirarPredeterminado(categoria: string | null | undefined) {
    if (!categoria || !DEFAULT_DASHBOARD_TEMPLATES.some((t) => t.categoryId === categoria)) return;
    const r = leerRetirados(); r.add(categoria);
    try { localStorage.setItem(LS_RETIRADOS, JSON.stringify([...r])); } catch { /* sin almacén */ }
}
function completarPredeterminados(): boolean {
    const stored = loadDashboards();
    if (stored.length === 0) return false;
    const presentes = new Set(stored.map((d) => d.category).filter(Boolean));
    const retirados = leerRetirados();
    const faltan = DEFAULT_DASHBOARD_TEMPLATES.filter((t) => !presentes.has(t.categoryId) && !retirados.has(t.categoryId));
    if (faltan.length === 0) return false;
    const now = new Date().toISOString();
    const widgets = loadAllWidgets();
    const nuevos: Dashboard[] = faltan.map((t) => {
        const id = crypto.randomUUID();
        widgets[id] = seedWidgetsFromTemplate(t, id, now);
        return { id, profile_id: 'local', name: t.name, is_default: false, category: t.categoryId, created_at: now, updated_at: now };
    });
    saveDashboards([...stored, ...nuevos]);
    saveAllWidgets(widgets);
    return true;
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
    // Espejo en ref del título visible (lo lee el manejador de scroll sin
    // re-suscribirse) + raíz del layout para localizar el scroll-parent real.
    const titleVisibleRef = useRef(true);
    const layoutRootRef = useRef<HTMLDivElement>(null);

    // Sello de build OCULTO por defecto (chrome limpio). Solo emerge como
    // herramienta de diagnóstico cuando localStorage 'starseed.debug' === '1'.
    const [showBuildBadge, setShowBuildBadge] = useState(false);
    useEffect(() => {
        try { setShowBuildBadge(localStorage.getItem("starseed.debug") === "1"); } catch { /* noop */ }
    }, []);

    // --- Editor superior (2026-09-28) ---
    // Grupo abierto del editor (Widgets · Acomodo · Pestaña · Apariencia · Plantillas · Sistema).
    const [grupoEditor, setGrupoEditor] = useState<GrupoEditor | null>(null);
    const [cuadricula, setCuadricula] = useState(false);
    const [estiloBarra, setEstiloBarra] = useState<EstiloBarra>('liquid-crystal');
    // Pedido de enfocar un tablero en el panel del editor (tras crearlo o duplicarlo).
    const [solicitudFoco, setSolicitudFoco] = useState<{ id: string; n: number } | null>(null);
    // Contadores de re-render: widgets guardados de otros tableros e historial de deshacer.
    const [versionWidgets, setVersionWidgets] = useState(0);
    const [, setVersionHistorial] = useState(0);
    const historialesRef = useRef(new Map<string, Historial<DashboardWidget[]>>());
    // Pista de tamaño del selector clásico (evento ADD_WIDGET_SIZE_HINT_EVENT, antes sin oyente).
    const pistaTallaRef = useRef<{ type: WidgetType; size: TallaEditor; at: number } | null>(null);

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

    // Temas curados aplicados recientemente (filtro «Recientes» del panel Apariencia).
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
    // Compartir dashboard (opción "Compartir" del menú de panel — permisos universales).
    const [shareDashboardId, setShareDashboardId] = useState<string | null>(null);

    // ── Diálogo "Plantillas" (cabecera): aplicar una composición al tablero
    // activo. Paso 1 elige la plantilla; paso 2 (pendingApplyTemplate) confirma
    // porque reemplaza los widgets actuales del tablero — acción destructiva.
    const [isTemplatesDialogOpen, setIsTemplatesDialogOpen] = useState(false);
    const [templatesDialogSearch, setTemplatesDialogSearch] = useState("");
    const [pendingApplyTemplate, setPendingApplyTemplate] = useState<string | null>(null);

    // ── Dispositivos y sincronización (pantalla principal adaptativa) ──
    // currentDevice: tipo detectado del entorno (resalta tableros afines y permite
    // filtrar/adaptar). devices/syncOpts: estado del gestor (localStorage, aditivo).
    const [currentDevice, setCurrentDevice] = useState<DeviceType>("desktop");
    const [devices, setDevices] = useState<UserDevice[]>([]);
    const [syncOpts, setSyncOpts] = useState<DeviceSyncOptions>(loadSyncOptions());
    const [isDeviceManagerOpen, setIsDeviceManagerOpen] = useState(false);

    const { toast } = useToast();
    const confirm = useConfirm();

    // ── Re-hidratación desde localStorage (fuente de verdad local) ──────────────
    // Relee la lista de tableros y los widgets del tablero activo desde
    // localStorage. Se reutiliza tanto para la sincronización entre pestañas
    // (BroadcastChannel / storage) como para la sincronización ENTRE DISPOSITIVOS
    // (Supabase realtime, tras volcar el blob remoto a localStorage).
    const rehydrateFromLocal = useCallback(() => {
        completarPredeterminados();
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

        // Estilo de la barra del editor (heredado del «Diseño estético» de la antigua barra
        // lateral) y cuadrícula visible: preferencias de este navegador.
        try {
            const raw = localStorage.getItem(LS_BARRA);
            const tema = raw ? JSON.parse(raw)?.theme : null;
            if (ESTILOS_BARRA.includes(tema)) setEstiloBarra(tema);
        } catch { /* sin almacén */ }
        try {
            const ed = JSON.parse(localStorage.getItem(LS_EDITOR) || '{}');
            if (typeof ed?.cuadricula === 'boolean') setCuadricula(ed.cuadricula);
        } catch { /* sin almacén */ }
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
            // Fusiona (en vez de sobrescribir) los tableros/widgets creados FUERA
            // del dashboard antes de la primera visita — p. ej. widgets forjados
            // desde la Fragua global (GlobalForgeHost) en cualquier otra ruta.
            const preexisting = loadDashboards();
            const preexistingWidgets = loadAllWidgets();
            const merged = [...defaults, ...preexisting];
            const mergedWidgets = { ...preexistingWidgets, ...widgetMap };
            saveDashboards(merged);
            saveAllWidgets(mergedWidgets);
            localStorage.setItem(LS_INITIALIZED, 'true');
            localStorage.setItem(LS_DEFAULTS_VERSION, DEFAULTS_VERSION);

            const sorted = sortDashboards(merged);
            setDashboards(sorted);
            if (sorted.length > 0) {
                setActiveDashboardId(sorted[0].id);
                setWidgets(mergedWidgets[sorted[0].id] || []);
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

            completarPredeterminados();
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
                const { data: sub } = supabase.auth.onAuthStateChange(
                    // Tipos explícitos: el cliente llega sin genéricos (import dinámico)
                    // y los parámetros quedarían en `any` implícito bajo strict.
                    (_e: unknown, session: { user?: { id?: string } } | null) => {
                        setSyncUid(session?.user?.id ?? undefined);
                    }
                );
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

    // Auto-hide title on scroll — versión ESTABLE (bug "glitcheo en loop", 2026-07-12).
    // ANTES: umbral único (scrollY<60) sin histéresis sobre `window`. El título
    // (~180px, EN FLUJO, animado con AnimatePresence height) al ocultarse encoge
    // el contenido desplazable; el re-anclaje/recorte del navegador devolvía la
    // posición bajo el umbral → mostrar → crecer → volver a cruzar → ocultar…
    // bucle infinito de montar/desmontar el bloque (sus animaciones de entrada
    // "se reiniciaban en loop"). Además `window` NO es el contenedor que
    // scrollea bajo (main) (`main.os-main-scroll`). AHORA:
    //  1. Se escucha el scroll-parent REAL (primer ancestro con overflow-y
    //     auto/scroll; fallback window).
    //  2. rAF-throttle (una decisión por frame).
    //  3. Histéresis amplia: ocultar >280px / mostrar <48px. El hueco (232px)
    //     supera el alto colapsable (~180px título + ~28px carril top/bottom),
    //     de modo que ni el re-anclaje ni el recorte pueden re-cruzar el umbral
    //     contrario.
    //  4. Guarda de recorrido: solo se oculta si tras colapsar aún queda pista
    //     de sobra (el estado converge SIEMPRE; cero bucles).
    useEffect(() => {
        if (typeof window === "undefined") return;
        const COLLAPSE_PX = 220; // título (~180px) + padding del carril top/bottom
        const HIDE_AT = 280;
        const SHOW_AT = 48;

        const findScrollParent = (node: HTMLElement | null): HTMLElement | Window => {
            let cur: HTMLElement | null = node?.parentElement ?? null;
            while (cur) {
                try {
                    const oy = window.getComputedStyle(cur).overflowY;
                    if (oy === "auto" || oy === "scroll" || oy === "overlay") return cur;
                } catch { /* defensivo */ }
                cur = cur.parentElement;
            }
            return window;
        };
        const target = findScrollParent(layoutRootRef.current);
        const read = () => target instanceof Window
            ? {
                y: window.scrollY,
                max: (document.documentElement?.scrollHeight ?? 0) - window.innerHeight,
            }
            : { y: target.scrollTop, max: target.scrollHeight - target.clientHeight };

        let raf: number | null = null;
        const handleScroll = () => {
            if (raf !== null) return;
            raf = requestAnimationFrame(() => {
                raf = null;
                const { y, max } = read();
                const visible = titleVisibleRef.current;
                const next = visible
                    // Ocultar solo con histéresis + pista suficiente tras colapsar.
                    ? !(y > HIDE_AT && max - COLLAPSE_PX >= SHOW_AT + 48)
                    : y < SHOW_AT;
                if (next !== visible) {
                    titleVisibleRef.current = next;
                    setIsTitleVisible(next);
                }
            });
        };
        target.addEventListener("scroll", handleScroll, { passive: true });
        return () => {
            target.removeEventListener("scroll", handleScroll);
            if (raf !== null) cancelAnimationFrame(raf);
        };
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
    const handleResetLayout = async () => {
        if (!(await confirm({
            title: "Restablecer tableros",
            description: "¿Restablecer los tableros predeterminados al acomodo más reciente? Tus tableros personalizados se conservan.",
            destructive: true,
        }))) return;
        const { dashboards: merged, widgetMap } = reseedDefaultDashboards();
        const sorted = sortDashboards(merged);
        setDashboards(sorted);
        if (sorted.length > 0) {
            setActiveDashboardId(sorted[0].id);
            setWidgets(widgetMap[sorted[0].id] || []);
        }
        toast({ title: "Tableros restablecidos", description: "Se aplicó el acomodo predeterminado más reciente." });
    };

    // ── Widgets de un tablero: lectura, guardado e historial (editor superior) ──
    // Todo cambio de widgets pasa por aquí: se guarda en SU tablero (localStorage → difusión entre
    // pestañas → cuenta) y, salvo que se pida lo contrario, apunta la foto anterior para Deshacer.
    // Antes los cambios de la rejilla (mover, redimensionar, quitar) no se guardaban, y cambiar
    // de pestaña no cambiaba el tablero activo: «añadir widget» podía escribir en otro tablero.
    // El almacén es la fuente de verdad (se escribe SIEMPRE antes que el estado): leer de ahí
    // evita el instante en que el tablero activo ya cambió y `widgets` aún es el anterior.
    const widgetsDe = useCallback(
        (id: string): DashboardWidget[] => loadWidgetsForDashboard(id),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [widgets, versionWidgets],
    );

    const guardarWidgetsDe = useCallback((id: string, next: DashboardWidget[]) => {
        saveWidgetsForDashboard(id, next);
        if (id === activeDashboardId) setWidgets(next);
        setVersionWidgets((v) => v + 1);
    }, [activeDashboardId]);

    const aplicarWidgets = useCallback((id: string, next: DashboardWidget[], opciones?: { registrar?: boolean }) => {
        const previos = widgetsDe(id);
        if (opciones?.registrar !== false && JSON.stringify(previos) !== JSON.stringify(next)) {
            const h = historialesRef.current.get(id) ?? historialVacio<DashboardWidget[]>();
            historialesRef.current.set(id, registrarHistorial(h, previos));
            setVersionHistorial((v) => v + 1);
        }
        guardarWidgetsDe(id, next);
    }, [widgetsDe, guardarWidgetsDe]);

    const deshacerEn = useCallback((id: string) => {
        const r = deshacerHistorial(historialesRef.current.get(id) ?? historialVacio<DashboardWidget[]>(), widgetsDe(id));
        if (!r) return;
        historialesRef.current.set(id, r.historial);
        setVersionHistorial((v) => v + 1);
        guardarWidgetsDe(id, r.valor);
    }, [widgetsDe, guardarWidgetsDe]);

    const rehacerEn = useCallback((id: string) => {
        const r = rehacerHistorial(historialesRef.current.get(id) ?? historialVacio<DashboardWidget[]>(), widgetsDe(id));
        if (!r) return;
        historialesRef.current.set(id, r.historial);
        setVersionHistorial((v) => v + 1);
        guardarWidgetsDe(id, r.valor);
    }, [widgetsDe, guardarWidgetsDe]);

    // El selector clásico avisa del tamaño elegido justo antes de añadir (antes nadie lo oía).
    useEffect(() => {
        const alPista = (e: Event) => {
            const d = (e as CustomEvent<AddWidgetSizeHintDetail>).detail;
            if (d?.type && d.size) pistaTallaRef.current = { type: d.type, size: d.size, at: Date.now() };
        };
        window.addEventListener(ADD_WIDGET_SIZE_HINT_EVENT, alPista);
        return () => window.removeEventListener(ADD_WIDGET_SIZE_HINT_EVENT, alPista);
    }, []);

    // Add Widget — con talla (micro · S · M · L · XL · panorámico · torre) y, si se soltó desde el
    // catálogo, en esa celda empujando lo que choque; si no, en el mejor hueco libre.
    const handleAddWidget = (dashboardId: string, type: WidgetType, opciones?: OpcionesAnadir) => {
        const actuales = widgetsDe(dashboardId);
        let talla: TallaEditor = opciones?.talla ?? "M";
        if (!opciones) {
            const pista = pistaTallaRef.current;
            if (pista && pista.type === type && Date.now() - pista.at < 3000) talla = pista.size;
            pistaTallaRef.current = null;
        }
        const d = dimsTalla(type, talla);
        const nuevo: DashboardWidget = {
            id: crypto.randomUUID(),
            dashboard_id: dashboardId,
            widget_type: type as any,
            layout: { x: 0, y: 0, w: d.w, h: d.h, i: crypto.randomUUID() },
            settings: {},
            size: d.size,
            created_at: new Date().toISOString(),
        };
        let updated: DashboardWidget[];
        if (opciones?.posicion) {
            const x = Math.max(0, Math.min(12 - d.w, Math.round(opciones.posicion.x)));
            const y = Math.max(0, Math.round(opciones.posicion.y));
            updated = colocarEmpujando(actuales, { ...nuevo, layout: { ...nuevo.layout, x, y } });
        } else {
            const hueco = mejorHueco(actuales, d.w, d.h);
            updated = [...actuales, { ...nuevo, layout: { ...nuevo.layout, ...hueco } }];
        }
        aplicarWidgets(dashboardId, updated);
        const nombre = getManifest(type)?.label ?? type.replace(/_/g, " ").toLowerCase();
        const etiquetaTalla = TALLAS_EDITOR.find((t) => t.id === talla)?.etiqueta ?? talla;
        toast({ title: "Widget añadido", description: `${nombre} · ${etiquetaTalla}. Puedes deshacerlo desde el editor.` });
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
        const actuales = widgetsDe(activeDashboardId);
        const hueco = mejorHueco(actuales, 6, 5);

        const newWidget: DashboardWidget = {
            id: crypto.randomUUID(),
            dashboard_id: activeDashboardId,
            widget_type: 'AI_GENERATED',
            layout: { x: hueco.x, y: hueco.y, w: 6, h: 5, i: crypto.randomUUID() },
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

        aplicarWidgets(activeDashboardId, [...actuales, newWidget]);
        toast({ title: "Widget forjado", description: `"${widgetData.ontology.title}" añadido al dashboard.` });
    }, [activeDashboardId, widgetsDe, aplicarWidgets, toast]);

    // Pide al espacio de trabajo que enfoque un tablero (recién creado, duplicado…).
    const pedirFoco = useCallback((id: string) => {
        setSolicitudFoco((s) => ({ id, n: (s?.n ?? 0) + 1 }));
    }, []);

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
            const seededWidgets: DashboardWidget[] = template ? seedWidgetsFromTemplate(template, dashId, now) : [];

            const allDashboards = [...dashboards, newDashboard];
            saveDashboards(allDashboards);
            saveWidgetsForDashboard(dashId, seededWidgets);

            setDashboards(allDashboards);
            setActiveDashboardId(dashId);
            setWidgets(seededWidgets);
            pedirFoco(dashId);

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
        const seededWidgets: DashboardWidget[] = template ? seedWidgetsFromTemplate(template, dashId, now) : [];
        setDashboards((prev) => {
            const all = [...prev, newDashboard];
            saveDashboards(all);
            return all;
        });
        saveWidgetsForDashboard(dashId, seededWidgets);
        setActiveDashboardId(dashId);
        setWidgets(seededWidgets);
        pedirFoco(dashId);
        toast({ title: "Dashboard creado", description: `Astraura preparó "${newDashboard.name}".` });
    }, [toast, pedirFoco]);

    // ── Plantillas: aplicar una composición al dashboard ACTUAL ────────────────
    // Distinto de handleCreateDashboardFromTemplate (que crea una pestaña NUEVA):
    // esto REEMPLAZA los widgets del tablero activo por los de la plantilla
    // elegida. Destructivo → el llamador (diálogo "Plantillas") debe confirmar
    // primero. Conserva el id/nombre/categoría del dashboard activo.
    const handleApplyTemplateToCurrentDashboard = useCallback((categoryId: string, dashId?: string) => {
        const destino = dashId ?? activeDashboardId;
        if (!destino) return;
        const template = ALL_DASHBOARD_TEMPLATES.find((t) => t.categoryId === categoryId);
        if (!template) return;
        const now = new Date().toISOString();
        const seededWidgets = seedWidgetsFromTemplate(template, destino, now);
        // Por aplicarWidgets: queda en el historial (Deshacer devuelve los widgets de antes).
        aplicarWidgets(destino, seededWidgets);
        setDashboards((prev) => {
            const updated = prev.map((d) => d.id === destino ? { ...d, updated_at: now } : d);
            saveDashboards(updated);
            return updated;
        });
        toast({ title: "Plantilla aplicada", description: `"${template.name}" reemplazó los widgets de este tablero. Puedes deshacerlo.` });
    }, [activeDashboardId, aplicarWidgets, toast]);

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

    const handleDeleteDashboard = async (id: string) => {
        if (dashboards.length <= 1) {
            toast({ title: "Acción bloqueada", description: "No puedes eliminar el único dashboard.", variant: "destructive" });
            return;
        }

        const ok = await confirm({ title: "Eliminar dashboard", description: "¿Estás seguro de eliminar este dashboard?", destructive: true });
        if (!ok) return;

        // Si era un predeterminado, se recuerda que la persona lo quitó (no se vuelve a sembrar).
        retirarPredeterminado(dashboards.find((d) => d.id === id)?.category);
        removeWidgetsForDashboard(id);
        // Recalcula desde el estado MÁS reciente (`prev`), no desde el closure previo al
        // `await confirm(...)`: el diálogo async ya NO congela el hilo (a diferencia del
        // window.confirm nativo), así que un sync realtime/cross-tab durante el diálogo
        // pudo cambiar `dashboards`; filtrar el snapshot viejo perdería tableros (rev. A137).
        setDashboards(prev => {
            const remaining = prev.filter(d => d.id !== id);
            saveDashboards(remaining);
            if (activeDashboardId === id && remaining.length > 0) setActiveDashboardId(remaining[0].id);
            return remaining;
        });

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

    // ── Dispositivos: detección del entorno + carga del gestor (SSR-safe) ──
    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            setCurrentDevice(detectCurrentDeviceType());
            setDevices(loadDevices());
        } catch { /* degradación silenciosa */ }
        // Re-detecta al cambiar el tamaño (p. ej. rotación / ventana redimensionada).
        const onResize = () => { try { setCurrentDevice(detectCurrentDeviceType()); } catch {} };
        window.addEventListener("resize", onResize, { passive: true });
        return () => window.removeEventListener("resize", onResize);
    }, []);

    // Etiqueta un tablero por tipo(s) de dispositivo (agrupación por dispositivo).
    // Persiste en localStorage vía saveDashboards (write-through a Supabase incluido).
    const handleSetDeviceTags = useCallback((id: string, tags: DeviceType[]) => {
        const now = new Date().toISOString();
        setDashboards((prev) => {
            const updated = prev.map((d) => (d.id === id ? { ...d, deviceTags: tags, updated_at: now } : d));
            saveDashboards(updated);
            return updated;
        });
    }, []);

    // Persiste cambios en las opciones de sincronización.
    const handleUpdateSyncOpts = useCallback((patch: Partial<DeviceSyncOptions>) => {
        setSyncOpts((prev) => {
            const next = { ...prev, ...patch };
            saveSyncOptions(next);
            return next;
        });
    }, []);

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

    // (2026-09-28) Sin saludo en la cabecera: Alex pidió quitar «Buenas tardes».

    // ── Editor superior: gestión de pestañas ──────────────────────────────────
    const renombrarDashboard = useCallback((id: string, nombre: string) => {
        const name = nombre.trim();
        if (!name) return;
        const now = new Date().toISOString();
        setDashboards((prev) => {
            const updated = prev.map((d) => (d.id === id ? { ...d, name, updated_at: now } : d));
            saveDashboards(updated);
            return updated;
        });
        toast({ title: "Pestaña renombrada", description: `Ahora se llama «${name}».` });
    }, [toast]);

    // Icono y color propios de la pestaña (campos aditivos del tablero guardado).
    const aspectoDashboard = useCallback((id: string, aspecto: AspectoPestana) => {
        const now = new Date().toISOString();
        setDashboards((prev) => {
            const updated = prev.map((d) => {
                if (d.id !== id) return d;
                const siguiente: Record<string, unknown> = { ...d, ...aspecto, updated_at: now };
                for (const k of Object.keys(aspecto) as (keyof AspectoPestana)[]) {
                    if (aspecto[k] === undefined) delete siguiente[k];
                }
                return siguiente as unknown as Dashboard;
            });
            saveDashboards(updated);
            return updated;
        });
    }, []);

    const duplicarDashboard = useCallback((id: string) => {
        const original = dashboards.find((d) => d.id === id);
        if (!original) return;
        const now = new Date().toISOString();
        const nuevoId = crypto.randomUUID();
        const copia: Dashboard = { ...original, id: nuevoId, name: `${original.name} (copia)`, is_default: false, created_at: now, updated_at: now };
        const copiaWidgets = widgetsDe(id).map((w) => ({
            ...w,
            id: crypto.randomUUID(),
            dashboard_id: nuevoId,
            layout: { ...w.layout, i: crypto.randomUUID() },
            created_at: now,
        }));
        const idx = dashboards.findIndex((d) => d.id === id);
        const todos = [...dashboards.slice(0, idx + 1), copia, ...dashboards.slice(idx + 1)];
        saveWidgetsForDashboard(nuevoId, copiaWidgets);
        saveDashboards(todos);
        saveOrder(todos);
        setDashboards(todos);
        setActiveDashboardId(nuevoId);
        setWidgets(copiaWidgets);
        pedirFoco(nuevoId);
        toast({ title: "Pestaña duplicada", description: `«${copia.name}» con ${copiaWidgets.length} widget${copiaWidgets.length === 1 ? "" : "s"}.` });
    }, [dashboards, widgetsDe, pedirFoco, toast]);

    const moverDashboard = useCallback((id: string, direccion: "izquierda" | "derecha") => {
        const idx = dashboards.findIndex((d) => d.id === id);
        if (idx < 0) return;
        handleMoveDashboard(idx, direccion === "izquierda" ? "left" : "right");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dashboards]);

    // Reordenar arrastrando las pestañas de la barra (persiste el orden).
    const reordenarDashboards = useCallback((activoId: string, sobreId: string) => {
        setDashboards((prev) => {
            const desde = prev.findIndex((d) => d.id === activoId);
            const hasta = prev.findIndex((d) => d.id === sobreId);
            if (desde < 0 || hasta < 0 || desde === hasta) return prev;
            const next = [...prev];
            const [movido] = next.splice(desde, 1);
            next.splice(hasta, 0, movido);
            saveOrder(next);
            saveDashboards(next);
            return next;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Pestañas temáticas que faltan (Política, Clima…): se pueden restaurar aunque se borraran.
    const faltanTematicas = useMemo(
        () => DEFAULT_DASHBOARD_TEMPLATES.filter((t) => !dashboards.some((d) => d.category === t.categoryId)).length,
        [dashboards],
    );
    const restaurarTematicas = useCallback(() => {
        try { localStorage.removeItem(LS_RETIRADOS); } catch { /* sin almacén */ }
        const anadio = completarPredeterminados();
        rehydrateFromLocal();
        toast({
            title: anadio ? "Pestañas temáticas restauradas" : "Ya tienes todas las pestañas temáticas",
            description: anadio ? "Vuelven con su acomodo predeterminado." : undefined,
        });
    }, [rehydrateFromLocal, toast]);

    const aplicarPlantillaConfirmada = useCallback(async (dashId: string, categoryId: string) => {
        const plantilla = ALL_DASHBOARD_TEMPLATES.find((t) => t.categoryId === categoryId);
        const destino = dashboards.find((d) => d.id === dashId);
        if (!plantilla || !destino) return;
        const ok = await confirm({
            title: "Aplicar plantilla",
            description: `Los widgets de «${destino.name}» se sustituirán por los de «${plantilla.name}». Puedes volver atrás con Deshacer.`,
            confirmText: "Aplicar",
            destructive: true,
        });
        if (ok) handleApplyTemplateToCurrentDashboard(categoryId, dashId);
    }, [dashboards, confirm, handleApplyTemplateToCurrentDashboard]);

    // ── Entrar y salir del editor ──────────────────────────────────────────────
    const alternarEdicion = useCallback(() => {
        setIsEditMode((v) => !v);
        setGrupoEditor(null);
    }, []);
    const terminarEdicion = useCallback(() => {
        setIsEditMode(false);
        setGrupoEditor(null);
        toast({ title: "Cambios guardados", description: "El tablero queda como lo dejaste." });
    }, [toast]);

    // Cualquier módulo (Aurora, atajos…) puede abrir el editor en un grupo concreto:
    // window.dispatchEvent(new CustomEvent("starseed:dashboard:editar", { detail: { grupo: "widgets" } })).
    useEffect(() => {
        const alPedir = (e: Event) => {
            const d = (e as CustomEvent<{ activo?: boolean; grupo?: GrupoEditor }>).detail ?? {};
            if (d.activo === false) { setIsEditMode(false); setGrupoEditor(null); return; }
            setIsEditMode(true);
            setGrupoEditor(d.grupo && GRUPOS_EDITOR.includes(d.grupo) ? d.grupo : null);
        };
        window.addEventListener("starseed:dashboard:editar", alPedir);
        return () => window.removeEventListener("starseed:dashboard:editar", alPedir);
    }, []);

    const cambiarCuadricula = useCallback((v: boolean) => {
        setCuadricula(v);
        try {
            const previo = JSON.parse(localStorage.getItem(LS_EDITOR) || '{}');
            localStorage.setItem(LS_EDITOR, JSON.stringify({ ...previo, cuadricula: v }));
        } catch { /* sin almacén */ }
    }, []);
    const cambiarEstiloBarra = useCallback((e: EstiloBarra) => {
        setEstiloBarra(e);
        try {
            const previo = JSON.parse(localStorage.getItem(LS_BARRA) || '{}');
            localStorage.setItem(LS_BARRA, JSON.stringify({ ...previo, theme: e }));
        } catch { /* sin almacén */ }
    }, []);

    // Widgets de cada tablero para el espacio de trabajo: el activo, en vivo; los demás, del
    // almacén (se recalcula al guardar cualquiera de ellos).
    const widgetsMap = useMemo(() => {
        const all = loadAllWidgets();
        const map: Record<string, DashboardWidget[]> = {};
        for (const d of dashboards) map[d.id] = all[d.id] || [];
        return map;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dashboards, widgets, activeDashboardId, versionWidgets]);

    // El panel que aloja el editor avisa de su tablero activo: el tablero activo del layout lo
    // sigue (así «añadir», plantillas y deshacer actúan sobre la pestaña que se ve).
    const activoRef = useRef(activeDashboardId);
    activoRef.current = activeDashboardId;
    const alCambiarDashboardActivo = useCallback((id: string) => {
        if (activoRef.current === id) return;
        // A la vez (mismo render): el tablero activo y SUS widgets.
        setWidgets(loadWidgetsForDashboard(id));
        setActiveDashboardId(id);
    }, []);

    // Estado de «Sistema» (lo que abría la barra lateral): mismo estado y mismas acciones.
    const sistema: PropsSistema = {
        perfiles: profiles,
        perfilActivoId: activeProfile?.id ?? null,
        onPerfil: (id) => { const p = profiles.find((x) => x.id === id); if (p) handleProfileChange(p); },
        memoria: memory,
        onRasgo: () => {
            addMemory("trait", "Foco visual avanzado", 0.8, "ui:manual-trigger");
            toast({ title: "Rasgo añadido", description: "Se guardó un rasgo cognitivo en tu memoria local." });
        },
        proveedorIa: aiProvider,
        onProveedorIa: (p) => { setAiProvider(p); try { localStorage.setItem(LS_AI_PROVIDER, p); } catch { /* sin almacén */ } },
        temperatura: aiTemperature[0] ?? 0.7,
        onTemperatura: (t) => setAiTemperature([t]),
        agente: aiAgent,
        onAgente: setAiAgent,
        servicios: services,
        onServicio: (k, v) => setServices((prev) => ({ ...prev, [k]: v })),
        servidores: selectedServers,
        onServidor: handleServerToggle,
        vpn: vpnEnabled,
        onVpn: setVpnEnabled,
        tor: torPrivacy,
        onTor: setTorPrivacy,
        zkp: zkpSecurity,
        onZkp: setZkpSecurity,
        sincronizando: isSyncing,
        progreso: syncProgress,
        onSincronizar: handleSync,
        onUbicacion: () => window.dispatchEvent(new CustomEvent('starseed:open-location')),
    };

    // Acciones del editor sobre UNA pestaña (la activa del panel que lo aloja).
    const accionesEditor = (dashId: string): AccionesEditor => ({
        onAnadirWidget: (type, opciones) => handleAddWidget(dashId, type, opciones),
        onForjar: () => setIsForgeOpen(true),
        onCrearDesdePlantilla: (categoryId, nombre) => handleCreateDashboardFromTemplate(categoryId, nombre),
        onCambiarWidgets: (ws) => aplicarWidgets(dashId, ws),
        onRestablecerPredeterminados: () => { void handleResetLayout(); },
        onRenombrar: renombrarDashboard,
        onAspecto: aspectoDashboard,
        onDuplicar: duplicarDashboard,
        onMover: moverDashboard,
        onEliminar: (id) => { void handleDeleteDashboard(id); },
        onPrincipal: handleSetDefault,
        onNuevaPestana: () => setIsCreateDialogOpen(true),
        onCompartir: (id) => setShareDashboardId(id),
        onDispositivos: handleSetDeviceTags,
        onGestorDispositivos: () => setIsDeviceManagerOpen(true),
        onRestaurarTematicas: restaurarTematicas,
        onAplicarPlantilla: (categoryId) => { void aplicarPlantillaConfirmada(dashId, categoryId); },
        onDeshacer: () => deshacerEn(dashId),
        onRehacer: () => rehacerEn(dashId),
        onListo: terminarEdicion,
    });

    const renderEditor = ({ dashboardId }: { panelId: string; dashboardId: string }) => {
        const dash = dashboards.find((d) => d.id === dashboardId) as DashboardConAspecto | undefined;
        if (!dash) return null;
        const h = historialesRef.current.get(dashboardId);
        return (
            <EditorSuperior
                dashboard={dash}
                dashboards={dashboards as DashboardConAspecto[]}
                widgets={widgetsDe(dashboardId)}
                grupo={grupoEditor}
                onGrupo={setGrupoEditor}
                acciones={accionesEditor(dashboardId)}
                puedeDeshacer={(h?.pasado.length ?? 0) > 0}
                puedeRehacer={(h?.futuro.length ?? 0) > 0}
                cuadricula={cuadricula}
                onCuadricula={cambiarCuadricula}
                estiloBarra={estiloBarra}
                onEstiloBarra={cambiarEstiloBarra}
                pantallaCompleta={isFullscreen}
                onPantallaCompleta={setIsFullscreen}
                faltanTematicas={faltanTematicas}
                currentDevice={currentDevice}
                temasRecientes={recentThemes}
                onAplicarTema={applyTheme}
                sistema={sistema}
            />
        );
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
            {/* Sello de versión: SOLO en modo depuración (localStorage starseed.debug=1).
                En uso normal el fondo queda limpio, sin rótulos técnicos. */}
            {showBuildBadge && (
                <div data-build="STARSEED_BUILD_BADGE" className="fixed bottom-1 left-1 z-[95] pointer-events-none select-none text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/45 text-white/55 backdrop-blur-sm">
                    build · 2026-06-14 · likes-comentarios+areas3 v18
                </div>
            )}
            <div ref={layoutRootRef} className={cn(
                "relative flex flex-row w-full select-none min-h-screen transition-all duration-500",
                // (2026-09-28) Sin barra lateral: el editor vive bajo las pestañas, así que el
                // contenido ya no reserva carril a la izquierda.
                isFullscreen ? "gap-0 p-0" : "gap-3 p-2"
            )}>
                
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
                                        el editor superior, bajo la barra de pestañas. */}
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
                                // Cada dashboard muestra SUS widgets: los del activo vienen del
                                // estado en vivo; los demás, del almacén (ya acomodados).
                                widgetsMap={widgetsMap}
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
                                onShareDashboard={(id) => setShareDashboardId(id)}
                                onCreateFromTemplate={handleCreateDashboardFromTemplate}
                                currentDevice={currentDevice}
                                onSetDeviceTags={handleSetDeviceTags}
                                onOpenDeviceManager={() => setIsDeviceManagerOpen(true)}
                                // ── Editor superior ──
                                renderEditor={renderEditor}
                                onCambiarWidgetsDashboard={aplicarWidgets}
                                onDashboardActivo={alCambiarDashboardActivo}
                                solicitudFoco={solicitudFoco}
                                onAlternarEdicion={alternarEdicion}
                                onReordenar={reordenarDashboards}
                                cuadricula={cuadricula}
                                onSoltarCatalogo={(dashId, type, talla, posicion) => handleAddWidget(dashId, type, { talla, posicion })}
                                onAbrirCatalogo={() => setGrupoEditor("widgets")}
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

                    {/* Compartir dashboard (opción "Compartir" del menú de panel — modelo universal §5) */}
                    {shareDashboardId && (() => {
                        const shareDash = dashboards.find((d) => d.id === shareDashboardId);
                        if (!shareDash) return null;
                        return (
                            <ShareAccessDialog
                                open
                                onOpenChange={(o) => { if (!o) setShareDashboardId(null); }}
                                resource={{ type: "dashboard", id: shareDash.id, title: shareDash.name }}
                                makeSpaceDoc={() => ({
                                    dashboard: shareDash,
                                    widgets: widgets.filter((w) => w.dashboard_id === shareDash.id),
                                })}
                                buildLink={(spaceId) =>
                                    spaceId && typeof window !== "undefined"
                                        ? `${window.location.origin}/dashboard?space=${encodeURIComponent(spaceId)}`
                                        : null
                                }
                            />
                        );
                    })()}

                    {/* Device & Sync Manager Dialog (agrupación por dispositivo + sync) */}
                    <Dialog open={isDeviceManagerOpen} onOpenChange={setIsDeviceManagerOpen}>
                        <DialogContent className="w-[92vw] max-w-[560px] max-h-[85vh] overflow-y-auto custom-scrollbar p-6">
                            <DialogHeader>
                                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                                    <Wifi className="w-5 h-5 text-emerald-400" />
                                    Dispositivos y sincronización
                                </DialogTitle>
                                <DialogDescription className="text-sm">
                                    Adapta la pantalla principal a cada dispositivo y mantén todo en sincronía entre tus equipos, cerebros y servidores.
                                </DialogDescription>
                            </DialogHeader>

                            {/* Dispositivo actual detectado */}
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 flex items-center gap-3">
                                {(() => {
                                    const def = DEVICE_TYPES.find(d => d.id === currentDevice);
                                    const Icon = def?.icon ?? Cpu;
                                    return (
                                        <>
                                            <div className="grid place-items-center size-10 rounded-xl border border-white/15" style={{ background: `color-mix(in srgb, ${def?.accent ?? '#22D3EE'} 18%, transparent)`, color: def?.accent ?? '#22D3EE' }}>
                                                <Icon className="w-5 h-5" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-xs uppercase tracking-wider text-white/40 font-mono">Dispositivo actual</div>
                                                <div className="text-sm font-semibold text-white/90">{def?.label ?? "Escritorio"}</div>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>

                            {/* Dispositivos asociados (cuenta / cerebros / servidores) */}
                            <div className="space-y-2">
                                <Label className="text-[10px] text-white/50 uppercase tracking-wider font-mono">Dispositivos asociados</Label>
                                <div className="space-y-1.5 max-h-[160px] overflow-y-auto custom-scrollbar pr-1">
                                    {devices.length === 0 ? (
                                        <p className="text-xs text-white/40 py-2">Sin dispositivos aún. Se detectará automáticamente este equipo; conecta cerebros o servidores para añadir más.</p>
                                    ) : devices.map((dev) => {
                                        const def = DEVICE_TYPES.find(d => d.id === dev.type);
                                        const Icon = def?.icon ?? Cpu;
                                        return (
                                            <div key={dev.id} className="flex items-center gap-2.5 rounded-xl border border-white/5 bg-white/[0.02] px-2.5 py-2">
                                                <Icon className="w-4 h-4 shrink-0" style={{ color: def?.accent ?? '#94a3b8' }} />
                                                <span className="text-xs text-white/80 flex-1 truncate">{dev.name}</span>
                                                <span className="text-[9px] uppercase tracking-wider text-white/35 font-mono">{def?.label ?? dev.type}</span>
                                                <span className={cn("size-2 rounded-full shrink-0", dev.online ? "bg-emerald-400" : "bg-white/20")} title={dev.online ? "En línea" : "Fuera de línea"} />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Opciones de sincronización (automáticas + configurables) */}
                            <div className="space-y-2">
                                <Label className="text-[10px] text-white/50 uppercase tracking-wider font-mono">Sincronización</Label>
                                <div className="space-y-1.5">
                                    {([
                                        { key: "auto", label: "Sincronización automática", desc: "Mantén tus dispositivos al día sin intervención." },
                                        { key: "dashboards", label: "Sincronizar tableros", desc: "Paneles y pestañas entre dispositivos." },
                                        { key: "widgets", label: "Sincronizar widgets", desc: "Disposición y ajustes de cada widget." },
                                        { key: "appearance", label: "Sincronizar apariencia", desc: "Tema y estilo visual." },
                                        { key: "adaptToDevice", label: "Adaptar al dispositivo", desc: "Muestra el tablero afín al equipo actual." },
                                        { key: "preferBrains", label: "Preferir cerebros/servidores", desc: "Usa tus cerebros como fuente del estado." },
                                    ] as const).map((opt) => (
                                        <div key={opt.key} className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                                            <div className="min-w-0">
                                                <div className="text-xs font-medium text-white/85">{opt.label}</div>
                                                <div className="text-[10px] text-white/40">{opt.desc}</div>
                                            </div>
                                            <Switch
                                                checked={syncOpts[opt.key]}
                                                onCheckedChange={(v) => handleUpdateSyncOpts({ [opt.key]: v } as Partial<DeviceSyncOptions>)}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <DialogFooter className="mt-2">
                                <Button onClick={() => setIsDeviceManagerOpen(false)} className="min-w-[120px]">Listo</Button>
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

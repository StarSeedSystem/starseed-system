"use client";

// src/components/creation/global-forge-host.tsx
// ─────────────────────────────────────────────────────────────────────────────
// FRAGUA GLOBAL — host universal de la Fragua de Widgets (SOP §2, Adenda 63).
//
// Antes, el evento 'starseed:open-forge' (cortina Trinity "Centro de Creación",
// botón de la Fragua en /crear, Aurora…) SOLO lo escuchaba el Dashboard
// (src/components/dashboard/dashboard-layout.tsx): fuera de /dashboard la
// Fragua no abría. Este host vive en el layout RAÍZ y abre la MISMA
// WidgetForgeDialog en cualquier ruta.
//
// Persistencia: EXACTAMENTE el mismo mecanismo que el dashboard —
//   · localStorage 'starseed_widgets' (mapa { dashboardId: DashboardWidget[] })
//     y 'starseed_dashboards' (lista de tableros), mismas claves y shape.
//   · Widget nuevo: widget_type 'AI_GENERATED', layout { x:0, y:max, w:6, h:5 },
//     settings { customHtml, ontology, widgetConfig, forgePrompt, selectedLayout }.
//   · Difusión BroadcastChannel('starseed-dashboard') → otras pestañas con el
//     dashboard abierto se re-hidratan en vivo.
//   · Write-through a Supabase (dashboard_state) vía dashboard-sync, igual que
//     el propio dashboard (best-effort, sin sesión es no-op).
//
// Anti doble apertura: en las rutas donde DashboardLayout monta su PROPIO
// listener (/dashboard y /qa-dock) este host NO abre — el dashboard conserva
// su comportamiento actual intacto.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { WidgetForgeDialog } from "@/components/dashboard/widget-forge/widget-forge-dialog";
import type { ForgeWidgetResult } from "@/components/dashboard/widget-forge/widget-forge-types";
import type { Dashboard, DashboardWidget } from "@/components/dashboard/dashboard-types";
import { collectLocal, saveRemoteDashboardState } from "@/lib/dashboard/dashboard-sync";
import { useToast } from "@/components/ui/use-toast";

// Mismas claves de localStorage que dashboard-layout.tsx (fuente de verdad local).
const LS_DASHBOARDS = "starseed_dashboards";
const LS_WIDGETS = "starseed_widgets";
const LS_ORDER = "dashboard_order";

// Rutas donde DashboardLayout está montado con su propio listener de la Fragua.
const DASHBOARD_ROUTES = ["/dashboard", "/qa-dock"];

// ── Difusión entre pestañas (mismo canal/mensaje que dashboard-layout) ──
let __channel: BroadcastChannel | null = null;
function broadcastDashboardChange(scope: "dashboards" | "widgets") {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
    try {
        if (!__channel) __channel = new BroadcastChannel("starseed-dashboard");
        __channel.postMessage({ type: "data:changed", scope, at: Date.now() });
    } catch {
        /* best-effort */
    }
}

// ── Lectura/escritura defensiva de las claves del dashboard ──
function loadDashboards(): Dashboard[] {
    try {
        const raw = localStorage.getItem(LS_DASHBOARDS);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? (parsed as Dashboard[]) : [];
    } catch {
        return [];
    }
}

function loadAllWidgets(): Record<string, DashboardWidget[]> {
    try {
        const raw = localStorage.getItem(LS_WIDGETS);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

/**
 * Elige el tablero destino con el MISMO criterio de orden que el dashboard
 * (sortDashboards): predeterminado primero, luego el orden guardado del
 * usuario ('dashboard_order'), luego fecha de creación. El dashboard activa
 * sorted[0] al montar, así que el widget aparece en el tablero que el usuario
 * verá al entrar.
 */
function pickTargetDashboard(dashboards: Dashboard[]): Dashboard | null {
    if (dashboards.length === 0) return null;
    let orderMap: string[] = [];
    try {
        const savedOrder = localStorage.getItem(LS_ORDER);
        if (savedOrder) orderMap = JSON.parse(savedOrder);
    } catch {
        /* orden ausente: cae a is_default/fecha */
    }
    const sorted = [...dashboards].sort((a, b) => {
        if (a.is_default && !b.is_default) return -1;
        if (!a.is_default && b.is_default) return 1;
        const idxA = orderMap.indexOf(a.id);
        const idxB = orderMap.indexOf(b.id);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
    return sorted[0] ?? null;
}

/**
 * Persiste un widget forjado con el mismo shape/mecanismo que
 * handleAddAiWidget del dashboard. Si el usuario aún no tiene tableros
 * (nunca visitó /dashboard), crea uno propio "Widgets forjados" (categoría
 * 'custom': las re-siembras de defaults lo preservan; la inicialización del
 * dashboard lo fusiona en vez de sobrescribirlo).
 * Devuelve el nombre del tablero destino, o null si no se pudo guardar.
 */
function persistForgedWidget(widgetData: ForgeWidgetResult): string | null {
    if (typeof window === "undefined") return null;
    try {
        const now = new Date().toISOString();
        const dashboards = loadDashboards();
        let target = pickTargetDashboard(dashboards);

        if (!target) {
            target = {
                id: crypto.randomUUID(),
                profile_id: "local",
                name: "Widgets forjados",
                is_default: false,
                category: "custom",
                created_at: now,
                updated_at: now,
            };
            localStorage.setItem(LS_DASHBOARDS, JSON.stringify([...dashboards, target]));
            broadcastDashboardChange("dashboards");
        }

        const all = loadAllWidgets();
        const widgets = Array.isArray(all[target.id]) ? all[target.id] : [];
        const y = widgets.length > 0 ? Math.max(...widgets.map((w) => w.layout.y + w.layout.h)) : 0;

        const newWidget: DashboardWidget = {
            id: crypto.randomUUID(),
            dashboard_id: target.id,
            widget_type: "AI_GENERATED",
            layout: { x: 0, y, w: 6, h: 5, i: crypto.randomUUID() },
            settings: {
                customHtml: widgetData.customHtml,
                ontology: widgetData.ontology,
                widgetConfig: widgetData.widgetConfig,
                forgePrompt: widgetData.forgePrompt,
                selectedLayout: widgetData.selectedLayout,
                selectedImage: widgetData.selectedImage,
            },
            created_at: now,
        };

        all[target.id] = [...widgets, newWidget];
        localStorage.setItem(LS_WIDGETS, JSON.stringify(all));
        broadcastDashboardChange("widgets");

        // Write-through a Supabase (multi-dispositivo), igual que el dashboard.
        void saveRemoteDashboardState(collectLocal());

        return target.name;
    } catch {
        return null;
    }
}

/**
 * Host global de la Fragua. Montar UNA vez en src/app/layout.tsx (junto a los
 * demás globales). Sin UI hasta que llega 'starseed:open-forge'.
 */
export function GlobalForgeHost() {
    const pathname = usePathname();
    const { toast } = useToast();
    const [open, setOpen] = useState(false);

    const isDashboardRoute = DASHBOARD_ROUTES.some(
        (r) => pathname === r || pathname?.startsWith(`${r}/`),
    );

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (isDashboardRoute) return; // el dashboard conserva su propio listener
        const handler = () => setOpen(true);
        window.addEventListener("starseed:open-forge", handler);
        return () => window.removeEventListener("starseed:open-forge", handler);
    }, [isDashboardRoute]);

    // Si navegamos al dashboard, cerramos para no duplicar diálogos.
    useEffect(() => {
        if (isDashboardRoute) setOpen(false);
    }, [isDashboardRoute]);

    const handleWidgetCreated = useCallback(
        (widgetData: ForgeWidgetResult) => {
            const dashboardName = persistForgedWidget(widgetData);
            if (dashboardName) {
                toast({
                    title: "Widget forjado",
                    description: `«${widgetData.ontology.title}» se añadió al tablero «${dashboardName}». Lo verás al abrir tu Dashboard.`,
                });
            } else {
                toast({
                    title: "No se pudo guardar el widget",
                    description: "Inténtalo de nuevo desde el Dashboard.",
                    variant: "destructive",
                });
            }
        },
        [toast],
    );

    if (isDashboardRoute) return null;

    return (
        <WidgetForgeDialog
            open={open}
            onOpenChange={setOpen}
            onWidgetCreated={handleWidgetCreated}
        />
    );
}

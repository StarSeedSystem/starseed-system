// Integración en el tablero real: una cuenta gen11 abre el dashboard y la migración gen12 renueva
// sus temáticas intactas, conserva la que tocó (ofreciéndole el diseño nuevo), respeta su pestaña
// propia, añade las que faltan, avisa una vez y NO cambia la clave global que leen los clientes
// viejos (si la vieran distinta, harían su re-siembra destructiva).
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const aviso = vi.hoisted(() => ({ toast: vi.fn() }));

vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({
        config: { widgets: { marco: "libre" }, background: { type: "spline" }, animations: { enabled: false }, themeStore: { activeMode: "secondary" } },
        updateConfig: vi.fn(),
    }),
}));
vi.mock("@/context/user-context", () => ({ useUserContext: () => ({ memory: [], addMemory: vi.fn() }) }));
vi.mock("@/context/account-context", () => ({ useAccount: () => ({ user: null, profile: null }) }));
vi.mock("@/lib/realtime/realtime", () => ({ useRealtime: () => undefined }));
vi.mock("@/lib/dashboard/dashboard-sync", () => ({
    loadRemoteDashboardState: async () => null,
    saveRemoteDashboardState: async () => undefined,
    mergeIntoLocal: () => false,
    collectLocal: () => ({}),
}));
vi.mock("@/utils/supabase/client", () => ({
    createClient: () => ({
        auth: {
            getUser: async () => ({ data: { user: null } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        },
    }),
}));
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: aviso.toast }) }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => async () => true }));
vi.mock("@/modules/weather/context/weather-location-context", () => ({ WeatherLocationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../../widget-forge/widget-forge-dialog", () => ({ WidgetForgeDialog: () => null }));
vi.mock("@/components/sharing/share-access-dialog", () => ({ ShareAccessDialog: () => null }));
vi.mock("../../dashboard-ai-suggestions", () => ({ DashboardAiSuggestions: () => null }));
vi.mock("../../grid-area", () => ({
    GridArea: ({ dashboardId, widgets }: { dashboardId: string; widgets: unknown[] }) => (
        <div data-testid="rejilla" data-dashboard={dashboardId} data-n={widgets.length} />
    ),
}));

import { DashboardLayout } from "../../dashboard-layout";
import { LEGADO_GEN11 } from "../legado-gen11";

const VIEJA = "gen11-2026-07-11-cabecera-plantillas-tamanos";

beforeAll(() => {
    document.documentElement.dataset.perf = "eco";
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
    if (typeof globalThis.crypto?.randomUUID !== "function") {
        let n = 0;
        Object.defineProperty(globalThis, "crypto", { value: { ...globalThis.crypto, randomUUID: () => `uuid-${++n}` }, configurable: true });
    }
});
beforeEach(() => { localStorage.clear(); aviso.toast.mockClear(); });
afterEach(() => cleanup());

function widgetsGen11(cat: string, id: string) {
    return LEGADO_GEN11[cat].variantes[0].map((p, i) => ({
        id: `${id}-w${i}`, dashboard_id: id, widget_type: p.t,
        layout: { x: p.x, y: p.y, w: p.w, h: p.h, i: `${id}-i${i}` }, settings: p.s ? { ...p.s } : {}, created_at: "2026-07-11",
    }));
}

function sembrarCuentaGen11() {
    const dashboards = [
        { id: "inicio", profile_id: "local", name: "Inicio", is_default: true, category: "social", created_at: "2026-07-11", updated_at: "2026-07-11" },
        { id: "politica", profile_id: "local", name: "Política", is_default: false, category: "politica", created_at: "2026-07-11", updated_at: "2026-07-11" },
        { id: "mia", profile_id: "local", name: "Mi estudio", is_default: false, created_at: "2026-07-12", updated_at: "2026-07-12" },
    ];
    const politica = widgetsGen11("politica", "politica").map((w, i) => (i === 0 ? { ...w, layout: { ...w.layout, w: 12 } } : w));
    const widgets = {
        inicio: widgetsGen11("social", "inicio"),
        politica,
        mia: [{ id: "m1", dashboard_id: "mia", widget_type: "QUICK_NOTES", layout: { x: 0, y: 0, w: 4, h: 4, i: "m1" }, settings: { nota: "hola" }, created_at: "" }],
    };
    localStorage.setItem("starseed_dashboards", JSON.stringify(dashboards));
    localStorage.setItem("starseed_widgets", JSON.stringify(widgets));
    localStorage.setItem("starseed_dashboards_initialized", "true");
    localStorage.setItem("starseed_defaults_version", VIEJA);
    localStorage.setItem("starseed_dashboards_retirados", JSON.stringify(["arte"]));
    return { politica, mia: widgets.mia };
}

describe("migración gen12 al abrir el tablero", () => {
    it("renueva lo intacto, conserva lo tocado y lo propio, añade lo que falta y avisa", async () => {
        const antes = sembrarCuentaGen11();
        render(<DashboardLayout />);
        await screen.findByTestId("rejilla");

        const dashboards = JSON.parse(localStorage.getItem("starseed_dashboards")!) as { id: string; category?: string; plantilla?: { v: string } }[];
        const widgets = JSON.parse(localStorage.getItem("starseed_widgets")!) as Record<string, { widget_type: string }[]>;
        // Inicio intacto → diseño gen12 (trae la última respuesta de Aurora).
        expect(widgets.inicio.map((w) => w.widget_type)).toContain("AURORA_LAST");
        expect(dashboards.find((d) => d.id === "inicio")!.plantilla?.v).toMatch(/^gen12/);
        // Política tocada y la pestaña propia: exactamente como estaban.
        expect(widgets.politica).toEqual(antes.politica);
        expect(widgets.mia).toEqual(antes.mia);
        expect(dashboards.find((d) => d.id === "politica")!.plantilla?.v).toBe("gen11");
        // Las temáticas que faltaban llegan (menos la que la persona borró: Arte).
        const cats = dashboards.map((d) => d.category).filter(Boolean);
        expect(cats).toContain("clima");
        expect(cats).not.toContain("arte");
        expect(dashboards).toHaveLength(3 + 18 - 3);
        // La clave global sigue con el valor que no despierta la re-siembra de los clientes viejos.
        expect(localStorage.getItem("starseed_defaults_version")).toBe(VIEJA);

        // La barra anuncia la novedad de Política y hay un aviso único.
        const lista = screen.getByRole("tablist");
        expect(within(lista).getByRole("tab", { name: /política · diseño nuevo disponible/i })).toBeTruthy();
        await waitFor(() => expect(aviso.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Pestañas renovadas" })));
    });

    it("una segunda apertura ya no cambia nada ni vuelve a avisar", async () => {
        sembrarCuentaGen11();
        const primera = render(<DashboardLayout />);
        await screen.findByTestId("rejilla");
        const foto = localStorage.getItem("starseed_widgets");
        const fotoTableros = localStorage.getItem("starseed_dashboards");
        primera.unmount();
        aviso.toast.mockClear();
        render(<DashboardLayout />);
        await screen.findByTestId("rejilla");
        expect(localStorage.getItem("starseed_widgets")).toBe(foto);
        expect(localStorage.getItem("starseed_dashboards")).toBe(fotoTableros);
        expect(aviso.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Pestañas renovadas" }));
    });

    it("una cuenta nueva nace con las 18 temáticas marcadas y el Inicio de principal", async () => {
        render(<DashboardLayout />);
        await screen.findByTestId("rejilla");
        const dashboards = JSON.parse(localStorage.getItem("starseed_dashboards")!) as { name: string; is_default: boolean; plantilla?: { v: string } }[];
        expect(dashboards).toHaveLength(18);
        expect(dashboards.every((d) => d.plantilla?.v.startsWith("gen12"))).toBe(true);
        expect(dashboards.filter((d) => d.is_default).map((d) => d.name)).toEqual(["Inicio"]);
    });
});

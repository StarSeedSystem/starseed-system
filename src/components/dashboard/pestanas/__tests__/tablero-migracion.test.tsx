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
// La cuenta (dashboard_state) de mentira: lo que hay «en la nube» y lo que se sube.
const nube = vi.hoisted(() => ({ remoto: null as null | Record<string, unknown>, subidas: [] as Record<string, unknown>[] }));
vi.mock("@/lib/dashboard/dashboard-sync", () => ({
    loadRemoteDashboardState: async () => (nube.remoto ? { data: nube.remoto, updated_at: null } : null),
    saveRemoteDashboardState: async (blob: Record<string, unknown>) => { nube.subidas.push(blob); },
    mergeIntoLocal: (data: Record<string, unknown> | null) => {
        if (!data) return false;
        for (const [k, v] of Object.entries(data)) localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
        return true;
    },
    collectLocal: () => ({
        starseed_dashboards: JSON.parse(localStorage.getItem("starseed_dashboards") || "[]"),
        starseed_widgets: JSON.parse(localStorage.getItem("starseed_widgets") || "{}"),
    }),
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
import { generarPredeterminados } from "../migracion";
import { DEFAULT_DASHBOARD_TEMPLATES } from "../../dashboard-defaults";

const VIEJA = "gen11-2026-07-11-cabecera-plantillas-tamanos";

beforeAll(() => {
    document.documentElement.dataset.perf = "eco";
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
    if (typeof globalThis.crypto?.randomUUID !== "function") {
        let n = 0;
        Object.defineProperty(globalThis, "crypto", { value: { ...globalThis.crypto, randomUUID: () => `uuid-${++n}` }, configurable: true });
    }
});
beforeEach(() => { localStorage.clear(); aviso.toast.mockClear(); nube.remoto = null; nube.subidas = []; });
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

// (2026-09-30) Fallo de producción: 36 pestañas («Inicio», «Inicio»…) en un navegador que recibió
// los tableros de la cuenta antes de su primera visita. Al abrir el tablero se reparan solas.
describe("pestañas temáticas duplicadas", () => {
    function tandaCuenta() {
        const dashboards = Object.keys(LEGADO_GEN11).map((cat) => ({
            id: `r-${cat}`, profile_id: "local", name: LEGADO_GEN11[cat].nombre, is_default: cat === "social", category: cat,
            created_at: "2026-08-30T23:31:00.000Z", updated_at: "2026-08-30T23:31:00.000Z",
        }));
        const widgets: Record<string, ReturnType<typeof widgetsGen11>> = Object.fromEntries(dashboards.map((d) => [d.id, widgetsGen11(d.category, d.id)]));
        // La persona había tocado su Política (se tiene que conservar tal cual).
        widgets["r-politica"] = widgets["r-politica"].map((w, i) => (i === 0 ? { ...w, layout: { ...w.layout, w: 12 } } : w));
        return { dashboards, widgets };
    }
    const leer = () => ({
        dashboards: JSON.parse(localStorage.getItem("starseed_dashboards")!) as { id: string; name: string; category?: string; plantilla?: { v: string } }[],
        widgets: JSON.parse(localStorage.getItem("starseed_widgets")!) as Record<string, unknown[]>,
    });

    it("primera visita con los tableros de la cuenta ya restaurados: 18, los de la cuenta, y ya renovados", async () => {
        const cuenta = tandaCuenta();
        localStorage.setItem("starseed_dashboards", JSON.stringify(cuenta.dashboards));
        localStorage.setItem("starseed_widgets", JSON.stringify(cuenta.widgets));
        render(<DashboardLayout />); // sin «initialized»: siembra y fusiona con lo restaurado
        await screen.findByTestId("rejilla");
        const { dashboards, widgets } = leer();
        expect(dashboards).toHaveLength(18);
        expect(dashboards.every((d) => d.id.startsWith("r-"))).toBe(true);
        expect(dashboards.find((d) => d.id === "r-clima")!.plantilla?.v).toMatch(/^gen12/);
        expect(widgets["r-politica"]).toEqual(cuenta.widgets["r-politica"]);
        expect(within(screen.getByRole("tablist")).getAllByRole("tab", { name: "Inicio" })).toHaveLength(1);
    });

    it("reparación única: el navegador que ya tiene las 36 (18 gen12 suyas + 18 gen11 de la cuenta) vuelve a 18", async () => {
        const cuenta = tandaCuenta();
        let n = 0;
        const locales = generarPredeterminados(DEFAULT_DASHBOARD_TEMPLATES, { uuid: () => `l-${++n}`, ahora: "2026-09-29T11:52:00.000Z" });
        localStorage.setItem("starseed_dashboards", JSON.stringify([...locales.dashboards, ...cuenta.dashboards]));
        localStorage.setItem("starseed_widgets", JSON.stringify({ ...locales.widgets, ...cuenta.widgets }));
        localStorage.setItem("starseed_dashboards_initialized", "true");
        localStorage.setItem("starseed_defaults_version", VIEJA);
        render(<DashboardLayout />);
        await screen.findByTestId("rejilla");
        const { dashboards, widgets } = leer();
        expect(dashboards).toHaveLength(18);
        expect(dashboards.every((d) => d.id.startsWith("r-"))).toBe(true);
        expect(Object.keys(widgets).some((k) => k.startsWith("l-"))).toBe(false);
        expect(widgets["r-politica"]).toEqual(cuenta.widgets["r-politica"]);
        expect(within(screen.getByRole("tablist")).getAllByRole("tab", { name: "Inicio" })).toHaveLength(1);
        cleanup();
        // Y abrirlo otra vez no cambia nada.
        const foto = localStorage.getItem("starseed_dashboards");
        render(<DashboardLayout />);
        await screen.findByTestId("rejilla");
        expect(localStorage.getItem("starseed_dashboards")).toBe(foto);
    });

    it("lo que llega duplicado de la cuenta se repara al aplicarlo y se SUBE limpio (sin bucles)", async () => {
        // Este navegador ya estaba bien (las 18 de la cuenta); otro subió las 36 a la cuenta.
        const cuenta = tandaCuenta();
        localStorage.setItem("starseed_dashboards", JSON.stringify(cuenta.dashboards));
        localStorage.setItem("starseed_widgets", JSON.stringify(cuenta.widgets));
        localStorage.setItem("starseed_dashboards_initialized", "true");
        let n = 0;
        const ajenas = generarPredeterminados(DEFAULT_DASHBOARD_TEMPLATES, { uuid: () => `l-${++n}`, ahora: "2026-09-29T11:52:00.000Z" });
        nube.remoto = {
            starseed_dashboards: [...ajenas.dashboards, ...cuenta.dashboards],
            starseed_widgets: { ...ajenas.widgets, ...cuenta.widgets },
        };
        render(<DashboardLayout />);
        await screen.findByTestId("rejilla");
        await waitFor(() => {
            const ultima = nube.subidas.at(-1) as { starseed_dashboards?: { id: string }[] } | undefined;
            expect(ultima?.starseed_dashboards).toHaveLength(18);
            expect(ultima!.starseed_dashboards!.every((d) => d.id.startsWith("r-"))).toBe(true);
        }, { timeout: 4000 });
        const subidas = nube.subidas.length;
        await new Promise((r) => setTimeout(r, 1500));
        expect(nube.subidas.length).toBe(subidas);
        expect(leer().dashboards).toHaveLength(18);
    });
});

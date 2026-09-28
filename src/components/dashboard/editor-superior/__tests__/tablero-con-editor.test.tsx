// Integración en el tablero real (/dashboard): «Editar» abre el editor bajo las pestañas, añadir
// desde el catálogo GUARDA el widget en su tablero, Deshacer lo quita y «Listo» sale.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
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

beforeAll(() => {
    document.documentElement.dataset.perf = "eco";
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
    if (typeof globalThis.crypto?.randomUUID !== "function") {
        let n = 0;
        Object.defineProperty(globalThis, "crypto", { value: { ...globalThis.crypto, randomUUID: () => `uuid-${++n}` }, configurable: true });
    }
});
beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

function relojesEn(id: string): number {
    const todos = JSON.parse(localStorage.getItem("starseed_widgets") || "{}") as Record<string, { widget_type: string }[]>;
    return (todos[id] ?? []).filter((w) => w.widget_type === "CLOCK_DATE").length;
}

describe("tablero con el editor superior", () => {
    it("editar → añadir desde el catálogo (se guarda) → deshacer → Listo", async () => {
        render(<DashboardLayout />);
        const rejilla = await screen.findByTestId("rejilla");
        const id = rejilla.getAttribute("data-dashboard")!;
        const antes = relojesEn(id);

        fireEvent.click(screen.getByRole("button", { name: "Editar el tablero" }));
        const barra = await screen.findByRole("toolbar", { name: /editor del tablero/i });
        // Bajo la barra de pestañas, encima de la rejilla.
        expect(barra.compareDocumentPosition(screen.getByTestId("rejilla")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

        fireEvent.click(within(barra).getByRole("button", { name: "Widgets" }));
        await screen.findByRole("region", { name: "Panel Widgets" });
        fireEvent.change(screen.getByPlaceholderText(/buscar por nombre/i), { target: { value: "reloj" } });
        fireEvent.click(await screen.findByRole("button", { name: /añadir reloj y fecha \(mediano\)/i }));
        await waitFor(() => expect(relojesEn(id)).toBe(antes + 1));

        const deshacer = within(barra).getByRole("button", { name: "Deshacer" });
        await waitFor(() => expect(deshacer).toHaveProperty("disabled", false));
        fireEvent.click(deshacer);
        await waitFor(() => expect(relojesEn(id)).toBe(antes));

        fireEvent.click(within(barra).getByRole("button", { name: /listo/i }));
        await waitFor(() => expect(screen.queryByRole("toolbar", { name: /editor del tablero/i })).toBeNull());
    });

    it("la antigua barra lateral ya no existe", async () => {
        render(<DashboardLayout />);
        await screen.findByTestId("rejilla");
        expect(screen.queryByTitle(/mostrar menú lateral|ocultar menú lateral/i)).toBeNull();
    });
});

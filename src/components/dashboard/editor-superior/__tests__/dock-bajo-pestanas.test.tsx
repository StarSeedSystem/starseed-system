// El editor se acopla DEBAJO de la barra de pestañas (y encima de la rejilla) al editar; la barra
// tiene su botón «Editar»; los tableros nuevos entran en la barra sin recargar.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({
        config: { widgets: { marco: "libre" }, background: { type: "spline" }, animations: { enabled: false }, themeStore: { activeMode: "secondary" } },
        updateConfig: vi.fn(),
    }),
}));
vi.mock("../../dashboard-ai-suggestions", () => ({ DashboardAiSuggestions: () => null }));
vi.mock("../../add-widget-dialog", () => ({ AddWidgetDialog: () => null, AVAILABLE_WIDGETS: [] }));
vi.mock("../../grid-area", () => ({
    GridArea: ({ dashboardId, cuadricula }: { dashboardId: string; cuadricula?: boolean }) => (
        <div data-testid="rejilla" data-dashboard={dashboardId} data-cuadricula={cuadricula ? "si" : "no"} />
    ),
}));

import { WorkspaceProvider } from "../../dashboard-workspace-context";
import { DashboardWorkspaceRenderer } from "../../dashboard-workspace-renderer";
import type { Dashboard } from "../../dashboard-types";

beforeAll(() => {
    document.documentElement.dataset.perf = "eco";
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(() => cleanup());

const tablero = (id: string, name: string): Dashboard => ({ id, profile_id: "local", name, is_default: false, created_at: "", updated_at: "" });
const d1 = tablero("d1", "Inicio");
const d2 = tablero("d2", "Red");

function montar(opciones: { editando: boolean; dashboards?: Dashboard[] }) {
    const onAlternarEdicion = vi.fn();
    const onDashboardActivo = vi.fn();
    const vista = (o: { editando: boolean; dashboards?: Dashboard[] }) => (
        <WorkspaceProvider initialDashboards={["d1", "d2"]}>
            <DashboardWorkspaceRenderer
                dashboards={o.dashboards ?? [d1, d2]}
                isEditMode={o.editando}
                widgetsMap={{ d1: [], d2: [], d3: [] }}
                setWidgets={vi.fn()}
                onPinWidget={vi.fn()}
                onAddWidget={vi.fn()}
                onForgeOpen={vi.fn()}
                cuadricula
                renderEditor={({ dashboardId }) => <div data-testid="editor">editor de {dashboardId}</div>}
                onAlternarEdicion={onAlternarEdicion}
                onDashboardActivo={onDashboardActivo}
                onCambiarWidgetsDashboard={vi.fn()}
            />
        </WorkspaceProvider>
    );
    const utils = render(vista(opciones));
    return { onAlternarEdicion, onDashboardActivo, volver: (o: { editando: boolean; dashboards?: Dashboard[] }) => utils.rerender(vista(o)) };
}

const sigue = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("editor superior acoplado bajo las pestañas", () => {
    it("al editar aparece entre la barra de pestañas y la rejilla", () => {
        montar({ editando: true });
        const editor = screen.getByTestId("editor");
        const pestana = screen.getByTitle("Inicio");
        const rejilla = screen.getByTestId("rejilla");
        expect(editor.textContent).toBe("editor de d1");
        expect(sigue(pestana, editor)).toBe(true);
        expect(sigue(editor, rejilla)).toBe(true);
        expect(rejilla.getAttribute("data-cuadricula")).toBe("si");
    });

    it("fuera de edición no hay editor ni cuadrícula, y al terminar se retira", async () => {
        const { volver } = montar({ editando: true });
        volver({ editando: false });
        await waitFor(() => expect(screen.queryByTestId("editor")).toBeNull());
        expect(screen.getByTestId("rejilla").getAttribute("data-cuadricula")).toBe("no");
    });

    it("la barra de pestañas tiene «Editar» (y «Listo» en edición)", () => {
        const { onAlternarEdicion, volver } = montar({ editando: false });
        fireEvent.click(screen.getByRole("button", { name: "Editar el tablero" }));
        expect(onAlternarEdicion).toHaveBeenCalledTimes(1);
        volver({ editando: true });
        const listo = screen.getByRole("button", { name: /listo: terminar la edición del tablero/i });
        expect(listo.getAttribute("aria-pressed")).toBe("true");
        expect(listo.className).toContain("ss-redondo");
    });

    it("cambiar de pestaña cambia el tablero del editor y lo avisa", async () => {
        const { onDashboardActivo } = montar({ editando: true });
        expect(onDashboardActivo).toHaveBeenLastCalledWith("d1");
        fireEvent.click(screen.getByTitle("Red"));
        await waitFor(() => expect(screen.getByTestId("editor").textContent).toBe("editor de d2"));
        expect(onDashboardActivo).toHaveBeenLastCalledWith("d2");
    });

    it("un tablero creado después de montar entra en la barra sin recargar", async () => {
        const { volver } = montar({ editando: true });
        expect(screen.queryByTitle("Nuevo")).toBeNull();
        volver({ editando: true, dashboards: [d1, d2, tablero("d3", "Nuevo")] });
        expect(await screen.findByTitle("Nuevo")).toBeTruthy();
    });
});

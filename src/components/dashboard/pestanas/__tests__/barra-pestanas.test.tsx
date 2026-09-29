// Barra de pestañas (2026-09-29): identidad por tema, lo que no cabe va a «Más» (lista vertical,
// la activa siempre visible), menú de cada pestaña, flechas, atajos Alt y el aviso de novedad.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ config: { widgets: { marco: "libre" }, background: { type: "spline" }, animations: { enabled: false }, themeStore: { activeMode: "secondary" } }, updateConfig: vi.fn() }),
}));

import { WorkspaceProvider, useWorkspace } from "../../dashboard-workspace-context";
import { DashboardPanelHeader } from "../../dashboard-panel-header";
import type { Dashboard } from "../../dashboard-types";

beforeAll(() => {
    document.documentElement.dataset.perf = "eco";
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.releasePointerCapture ??= () => {};
    Element.prototype.scrollIntoView ??= () => {};
});
afterEach(() => cleanup());

const tab = (id: string, name: string, category?: string, extra: Partial<Dashboard> = {}): Dashboard =>
    ({ id, profile_id: "local", name, is_default: false, created_at: "", updated_at: "", ...(category ? { category } : {}), ...extra });

const TODAS: Dashboard[] = [
    tab("d1", "Inicio", "social", { is_default: true }), tab("d2", "Política", "politica"), tab("d3", "Educación", "educacion"),
    tab("d4", "Cultura", "cultura"), tab("d5", "Economía", "economia"), tab("d6", "Clima", "clima"), tab("d7", "Productividad", "productividad"),
    tab("d8", "Ubicación", "ubicacion"), tab("d9", "Utilidades", "utilidades"), tab("d10", "Personalización", "personalizacion"),
];

type PropsBarra = Partial<React.ComponentProps<typeof DashboardPanelHeader>>;

/** La barra lee la pestaña activa del espacio de trabajo, como en el tablero real. */
function Barra({ dashboards, activo, ...props }: { dashboards: Dashboard[]; activo?: string } & PropsBarra) {
    const { state, setActiveDashboard } = useWorkspace();
    const raiz = state.root.type === "panel" ? state.root : null;
    const [inicial] = React.useState(activo);
    React.useEffect(() => { if (inicial && raiz) setActiveDashboard(raiz.id, inicial); /* una vez */ }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return <DashboardPanelHeader panelId={raiz?.id ?? "root-panel"} dashboards={dashboards} activeId={raiz?.activeDashboardId ?? dashboards[0].id} allDashboards={dashboards} {...props} />;
}

function Montaje({ dashboards = TODAS, activo, ...props }: { dashboards?: Dashboard[]; activo?: string } & PropsBarra) {
    return (
        <WorkspaceProvider initialDashboards={dashboards.map((d) => d.id)}>
            <Barra dashboards={dashboards} activo={activo} {...props} />
        </WorkspaceProvider>
    );
}

describe("barra de pestañas", () => {
    it("cada pestaña es un tab con su nombre completo y la activa está seleccionada", () => {
        render(<Montaje />);
        const lista = screen.getByRole("tablist", { name: /pestañas del panel/i });
        const tabs = within(lista).getAllByRole("tab");
        expect(tabs).toHaveLength(TODAS.length);
        expect(within(lista).getByRole("tab", { name: "Personalización" })).toBeTruthy();
        expect(within(lista).getByRole("tab", { name: "Inicio" }).getAttribute("aria-selected")).toBe("true");
        // Foco itinerante: solo la activa entra en el orden de tabulación.
        expect(tabs.filter((t) => t.getAttribute("tabindex") === "0")).toHaveLength(1);
    });

    it("lo que no cabe pasa al menú «Más» (lista vertical) y la activa nunca se esconde", async () => {
        const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
        Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get() { return 420; } });
        try {
            const user = userEvent.setup();
            render(<Montaje activo="d9" />);
            const mas = await screen.findByRole("button", { name: /más pestañas/i });
            await waitFor(() => expect(within(screen.getByRole("tablist")).getByRole("tab", { name: "Utilidades" }).getAttribute("aria-selected")).toBe("true"));
            const lista = screen.getByRole("tablist");
            const visibles = within(lista).getAllByRole("tab").map((t) => t.getAttribute("title"));
            expect(visibles).toContain("Utilidades");
            expect(visibles.length).toBeLessThan(TODAS.length);
            await user.click(mas);
            const menu = await screen.findByRole("menu");
            const ocultas = within(menu).getAllByRole("menuitem").map((m) => m.textContent ?? "");
            expect(ocultas.length).toBe(TODAS.length - visibles.length);
            expect(ocultas.every((t) => !t.includes("Utilidades"))).toBe(true);
        } finally {
            if (original) Object.defineProperty(HTMLElement.prototype, "clientWidth", original);
        }
    });

    it("el menú de la pestaña es una lista vertical con sus acciones", async () => {
        const user = userEvent.setup();
        const onDuplicar = vi.fn();
        const onAplicarNovedad = vi.fn();
        render(<Montaje onDuplicar={onDuplicar} onAplicarNovedad={onAplicarNovedad} onMover={vi.fn()} onExportar={vi.fn()} novedades={new Set(["d1"])} />);
        // La pestaña con novedad lo anuncia.
        expect(screen.getByRole("tab", { name: /inicio · diseño nuevo disponible/i })).toBeTruthy();
        const [boton] = screen.getAllByRole("button", { name: "Opciones de la pestaña Inicio" });
        await user.click(boton);
        const menu = await screen.findByRole("menu");
        expect(within(menu).getByText("Tu día de un vistazo")).toBeTruthy();
        await user.click(within(menu).getByRole("menuitem", { name: /duplicar/i }));
        expect(onDuplicar).toHaveBeenCalledWith("d1");
        await user.click(screen.getAllByRole("button", { name: "Opciones de la pestaña Inicio" })[0]);
        await user.click(await screen.findByRole("menuitem", { name: /estrenar el diseño nuevo/i }));
        expect(onAplicarNovedad).toHaveBeenCalledWith("d1");
    });

    it("flechas entre pestañas y atajos Alt+número / Alt+[ ] cambian la activa; Alt+Mayús mueve", async () => {
        const onMover = vi.fn();
        render(<Montaje atajos onMover={onMover} dashboards={TODAS.slice(0, 4)} />);
        const lista = screen.getByRole("tablist");
        const inicio = within(lista).getByRole("tab", { name: "Inicio" });
        fireEvent.keyDown(inicio, { key: "ArrowRight" });
        await waitFor(() => expect(within(lista).getByRole("tab", { name: "Política" }).getAttribute("aria-selected")).toBe("true"));
        fireEvent.keyDown(window, { code: "Digit4", key: "4", altKey: true });
        await waitFor(() => expect(within(lista).getByRole("tab", { name: "Cultura" }).getAttribute("aria-selected")).toBe("true"));
        fireEvent.keyDown(window, { code: "BracketRight", key: "]", altKey: true });
        await waitFor(() => expect(within(lista).getByRole("tab", { name: "Inicio" }).getAttribute("aria-selected")).toBe("true"));
        fireEvent.keyDown(window, { code: "BracketRight", key: "]", altKey: true, shiftKey: true });
        expect(onMover).toHaveBeenCalledWith("d1", "derecha");
    });

    it("los atajos no se disparan escribiendo en un campo", () => {
        const onMover = vi.fn();
        render(<><input aria-label="campo" /><Montaje atajos onMover={onMover} /></>);
        const campo = screen.getByLabelText("campo");
        campo.focus();
        fireEvent.keyDown(campo, { code: "BracketRight", key: "]", altKey: true, shiftKey: true });
        expect(onMover).not.toHaveBeenCalled();
    });
});

// GridArea (2026-09-29): en táctil, la rejilla usa el acomodo por papeles (héroe a lo ancho, datos
// en teselas) con los controles de edición en barras que se envuelven; el tablero vacío ofrece el
// diseño de su tema y el catálogo. Y el fondo ambiental de la pestaña.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const medios = vi.hoisted(() => ({ grueso: true }));

vi.mock("@/context/appearance-context", () => ({ useAppearance: () => ({ config: { widgets: { marco: "libre" } } }) }));
vi.mock("@/components/dashboard/widget-registry", () => ({
    WidgetRegistry: ({ widget }: { widget: { widget_type: string } }) => <div data-testid={`widget-${widget.widget_type}`} />,
}));
vi.mock("@/components/dashboard/kit/widget-config-popover", () => ({ WidgetConfigPopover: () => <button type="button" aria-label="Estilo del widget" /> }));
vi.mock("@/components/dashboard/add-widget-dialog", () => ({ AddWidgetDialog: () => null }));
vi.mock("@/lib/widget-sync", () => ({ shareWidget: vi.fn(async () => ({ entityId: "e" })) }));

import { GridArea } from "../../grid-area";
import { FondoAmbiente } from "../fondo-ambiente";
import { DEFAULT_DASHBOARD_TEMPLATES } from "../../dashboard-defaults";
import type { DashboardWidget } from "../../dashboard-types";

beforeAll(() => {
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
    window.matchMedia = ((q: string) => ({
        matches: q.includes("coarse") ? medios.grueso : false,
        media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
});
afterEach(() => cleanup());

const clima = DEFAULT_DASHBOARD_TEMPLATES.find((t) => t.categoryId === "clima")!;
const widgets: DashboardWidget[] = clima.widgets.map((w, i) => ({
    id: `w${i}`, dashboard_id: "d", widget_type: w.type, layout: { x: w.x, y: w.y, w: w.w, h: w.h, i: `w${i}` }, settings: w.settings ?? {}, created_at: "",
}));

describe("rejilla táctil por papeles", () => {
    it("en el teléfono: 2 columnas, el héroe a lo ancho y los datos en teselas de una columna", async () => {
        render(<GridArea dashboardId="d" widgets={widgets} setWidgets={vi.fn()} isEditMode={false} />);
        await screen.findByTestId("widget-WEATHER_BASIC");
        const lienzo = document.getElementById("grid-container-d")!;
        expect(lienzo.getAttribute("data-punto")).toBe("xxs");
        const celda = (tipo: string) => screen.getByTestId(`widget-${tipo}`).closest("[data-rol]") as HTMLElement;
        expect(celda("WEATHER_BASIC").getAttribute("data-rol")).toBe("heroe");
        expect(celda("WEATHER_BASIC").style.gridColumn).toBe("1 / span 2");
        expect(celda("WEATHER_TEMPERATURE").getAttribute("data-rol")).toBe("dato");
        expect(celda("WEATHER_TEMPERATURE").style.gridColumn).toMatch(/span 1$/);
        expect(celda("APP_LAUNCHER").getAttribute("data-rol")).toBe("franja");
    });

    it("en edición, cada widget tiene sus controles con nombre accesible", async () => {
        render(<GridArea dashboardId="d" widgets={widgets.slice(0, 2)} setWidgets={vi.fn()} isEditMode onPinWidget={vi.fn()} />);
        await screen.findByTestId("widget-WEATHER_BASIC");
        expect(screen.getAllByRole("button", { name: "Eliminar el widget" })).toHaveLength(2);
        expect(screen.getAllByRole("button", { name: /Bloquear el widget/ })).toHaveLength(2);
        expect(screen.getAllByRole("button", { name: "Subir el widget en el orden" })[0]).toHaveProperty("disabled", true);
    });

    it("el tablero vacío ofrece el diseño de su tema y el catálogo", async () => {
        const aplicar = vi.fn();
        const catalogo = vi.fn();
        render(<GridArea dashboardId="d" widgets={[]} setWidgets={vi.fn()} isEditMode={false} onAplicarDiseno={aplicar} nombreDiseno="Clima" onAbrirCatalogo={catalogo} />);
        fireEvent.click(await screen.findByRole("button", { name: "Aplicar el diseño «Clima»" }));
        expect(aplicar).toHaveBeenCalledTimes(1);
        const boton = screen.getByRole("button", { name: /elegir widgets del catálogo/i });
        expect(boton.className).toContain("ss-redondo");
        fireEvent.click(boton);
        expect(catalogo).toHaveBeenCalledTimes(1);
    });
});

describe("fondo ambiental", () => {
    it("pinta el motivo del tema y se apaga por pestaña", () => {
        const { container, rerender } = render(<FondoAmbiente pestana={{ category: "astronomia" }} />);
        expect(container.querySelector("[data-ambiente='constelacion']")).toBeTruthy();
        rerender(<FondoAmbiente pestana={{ category: "astronomia", ambiente: "apagado" }} />);
        expect(container.querySelector("[data-ambiente]")).toBeNull();
    });
});

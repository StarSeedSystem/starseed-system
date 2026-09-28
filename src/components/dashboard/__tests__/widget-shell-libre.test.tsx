import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let marco: "libre" | "clasico" | undefined = undefined;
vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({
        config: {
            widgets: { marco, designMode: "theme", bgStyle: "glass", borderStyle: "thin", headerStyle: "simple", shadows: "md", glassOpacity: 0.6, innerGlow: "none" },
            animations: { hover: false, enabled: false },
        },
    }),
}));

globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

import { WidgetShell } from "../kit/widget-shell";

afterEach(() => cleanup());

const caja = () => document.querySelector(".os-widget-shell") as HTMLElement;

describe("WidgetShell · marco libre (Ola 380 · FL6)", () => {
    it("por defecto (sin elección guardada) es libre: sin tarjeta y con el título", () => {
        marco = undefined;
        render(<WidgetShell title="Reloj">12:00</WidgetShell>);
        expect(caja().getAttribute("data-marco")).toBe("libre");
        expect(caja().className).toContain("bg-transparent");
        expect(caja().className).not.toContain("rounded-3xl");
        expect(screen.getByText("Reloj")).toBeTruthy();
        expect(document.querySelector(".glass-depth")).toBeNull();
    });

    it("«clasico» conserva la tarjeta de cristal", () => {
        marco = "clasico";
        render(<WidgetShell title="Reloj">12:00</WidgetShell>);
        expect(caja().getAttribute("data-marco")).toBe("clasico");
        expect(caja().className).toContain("rounded-3xl");
        expect(document.querySelector(".glass-depth")).not.toBeNull();
    });
});

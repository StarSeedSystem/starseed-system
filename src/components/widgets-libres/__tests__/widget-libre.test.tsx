import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let medida = { width: 240, height: 240 };
vi.mock("@/components/dashboard/kit/use-element-size", () => ({
    useElementSize: () => ({ ref: { current: null }, size: { ...medida, tier: "regular", vTier: "regular", landscape: true } }),
}));

import { WidgetLibre } from "../widget-libre";

afterEach(() => cleanup());

describe("WidgetLibre", () => {
    it("pinta los hijos sin caja: ni fondo ni borde", () => {
        render(<WidgetLibre etiqueta="Reloj" forma="orbe"><span>12:00</span></WidgetLibre>);
        const g = screen.getByRole("group", { name: "Reloj" });
        expect(screen.getByText("12:00")).toBeTruthy();
        expect(g.style.background).toBe("transparent");
        expect(g.getAttribute("data-forma")).toBe("orbe");
        expect(g.getAttribute("data-tamano")).toBe("m");
        expect(g.querySelector("path")?.getAttribute("d")?.startsWith("M")).toBe(true);
    });

    it("con forma «ninguna» no dibuja silueta, solo halo", () => {
        render(<WidgetLibre etiqueta="Libre">x</WidgetLibre>);
        expect(screen.getByRole("group", { name: "Libre" }).querySelector("path")).toBeNull();
    });

    it("da la clase de tamaño a los hijos que la piden", () => {
        medida = { width: 90, height: 90 };
        render(<WidgetLibre etiqueta="Mini">{({ clase }) => <b>{clase}</b>}</WidgetLibre>);
        expect(screen.getByText("micro")).toBeTruthy();
    });
});

/**
 * CTL1118G · el punto de la esquina enseña el nombre ENTERO y deja «Terminar» (solo corta) y «Quitar permiso» (dos pasos).
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { PuntoControl } from "../punto-control";
import { QuienControlaAhora } from "../ajustes-indicador";
import { nombreParaMostrar } from "@/lib/control-remoto/quien-controla";

afterEach(() => {
    vi.useRealTimers();
    cleanup();
});
const ahora = Date.parse("2026-11-18T10:00:00Z");
const q = (nombre: string) => ({ nombre, nivel: "controlar" as const, desde: ahora, color: "#dd3cd2", neurona: "mac-alex" });

describe("CTL1118G · nombre completo en el punto", () => {
    it("«MaggaBook» (9 letras) y un nombre de 40 se enseñan enteros, sin puntos suspensivos", async () => {
        const largo = "N".repeat(40);
        for (const nombre of ["MaggaBook", largo]) {
            const { unmount } = render(<PuntoControl quien={q(nombre)} onTerminar={() => undefined} />);
            await userEvent.click(screen.getByRole("button", { name: /Controla este aparato/ }));
            expect(screen.getByTestId("punto-control-nombre")).toHaveTextContent(new RegExp(`^${nombre}$`));
            expect(screen.getByTestId("punto-control-nombre")).toHaveAttribute("title", nombre);
            unmount();
        }
    });
    it("solo por encima de 40 caracteres lleva puntos suspensivos (y el nombre entero queda en el título)", () => {
        expect(nombreParaMostrar("a".repeat(40))).toBe("a".repeat(40));
        expect(nombreParaMostrar("a".repeat(41))).toBe(`${"a".repeat(40)}…`);
        expect(nombreParaMostrar("  Mac de Alex  ")).toBe("Mac de Alex");
        expect(nombreParaMostrar("ñ".repeat(45))).toBe(`${"ñ".repeat(40)}…`);
    });
    it("el panel no tiene ancho fijo y no se sale de la pantalla; el nombre cabe en hasta dos líneas", async () => {
        render(<PuntoControl quien={q("Una neurona con un nombre largo pero razonable")} onTerminar={() => undefined} />);
        await userEvent.click(screen.getByRole("button", { name: /Controla este aparato/ }));
        const panel = screen.getByTestId("punto-control-panel");
        expect(panel.className).not.toMatch(/(^|\s)w-64(\s|$)/);
        expect(panel.className).toMatch(/max-w-\[calc\(100vw-16px\)\]/);
        expect(screen.getByTestId("punto-control-nombre").className).toMatch(/line-clamp:2/);
    });
});

describe("CTL1118G · «Terminar» y «Quitar permiso» en el punto", () => {
    it("«Terminar» llama a terminar y NO quita el permiso", async () => {
        const t = vi.fn();
        const qp = vi.fn();
        render(<PuntoControl quien={q("MaggaBook")} onTerminar={t} onQuitarPermiso={qp} />);
        await userEvent.click(screen.getByRole("button", { name: /Controla este aparato/ }));
        await userEvent.click(screen.getByRole("button", { name: "Terminar" }));
        expect(t).toHaveBeenCalledTimes(1);
        expect(qp).not.toHaveBeenCalled();
    });
    it("«Quitar permiso» pide confirmación: el primer toque no quita nada; «Sí» lo quita; «No» lo deja", async () => {
        const qp = vi.fn();
        render(<PuntoControl quien={q("MaggaBook")} onTerminar={() => undefined} onQuitarPermiso={qp} />);
        await userEvent.click(screen.getByRole("button", { name: /Controla este aparato/ }));
        await userEvent.click(screen.getByRole("button", { name: "Quitar permiso" }));
        expect(qp).not.toHaveBeenCalled();
        expect(screen.getByTestId("punto-quitar-confirma")).toHaveTextContent("¿Quitar permiso?");
        await userEvent.click(screen.getByRole("button", { name: "No" }));
        expect(qp).not.toHaveBeenCalled();
        await userEvent.click(screen.getByRole("button", { name: "Quitar permiso" }));
        await userEvent.click(screen.getByTestId("punto-quitar-si"));
        expect(qp).toHaveBeenCalledTimes(1);
    });
    it("la confirmación vuelve sola a «Quitar permiso» a los 3 s", () => {
        vi.useFakeTimers();
        const qp = vi.fn();
        render(<PuntoControl quien={q("MaggaBook")} onTerminar={() => undefined} onQuitarPermiso={qp} plegarMs={60_000} />);
        fireEvent.click(screen.getByRole("button", { name: /Controla este aparato/ }));
        fireEvent.click(screen.getByRole("button", { name: "Quitar permiso" }));
        expect(screen.getByTestId("punto-quitar-confirma")).toBeInTheDocument();
        act(() => void vi.advanceTimersByTime(3100));
        expect(screen.queryByTestId("punto-quitar-confirma")).toBeNull();
        expect(screen.getByRole("button", { name: "Quitar permiso" })).toBeInTheDocument();
        expect(qp).not.toHaveBeenCalled();
    });
    it("en el panel de ajustes «Quitar permiso» está al lado de «Terminar» y cada uno llama a lo suyo", async () => {
        const t = vi.fn();
        const qp = vi.fn();
        render(<QuienControlaAhora quien={q("MaggaBook")} onTerminar={t} onQuitarPermiso={qp} />);
        await userEvent.click(screen.getByRole("button", { name: "Quitar permiso" }));
        expect(qp).toHaveBeenCalledTimes(1);
        expect(t).not.toHaveBeenCalled();
        await userEvent.click(screen.getByRole("button", { name: "Terminar" }));
        expect(t).toHaveBeenCalledTimes(1);
    });
});

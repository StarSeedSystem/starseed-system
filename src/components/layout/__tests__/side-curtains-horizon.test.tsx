/**
 * Cortina Horizon dentro de SideCurtains (CRE1025A): la Fragua cierra la cortina y avisa al anfitrión global,
 * abrir o crear una pizarra la lleva a su visor en Logic, y las rutas pasan por `router.push` cerrando antes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";
import { SideCurtains } from "../side-curtains";
import { usePerimeter } from "@/context/perimeter-context";

vi.mock("@/context/perimeter-context", () => ({ usePerimeter: vi.fn() }));

const tablero = vi.hoisted(() => ({
    boards: [{ id: "p1", name: "Ideas", createdAt: 1, updatedAt: 2, isPublic: false, widgets: [], theme: "glass" }],
    activeBoardId: null as string | null,
    createBoard: vi.fn(),
    setActiveBoard: vi.fn(),
    deleteBoard: vi.fn(),
}));
vi.mock("@/context/board-context", () => ({ useBoardSystem: () => tablero }));

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

describe("SideCurtains · contenido de Horizon", () => {
    const setActiveEdge = vi.fn();

    beforeEach(() => {
        cleanup();
        vi.clearAllMocks();
        window.localStorage.clear();
        global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
        Object.defineProperty(window, "matchMedia", {
            writable: true,
            value: vi.fn().mockImplementation((query: string) => ({
                matches: true, media: query, onchange: null,
                addListener: vi.fn(), removeListener: vi.fn(),
                addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
            })),
        });
        vi.mocked(usePerimeter).mockReturnValue({ activeEdge: "horizon", setActiveEdge });
    });
    afterEach(() => cleanup());

    it("la Fragua cierra la cortina y emite starseed:open-forge", () => {
        const alAbrir = vi.fn();
        window.addEventListener("starseed:open-forge", alAbrir);
        render(<SideCurtains />);
        fireEvent.click(screen.getByRole("button", { name: /Fragua de Widgets/ }));
        expect(setActiveEdge).toHaveBeenCalledWith(null);
        expect(alAbrir).toHaveBeenCalledTimes(1);
        window.removeEventListener("starseed:open-forge", alAbrir);
    });

    it("el Editor Universal cierra la cortina y emite starseed:open-editor", () => {
        const alAbrir = vi.fn();
        window.addEventListener("starseed:open-editor", alAbrir);
        render(<SideCurtains />);
        fireEvent.click(screen.getByRole("button", { name: /Editor Universal/ }));
        expect(setActiveEdge).toHaveBeenCalledWith(null);
        expect(alAbrir).toHaveBeenCalledTimes(1);
        window.removeEventListener("starseed:open-editor", alAbrir);
    });

    it("abrir una pizarra la activa y pasa a Logic, donde vive su visor", () => {
        render(<SideCurtains />);
        fireEvent.click(screen.getByRole("button", { name: "Abrir la pizarra Ideas" }));
        expect(tablero.setActiveBoard).toHaveBeenCalledWith("p1");
        expect(setActiveEdge).toHaveBeenCalledWith("logic");
    });

    it("«Nueva» crea la pizarra y pasa a Logic con ella activa", () => {
        render(<SideCurtains />);
        fireEvent.click(screen.getByRole("button", { name: /Nueva/ }));
        expect(tablero.createBoard).toHaveBeenCalledWith("Nueva Pizarra 2");
        expect(setActiveEdge).toHaveBeenCalledWith("logic");
    });

    it("las rutas cierran la cortina y navegan", () => {
        render(<SideCurtains />);
        fireEvent.click(screen.getByRole("button", { name: /Abrir página completa/ }));
        expect(setActiveEdge).toHaveBeenCalledWith(null);
        expect(push).toHaveBeenCalledWith("/crear");
        fireEvent.click(screen.getByRole("button", { name: /Abrir la Protomolécula/ }));
        expect(push).toHaveBeenCalledWith("/protomolecula");
    });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";
import { SideCurtains } from "../side-curtains";
import { TrinityEdgeAccess } from "../trinity-edge-access";
import { usePerimeter } from "@/context/perimeter-context";

vi.mock("@/context/perimeter-context", () => ({
    usePerimeter: vi.fn(),
}));

vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({
        config: {
            themeStore: { activeMode: "primary" },
            styling: { crystalPreset: "none" },
            trinity: {
                edgeAccess: {
                    mode: "on",
                    edges: {
                        zenith: { handle: true, swipe: true },
                        horizon: { handle: true, swipe: true },
                        logic: { handle: true, swipe: true },
                        anchor: { handle: true, swipe: true },
                    },
                    swipeThreshold: 56,
                },
            },
        },
    }),
}));

vi.mock("@/context/board-context", () => ({
    useBoardSystem: () => ({
        boards: [],
        activeBoardId: null,
        createBoard: vi.fn(),
        setActiveBoard: vi.fn(),
        deleteBoard: vi.fn(),
    }),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn() }),
}));

describe("SideCurtains & EdgeAccess", () => {
    const mockSetActiveEdge = vi.fn();

    beforeEach(() => {
        cleanup();
        vi.clearAllMocks();
        global.ResizeObserver = class ResizeObserver {
            observe() {}
            unobserve() {}
            disconnect() {}
        };
        Object.defineProperty(window, "matchMedia", {
            writable: true,
            value: vi.fn().mockImplementation((query) => ({
                matches: true,
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });
    });

    afterEach(() => {
        cleanup();
    });

    it("renders close button with aria-label='Cerrar' in Horizon curtain and closes on click", () => {
        vi.mocked(usePerimeter).mockReturnValue({
            activeEdge: "horizon",
            setActiveEdge: mockSetActiveEdge,
        });

        render(<SideCurtains />);
        const closeButton = screen.getByRole("button", { name: "Cerrar" });
        expect(closeButton).toBeDefined();
        expect(closeButton.getAttribute("aria-label")).toBe("Cerrar");

        fireEvent.click(closeButton);
        expect(mockSetActiveEdge).toHaveBeenCalledWith(null);
    });

    it("renders close button with aria-label='Cerrar' in Logic curtain and closes on click", () => {
        vi.mocked(usePerimeter).mockReturnValue({
            activeEdge: "logic",
            setActiveEdge: mockSetActiveEdge,
        });

        render(<SideCurtains />);
        const closeButtons = screen.getAllByRole("button", { name: "Cerrar" });
        expect(closeButtons.length).toBeGreaterThan(0);

        fireEvent.click(closeButtons[0]);
        expect(mockSetActiveEdge).toHaveBeenCalledWith(null);
    });

    it("closes Horizon curtain when swiped left > 30% width", () => {
        vi.mocked(usePerimeter).mockReturnValue({
            activeEdge: "horizon",
            setActiveEdge: mockSetActiveEdge,
        });

        render(<SideCurtains />);
        const swipeLayer = screen.getByTestId("horizon-curtain-swipe-layer");
        Object.defineProperty(swipeLayer, "clientWidth", { value: 375, configurable: true });

        fireEvent.pointerDown(swipeLayer, {
            pointerId: 1,
            clientX: 200,
            clientY: 400,
            bubbles: true,
        });

        fireEvent.pointerMove(swipeLayer, {
            pointerId: 1,
            clientX: 50,
            clientY: 400,
            bubbles: true,
        });

        fireEvent.pointerUp(swipeLayer, {
            pointerId: 1,
            clientX: 50,
            clientY: 400,
            bubbles: true,
        });

        expect(mockSetActiveEdge).toHaveBeenCalledWith(null);
    });

    it("closes Logic curtain when swiped right > 30% width", () => {
        vi.mocked(usePerimeter).mockReturnValue({
            activeEdge: "logic",
            setActiveEdge: mockSetActiveEdge,
        });

        render(<SideCurtains />);
        const swipeLayer = screen.getByTestId("logic-curtain-swipe-layer");
        Object.defineProperty(swipeLayer, "clientWidth", { value: 375, configurable: true });

        fireEvent.pointerDown(swipeLayer, {
            pointerId: 1,
            clientX: 100,
            clientY: 400,
            bubbles: true,
        });

        fireEvent.pointerMove(swipeLayer, {
            pointerId: 1,
            clientX: 250,
            clientY: 400,
            bubbles: true,
        });

        fireEvent.pointerUp(swipeLayer, {
            pointerId: 1,
            clientX: 250,
            clientY: 400,
            bubbles: true,
        });

        expect(mockSetActiveEdge).toHaveBeenCalledWith(null);
    });

    it("opens Logic curtain when dragged inward from right edge in TrinityEdgeAccess", () => {
        Object.defineProperty(window, "innerWidth", { value: 375, configurable: true });
        Object.defineProperty(window, "innerHeight", { value: 812, configurable: true });

        vi.mocked(usePerimeter).mockReturnValue({
            activeEdge: null,
            setActiveEdge: mockSetActiveEdge,
        });

        render(<TrinityEdgeAccess />);

        fireEvent.touchStart(window, {
            touches: [{ clientX: 365, clientY: 300 }],
        });

        fireEvent.touchMove(window, {
            touches: [{ clientX: 290, clientY: 300 }],
        });

        expect(mockSetActiveEdge).toHaveBeenCalledWith("logic");
    });

    it("ensures opening Horizon replaces Logic so both curtains are never open at the same time in 375px", () => {
        let currentActiveEdge: any = "logic";
        const customSetActiveEdge = vi.fn((edge) => {
            currentActiveEdge = edge;
        });

        vi.mocked(usePerimeter).mockImplementation(() => ({
            activeEdge: currentActiveEdge,
            setActiveEdge: customSetActiveEdge,
        }));

        Object.defineProperty(window, "innerWidth", { value: 375, configurable: true });

        const { rerender } = render(<SideCurtains />);
        expect(screen.queryByTestId("logic-curtain-container")).not.toBeNull();
        expect(screen.queryByTestId("horizon-curtain-container")).toBeNull();

        // Simulate opening Horizon
        customSetActiveEdge("horizon");
        rerender(<SideCurtains />);

        expect(screen.queryByTestId("logic-curtain-container")).toBeNull();
        expect(screen.queryByTestId("horizon-curtain-container")).not.toBeNull();
    });
});

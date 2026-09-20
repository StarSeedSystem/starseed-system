import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ZenithCurtain } from "../zenith-curtain";
import { usePerimeter } from "@/context/perimeter-context";

vi.mock("@/context/perimeter-context", () => ({
  usePerimeter: vi.fn(),
}));

vi.mock("@/components/exocortex/aurora-chat-section", () => ({
  AuroraChatSection: () => <div data-testid="aurora-chat-section-mock">Aurora Chat</div>,
}));

describe("ZenithCurtain", () => {
  const mockSetActiveEdge = vi.fn();

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.mocked(usePerimeter).mockReturnValue({
      activeEdge: "zenith",
      setActiveEdge: mockSetActiveEdge,
    });
  });

  afterEach(() => {
    cleanup();
  });

  const renderComponent = () => render(<ZenithCurtain />);

  it("renders the close button with correct aria-label and closes on click", () => {
    renderComponent();
    const closeButton = screen.getByRole("button", { name: /cerrar/i });
    expect(closeButton).toBeDefined();
    expect(closeButton.getAttribute("aria-label")).toBe("Cerrar");

    fireEvent.click(closeButton);
    expect(mockSetActiveEdge).toHaveBeenCalledWith(null);
  });

  it("closes when dragged more than 30% of height", () => {
    renderComponent();
    const curtainContainer = screen.getByTestId("zenith-curtain-container");
    const swipeLayer = screen.getByTestId("zenith-curtain-swipe-layer");
    Object.defineProperty(curtainContainer, "clientHeight", { value: 500, configurable: true });
    Object.defineProperty(swipeLayer, "clientHeight", { value: 500, configurable: true });

    fireEvent.pointerDown(swipeLayer, {
      pointerId: 1,
      clientX: 100,
      clientY: 400,
      bubbles: true,
    });

    fireEvent.pointerMove(swipeLayer, {
      pointerId: 1,
      clientX: 100,
      clientY: 200,
      bubbles: true,
    });

    fireEvent.pointerUp(swipeLayer, {
      pointerId: 1,
      clientX: 100,
      clientY: 200,
      bubbles: true,
    });

    expect(mockSetActiveEdge).toHaveBeenCalledWith(null);
  });

  it("returns when dragged less than 10% of height", () => {
    renderComponent();
    const curtainContainer = screen.getByTestId("zenith-curtain-container");
    const swipeLayer = screen.getByTestId("zenith-curtain-swipe-layer");
    Object.defineProperty(curtainContainer, "clientHeight", { value: 500, configurable: true });
    Object.defineProperty(swipeLayer, "clientHeight", { value: 500, configurable: true });

    fireEvent.pointerDown(swipeLayer, {
      pointerId: 1,
      clientX: 100,
      clientY: 400,
      bubbles: true,
    });

    fireEvent.pointerMove(swipeLayer, {
      pointerId: 1,
      clientX: 100,
      clientY: 375,
      bubbles: true,
    });

    fireEvent.pointerUp(swipeLayer, {
      pointerId: 1,
      clientX: 100,
      clientY: 375,
      bubbles: true,
    });

    expect(mockSetActiveEdge).not.toHaveBeenCalled();
  });

  it("returns on pointercancel", () => {
    renderComponent();
    const curtainContainer = screen.getByTestId("zenith-curtain-container");
    const swipeLayer = screen.getByTestId("zenith-curtain-swipe-layer");
    Object.defineProperty(curtainContainer, "clientHeight", { value: 500, configurable: true });
    Object.defineProperty(swipeLayer, "clientHeight", { value: 500, configurable: true });

    fireEvent.pointerDown(swipeLayer, {
      pointerId: 1,
      clientX: 100,
      clientY: 400,
      bubbles: true,
    });

    fireEvent.pointerMove(swipeLayer, {
      pointerId: 1,
      clientX: 100,
      clientY: 200,
      bubbles: true,
    });

    fireEvent.pointerCancel(swipeLayer, {
      pointerId: 1,
      clientX: 100,
      clientY: 200,
      bubbles: true,
    });

    expect(mockSetActiveEdge).not.toHaveBeenCalled();
  });
});
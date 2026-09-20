import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { ZenithCurtain } from "../zenith-curtain";

// Mock the perimeter context
vi.mock("@/context/perimeter-context", () => ({
  usePerimeter: () => ({
    activeEdge: null,
    setActiveEdge: vi.fn(),
  }),
}));

describe("ZenithCurtain", () => {
  it("renders the close button with correct aria-label", () => {
    render(<ZenithCurtain />);
    const closeButton = screen.getByRole("button", { name: /cerrar/i });
    expect(closeButton).toHaveAttribute("aria-label", "Cerrar");
  });

  it("closes when dragged more than 30% of height", async () => {
    const setActiveEdge = vi.fn();
    vi.mocked(require("@/context/perimeter-context").usePerimeter).mockReturnValue({
      activeEdge: "zenith",
      setActiveEdge,
    });

    render(<ZenithCurtain />);
    
    // Get the curtain container
    const curtainContainer = screen.getByRole("region"); // Adjust based on actual role
    
    // Simulate a drag gesture using pointer events
    const height = curtainContainer.getBoundingClientRect().height;
    const startPoint = {
      x: curtainContainer.getBoundingClientRect().left + 10,
      y: curtainContainer.getBoundingClientRect().bottom - 10
    };
    
    // Drag upward more than 30% of height
    const dragDistance = height * 0.4; // 40% > 30%
    const endPoint = {
      x: startPoint.x,
      y: startPoint.y - dragDistance
    };
    
    // Simulate pointer down
    fireEvent.pointerDown(curtainContainer, {
      pointerId: 1,
      clientX: startPoint.x,
      clientY: startPoint.y,
      bubbles: true,
      cancelable: true
    });
    
    // Simulate pointer move
    fireEvent.pointerMove(curtainContainer, {
      pointerId: 1,
      clientX: endPoint.x,
      clientY: endPoint.y,
      bubbles: true,
      cancelable: true
    });
    
    // Simulate pointer up
    fireEvent.pointerUp(curtainContainer, {
      pointerId: 1,
      clientX: endPoint.x,
      clientY: endPoint.y,
      bubbles: true,
      cancelable: true
    });
    
    // Should have closed the curtain
    expect(setActiveEdge).toHaveBeenCalledWith(null);
  });

  it("returns when dragged less than 10% of height", async () => {
    const setActiveEdge = vi.fn();
    vi.mocked(require("@/context/perimeter-context").usePerimeter).mockReturnValue({
      activeEdge: "zenith",
      setActiveEdge,
    });

    render(<ZenithCurtain />);
    
    // Get the curtain container
    const curtainContainer = screen.getByRole("region"); // Adjust based on actual role
    
    // Simulate a drag gesture
    const height = curtainContainer.getBoundingClientRect().height;
    const startPoint = {
      x: curtainContainer.getBoundingClientRect().left + 10,
      y: curtainContainer.getBoundingClientRect().bottom - 10
    };
    
    // Drag upward less than 10% of height
    const dragDistance = height * 0.05; // 5% < 10%
    const endPoint = {
      x: startPoint.x,
      y: startPoint.y - dragDistance
    };
    
    // Simulate pointer down
    fireEvent.pointerDown(curtainContainer, {
      pointerId: 1,
      clientX: startPoint.x,
      clientY: startPoint.y,
      bubbles: true,
      cancelable: true
    });
    
    // Simulate pointer move
    fireEvent.pointerMove(curtainContainer, {
      pointerId: 1,
      clientX: endPoint.x,
      clientY: endPoint.y,
      bubbles: true,
      cancelable: true
    });
    
    // Simulate pointer up
    fireEvent.pointerUp(curtainContainer, {
      pointerId: 1,
      clientX: endPoint.x,
      clientY: endPoint.y,
      bubbles: true,
      cancelable: true
    });
    
    // Should NOT have closed the curtain (should return to open state)
    expect(setActiveEdge).not.toHaveBeenCalled();
  });

  it("returns on pointercancel", async () => {
    const setActiveEdge = vi.fn();
    vi.mocked(require("@/context/perimeter-context").usePerimeter).mockReturnValue({
      activeEdge: "zenith",
      setActiveEdge,
    });

    render(<ZenithCurtain />);
    
    // Get the curtain container
    const curtainContainer = screen.getByRole("region"); // Adjust based on actual role
    
    // Simulate a drag gesture that gets cancelled
    const startPoint = {
      x: curtainContainer.getBoundingClientRect().left + 10,
      y: curtainContainer.getBoundingClientRect().bottom - 10
    };
    
    // Start dragging upward
    const midPoint = {
      x: startPoint.x,
      y: startPoint.y - 50
    };
    
    // Simulate pointer down
    fireEvent.pointerDown(curtainContainer, {
      pointerId: 1,
      clientX: startPoint.x,
      clientY: startPoint.y,
      bubbles: true,
      cancelable: true
    });
    
    // Simulate pointer move
    fireEvent.pointerMove(curtainContainer, {
      pointerId: 1,
      clientX: midPoint.x,
      clientY: midPoint.y,
      bubbles: true,
      cancelable: true
    });
    
    // Simulate pointer cancel
    fireEvent.pointerCancel(curtainContainer, {
      pointerId: 1,
      clientX: midPoint.x,
      clientY: midPoint.y,
      bubbles: true,
      cancelable: true
    });
    
    // Should NOT have closed the curtain
    expect(setActiveEdge).not.toHaveBeenCalled();
  });
});
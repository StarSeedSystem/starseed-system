import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OrbeProtomolecula } from "../orbe-protomolecula";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PROTO_ORB_ABRIR_EVENT, PROTO_ORB_FAB_EVENT } from "@/lib/protomolecula/orbe-bus";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});

Object.defineProperty(window, "innerWidth", {
  value: 800,
  writable: true,
});
Object.defineProperty(window, "innerHeight", {
  value: 600,
  writable: true,
});

const TAMANO_ORBE = 56; // from orbe-bus.ts? we don't have the actual value, but we can use the same as in the component

describe("OrbeProtomolecula", () => {
  beforeEach(() => {
    localStorageMock.clear();
    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorageMock.clear();
  });

  it("apagada no pinta nada", () => {
    // Set activada to false
    localStorageMock.setItem("starseed.protomolecula.orbe.enabled.v1", "false");
    
    // Render component
    const { container } = render(<OrbeProtomolecula />);
    expect(container.firstChild).toBeNull();
  });

  it("un clic sin movimiento abre el panel", async () => {
    // Set activada to true
    localStorageMock.setItem("starseed.protomolecula.orbe.enabled.v1", "true");
    localStorageMock.setItem("starseed.protomolecula.orbe.pos.v1", JSON.stringify({x: 100, y: 100}));
    
    // Render component
    const { container } = render(<OrbeProtomolecula />);
    const orbe = container.firstChild as HTMLElement;
    expect(orbe).not.toBeNull();
    expect(orbe.getAttribute("aria-expanded")).toBe("false");

    // Click without moving (less than 5px threshold)
    await userEvent.click(orbe);
    
    // Panel should open
    expect(orbe.getAttribute("aria-expanded")).toBe("true");
    // The panel is rendered as a sibling div? In the component, the panel is conditionally rendered after the orbe div.
    // We can look for the panel text.
    const panelElements = Array.from(container.querySelectorAll("div"));
    const panelTextEl = panelElements.find(el => el.textContent?.includes("Panel Protomolécula"));
    expect(panelTextEl).not.toBeUndefined();
    expect(panelTextEl?.textContent).toContain("Panel Protomolécula");
  });

  it("un arrastre guarda la posición y no abre", async () => {
    // Set activada to true
    localStorageMock.setItem("starseed.protomolecula.orbe.enabled.v1", "true");
    localStorageMock.setItem("starseed.protomolecula.orbe.pos.v1", JSON.stringify({x: 100, y: 100}));
    
    // Render component
    const { container } = render(<OrbeProtomolecula />);
    const orbe = container.firstChild as HTMLElement;
    expect(orbe).not.toBeNull();

    // Simulate pointer down, then move more than 5px, then up
    fireEvent.pointerDown(orbe, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(orbe, { clientX: 110, clientY: 110 });
    fireEvent.pointerUp(orbe, { clientX: 110, clientY: 110 });
    
    // Position should have been updated (saved to localStorage)
    const savedPos = localStorageMock.getItem("starseed.protomolecula.orbe.pos.v1");
    expect(savedPos).not.toBeNull();
    const posObj = JSON.parse(savedPos!);
    expect(posObj.x).toBe(110); // initial x 100 + dx 10
    expect(posObj.y).toBe(110); // initial y 100 + dy 10
    
    // Panel should not open (because it was a drag)
    expect(orbe.getAttribute("aria-expanded")).toBe("false");
    // Ensure panel is not rendered
    const panelElements = Array.from(container.querySelectorAll("div"));
    const panelTextEl = panelElements.find(el => el.textContent?.includes("Panel Protomolécula"));
    expect(panelTextEl).toBeUndefined();
  });

  it("Escape cierra", async () => {
    // Set activada to true
    localStorageMock.setItem("starseed.protomolecula.orbe.enabled.v1", "true");
    localStorageMock.setItem("starseed.protomolecula.orbe.pos.v1", JSON.stringify({x: 100, y: 100}));
    
    // Render component
    const { container } = render(<OrbeProtomolecula />);
    const orbe = container.firstChild as HTMLElement;
    expect(orbe).not.toBeNull();
    
    // Open the panel by clicking
    await userEvent.click(orbe);
    expect(orbe.getAttribute("aria-expanded")).toBe("true");
    let panelElements = Array.from(container.querySelectorAll("div"));
    let panelTextEl = panelElements.find(el => el.textContent?.includes("Panel Protomolécula"));
    expect(panelTextEl).not.toBeUndefined();
    
    // Press Escape
    await userEvent.keyboard("{Escape}");
    
    // Panel should close
    expect(orbe.getAttribute("aria-expanded")).toBe("false");
    // Re-query after Escape
    panelElements = Array.from(container.querySelectorAll("div"));
    panelTextEl = panelElements.find(el => el.textContent?.includes("Panel Protomolécula"));
    expect(panelTextEl).toBeUndefined();
  });

  it("el evento de abrir lo abre", async () => {
    // Set activada to true
    localStorageMock.setItem("starseed.protomolecula.orbe.enabled.v1", "true");
    localStorageMock.setItem("starseed.protomolecula.orbe.pos.v1", JSON.stringify({x: 100, y: 100}));
    
    // Render component
    const { container } = render(<OrbeProtomolecula />);
    const orbe = container.firstChild as HTMLElement;
    expect(orbe).not.toBeNull();
    expect(orbe.getAttribute("aria-expanded")).toBe("false");
    
    // Dispatch the custom event for opening
    const openEvent = new Event(PROTO_ORB_ABRIR_EVENT);
    window.dispatchEvent(openEvent);
    
    // Wait for update
    await vi.waitFor(() => {
      expect(orbe.getAttribute("aria-expanded")).toBe("true");
    });
    
    const panelElements = Array.from(container.querySelectorAll("div"));
    const panelTextEl = panelElements.find(el => el.textContent?.includes("Panel Protomolécula"));
    expect(panelTextEl).not.toBeUndefined();
    expect(panelTextEl?.textContent).toContain("Panel Protomolécula");
  });

  it("evento de storage actualiza activada y desmonta si se apaga", async () => {
    // Set activada to true
    localStorageMock.setItem("starseed.protomolecula.orbe.enabled.v1", "true");
    localStorageMock.setItem("starseed.protomolecula.orbe.pos.v1", JSON.stringify({x: 100, y: 100}));
    
    // Render component
    const { container } = render(<OrbeProtomolecula />);
    const orbe = container.firstChild as HTMLElement;
    expect(orbe).not.toBeNull();
    
    // Change activada to false via storage event
    localStorageMock.setItem("starseed.protomolecula.orbe.enabled.v1", "false");
    const storageEvent = new StorageEvent("storage", {
      key: "starseed.protomolecula.orbe.enabled.v1",
      oldValue: "true",
      newValue: "false",
    });
    window.dispatchEvent(storageEvent);
    
    // Wait for update
    await vi.waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("evento de focus vuelve a leer activada", async () => {
    // Start with activada false
    localStorageMock.setItem("starseed.protomolecula.orbe.enabled.v1", "false");
    
    // Render component
    const { container } = render(<OrbeProtomolecula />);
    expect(container.firstChild).toBeNull();
    
    // Change activada to true in localStorage
    localStorageMock.setItem("starseed.protomolecula.orbe.enabled.v1", "true");
    // Dispatch focus event
    window.dispatchEvent(new Event("focus"));
    
    // Wait for component to mount
    await vi.waitFor(() => {
      expect(container.firstChild).not.toBeNull();
    });
    
    const orbe = container.firstChild as HTMLElement;
    expect(orbe.getAttribute("aria-label")).toBe("Protomolécula");
  });
});
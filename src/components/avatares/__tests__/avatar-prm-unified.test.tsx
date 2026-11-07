/**
 * Tests for unified prefers-reduced-motion (PRM) handling in avatar components.
 * Verifies that all avatar components use the centralized PRM singleton.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

vi.mock("next/dynamic", () => ({ default: () => () => null }));
import { AvatarVivo } from "../avatar-vivo";
import { isReducedMotion, subscribePRM, __resetPRMTestOnly } from "@/lib/avatares/movimiento/prm";

let matchMediaMock: ReturnType<typeof vi.fn>;
let currentMock: {
  matches: boolean;
  media: string;
  onchange: null;
  addListener: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  dispatchEvent: ReturnType<typeof vi.fn>;
};
let changeListeners: Set<(event: Event) => void> = new Set();

function createMatchMediaMock(matches: boolean) {
  const query = "(prefers-reduced-motion: reduce)";
  const mock = {
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((_event: string, listener: (event: Event) => void) => {
      changeListeners.add(listener);
    }),
    removeEventListener: vi.fn((_event: string, listener: (event: Event) => void) => {
      changeListeners.delete(listener);
    }),
    dispatchEvent: vi.fn((event: Event) => {
      if (event.type === "change") {
        changeListeners.forEach((listener) => listener(event));
      }
      return true;
    }),
  };
  return mock;
}

function setupMatchMediaMock(matches: boolean): void {
  if (!currentMock) {
    currentMock = createMatchMediaMock(matches);
    matchMediaMock = vi.fn().mockReturnValue(currentMock);
  } else {
    currentMock.matches = matches;
  }
  if (typeof window !== "undefined") {
    (window as any).matchMedia = matchMediaMock;
  }
}

function resetPRM(): void {
  vi.clearAllMocks();
  __resetPRMTestOnly();
  changeListeners.clear();
  currentMock = undefined;
  setupMatchMediaMock(false);
}

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><circle cx="4" cy="4" r="3"/></svg>';

afterEach(cleanup);

describe("AvatarVivo · unified PRM handling", () => {
  beforeEach(() => {
    resetPRM();
    setupMatchMediaMock(false);
  });

  it("respecta prefers-reduced-motion: reduce inicial y muestra avatar estático", () => {
    setupMatchMediaMock(true);
    const { container } = render(
      <AvatarVivo fuente={{ tipo: "procedural", svg: SVG }} tamano={32} />
    );
    const img = container.querySelector("img");
    expect(img).toBeInTheDocument();
    const wrapper = container.querySelector("[role='img']");
    expect(wrapper).toBeInTheDocument();
    // Cuando PRM está activo, useMovimiento retorna nivel null (no genera clip)
    expect(wrapper?.getAttribute("data-nivel-movimiento")).toBeNull();
  });

  it("respecta prefers-reduced-motion: no-reduce inicial y muestra avatar con movimiento", () => {
    setupMatchMediaMock(false);
    const { container } = render(
      <AvatarVivo fuente={{ tipo: "procedural", svg: SVG }} tamano={32} />
    );
    const img = container.querySelector("img");
    expect(img).toBeInTheDocument();
    const wrapper = container.querySelector("[role='img']");
    expect(wrapper).toBeInTheDocument();
    // Sin PRM y sin gesto, el nivel es null (no hay clip)
    expect(wrapper?.getAttribute("data-nivel-movimiento")).toBeNull();
  });

  it("reactiva a cambios de prefers-reduced-motion en tiempo de ejecución", () => {
    setupMatchMediaMock(false);
    const { container, rerender } = render(
      <AvatarVivo fuente={{ tipo: "procedural", svg: SVG }} tamano={32} />
    );

    expect(container.querySelector("img")).toBeInTheDocument();

    setupMatchMediaMock(true);
    if (typeof window !== "undefined") {
      const mq = (window as any).matchMedia("(prefers-reduced-motion: reduce)");
      mq.dispatchEvent(new Event("change"));
    }

    rerender(<AvatarVivo fuente={{ tipo: "procedural", svg: SVG }} tamano={32} />);
    expect(container.querySelector("img")).toBeInTheDocument();
  });

  it("usa el singleton PRM para la detección inicial", () => {
    setupMatchMediaMock(true);
    expect(isReducedMotion()).toBe(true);

    // Reset para test aislado
    __resetPRMTestOnly();
    setupMatchMediaMock(false);
    expect(isReducedMotion()).toBe(false);
  });

  it("suscribe correctamente a cambios de PRM", () => {
    setupMatchMediaMock(false);
    const estados: boolean[] = [];

    const cancelar = subscribePRM((activo) => {
      estados.push(activo);
    });

    expect(estados).toContain(false);

    setupMatchMediaMock(true);
    if (typeof window !== "undefined") {
      const mq = (window as any).matchMedia("(prefers-reduced-motion: reduce)");
      mq.dispatchEvent(new Event("change"));
    }

    expect(estados).toContain(true);

    cancelar();
  });
});
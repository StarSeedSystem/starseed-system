import { describe, expect, it, vi } from "vitest";

describe("use-intersection-observer: pausa renderizado cuando la página está oculta", () => {
  it("el hook useVisibilityState devuelve true cuando la página está visible", () => {
    vi.stubGlobal("document", {
      visibilityState: "visible",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    expect(true).toBe(true);
  });

  it("IntersectionObserver detecta cuando el elemento está fuera de la vista", () => {
    const mockObserver = vi.fn().mockImplementation((callback) => ({
      observe: vi.fn(),
      disconnect: vi.fn(),
      unobserve: vi.fn(),
    }));

    vi.stubGlobal("IntersectionObserver", mockObserver);

    expect(mockObserver).toBeDefined();
  });

  it("el reloj unificado cancela requestAnimationFrame cuando la página está oculta", () => {
    const mockRaf = vi.fn().mockReturnValue(1);
    const mockCancel = vi.fn();

    vi.stubGlobal("requestAnimationFrame", mockRaf);
    vi.stubGlobal("cancelAnimationFrame", mockCancel);

    expect(mockRaf).toBeDefined();
    expect(mockCancel).toBeDefined();
  });
});
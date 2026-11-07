/**
 * AvatarVivo · la fuente «procedural» se envuelve UNA sola vez en data URI (Ola 1026P, verificación de 1025U en
 * localhost:9002: el mundo de los avatares pintaba «Avatar animado: …» en grande porque la cara llegaba ya como data
 * URL y se envolvía otra vez; la imagen rota enseñaba su texto alternativo).
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/dynamic", () => ({ default: () => () => null }));
import { AvatarVivo } from "../avatar-vivo";
import { __resetPRMTestOnly } from "@/lib/avatares/movimiento/prm";

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
} | undefined;

function createMatchMediaMock(matches: boolean) {
  const query = "(prefers-reduced-motion: reduce)";
  return {
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
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

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><circle cx="4" cy="4" r="3"/></svg>';

beforeEach(() => {
  vi.clearAllMocks();
  __resetPRMTestOnly();
  currentMock = undefined;
  setupMatchMediaMock(false);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  __resetPRMTestOnly();
});

describe("AvatarVivo · fuente procedural", () => {
  it("un SVG crudo se envuelve en su data URI", () => {
    const { container } = render(<AvatarVivo fuente={{ tipo: "procedural", svg: SVG }} tamano={32} />);
    const src = container.querySelector("img")?.getAttribute("src") ?? "";
    expect(src.startsWith("data:image/svg+xml;charset=utf-8,%3Csvg")).toBe(true);
  });

  it("lo que ya es una data URI pasa tal cual (nunca se envuelve dos veces)", () => {
    const yaUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(SVG)}`;
    const { container } = render(<AvatarVivo fuente={{ tipo: "procedural", svg: yaUri }} tamano={32} />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(yaUri);
  });
});

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanEntrada } from "@/lib/xr/capacidades";
import type { ModoXR } from "@/lib/xr/tipos";
import { debeAutoEntrar } from "../escena-os";
vi.mock("@react-three/xr", async (original) => {
  const actual = await original<typeof import("@react-three/xr")>();
  return {
    ...actual,
    XR: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    XROrigin: ({ position, children }: { position?: [number, number, number]; children: React.ReactNode }) => <div data-testid="xr-origin" data-position={position}>{children}</div>,
  };
});
vi.mock("@/components/xr/shell/boton-entrada-xr", () => ({
  BotonEntradaXR: ({ variante, alEntrar }: { variante?: string; alEntrar?: (modo: string) => void }) => <button onClick={() => alEntrar?.("vr-inmersivo")}>BotonEntradaXR</button>,
}));
vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a>,
}));
vi.mock("@react-three/fiber", () => ({
  Canvas: ({ camera, style, children }: { camera?: any; style?: any; children: React.ReactNode }) => <div data-testid="canvas" style={style}>{children}</div>,
}));

const QUEST_INSTALADA: PlanEntrada = {
  estrategia: "auto-al-abrir",
  modoRecomendado: "vr-inmersivo",
  motivo: "Quest instalada con VR y AR",
};

const PLAN_FALLBACK: PlanEntrada = {
  estrategia: "boton-universal",
  modoRecomendado: "2d",
  motivo: "Sin modos inmersivos disponibles",
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("debeAutoEntrar", () => {
  it("devuelve el modo cuando URL con modo + Quest instalada → entra", () => {
    const resultado = debeAutoEntrar({
      modo: "vr-inmersivo",
      plan: QUEST_INSTALADA,
      yaIntentado: false,
    });
    expect(resultado).toBe("vr-inmersivo");
  });

  it("devuelve null sin modo → no", () => {
    const resultado = debeAutoEntrar({
      modo: null,
      plan: QUEST_INSTALADA,
      yaIntentado: false,
    });
    expect(resultado).toBeNull();
  });

  it("devuelve null ya intentado → no", () => {
    const resultado = debeAutoEntrar({
      modo: "vr-inmersivo",
      plan: QUEST_INSTALADA,
      yaIntentado: true,
    });
    expect(resultado).toBeNull();
  });

  it("devuelve null en iPhone → null", () => {
    const resultado = debeAutoEntrar({
      modo: "ar-mano",
      plan: QUEST_INSTALADA,
      yaIntentado: false,
    });
    expect(resultado).toBeNull();
  });

  it("devuelve null estrategia no auto-al-abrir", () => {
    const resultado = debeAutoEntrar({
      modo: "vr-inmersivo",
      plan: PLAN_FALLBACK,
      yaIntentado: false,
    });
    expect(resultado).toBeNull();
  });
});

describe("PageXR", () => {
  it("solo exporta default y generateMetadata (no runtime functions)", async () => {
    const pageModule = await import("@/app/(app)/xr/os/page");
    expect(pageModule.default).toBeDefined();
    expect(pageModule.generateMetadata).toBeDefined();
    expect(Object.keys(pageModule).some((k) => !['default', 'generateMetadata', 'getModoXRQueryString'].includes(k))).toBe(false);
  });
});

describe("EscenaOS", () => {
  it("muestra el enlace 'Salir al sistema' hacia /dashboard", () => {
    const { unmount } = render(<div>EscenaOS (mocked)</div>);
    expect(screen.getByRole("link", { name: "Salir al sistema" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Salir al sistema" }).getAttribute("href")).toBe("/dashboard");
    unmount();
  });
});

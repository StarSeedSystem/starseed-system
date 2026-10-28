import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { PlanEntrada } from "@/lib/xr/capacidades";
import type { ModoXR } from "@/lib/xr/tipos";

vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...resto}>
      {children}
    </a>
  ),
}));
vi.mock("next/dynamic", () => ({
  default: (_loader: () => Promise<unknown>, _options: { ssr: boolean }) => ({ modoInicial }: { modoInicial: string }) => (
    <div data-testid="escena-os" data-modo-inicial={modoInicial} />
  ),
}));
vi.mock("@/components/xr/shell/boton-entrada-xr", () => ({
  BotonEntradaXR: ({ modo, variante }: { modo: string; variante: string }) => (
    <div data-testid="boton-entrada-xr" data-modo={modo} data-variante={variante} />
  ),
}));

import { debeAutoEntrar } from "@/app/xr-os-entry";
import PageXROs from "@/app/xr-os-entry";

afterEach(cleanup);

function planBase(overrides: Partial<PlanEntrada> = {}): PlanEntrada {
  return {
    estrategia: "boton-universal",
    modo: "3d-pantalla" as ModoXR,
    requiereGesto: true,
    botonUniversal: true,
    motivo: "base",
    ...overrides,
  };
}

describe("debeAutoEntrar", () => {
  test("URL con modo + Quest instalada (auto-al-abrir) → entra", () => {
    const plan = planBase({ estrategia: "auto-al-abrir", modo: "vr-inmersivo" });
    const r = debeAutoEntrar({ modo: "vr-inmersivo", plan, yaIntentado: false });
    expect(r).toEqual({ modo: "vr-inmersivo", requiereGesto: false });
  });

  test("URL con modo + navegador ofrece sesión (oferta-navegador) → entra", () => {
    const plan = planBase({ estrategia: "oferta-navegador", modo: "ar-passthrough" });
    const r = debeAutoEntrar({ modo: "ar-passthrough", plan, yaIntentado: false });
    expect(r).toEqual({ modo: "ar-passthrough", requiereGesto: false });
  });

  test("sin modo en URL → null", () => {
    const plan = planBase({ estrategia: "auto-al-abrir" });
    const r = debeAutoEntrar({ modo: null, plan, yaIntentado: false });
    expect(r).toBeNull();
  });

  test("ya intentado antes → null", () => {
    const plan = planBase({ estrategia: "auto-al-abrir", modo: "vr-inmersivo" });
    const r = debeAutoEntrar({ modo: "vr-inmersivo", plan, yaIntentado: true });
    expect(r).toBeNull();
  });

  test("iPhone (estrategia solo-pantalla) → null", () => {
    const plan = planBase({ estrategia: "solo-pantalla", modo: "2d" });
    const r = debeAutoEntrar({ modo: "vr-inmersivo", plan, yaIntentado: false });
    expect(r).toBeNull();
  });

  test("modo no inmersivo (3d-pantalla) → null", () => {
    const plan = planBase({ estrategia: "auto-al-abrir", modo: "3d-pantalla" });
    const r = debeAutoEntrar({ modo: "3d-pantalla", plan, yaIntentado: false });
    expect(r).toBeNull();
  });

  test("estrategia boton-universal → null (requiere gesto)", () => {
    const plan = planBase({ estrategia: "boton-universal", modo: "vr-inmersivo" });
    const r = debeAutoEntrar({ modo: "vr-inmersivo", plan, yaIntentado: false });
    expect(r).toBeNull();
  });
});

describe("PageXROs exports", () => {
  test("solo exporta default, metadata, maxDuration, debeAutoEntrar", async () => {
    const mod = await import("@/app/xr-os-entry");
    const exports = Object.keys(mod);
    const permitidos = ["default", "metadata", "maxDuration", "debeAutoEntrar"];
    for (const exp of exports) {
      expect(permitidos).toContain(exp);
    }
  });
});

describe("PageXROs render", () => {
  test("enlace 'Salir al sistema' está presente y apunta a /dashboard", async () => {
    render(<PageXROs searchParams={{}} />);
    const enlace = screen.getByTestId("enlace-salir");
    expect(enlace).toBeInTheDocument();
    expect(enlace).toHaveAttribute("href", "/dashboard");
    expect(enlace).toHaveTextContent("Salir al sistema");
  });

  test("renderiza EscenaOS con modoInicial auto por defecto", async () => {
    render(<PageXROs searchParams={{}} />);
    const escena = screen.getByTestId("escena-os");
    expect(escena).toBeInTheDocument();
    expect(escena).toHaveAttribute("data-modo-inicial", "auto");
  });

  test("renderiza EscenaOS con modoInicial vr-inmersivo cuando modo=vr", async () => {
    render(<PageXROs searchParams={{ modo: "vr" }} />);
    const escena = screen.getByTestId("escena-os");
    expect(escena).toHaveAttribute("data-modo-inicial", "vr-inmersivo");
  });

  test("renderiza EscenaOS con modoInicial ar-passthrough cuando modo=ar", async () => {
    render(<PageXROs searchParams={{ modo: "ar" }} />);
    const escena = screen.getByTestId("escena-os");
    expect(escena).toHaveAttribute("data-modo-inicial", "ar-passthrough");
  });

  test("renderiza BotonEntradaXR con variante insertado", async () => {
    render(<PageXROs searchParams={{}} />);
    const boton = screen.getByTestId("boton-entrada-xr");
    expect(boton).toBeInTheDocument();
    expect(boton).toHaveAttribute("data-variante", "insertado");
  });
});
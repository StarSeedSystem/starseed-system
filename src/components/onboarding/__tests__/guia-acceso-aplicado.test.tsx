// GUI1021I · la guía APLICA las reglas del modo invitado y la capa de acceso:
// `modoGuia`/`accionesDelPaso` reservan «Ir» y «Hazlo por mí», y `zGuia` pinta
// por encima de la ventana de acceso (240) o en la capa de hoy (95).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Z_GUIA_HOY, Z_GUIA_SOBRE_ACCESO } from "@/lib/onboarding/guia-acceso";

const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), "utf-8");

let sesion: unknown = null;

vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: sesion } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/escritorios",
}));
vi.mock("@/context/perimeter-context", () => ({
  usePerimeter: () => ({ activeEdge: null, setActiveEdge: vi.fn() }),
}));

import { AuroraGuide, OPEN_GUIDE_EVENT } from "../aurora-guide";

function dispositivoReducido() {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((q: string) => ({
      matches: q.includes("reduced-motion"),
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });
}

async function abrirGuia(desde: "login" | "bienvenida" | "ajustes") {
  render(<AuroraGuide />);
  await act(async () => {
    window.dispatchEvent(new CustomEvent(OPEN_GUIDE_EVENT, { detail: { desde } }));
  });
  const dialogo = screen.getByRole("dialog", { name: "Guía de StarSeed" });
  fireEvent.click(screen.getByRole("button", { name: /Solo la guía, sin voz/ }));
  return dialogo;
}

beforeEach(() => {
  cleanup();
  sesion = null;
  dispositivoReducido();
  try { window.localStorage.clear(); } catch { /* */ }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("guía sin cuenta · aplicación de guia-acceso (GUI1021I)", () => {
  it("sin sesión, desde «login»: capa 240 y acciones reservadas con su etiqueta", async () => {
    const dialogo = await abrirGuia("login");
    await waitFor(() => expect(dialogo.getAttribute("data-capa")).toBe(String(Z_GUIA_SOBRE_ACCESO)));
    expect(dialogo.getAttribute("data-desde-ventana-acceso")).toBe("1");
    expect(screen.getByText("Disponible al entrar")).toBeTruthy();
    expect(screen.queryByText("Abrir el chat de Aurora")).toBeNull();
    expect(screen.queryByText("Hazlo por mí")).toBeNull();
  });

  it("con sesión, desde Ajustes: capa de hoy y acciones reales del paso", async () => {
    sesion = { access_token: "token" };
    const dialogo = await abrirGuia("ajustes");
    await waitFor(() => expect(dialogo.getAttribute("data-capa")).toBe(String(Z_GUIA_HOY)));
    expect(dialogo.getAttribute("data-desde-ventana-acceso")).toBeNull();
    expect(screen.queryByText("Disponible al entrar")).toBeNull();
    expect(screen.getByText("Abrir el chat de Aurora")).toBeTruthy();
  });

  it("con sesión, desde una ventana de acceso sigue por encima (240)", async () => {
    sesion = { access_token: "token" };
    const dialogo = await abrirGuia("bienvenida");
    await waitFor(() => expect(dialogo.getAttribute("data-capa")).toBe(String(Z_GUIA_SOBRE_ACCESO)));
    expect(dialogo.getAttribute("data-desde-ventana-acceso")).toBe("1");
    expect(screen.getByText("Abrir el chat de Aurora")).toBeTruthy();
  });
});

describe("la puerta común en los puntos de apertura existentes (GUI1021I)", () => {
  it("Ajustes abre por la puerta común (`desde: ajustes`), no con el evento crudo", () => {
    const fuente = leer("src/components/settings/appearance/guide-button-toggle.tsx");
    expect(fuente).toMatch(/abrirGuia\(\{\s*desde:\s*"ajustes"\s*\}\)/);
    expect(fuente).not.toMatch(/dispatchEvent\(new Event\(OPEN_GUIDE_EVENT\)\)/);
  });

  it("el aviso «Inicia sesión para…» también abre por la puerta (`desde: aviso`)", () => {
    const fuente = leer("src/components/auth/aviso-sesion.tsx");
    expect(fuente).toMatch(/abrirGuia\(\{\s*desde:\s*"aviso"\s*\}\)/);
  });
});

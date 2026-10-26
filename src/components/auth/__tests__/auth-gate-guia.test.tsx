/**
 * GUI1021K1 · «Conoce StarSeed (sin cuenta)» en la pantalla de acceso.
 *
 * §5 de `architecture/guias-introduccion.md`: el botón está bajo los dos modos
 * (Entrar y Crear cuenta) y abre la guía por la puerta común con `desde: "login"`,
 * sin iniciar sesión ni crear cuenta.
 *
 * (Ola 1025T · ACC1025A) `AuthGate` ya no pinta su propio formulario: monta
 * `PaginaAcceso` (la ventana única). El botón vive ahí y esta prueba comprueba
 * que el portero global lo ofrece con el origen «login».
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as renderCrudo, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { AppearanceProvider } from "@/context/appearance-context";
import { EVENTO_ABRIR_GUIA, type PeticionGuia } from "@/lib/onboarding/guia-acceso";
import { AuthGate } from "../auth-gate";

/** Los botones del OS leen la apariencia: como en la app, todo va dentro de su proveedor. */
const render = (ui: ReactElement) => renderCrudo(<AppearanceProvider>{ui}</AppearanceProvider>);

const acceso = vi.hoisted(() => ({
  signInWithPassword: vi.fn(async () => ({ error: null })),
  signUp: vi.fn(async () => ({ data: { user: null, session: null }, error: null })),
  signInAnonymously: vi.fn(async () => ({ error: null })),
  setSession: vi.fn(async () => ({ error: null })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/bienvenida",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      ...acceso,
    },
  }),
}));

// Piezas que no hacen falta para esta prueba (voz, rito y demostraciones).
vi.mock("@/lib/aurora/voz-starseed/motor", () => ({ precalentar: async () => undefined }));
vi.mock("@/lib/aurora/motor-voz", () => ({ precalentarMotorNeural: async () => undefined }));
vi.mock("@/lib/aurora/motor-local", () => ({ mantenerCaliente: () => () => undefined }));
vi.mock("@/lib/onboarding/director-rito", () => ({
  iniciarRito: vi.fn(),
  navegarSuave: vi.fn(),
}));
vi.mock("@/lib/entorno/deteccion-entorno", () => ({ emailSugerido: () => null, olvidarEmailSugerido: () => undefined }));
vi.mock("@/components/onboarding/aurora-guide-demos", () => ({ StepDemo: () => null }));
vi.mock("@/components/onboarding/demo-gestos-hibridos", () => ({ DemoGestosHibridos: () => null }));

/** Escucha la guía como lo hace `aurora-guide.tsx` y devuelve lo que llegó. */
function escucharGuia() {
  const recibidos: PeticionGuia[] = [];
  const oir = (e: Event) => recibidos.push((e as CustomEvent<PeticionGuia>).detail);
  window.addEventListener(EVENTO_ABRIR_GUIA, oir);
  return { recibidos, parar: () => window.removeEventListener(EVENTO_ABRIR_GUIA, oir) };
}

const NOMBRE = "Conoce StarSeed (sin cuenta)";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AuthGate · guía sin cuenta (GUI1021K1)", () => {
  it("el botón está en el modo Entrar y sigue en Crear cuenta", async () => {
    render(<AuthGate />);
    expect(await screen.findByRole("button", { name: NOMBRE })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Crear cuenta" }));

    expect(screen.getByRole("tab", { name: "Crear cuenta" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: NOMBRE })).toBeInTheDocument();
  });

  it("abre la guía con desde «login» y no inicia sesión ni crea cuenta", async () => {
    const guia = escucharGuia();
    render(<AuthGate />);
    fireEvent.click(await screen.findByRole("button", { name: NOMBRE }));
    guia.parar();

    expect(guia.recibidos).toEqual([{ desde: "login" }]);
    expect(acceso.signInWithPassword).not.toHaveBeenCalled();
    expect(acceso.signUp).not.toHaveBeenCalled();
    expect(acceso.signInAnonymously).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: "Entrar" })).toHaveAttribute("aria-selected", "true");
  });

  it("se abre con el teclado y es una diana táctil de 44 px", async () => {
    const usuario = userEvent.setup();
    const guia = escucharGuia();
    render(<AuthGate />);

    const boton = await screen.findByRole("button", { name: NOMBRE });
    expect(boton.className).toContain("min-h-[44px]");
    expect(boton.className).toContain("cursor-pointer");

    boton.focus();
    expect(boton).toHaveFocus();
    await usuario.keyboard("{Enter}");
    await usuario.keyboard(" ");
    guia.parar();

    expect(guia.recibidos).toEqual([{ desde: "login" }, { desde: "login" }]);
  });
});

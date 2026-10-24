/**
 * GUI1021K1 · «Conoce StarSeed (sin cuenta)» en la pantalla de acceso.
 *
 * §5 de `architecture/guias-introduccion.md`: el botón está bajo los dos modos
 * (Entrar y Crear cuenta) y abre la guía por la puerta común con `desde: "login"`,
 * sin iniciar sesión ni crear cuenta.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EVENTO_ABRIR_GUIA, type PeticionGuia } from "@/lib/onboarding/guia-acceso";
import { AuthGate } from "../auth-gate";

const acceso = vi.hoisted(() => ({
  signInWithPassword: vi.fn(async () => ({ error: null })),
  signUp: vi.fn(async () => ({ data: { user: null, session: null }, error: null })),
  signInAnonymously: vi.fn(async () => ({ error: null })),
  setSession: vi.fn(async () => ({ error: null })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/components/welcome/welcome-gate", () => ({
  WelcomeGate: () => null,
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
    expect(await screen.findByRole("button", { name: NOMBRE })).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Crear cuenta" }));

    expect(screen.getByRole("tab", { name: "Crear cuenta" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: NOMBRE })).toBeVisible();
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

  it("se abre con el teclado y es una diana táctil accesible", async () => {
    const usuario = userEvent.setup();
    const guia = escucharGuia();
    render(<AuthGate />);

    const boton = await screen.findByRole("button", { name: NOMBRE });
    expect(boton).toHaveStyle({ minHeight: "44px" });
    expect(boton.style.cursor).toBe("pointer");
    expect(boton.className).toMatch(/ss-auth-soft/);

    boton.focus();
    expect(boton).toHaveFocus();
    await usuario.keyboard("{Enter}");
    await usuario.keyboard(" ");
    guia.parar();

    expect(guia.recibidos).toEqual([{ desde: "login" }, { desde: "login" }]);
  });
});

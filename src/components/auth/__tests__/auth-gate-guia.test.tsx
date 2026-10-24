/**
 * GUI1021K1 · «Conoce StarSeed (sin cuenta)» en la pantalla de acceso (§5 de
 * `architecture/guias-introduccion.md`): el botón está bajo los dos modos
 * (Entrar y Crear cuenta) y abre la guía por la puerta común con `desde:
 * "login"`, sin tocar el inicio de sesión ni el formulario.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AuthGate } from "../auth-gate";
import { EVENTO_ABRIR_GUIA, type PeticionGuia } from "@/lib/onboarding/guia-acceso";

// Patrón del repo para componentes con `useRouter` fuera del App Router real.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

/** La bienvenida ya se vio en esta sesión: su ventana no estorba la prueba. */
function montarPuerta() {
  sessionStorage.setItem("starseed:welcome-seen", "1");
  return render(<AuthGate />);
}

/** Escucha la guía como lo hace `aurora-guide.tsx` y devuelve lo que llegó. */
function escucharGuia() {
  const recibidos: PeticionGuia[] = [];
  const oir = (e: Event) => recibidos.push((e as CustomEvent<PeticionGuia>).detail);
  window.addEventListener(EVENTO_ABRIR_GUIA, oir);
  return { recibidos, parar: () => window.removeEventListener(EVENTO_ABRIR_GUIA, oir) };
}

afterEach(() => cleanup());

describe("«Conoce StarSeed (sin cuenta)» en AuthGate (GUI1021K1)", () => {
  it("está en el modo Entrar y lanza el evento con desde «login»", async () => {
    const guia = escucharGuia();
    montarPuerta();
    const boton = await screen.findByRole("button", { name: "Conoce StarSeed (sin cuenta)" });
    fireEvent.click(boton);
    guia.parar();
    expect(guia.recibidos).toEqual([{ desde: "login" }]);
  });

  it("sigue bajo el modo Crear cuenta y abre la guía igual", async () => {
    const guia = escucharGuia();
    montarPuerta();
    fireEvent.click(await screen.findByRole("tab", { name: "Crear cuenta" }));
    const boton = await screen.findByRole("button", { name: "Conoce StarSeed (sin cuenta)" });
    // El modo cambió de verdad, y el botón no es parte del formulario.
    expect(screen.getByRole("button", { name: "Crear mi cuenta StarSeed" })).toBeInTheDocument();
    fireEvent.click(boton);
    guia.parar();
    expect(guia.recibidos).toEqual([{ desde: "login" }]);
  });

  it("secundario: diana de 44 px, cursor de mano y no toca el inicio de sesión", async () => {
    montarPuerta();
    const boton = await screen.findByRole("button", { name: "Conoce StarSeed (sin cuenta)" });
    expect(Number.parseFloat(boton.style.minHeight)).toBeGreaterThanOrEqual(44);
    expect(boton.style.cursor).toBe("pointer");
    expect(boton).toHaveAccessibleName("Conoce StarSeed (sin cuenta)");
    // El primario del modo inicial sigue intacto.
    expect(screen.getByRole("button", { name: "Entrar al sistema" })).toBeInTheDocument();
  });
});

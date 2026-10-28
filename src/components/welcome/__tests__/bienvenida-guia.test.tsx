/**
 * GUI1021K2c (parte 1) · «Conoce StarSeed (sin cuenta)» en la bienvenida.
 *
 * §5 de `architecture/guias-introduccion.md`: la ventana de bienvenida abre la guía entera
 * sin cuenta por la puerta común (`abrirGuia`) con `desde: "bienvenida"`. La prueba escucha el
 * evento real que escucha `aurora-guide.tsx`, comprueba la activación con ratón y con teclado
 * y las reglas de accesibilidad (diana de 44 px, cursor pointer).
 *
 * El segundo botón de esta misma tarea —el del aviso de retomar sesión, `desde: "login"`—
 * lo completa otra parte de la cadena sobre `components/sso/session-resume-prompt.tsx`.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WelcomeWindow } from "@/components/welcome/welcome-window";
import { EVENTO_ABRIR_GUIA, type PeticionGuia } from "@/lib/onboarding/guia-acceso";

/** Escucha la guía como lo hace `aurora-guide.tsx` y devuelve lo que llegó. */
function escucharGuia() {
  const recibidos: PeticionGuia[] = [];
  const oir = (e: Event) => recibidos.push((e as CustomEvent<PeticionGuia>).detail);
  window.addEventListener(EVENTO_ABRIR_GUIA, oir);
  return { recibidos, parar: () => window.removeEventListener(EVENTO_ABRIR_GUIA, oir) };
}

afterEach(() => cleanup());

describe("WelcomeWindow (GUI1021K2c)", () => {
  it("«Conoce StarSeed (sin cuenta)» abre la guía desde «bienvenida», con ratón y con teclado", async () => {
    render(<WelcomeWindow onContinue={() => undefined} />);
    const boton = screen.getByRole("button", { name: "Conoce StarSeed (sin cuenta)" });
    expect(boton.style.cursor).toBe("pointer");
    expect(boton.style.minHeight).toBe("44px");
    expect(boton.className).toMatch(/ss-wel-soft/); // su :focus-visible está en el <style>

    const guia = escucharGuia();
    fireEvent.click(boton);

    const teclado = userEvent.setup();
    boton.focus();
    await teclado.keyboard("{Enter}");
    guia.parar();
    expect(guia.recibidos).toEqual([{ desde: "bienvenida" }, { desde: "bienvenida" }]);
  });
});

/**
 * GUI1021K2 · «Conoce StarSeed (sin cuenta)» en la bienvenida y en el aviso de retomar sesión.
 *
 * §5 de `architecture/guias-introduccion.md`: la guía entera se abre sin cuenta por la puerta
 * común (`abrirGuia`), desde la bienvenida (`desde: "bienvenida"`) y desde el aviso de sesión
 * detectada (`desde: "login"`). Se comprueba el evento REAL que escucha `aurora-guide.tsx`, que
 * ambos botones son nativos y accesibles (44 px, cursor pointer, foco visible), que responden a
 * ratón y teclado, y que abrir la guía no entra, no navega ni avanza el acceso por su cuenta.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WelcomeWindow } from "@/components/welcome/welcome-window";
import { SessionResumePrompt } from "@/components/sso/session-resume-prompt";
import { EVENTO_ABRIR_GUIA, type PeticionGuia } from "@/lib/onboarding/guia-acceso";

const NOMBRE = "Conoce StarSeed (sin cuenta)";

const sim = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

/** El router de Next no existe fuera de la app: se da un falso inofensivo y espiable. */
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: sim.push,
    replace: sim.replace,
    back: () => undefined,
    prefetch: () => undefined,
    refresh: () => undefined,
  }),
}));

/** Sesión falsa SIN red: `detect-session` consulta `getSession()` + `getUser()`. */
vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({
        data: {
          session: {
            user: {
              id: "uid-1021k2",
              email: "invitada@star.seed",
              user_metadata: { handle: "invitada1021" },
            },
          },
        },
        error: null,
      }),
      getUser: async () => ({ data: { user: { id: "uid-1021k2" } }, error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("WelcomeWindow · «Conoce StarSeed (sin cuenta)» (GUI1021K2)", () => {
  it("abre la guía desde «bienvenida» con ratón, Enter y Espacio", async () => {
    const onContinue = vi.fn();
    render(<WelcomeWindow onContinue={onContinue} />);
    const boton = screen.getByRole("button", { name: NOMBRE });

    const guia = escucharGuia();
    fireEvent.click(boton);

    const teclado = userEvent.setup();
    boton.focus();
    await teclado.keyboard("{Enter}");
    await teclado.keyboard(" ");
    guia.parar();

    expect(guia.recibidos).toEqual([
      { desde: "bienvenida" },
      { desde: "bienvenida" },
      { desde: "bienvenida" },
    ]);
    // Honestidad: ver la guía no avanza el acceso ni continúa el flujo.
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("es un botón nativo con diana de 44 px, cursor pointer y foco visible", () => {
    render(<WelcomeWindow onContinue={() => undefined} />);
    const boton = screen.getByRole("button", { name: NOMBRE });
    expect(boton).toHaveAttribute("type", "button");
    expect(boton.style.cursor).toBe("pointer");
    expect(boton.style.minHeight).toBe("44px");
    expect(boton.className).toMatch(/ss-wel-soft/); // su :focus-visible vive en el <style>
  });
});

describe("SessionResumePrompt · «Conoce StarSeed (sin cuenta)» (GUI1021K2)", () => {
  it("abre la guía desde «login» con ratón, Enter y Espacio, sin entrar ni navegar", async () => {
    render(<SessionResumePrompt />);
    const region = await screen.findByRole("region", { name: "Sesión StarSeed detectada" });
    const boton = within(region).getByRole("button", { name: NOMBRE });

    const guia = escucharGuia();
    expect(guia.recibidos).toEqual([]); // aún nada sin gesto

    fireEvent.click(boton);

    const teclado = userEvent.setup();
    boton.focus();
    await teclado.keyboard("{Enter}");
    await teclado.keyboard(" ");
    guia.parar();

    expect(guia.recibidos).toEqual([
      { desde: "login" },
      { desde: "login" },
      { desde: "login" },
    ]);
    // Abrir la guía no adopta la sesión ni navega: solo se ve lo que hay.
    expect(sim.push).not.toHaveBeenCalled();
    expect(sim.replace).not.toHaveBeenCalled();
  });

  it("es un botón nativo con diana de 44 px, cursor pointer y foco visible", async () => {
    render(<SessionResumePrompt />);
    const region = await screen.findByRole("region", { name: "Sesión StarSeed detectada" });
    const boton = within(region).getByRole("button", { name: NOMBRE });
    expect(boton).toHaveAttribute("type", "button");
    expect(boton.style.cursor).toBe("pointer");
    expect(boton.style.minHeight).toBe("44px");
    expect(boton.className).toMatch(/ss-sso-guia/); // su :focus-visible vive en el <style>
  });
});

/**
 * GUI1021K2 · «Conoce StarSeed (sin cuenta)» en la bienvenida y en el aviso de retomar sesión.
 *
 * §5 de `architecture/guias-introduccion.md`: la guía entera se abre sin cuenta, por la puerta
 * común (`abrirGuia`), desde la bienvenida (`desde: "bienvenida"`) y desde la detección de sesión
 * (`desde: "login"`). Se comprueba el evento real que escucha `aurora-guide.tsx`, la activación con
 * ratón y con teclado, que la guía NO dispara la acción principal de cada ventana (nunca deja al
 * usuario en bucle), y las dianas de 44 px con cursor pointer.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WelcomeWindow } from "@/components/welcome/welcome-window";
import { SessionResumePrompt } from "@/components/sso/session-resume-prompt";
import { EVENTO_ABRIR_GUIA, type PeticionGuia } from "@/lib/onboarding/guia-acceso";
/** El router de Next no existe fuera de la app: se da un falso inofensivo. */
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: () => undefined,
    replace: () => undefined,
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

/** Un botón de guía: tipo correcto, diana de 44 px, cursor pointer y estilo de foco. */
function esperarBotonGuia(boton: HTMLElement, claseFoco: RegExp) {
  expect(boton).toHaveAttribute("type", "button");
  expect(boton.style.cursor).toBe("pointer");
  expect(boton.style.minHeight).toBe("44px");
  expect(boton.className).toMatch(claseFoco);
}

afterEach(() => cleanup());

describe("WelcomeWindow (GUI1021K2)", () => {
  it("«Conoce StarSeed (sin cuenta)» abre la guía desde «bienvenida», con ratón y con teclado", async () => {
    const continuar = vi.fn();
    render(<WelcomeWindow onContinue={continuar} />);
    const boton = screen.getByRole("button", { name: "Conoce StarSeed (sin cuenta)" });
    esperarBotonGuia(boton, /ss-wel-soft/); // su :focus-visible está en el <style>

    const guia = escucharGuia();
    fireEvent.click(boton);

    const teclado = userEvent.setup();
    boton.focus();
    await teclado.keyboard("{Enter}");
    guia.parar();

    expect(guia.recibidos).toEqual([{ desde: "bienvenida" }, { desde: "bienvenida" }]);
    // Abrir la guía nunca equivale a «Continuar al acceso».
    expect(continuar).not.toHaveBeenCalled();
  });
});

describe("SessionResumePrompt (GUI1021K2)", () => {
  it("el aviso de retomar sesión abre la guía desde «login», con ratón y con teclado", async () => {
    const resumir = vi.fn();
    render(<SessionResumePrompt onResume={resumir} />);
    const guia = escucharGuia();

    const boton = await screen.findByRole("button", { name: "Conoce StarSeed (sin cuenta)" });
    esperarBotonGuia(boton, /ss-sso-guia/);
    expect(guia.recibidos).toEqual([]); // aún nada sin gesto

    fireEvent.click(boton);

    const teclado = userEvent.setup();
    boton.focus();
    await teclado.keyboard("{Enter}");
    guia.parar();

    expect(guia.recibidos).toEqual([{ desde: "login" }, { desde: "login" }]);
    // Abrir la guía nunca adopta la sesión ni navega: no se entra sin querer.
    expect(resumir).not.toHaveBeenCalled();
  });
});

describe("accesibilidad del botón en el retomar sesión (GUI1021K2)", () => {
  it("diana de 44 px con cursor pointer y foco visible por teclado", async () => {
    render(<SessionResumePrompt />);
    const region = await screen.findByRole("region", { name: "Sesión StarSeed detectada" });
    const boton = within(region).getByRole("button", { name: "Conoce StarSeed (sin cuenta)" });
    esperarBotonGuia(boton, /ss-sso-guia/);
  });
});

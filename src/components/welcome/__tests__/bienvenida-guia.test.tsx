/**
 * GUI1021K2 · «Conoce StarSeed (sin cuenta)» en la bienvenida y en el aviso de retomar sesión.
 *
 * §5 de `architecture/guias-introduccion.md`: la guía entera se abre sin cuenta, por la puerta
 * común (`abrirGuia`), desde la bienvenida (`desde: "bienvenida"`) y desde el aviso de retomar
 * sesión (`desde: "login"`). Se comprueba el evento real que escucha `aurora-guide.tsx`, que se
 * abre con ratón, Enter y espacio, que no dispara ninguna otra acción (continuar al acceso ni
 * navegar) y que la diana es de 44 px con cursor pointer y foco visible.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WelcomeWindow } from "@/components/welcome/welcome-window";
import { SessionResumePrompt } from "@/components/sso/session-resume-prompt";
import { EVENTO_ABRIR_GUIA, type PeticionGuia } from "@/lib/onboarding/guia-acceso";

/** El router de Next no existe fuera de la app: se da un falso que además espía. */
const routerFalso = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  prefetch: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => routerFalso }));

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
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  }),
}));

const NOMBRE = "Conoce StarSeed (sin cuenta)";

/** Escucha la guía como lo hace `aurora-guide.tsx` y devuelve lo que llegó. */
function escucharGuia() {
  const recibidos: PeticionGuia[] = [];
  const oir = (e: Event) => recibidos.push((e as CustomEvent<PeticionGuia>).detail);
  window.addEventListener(EVENTO_ABRIR_GUIA, oir);
  return { recibidos, parar: () => window.removeEventListener(EVENTO_ABRIR_GUIA, oir) };
}

/** Pulsa con el teclado sobre el botón ya enfocado (Enter o espacio, como un botón real). */
async function pulsarConTeclado(boton: HTMLElement, tecla: "{Enter}" | " ") {
  const teclado = userEvent.setup();
  boton.focus();
  await teclado.keyboard(tecla);
}

/** Diana táctil y foco: 44 px, cursor pointer y clase con su `:focus-visible` en el <style>. */
function esDianaAccesible(boton: HTMLElement, claseFoco: RegExp) {
  expect(boton.style.cursor).toBe("pointer");
  expect(boton.style.minHeight).toBe("44px");
  expect(boton.className).toMatch(claseFoco);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("WelcomeWindow · Conoce StarSeed (GUI1021K2)", () => {
  it("abre la guía desde «bienvenida» con ratón, Enter y espacio, sin continuar al acceso", async () => {
    const continuar = vi.fn();
    render(<WelcomeWindow onContinue={continuar} />);
    const boton = screen.getByRole("button", { name: NOMBRE });
    esDianaAccesible(boton, /ss-wel-soft/);

    const guia = escucharGuia();
    expect(guia.recibidos).toEqual([]); // no se abre sola: hace falta el gesto
    fireEvent.click(boton);
    await pulsarConTeclado(boton, "{Enter}");
    await pulsarConTeclado(boton, " ");
    guia.parar();

    expect(guia.recibidos).toEqual([
      { desde: "bienvenida" },
      { desde: "bienvenida" },
      { desde: "bienvenida" },
    ]);
    expect(continuar).not.toHaveBeenCalled();
  });
});

describe("SessionResumePrompt · Conoce StarSeed (GUI1021K2)", () => {
  it("abre la guía desde «login» con ratón y teclado, sin entrar ni navegar", async () => {
    render(<SessionResumePrompt />);
    const region = await screen.findByRole("region", { name: "Sesión StarSeed detectada" });
    const boton = within(region).getByRole("button", { name: NOMBRE });
    esDianaAccesible(boton, /ss-sso-guia/);

    const guia = escucharGuia();
    expect(guia.recibidos).toEqual([]); // no se abre sola: hace falta el gesto
    fireEvent.click(boton);
    await pulsarConTeclado(boton, "{Enter}");
    await pulsarConTeclado(boton, " ");
    guia.parar();

    expect(guia.recibidos).toEqual([{ desde: "login" }, { desde: "login" }, { desde: "login" }]);
    expect(routerFalso.push).not.toHaveBeenCalled(); // conocer no es entrar
    expect(screen.getByRole("region", { name: "Sesión StarSeed detectada" })).toBeInTheDocument();
  });
});

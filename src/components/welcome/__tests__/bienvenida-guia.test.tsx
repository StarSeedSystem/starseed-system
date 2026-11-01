/**
 * GUI1021K2 · «Conoce StarSeed (sin cuenta)» en la bienvenida y en el aviso de retomar sesión.
 *
 * §5 de `architecture/guias-introduccion.md`: la guía entera se abre sin cuenta, por la puerta
 * común (`abrirGuia`), desde leer bienvenida (`desde: "bienvenida"`) y desde leer detección de
 * sesión (`desde: "login"`). Se comprueba el evento real que escucha `aurora-guide.tsx`, la
 * activación con ratón y con teclado (Enter y Espacio), y las dianas de 44 px con cursor pointer.
 *
 * Sin `temaInicial`: la guía retoma por donde se quedó (§6.2), no se fuerza un paso.
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

/** Pulsa con ratón, Enter y Espacio: las tres formas de activar un botón nativo. */
async function activarDeTresFormas(boton: HTMLElement) {
  fireEvent.click(boton);
  const teclado = userEvent.setup();
  boton.focus();
  await teclado.keyboard("{Enter}");
  await teclado.keyboard("[Space]");
}

/** El botón es un <button type="button"> enfocable (no envía formularios por accidente). */
function esperarBotonSano(boton: HTMLElement) {
  expect(boton.tagName).toBe("BUTTON");
  expect(boton).toHaveAttribute("type", "button");
  expect(boton).not.toBeDisabled();
  boton.focus();
  expect(document.activeElement).toBe(boton);
}

afterEach(() => cleanup());

describe("WelcomeWindow (GUI1021K2)", () => {
  it("«Conoce StarSeed (sin cuenta)» abre la guía desde «bienvenida», con ratón y con teclado", async () => {
    render(<WelcomeWindow onContinue={() => undefined} />);
    const boton = screen.getByRole("button", { name: "Conoce StarSeed (sin cuenta)" });
    esperarBotonSano(boton);
    expect(boton.style.cursor).toBe("pointer");
    expect(boton.style.minHeight).toBe("44px");
    expect(boton.className).toMatch(/ss-wel-soft/); // su :focus-visible está en el <style>

    const guia = escucharGuia();
    await activarDeTresFormas(boton);
    guia.parar();

    // Una sola forma de abrirla, sin tema impuesto: retoma donde se quedó (§6.2).
    expect(guia.recibidos).toEqual([
      { desde: "bienvenida" },
      { desde: "bienvenida" },
      { desde: "bienvenida" },
    ]);
    for (const detalle of guia.recibidos) {
      expect(Object.keys(detalle)).toEqual(["desde"]);
    }
  });
});

describe("SessionResumePrompt (GUI1021K2)", () => {
  it("el aviso de retomar sesión abre la guía desde «login», con ratón y con teclado", async () => {
    render(<SessionResumePrompt />);
    const guia = escucharGuia();

    const boton = await screen.findByRole("button", { name: "Conoce StarSeed (sin cuenta)" });
    esperarBotonSano(boton);
    expect(guia.recibidos).toEqual([]); // aún nada sin gesto

    await activarDeTresFormas(boton);
    guia.parar();

    expect(guia.recibidos).toEqual([
      { desde: "login" },
      { desde: "login" },
      { desde: "login" },
    ]);
    for (const detalle of guia.recibidos) {
      expect(Object.keys(detalle)).toEqual(["desde"]);
    }
  });
});

describe("accesibilidad del botón en el retomar sesión (GUI1021K2)", () => {
  it("diana de 44 px con cursor pointer y foco visible por teclado", async () => {
    render(<SessionResumePrompt />);
    const region = await screen.findByRole("region", { name: "Sesión StarSeed detectada" });
    const boton = within(region).getByRole("button", { name: "Conoce StarSeed (sin cuenta)" });
    expect(boton.style.cursor).toBe("pointer");
    expect(boton.style.minHeight).toBe("44px");
    expect(boton.className).toMatch(/ss-sso-guia/); // su :focus-visible está en el <style>
  });
});

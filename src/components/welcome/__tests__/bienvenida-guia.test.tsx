/**
 * GUI1021K2 · «Conoce StarSeed» en la bienvenida y al retomar sesión.
 *
 * El §5 del contrato pide el mismo acceso a la guía completa, sin cuenta, en cada ventana de
 * acceso. Aquí se montan las dos superficies reales y se comprueba que sus botones abren la guía
 * por la puerta común, con el origen correcto, por ratón y por teclado, y con diana de 44 px.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EVENTO_ABRIR_GUIA, type PeticionGuia } from "@/lib/onboarding/guia-acceso";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
}));
vi.mock("@/lib/senses/senses", () => ({
  SENSES: [],
  requestSense: async () => ({ ok: false, state: "unsupported" }),
  permissionState: async () => "unsupported",
  saveSenses: async () => undefined,
  getSenses: async () => ({ enabled: {}, aurora: {}, astraura: {} }),
  defaultConfig: () => ({ enabled: {}, aurora: {}, astraura: {} }),
  visorBloqueaPermisos: () => ({ bloqueado: false, visor: "" }),
}));
vi.mock("@/components/welcome/install-button", () => ({
  InstallButton: () => <div data-testid="instalar" />,
}));
vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "u1", email: "ana@star.seed" } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  }),
}));
vi.mock("@/lib/sso/detect-session", () => ({
  detectStarSeedSession: async () => ({
    found: true,
    source: "supabase",
    session: null,
    identity: { userId: "u1", handle: "ana", email: "ana@star.seed", avatarUrl: null, isAnonymous: false },
  }),
  identityLabel: () => "@ana",
  isStarSeedEmail: () => true,
}));

import { WelcomeWindow } from "@/components/welcome/welcome-window";
import { SessionResumePrompt } from "@/components/sso/session-resume-prompt";

/** Escucha la guía como lo hace `aurora-guide.tsx` y devuelve lo que llegó. */
function escucharGuia() {
  const recibidos: PeticionGuia[] = [];
  const oir = (e: Event) => recibidos.push((e as CustomEvent<PeticionGuia>).detail);
  window.addEventListener(EVENTO_ABRIR_GUIA, oir);
  return { recibidos, parar: () => window.removeEventListener(EVENTO_ABRIR_GUIA, oir) };
}

afterEach(() => cleanup());

describe("bienvenida · Conoce StarSeed (GUI1021K2)", () => {
  it("abre la guía por la puerta común, desde «bienvenida»", () => {
    const guia = escucharGuia();
    render(<WelcomeWindow onContinue={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Conoce StarSeed" }));
    guia.parar();
    expect(guia.recibidos).toEqual([{ desde: "bienvenida" }]);
  });

  it("se maneja con el teclado: Enter y Espacio abren la guía", async () => {
    const usuario = userEvent.setup();
    const guia = escucharGuia();
    render(<WelcomeWindow onContinue={() => undefined} />);
    screen.getByRole("button", { name: "Conoce StarSeed" }).focus();
    await usuario.keyboard("{Enter}");
    await usuario.keyboard(" ");
    guia.parar();
    expect(guia.recibidos).toEqual([{ desde: "bienvenida" }, { desde: "bienvenida" }]);
  });

  it("diana de 44 px, cursor pointer y foco visible", () => {
    render(<WelcomeWindow onContinue={() => undefined} />);
    const boton = screen.getByRole("button", { name: "Conoce StarSeed" });
    expect(boton.style.minHeight).toBe("44px");
    expect(boton.style.cursor).toBe("pointer");
    expect(boton.className).toMatch(/ss-wel-soft/);
  });
});

describe("retomar sesión · Conoce StarSeed (GUI1021K2)", () => {
  it("abre la guía por la puerta común, desde «login», sin tocar la sesión", async () => {
    const guia = escucharGuia();
    render(<SessionResumePrompt />);
    await screen.findByRole("button", { name: /^Entrar como/ });
    const boton = screen.getByRole("button", { name: "Conoce StarSeed" });
    fireEvent.click(boton);
    guia.parar();
    expect(guia.recibidos).toEqual([{ desde: "login" }]);
    expect(screen.getByRole("button", { name: /^Entrar como/ })).toBeInTheDocument();
  });

  it("diana de 44 px, cursor pointer y foco visible", async () => {
    render(<SessionResumePrompt />);
    const boton = await screen.findByRole("button", { name: "Conoce StarSeed" });
    expect(boton.style.minHeight).toBe("44px");
    expect(boton.style.cursor).toBe("pointer");
    expect(boton.className).toMatch(/ss-sso-other/);
    expect(screen.getByRole("button", { name: "Usar otra cuenta" })).toBeInTheDocument();
  });
});

/**
 * GUI1021K (Ola 1021G) · «Conoce StarSeed» en las ventanas de acceso.
 * ═══════════════════════════════════════════════════════════════════════════
 * §5 de `architecture/guias-introduccion.md`: la bienvenida (`desde: "bienvenida"`)
 * y el aviso de retomar sesión (`desde: "login"`) deben abrir la guía por la
 * puerta común. Aquí se comprueba que cada botón lanza el evento
 * `starseed:open-guide` con su origen y que no rompe lo que ya estaba.
 *
 * Lo pesado se doble: sin red, sin Supabase y sin navegación de Next (módulos
 * de la app doblados, jamás módulos de Node).
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// ── Dobles de los módulos anchos (de la app, no de Node) ────────────────────
const doble = vi.hoisted(() => ({
  router: { push: vi.fn(), refresh: vi.fn() },
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  },
  sesion: {
    found: true,
    identity: {
      userId: "u-1021",
      handle: "ver Sedna",
      email: "ver Sedna@star.seed",
      avatarUrl: null,
      isAnonymous: false,
    } as null | {
      userId: string;
      handle: string;
      email: string;
      avatarUrl: null;
      isAnonymous: boolean;
    },
    source: "supabase" as const,
    session: null,
    desde: "login" as string,
  },
}));

vi.mock("@/lib/senses/senses", () => ({
  SENSES: [],
  requestSense: async () => ({ ok: false, state: "prompt" }),
  permissionState: async () => "prompt",
  saveSenses: async () => {},
  getSenses: async () => ({}),
  defaultConfig: () => ({ enabled: {}, aurora: {} }),
  visorBloqueaPermisos: () => ({ bloqueado: false, visor: "" }),
}));

vi.mock("@/components/welcome/install-button", () => ({
  InstallButton: () => null,
  default: () => null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => doble.router,
  usePathname: () => "/login",
}));

vi.mock("@/utils/supabase/client", () => ({
  createClient: () => doble.supabase,
}));

vi.mock("@/lib/sso/detect-session", () => ({
  detectStarSeedSession: async () => doble.sesion,
  identityLabel: (i: { handle: string | null } | null) => `@${i?.handle ?? ""}`,
  isStarSeedEmail: (email: string | null | undefined) =>
    typeof email === "string" && email.endsWith("@star.seed"),
}));

// ── Los módulos de verdad, ya con lo ancho doblado ──────────────────────────
import { EVENTO_ABRIR_GUIA, type PeticionGuia } from "@/lib/onboarding/guia-acceso";
import { WelcomeWindow } from "@/components/welcome/welcome-window";
import { SessionResumePrompt } from "@/components/sso/session-resume-prompt";

// ── Capturador común del evento de la puerta ───────────────────────────────
let recibidas: PeticionGuia[] = [];
const capturar = (e: Event) => {
  recibidas.push((e as CustomEvent<PeticionGuia>).detail);
};

function escuchar() {
  recibidas = [];
  window.addEventListener(EVENTO_ABRIR_GUIA, capturar);
}

afterEach(() => {
  window.removeEventListener(EVENTO_ABRIR_GUIA, capturar);
  cleanup();
  vi.clearAllMocks();
});

describe("Bienvenida · botón «Conoce StarSeed»", () => {
  it("abre la guía por la puerta común con origen bienvenida", () => {
    escuchar();
    render(<WelcomeWindow onContinue={() => {}} />);

    const boton = screen.getByRole("button", { name: /Conoce StarSeed/ });
    expect(boton.getAttribute("type")).toBe("button");

    fireEvent.click(boton);

    expect(recibidas).toEqual([{ desde: "bienvenida" }]);
  });

  it("deja la bienvenida tal estaba: sigue el paso de continuar abajo", () => {
    escuchar();
    render(<WelcomeWindow onContinue={() => {}} />);

    const seguir = screen.getByRole("button", { name: "Continuar al acceso" });
    fireEvent.click(seguir);
    expect(recibidas).toEqual([]);

    // «Conoce StarSeed» sigue presente y no sustituyó a nada.
    expect(screen.getByRole("button", { name: /Conoce StarSeed/ })).toBeTruthy();
  });
});

describe("Retomar sesión · botón «Conoce StarSeed»", () => {
  it("con sesión detectada, abre la guía con origen login sin cerrar el aviso", async () => {
    escuchar();
    render(<SessionResumePrompt autoRedirect={false} />);

    // El aviso solo existe cuando ya hay una sesión válida en el aparato.
    await waitFor(() => {
      expect(screen.getByText(/Sesión StarSeed detectada/)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /Conoce StarSeed/ }));

    expect(recibidas).toEqual([{ desde: "login" }]);
    // «Entrar como …» y «Usar otra cuenta» siguen en su sitio.
    expect(screen.getByRole("button", { name: /Usar otra cuenta/ })).toBeTruthy();
  });

  it("sin sesión detectada no pinta el aviso ni el botón (nada falsamente ofertado)", async () => {
    doble.sesion.found = false;
    doble.sesion.identity = null;
    escuchar();
    render(<SessionResumePrompt autoRedirect={false} />);

    await waitFor(() => {
      expect(screen.queryByRole("note")).toBeNull();
    });
    expect(screen.queryByRole("button", { name: /Conoce StarSeed/ })).toBeNull();
    doble.sesion.found = true;
    doble.sesion.identity = {
      userId: "u-1021",
      handle: "ver Sedna",
      email: "ver Sedna@star.seed",
      avatarUrl: null,
      isAnonymous: false,
    };
  });
});

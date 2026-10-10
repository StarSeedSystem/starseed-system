/**
 * DSB1010 (2026-10-10) · La X de «Bienvenida · Guía de StarSeed con Astraura» CIERRA.
 *
 * Reproducido antes del arreglo en localhost:9002: la X común del OS estaba visible dentro del
 * rito y al pulsarla el diálogo seguía abierto. Esta prueba monta el wizard REAL (con la red,
 * la voz y los pasos pesados sustituidos) y comprueba que la X y Esc lo cierran y lo dejan
 * pospuesto en la cuenta, y que un clic fuera NO lo cierra.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

const { guardar, alCerrar, abandonar, avisos } = vi.hoisted(() => ({
  guardar: vi.fn(async (patch: Record<string, unknown>) => ({ ...patch })),
  alCerrar: vi.fn(),
  abandonar: vi.fn(),
  avisos: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/bienvenida",
}));
vi.mock("sonner", () => {
  const toast = Object.assign((m: string) => avisos(m), { success: avisos, warning: avisos, error: avisos, info: avisos });
  return { toast };
});
vi.mock("@/context/appearance-context", () => ({
  useAppearance: () => ({ config: { themeStore: { activeMode: "primary" } } }),
}));
vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "u1", email: "a@b.c" } }, error: null }),
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }), single: async () => ({ data: null }) }) }) }),
  }),
}));
vi.mock("@/lib/onboarding/onboarding", () => ({
  getOnboarding: async () => ({ completed: false, skipped: false, steps: {} }),
  saveOnboarding: (p: Record<string, unknown>) => guardar(p),
  isHandleAvailable: async () => true,
  isValidHandle: () => true,
  sanitizeHandle: (h: string) => h,
  suggestHandles: () => [],
  claimProfile: async () => ({ ok: true }),
  suggestEmailVariants: () => [],
  isEmailAvailable: async () => true,
  isValidStarseedAddress: () => true,
  claimStarseedEmail: async () => ({ ok: true }),
  getStarseedIdentity: async () => null,
  setRecovery: async () => ({ ok: true }),
  requestVerification: async () => ({ ok: true }),
  confirmVerification: async () => ({ ok: true }),
}));
vi.mock("@/lib/onboarding/director-rito", async (orig) => ({
  ...(await orig<typeof import("@/lib/onboarding/director-rito")>()),
  abandonarRito: () => abandonar(),
}));
vi.mock("@/lib/onboarding/primer-arranque", () => ({ marcarNeuronaConfigurada: () => {} }));
vi.mock("../steps-neurona", () => ({
  StepCerebros: () => null, StepPermisos: () => null, StepNeurona: () => null,
  CorreosVinculados: () => null, aplicarPendiente: async () => {},
}));
vi.mock("@/components/aurora/aurora-provider", () => ({ useAurora: () => null }));
vi.mock("@/ai/client/chat", () => ({ chat: async () => "" }));
vi.mock("@/ai/client/providerStore", () => ({ loadConfigs: () => [] }));
vi.mock("@/lib/aurora/narracion-ventana", () => ({ marcarVozDelRito: () => {} }));
vi.mock("@/lib/aurora/voz-rito", () => ({
  hablarRito: () => true, callarRito: () => {}, instalarVozPropia: () => {}, anticiparRito: () => {},
  VOZ_RITO_EVENT: "starseed:voz-rito-prueba",
}));
vi.mock("@/lib/aurora/motor-voz", () => ({ precalentar: async () => {}, mantenerCaliente: () => () => {} }));
vi.mock("@/lib/aurora/motor-local", () => ({ precalentar: async () => {}, mantenerCaliente: () => () => {} }));
vi.mock("@/components/onboarding/paso-escena", () => ({ PasoEscena: () => null }));
vi.mock("@/components/onboarding/areas-explicadas", () => ({ AreasExplicadas: () => null }));
vi.mock("@/components/onboarding/demo-gestos-hibridos", () => ({ ResumenGestos: () => null }));
vi.mock("@/components/onboarding/selector-voz-inicial", () => ({ default: () => null }));

import OnboardingWizard from "../onboarding-wizard";

const titulo = () => screen.queryByText("Bienvenida · Guía de StarSeed con Astraura");

describe("Bienvenida · Guía de StarSeed con Astraura", () => {
  beforeEach(() => { guardar.mockClear(); alCerrar.mockClear(); abandonar.mockClear(); avisos.mockClear(); });
  afterEach(() => cleanup());

  it("la X la cierra, la deja pospuesta en la cuenta y abandona el rito de la pestaña", async () => {
    render(<OnboardingWizard onClose={alCerrar} />);
    expect(titulo()).not.toBeNull();
    const dialogo = document.querySelector("[data-bienvenida]") as HTMLElement;
    const x = dialogo.querySelector("[data-boton-cerrar]") as HTMLElement;
    expect(x).not.toBeNull();
    fireEvent.click(x);
    await waitFor(() => expect(titulo()).toBeNull());
    expect(alCerrar).toHaveBeenCalledTimes(1);
    expect(abandonar).toHaveBeenCalledTimes(1);
    expect(guardar).toHaveBeenCalledWith(expect.objectContaining({ completed: false, skipped: true }));
    await waitFor(() => expect(avisos).toHaveBeenCalled());
  });

  it("Esc también la cierra", async () => {
    render(<OnboardingWizard onClose={alCerrar} />);
    fireEvent.keyDown(document.activeElement || document.body, { key: "Escape" });
    await waitFor(() => expect(titulo()).toBeNull());
    expect(guardar).toHaveBeenCalledWith(expect.objectContaining({ skipped: true }));
  });

  it("un clic FUERA no la cierra (nadie la pierde sin querer)", async () => {
    render(<OnboardingWizard onClose={alCerrar} />);
    const fondo = document.querySelector("[data-radix-dialog-overlay], [data-state='open'][class*='fixed inset-0']");
    if (fondo) fireEvent.pointerDown(fondo);
    await new Promise((r) => setTimeout(r, 50));
    expect(titulo()).not.toBeNull();
    expect(guardar).not.toHaveBeenCalled();
  });
});

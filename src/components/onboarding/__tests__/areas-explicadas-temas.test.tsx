/**
 * GUI1021G · Tarjetas de la Guía de la red con los temas nuevos.
 * ═══════════════════════════════════════════════════════════════════════════
 * Cada ruta nueva (/protomolecula, /network/politics, /network/education,
 * /network/culture, /genesis y /cerebro) abre SU explicación, tomada de
 * TODOS_LOS_TEMAS (fuente de verdad: guia-temas-red.ts), y la tarjeta de
 * Cerebros es /cerebro y nadie habla ya de «varios cerebros» ni de la
 * continua mezcla de Librería y Biblioteca de la tarjeta vieja.
 *
 * Se importa AREAS del wizard real (módulos pesados del rito sustituidos,
 * mismo patrón que bienvenida-se-cierra.test.tsx) y se pinta AreasExplicadas.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/bienvenida",
}));

vi.mock("sonner", () => {
  const toast = Object.assign(() => undefined, {
    success: () => undefined, warning: () => undefined,
    error: () => undefined, info: () => undefined, message: () => undefined,
  });
  return { toast };
});

vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null }),
          single: async () => ({ data: null }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/onboarding/onboarding", () => ({
  getOnboarding: async () => ({ completed: false, skipped: false, steps: {} }),
  saveOnboarding: async (p: Record<string, unknown>) => ({ ...p }),
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

vi.mock("@/lib/onboarding/primer-arranque", () => ({ marcarNeuronaConfigurada: () => {} }));
vi.mock("@/lib/onboarding/director-rito", () => ({
  terminarEtapa: () => undefined,
  navegarSuave: () => undefined,
  abandonarRito: () => undefined,
}));
vi.mock("@/lib/onboarding/cerrar-bienvenida", () => ({
  cerrarBienvenida: async () => true,
  recordarCierreLocal: () => undefined,
}));
vi.mock("@/lib/aurora/narracion-ventana", () => ({ marcarVozDelRito: () => undefined }));
vi.mock("@/lib/aurora/voz-rito", () => ({
  hablarRito: () => true,
  callarRito: () => undefined,
  instalarVozPropia: () => undefined,
  anticiparRito: () => undefined,
  VOZ_RITO_EVENT: "starseed:voz-rito-prueba",
}));
vi.mock("@/lib/ui/rito-activo", () => ({ marcarRitoActivo: () => undefined }));
vi.mock("@/context/appearance-context", () => ({
  useAppearance: () => ({ config: { themeStore: { activeMode: "primary" } } }),
}));
vi.mock("@/components/aurora/aurora-provider", () => ({ useAurora: () => null }));
vi.mock("@/ai/client/chat", () => ({ chat: async () => ({ text: "" }) }));
vi.mock("@/ai/client/providerStore", () => ({ loadConfigs: () => [] }));
vi.mock("@/components/onboarding/steps-neurona", () => ({
  StepCerebros: () => null,
  StepPermisos: () => null,
  StepNeurona: () => null,
  CorreosVinculados: () => null,
  aplicarPendiente: async () => undefined,
}));
vi.mock("@/components/onboarding/paso-escena", () => ({ PasoEscena: () => null }));
vi.mock("@/components/onboarding/demo-gestos-hibridos", () => ({ ResumenGestos: () => null }));
vi.mock("@/components/onboarding/selector-voz-inicial", () => ({ default: () => null }));

// (resto de mocks e importaciones del módulo bajo prueba)
import { AREAS } from "../onboarding-wizard";
import { AreasExplicadas, type AreaTip } from "../areas-explicadas";
import { TODOS_LOS_TEMAS } from "@/lib/onboarding/guia-temas-red";
import { Compass, type LucideIcon } from "lucide-react";

const temaDeRuta = (ruta: string) => TODOS_LOS_TEMAS.find((t) => t.ruta === ruta);

const areaTonta = (path: string, label: string): AreaTip => ({
  path,
  label,
  icon: Compass as unknown as LucideIcon,
  tip: "tip de prueba",
  accent: "text-white/80",
});

function abrir(area: AreaTip): void {
  render(<AreasExplicadas areas={[area]} onIr={() => undefined} />);
  fireEvent.click(screen.getByRole("button"));
}

describe("Guía de la red · temas nuevos en las tarjetas (GUI1021G)", () => {
  afterEach(() => cleanup());

  it("AREAS incluye una tarjeta por cada ruta nueva del §3 de la guía", () => {
    for (const ruta of ["/protomolecula", "/network/politics", "/network/education", "/network/culture", "/genesis", "/cerebro"]) {
      expect(AREAS.some((a) => a.path === ruta)).toBe(true);
    }
  });

  it("la tarjeta de Cerebros es /cerebro; /cerebros ya no está en AREAS", () => {
    expect(AREAS.some((a) => a.path === "/cerebro")).toBe(true);
    expect(AREAS.some((a) => a.path === "/cerebros")).toBe(false);
  });

  it("ninguna tarjeta habla de «varios cerebros»", () => {
    const { container } = render(<AreasExplicadas areas={AREAS} onIr={() => undefined} />);
    expect(container.textContent).not.toMatch(/varios cerebros/i);
  });
});

describe("Explicaciones por ruta", () => {
  afterEach(() => cleanup());

  const RUTAS_NUEVAS = ["/protomolecula", "/network/politics", "/network/education", "/network/culture", "/genesis", "/cerebro"];

  it("cada ruta nueva abre su explicación con el cuerpo y la pregunta de Aurora del tema", () => {
    for (const ruta of RUTAS_NUEVAS) {
      const area = AREAS.find((a) => a.path === ruta);
      expect(area).toBeDefined();
      abrir(area as AreaTip);
      const tema = temaDeRuta(ruta);
      expect(tema).toBeDefined();
      expect(screen.getByText(tema?.cuerpo ?? "")).not.toBeNull();
      expect(screen.getByText(tema?.preguntaAurora ?? "")).not.toBeNull();
      cleanup();
    }
  });

  it("cada ruta nueva pinta todos sus puntos en «Cómo funciona»", () => {
    for (const ruta of RUTAS_NUEVAS) {
      const area = AREAS.find((a) => a.path === ruta);
      expect(area).toBeDefined();
      abrir(area as AreaTip);
      const tema = temaDeRuta(ruta);
      expect(tema).toBeDefined();
      for (const punto of tema?.puntos ?? []) {
        expect(screen.getByText(punto)).not.toBeNull();
      }
      cleanup();
    }
  });

  it("la ruta histórica /cerebros abre el tema neuronas-cerebro (un cerebro por cuenta)", () => {
    abrir(areaTonta("/cerebros", "Cerebros"));
    const tema = TODOS_LOS_TEMAS.find((t) => t.key === "neuronas-cerebro");
    expect(tema).toBeDefined();
    expect(screen.getByText(tema?.cuerpo ?? "")).not.toBeNull();
    expect(screen.getByText(tema?.preguntaAurora ?? "")).not.toBeNull();
  });

  it("/library usa libreria-biblioteca: Librería (catálogo de la red) y Biblioteca (lo que tú guardas)", () => {
    const area = AREAS.find((a) => a.path === "/library");
    expect(area).toBeDefined();
    abrir(area as AreaTip);
    const tema = TODOS_LOS_TEMAS.find((t) => t.key === "libreria-biblioteca");
    expect(tema).toBeDefined();
    expect(screen.getByText(tema?.cuerpo ?? "")).not.toBeNull();
  });

  it("/red-mesh usa malla: autovínculo por cuenta, QR/LoRa, ya no solo nodos LoRa de la tarjeta vieja", () => {
    const area = AREAS.find((a) => a.path === "/red-mesh");
    expect(area).toBeDefined();
    abrir(area as AreaTip);
    const tema = TODOS_LOS_TEMAS.find((t) => t.key === "malla");
    expect(tema).toBeDefined();
    expect(screen.getByText(tema?.cuerpo ?? "")).not.toBeNull();
    expect(screen.getByText("sin internet: QR o código")).not.toBeNull();
  });
});

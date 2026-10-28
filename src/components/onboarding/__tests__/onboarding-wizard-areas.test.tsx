/**
 * GUI1021G (parte 2) · las tarjetas de AREAS del rito (último paso, «Guía de la red»)
 * usan las rutas nuevas y hablan de UN cerebro. Cada ruta nueva está una sola vez,
 * con icono y tip corto, y su explicación sale del tema de TODOS_LOS_TEMAS.
 *
 * Los mocados replican los de bienvenida-se-cierra.test.tsx (probados): son
 * necesarios para EVALUAR el módulo del wizard, del que solo se lee su AREAS.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/bienvenida",
}));
vi.mock("sonner", () => {
  const toast = Object.assign(() => undefined, {
    success: () => undefined,
    warning: () => undefined,
    error: () => undefined,
    info: () => undefined,
  });
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
  saveOnboarding: async () => ({}),
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
vi.mock("../steps-neurona", () => ({
  StepCerebros: () => null,
  StepPermisos: () => null,
  StepNeurona: () => null,
  CorreosVinculados: () => null,
  aplicarPendiente: async () => {},
}));
vi.mock("@/components/aurora/aurora-provider", () => ({ useAurora: () => null }));
vi.mock("@/ai/client/chat", () => ({ chat: async () => "" }));
vi.mock("@/ai/client/providerStore", () => ({ loadConfigs: () => [] }));
vi.mock("@/lib/aurora/narracion-ventana", () => ({ marcarVozDelRito: () => {} }));
vi.mock("@/lib/aurora/voz-rito", () => ({
  hablarRito: () => true,
  callarRito: () => {},
  instalarVozPropia: () => {},
  anticiparRito: () => {},
  VOZ_RITO_EVENT: "starseed:voz-rito-prueba",
}));
vi.mock("@/components/onboarding/paso-escena", () => ({ PasoEscena: () => null }));
vi.mock("@/components/onboarding/areas-explicadas", async (orig) => {
  const real = await orig<typeof import("@/components/onboarding/areas-explicadas")>();
  return { ...real, AreasExplicadas: () => null };
});
vi.mock("@/components/onboarding/demo-gestos-hibridos", () => ({ ResumenGestos: () => null }));
vi.mock("@/components/onboarding/selector-voz-inicial", () => ({ default: () => null }));

// ── resto de la prueba: las tarjetas de AREAS ──
import { TODOS_LOS_TEMAS } from "@/lib/onboarding/guia-temas-red";
import { TEMA_POR_RUTA } from "../areas-explicadas";
import { AREAS } from "../onboarding-wizard";

/** [ruta, etiqueta] de las tarjetas nuevas de la Guía de la red (GUI1021G). */
const RUTAS_NUEVAS: Array<[string, string]> = [
  ["/protomolecula", "Protomolécula"],
  ["/network/politics", "Política"],
  ["/network/education", "Educación"],
  ["/network/culture", "Cultura"],
  ["/genesis", "Genesis"],
  ["/cerebro", "Cerebro"],
];

describe("Rito · AREAS con las rutas nuevas (GUI1021G, parte 2)", () => {
  it("cada ruta nueva está en AREAS, una sola vez, con icono y tip corto", () => {
    for (const [ruta, label] of RUTAS_NUEVAS) {
      const tarjetas = AREAS.filter((a) => a.path === ruta);
      expect(tarjetas, `la tarjeta ${ruta} aparece ${tarjetas.length} veces`).toHaveLength(1);
      expect(tarjetas[0].icon).toBeTruthy();
      expect(tarjetas[0].label).toContain(label);
      expect(tarjetas[0].tip.length).toBeGreaterThan(10);
      expect(tarjetas[0].tip.length).toBeLessThan(200);
    }
  });

  it("ninguna ruta está repetida en AREAS (las claves de React no chocan)", () => {
    const rutas = AREAS.map((a) => a.path);
    expect(new Set(rutas).size).toBe(rutas.length);
  });

  it("cada ruta nueva abre su explicación: su tema está en la fuente única", () => {
    for (const [ruta] of RUTAS_NUEVAS) {
      const clave = TEMA_POR_RUTA[ruta];
      expect(clave, `sin tema para ${ruta}`).toBeDefined();
      expect(
        TODOS_LOS_TEMAS.some((t) => t.key === clave),
        `el tema ${clave} no está en TODOS_LOS_TEMAS`,
      ).toBe(true);
    }
  });

  it("ninguna tarjeta habla de «varios cerebros» y Cerebro va a /cerebro", () => {
    const texto = AREAS.map((a) => `${a.label} ${a.tip}`).join(" ");
    expect(texto).not.toMatch(/varios cerebros/i);
    expect(AREAS.some((a) => a.path === "/cerebros")).toBe(false);
    expect(AREAS.find((a) => a.path === "/cerebro")?.tip).toMatch(/un cerebro por cuenta/i);
  });
});


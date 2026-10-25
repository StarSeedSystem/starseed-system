/**
 * GUI1021G · Las tarjetas de la Guía de la red hablan con los textos nuevos.
 * ═══════════════════════════════════════════════════════════════════════════
 * Cada ruta nueva (/protomolecula, los tres pilares, /genesis, /cerebro) abre
 * su explicación tomada de TODOS_LOS_TEMAS (§3 de
 * `architecture/guias-introduccion.md`, fuente de verdad) y ninguna tarjeta
 * habla de «varios cerebros»: hoy un cerebro por cuenta, en /cerebro.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/bienvenida",
}));
vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) }),
  }),
}));
vi.mock("@/lib/onboarding/onboarding", () => ({
  getOnboarding: async () => ({ completed: false, steps: {} }),
  saveOnboarding: async (p: object) => p,
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

vi.mock("sonner", () => {
  const toast = Object.assign(() => undefined, { success: () => undefined, error: () => undefined, warning: () => undefined, message: () => undefined });
  return { toast };
});
vi.mock("@/context/appearance-context", () => ({
  useAppearance: () => ({ config: { themeStore: { activeMode: "primary" } } }),
}));
vi.mock("@/lib/onboarding/director-rito", () => ({
  terminarEtapa: () => {}, navegarSuave: () => {}, abandonarRito: () => {},
}));
vi.mock("@/lib/onboarding/primer-arranque", () => ({ marcarNeuronaConfigurada: () => {} }));
vi.mock("@/lib/onboarding/cerrar-bienvenida", () => ({ cerrarBienvenida: async () => true, recordarCierreLocal: () => {} }));
vi.mock("../steps-neurona", () => ({
  StepCerebros: () => null, StepPermisos: () => null, StepNeurona: () => null,
  CorreosVinculados: () => null, aplicarPendiente: async () => {},
}));
vi.mock("@/components/aurora/aurora-provider", () => ({ useAurora: () => null }));
vi.mock("@/ai/client/chat", () => ({ chat: async () => ({ text: "" }) }));
vi.mock("@/ai/client/providerStore", () => ({ loadConfigs: () => [] }));
vi.mock("@/lib/aurora/types", () => ({
  buildSystemPrompt: () => "", DEFAULT_PERSONALITY: "aurora",
}));
vi.mock("@/lib/aurora/narracion-ventana", () => ({ marcarVozDelRito: () => {} }));
vi.mock("@/lib/ui/rito-activo", () => ({ marcarRitoActivo: () => {} }));
vi.mock("@/lib/aurora/voz-rito", () => ({
  hablarRito: () => true, callarRito: () => {}, instalarVozPropia: () => {}, anticiparRito: () => {},
  VOZ_RITO_EVENT: "starseed:voz-rito-prueba",
}));
vi.mock("@/lib/aurora/motor-voz", () => ({ precalentarMotorNeural: async () => {}, precalentar: async () => {} }));
vi.mock("@/lib/aurora/motor-local", () => ({ precalentar: async () => {}, mantenerCaliente: () => () => {} }));
vi.mock("@/components/onboarding/paso-escena", () => ({ PasoEscena: () => null }));
vi.mock("@/components/onboarding/demo-gestos-hibridos", () => ({ ResumenGestos: () => null }));
vi.mock("@/components/onboarding/selector-voz-inicial", () => ({ default: () => null }));

import { AreasExplicadas, explicacionDeTema, type AreaTip } from "../areas-explicadas";
import { AREAS } from "../onboarding-wizard";
import { TODOS_LOS_TEMAS } from "@/lib/onboarding/guia-temas-red";

afterEach(() => cleanup());

const RUTAS_NUEVAS = [
  "/protomolecula",
  "/network/politics",
  "/network/education",
  "/network/culture",
  "/genesis",
  "/cerebro",
] as const;

describe("explicacionDeTema · texto de la guía por ruta (GUI1021G)", () => {
  it("cada ruta nueva toma su explicación del tema con esa misma ruta", () => {
    for (const ruta of RUTAS_NUEVAS) {
      const e = explicacionDeTema(ruta);
      expect(e).not.toBeNull();
      const tema = TODOS_LOS_TEMAS.find((t) => t.ruta === ruta);
      expect(tema).toBeDefined();
      expect(e?.queEs).toBe(tema?.cuerpo);
      expect(e?.empiezaPor).toBe(tema?.preguntaAurora);
      expect(e?.comoFunciona.map((p) => p.texto)).toEqual([...(tema?.puntos ?? [])]);
    }
  });

  it("/genesis responde al tema de Genesis, no al de personalización segura", () => {
    const genesis = TODOS_LOS_TEMAS.find((t) => t.key === "genesis");
    expect(explicacionDeTema("/genesis")?.queEs).toBe(genesis?.cuerpo);
  });

  it("las tres correcciones usan neuronas-cerebro, libreria-biblioteca y malla", () => {
    const d = [
      ["/cerebro", "neuronas-cerebro"],
      ["/library", "libreria-biblioteca"],
      ["/red-mesh", "malla"],
    ] as const;
    for (const [ruta, key] of d) {
      const tema = TODOS_LOS_TEMAS.find((t) => t.key === key);
      expect(explicacionDeTema(ruta)?.queEs).toBe(tema?.cuerpo);
    }
  });

  it("una ruta sin tema deja pasar a la explicación genérica (null)", () => {
    expect(explicacionDeTema("/pizarra")).toBeNull();
  });
});

describe("tarjetas de la Guía de la red (GUI1021G)", () => {
  it("hay una tarjeta por cada ruta nueva y ya no está /cerebros", () => {
    for (const ruta of RUTAS_NUEVAS) {
      expect(AREAS.some((a) => a.path === ruta)).toBe(true);
    }
    expect(AREAS.some((a) => a.path === "/cerebros")).toBe(false);
  });

  it("ninguna tarjeta habla de «varios cerebros»", () => {
    const textoDe = AREAS.map((a) => `${a.label} ${a.tip}`).join(" ");
    expect(textoDe).not.toMatch(/varios cerebros/i);
    expect(AREAS.length).toBe(20);
  });

  function abrir(areas: AreaTip[], etiqueta: string) {
    render(<AreasExplicadas areas={areas} onIr={() => {}} />);
    fireEvent.click(screen.getByText(etiqueta));
  }

  for (const ruta of RUTAS_NUEVAS) {
    it(`al abrir la tarjeta de ${ruta} aparece el cuerpo del tema y la pregunta a Aurora`, async () => {
      const area = AREAS.find((a) => a.path === ruta);
      expect(area).toBeDefined();
      const tema = TODOS_LOS_TEMAS.find((t) => t.ruta === ruta)!;
      abrir([area!], area!.label);
      expect(await screen.findByText(tema.cuerpo)).not.toBeNull();
      expect(screen.getByText(tema.preguntaAurora)).not.toBeNull();
      // Y el primer punto del tema figura entre «cómo funciona».
      expect(screen.getByText(tema.puntos[0])).not.toBeNull();
    });
  }

  it("la tarjeta de la Librería mezcla Librería y Biblioteca, como la guía", async () => {
    const tema = TODOS_LOS_TEMAS.find((t) => t.key === "libreria-biblioteca")!;
    abrir([AREAS.find((a) => a.path === "/library")!], AREAS.find((a) => a.path === "/library")!.label);
    expect(await screen.findByText(tema.cuerpo)).not.toBeNull();
  });

  it("la tarjeta de la Red Mesh usa el tema malla (no solo LoRa)", async () => {
    const tema = TODOS_LOS_TEMAS.find((t) => t.key === "malla")!;
    abrir([AREAS.find((a) => a.path === "/red-mesh")!], AREAS.find((a) => a.path === "/red-mesh")!.label);
    expect(await screen.findByText(tema.cuerpo)).not.toBeNull();
  });
});




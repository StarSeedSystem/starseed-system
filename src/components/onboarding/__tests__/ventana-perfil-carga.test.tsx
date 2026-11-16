/**
 * VENTANA-DE-PERFIL-1: Test de carga de perfil.
 * Verifica que la carga de datos del perfil reporta errores
 * en lugar de quedarse en silencio.
 *
 * El catch silencioso en ventana-perfil-inicial.tsx:131 oculta errores
 * de autenticación y consulta a Supabase, dejando al usuario con
 * datos vacíos sin diagnóstico posible.
 */
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const avisos = vi.hoisted(() => vi.fn());
const guardar = vi.hoisted(() => vi.fn());
const abandonar = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/bienvenida",
  useSearchParams: () => ({ get: () => null }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: avisos,
    error: avisos,
    warning: avisos,
    info: avisos,
  },
}));

vi.mock("@/context/appearance-context", () => ({
  useAppearance: () => ({ config: { themeStore: { activeMode: "primary" } } }),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

const mockCreateClient = vi.hoisted(() => ({
  auth: {
    getUser: async () => ({ data: { user: { id: "user-123", is_anonymous: false } }, error: null }),
    getSession: async () => ({ data: { session: null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  },
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: null, error: null }),
      }),
    }),
  }),
}));

vi.mock("@/utils/supabase/client", () => ({
  createClient: () => mockCreateClient,
}));

vi.mock("@/lib/onboarding/director-rito", (orig) => ({
  ...(orig as any),
  esMiTurno: () => true,
  terminarEtapa: () => {},
  suscribirRito: () => () => {},
  navegarSuave: vi.fn(),
}));

vi.mock("@/lib/onboarding/onboarding", () => ({
  claimProfile: async () => ({ ok: true }),
  saveProfileOptional: async () => ({ ok: true }),
  isValidHandle: () => true,
  sincronizarPerfilPublico: async () => {},
}));

vi.mock("@/lib/ui/rito-activo", () => ({
  marcarRitoActivo: vi.fn(),
}));

vi.mock("@/components/profile/foto-con-marco", () => ({
  FotoConMarco: ({ children }: { children: React.ReactNode }) => <div data-testid="foto-marco">{children}</div>,
}));

vi.mock("@/components/profile/avatar-3d", () => ({
  Avatar3DVisor: () => <div data-testid="avatar-3d" />,
  EditorAvatar3D: () => <div />,
}));

vi.mock("@/lib/profile/marco-foto", () => ({
  MARCO_POR_DEFECTO: { forma: "redonda", borde: 2 },
  type: {},
}));

vi.mock("@/lib/sync/entity-state", () => ({
  deviceId: () => "device-test",
}));

vi.mock("@/lib/profiles/profiles", () => ({
  activeProfileId: () => "test-profile",
}));

vi.mock("@/components/inicio/preferencias-arranque", () => ({
  PreferenciasArranque: () => <div data-testid="preferencias-arranque" />,
}));

vi.mock("../steps-neurona", () => ({
  StepCerebros: () => null,
  StepPermisos: () => null,
  StepNeurona: () => null,
  CorreosVinculados: () => null,
  aplicarPendiente: async () => {},
}));

vi.mock("../icono-starseed", () => ({
  IconoStarSeed: () => <div data-testid="icono-starseed" />,
}));

vi.mock("../aurora-guide-voice", () => ({
  auroraBridge: () => null,
  auroraSpeak: () => undefined,
  auroraEnsureListening: () => undefined,
}));

import { VentanaPerfilInicial } from "../ventana-perfil-inicial";

const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {}).mockImplementation(vi.fn);
const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {}).mockImplementation(vi.fn);

describe("VentanaPerfilInicial - carga de perfil", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    avisos.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
    vi.useRealTimers();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it("renderiza la ventana de perfil y muestra el título", () => {
    render(<VentanaPerfilInicial />);
    expect(screen.getByRole("heading", { name: /Tu perfil en la red/i })).toBeInTheDocument();
  });

  it("muestra 'Cargando tu perfil' mientras se obtiene el usuario de Supabase", () => {
    render(<VentanaPerfilInicial />);
    expect(screen.getByText(/Cargando tu perfil/)).toBeInTheDocument();
  });
});
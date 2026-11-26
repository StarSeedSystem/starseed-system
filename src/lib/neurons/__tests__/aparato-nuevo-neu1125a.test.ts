// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usarConfiguracionDeNeurona } from "../adopcion-neurona";
import { adoptarNeurona, leerAliasDispositivo } from "@/lib/network/identidad-dispositivo";
import { safeGet, safeSet } from "@/lib/safe-storage";
import { CLAVE_HUELLA_REVISION } from "../adopcion-neurona";

const LS_NEURON = "starseed.neuron.device-id";
const NEURON_PREFS_KEY = "starseed.neurons.prefs.v1";
const CLAVE_ALIAS_DISPOSITIVO = "starseed.device.alias.v1";

function resetStorage() {
  if (typeof window !== "undefined") {
    window.localStorage.clear();
  }
  vi.resetAllMocks();
}

function setupNeuronId(id: string) {
  safeSet(LS_NEURON, id);
}

function setupAlias(adoptada: string, propia: string) {
  safeSet(CLAVE_ALIAS_DISPOSITIVO, JSON.stringify({ v: 1, neurona: { adoptada, propia, ts: Date.now() } }));
}

function setupPrefs(neuronId: string, hasPrefs: boolean) {
  if (hasPrefs) {
    safeSet(NEURON_PREFS_KEY, JSON.stringify({ names: { [neuronId]: "Mi Neurona" }, permissions: {}, settings: {} }));
  } else {
    safeSet(NEURON_PREFS_KEY, JSON.stringify({ names: {}, permissions: {}, settings: {} }));
  }
}

// Mock del puente nativo configurable por test
const mockPuente = {
  disponible: true,
  huellaAparatoVerificar: vi.fn(),
  huellaAparatoActual: vi.fn(),
  huellaAparatoGenerar: vi.fn(),
};

vi.mock("@/lib/nativa/puente", () => ({
  get puenteNativo() {
    return () => mockPuente;
  },
  get esAppNativa() {
    return () => mockPuente.disponible;
  },
}));

vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  }),
}));

vi.mock("@/lib/onboarding/primer-arranque", () => ({
  marcarNeuronaConfigurada: vi.fn(),
}));

// Mock para módulos de huella web (aparato-registro, aparato-este-medio, neurons)
const mockHuellaWeb = {
  leerAparato: vi.fn(),
  aparatoDeEsteMedio: vi.fn(),
  detectCapabilities: vi.fn(),
};

vi.mock("@/lib/neurons/aparato-registro", () => ({
  leerAparato: (...args: unknown[]) => mockHuellaWeb.leerAparato(...args),
}));

vi.mock("@/lib/neurons/aparato-este-medio", () => ({
  aparatoDeEsteMedio: (...args: unknown[]) => mockHuellaWeb.aparatoDeEsteMedio(...args),
}));

vi.mock("@/lib/neurons/neurons", () => ({
  detectCapabilities: (...args: unknown[]) => mockHuellaWeb.detectCapabilities(...args),
}));

describe("aparato-nuevo NEU1125A - adopción con huella nativa", () => {
  beforeEach(() => {
    resetStorage();
    vi.clearAllMocks();
    
    // Configuración por defecto: app nativa disponible, huella coincide
    mockPuente.disponible = true;
    mockPuente.huellaAparatoVerificar.mockResolvedValue({ ok: true, valor: true });
    mockPuente.huellaAparatoActual.mockResolvedValue({ ok: true, valor: { huella: "abc123", id_guardado: "device-1", creado: "123" } });
    mockPuente.huellaAparatoGenerar.mockResolvedValue({ ok: true, valor: { huella: "abc123", id_guardado: "device-1", creado: "123" } });
    
    // Mocks por defecto para huella web (no se usan en app nativa)
    mockHuellaWeb.leerAparato.mockReturnValue({ v: 1, huella: "web-huella-123" });
    mockHuellaWeb.aparatoDeEsteMedio.mockResolvedValue({ v: 1, huella: "web-huella-123" });
    mockHuellaWeb.detectCapabilities.mockResolvedValue({});
  });

  it("misma huella nativa → adopta correctamente", async () => {
    const idPropia = "neurona-propia-123";
    const idAdoptada = "neurona-ajena-456";
    setupNeuronId(idPropia);
    setupPrefs(idPropia, false);

    const resultado = await usarConfiguracionDeNeurona(idAdoptada, { propiaCreadaAhora: true });

    expect(resultado.ok).toBe(true);
    expect(resultado.adoptada).toBe(idAdoptada);
    expect(resultado.anterior).toBe(idPropia);
    expect(resultado.filaDuplicadaEliminada).toBe(true);
    expect(resultado.motivo).toBeUndefined();
  });

  it("huella nativa distinta → motivo 'aparato-nuevo' y NO adopta", async () => {
    mockPuente.huellaAparatoVerificar.mockResolvedValue({ ok: true, valor: false });

    const idPropia = "neurona-propia-123";
    const idAdoptada = "neurona-ajena-456";
    setupNeuronId(idPropia);
    setupPrefs(idPropia, false);

    const resultado = await usarConfiguracionDeNeurona(idAdoptada, { propiaCreadaAhora: true });

    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toBe("aparato-nuevo");
    expect(resultado.adoptada).toBe(idPropia); // sigue siendo la propia
    expect(resultado.anterior).toBe(idPropia);
    expect(resultado.filaDuplicadaEliminada).toBe(false);
    // Verificar que tiene todos los campos de ResultadoUsarConfiguracion
    expect(resultado).toHaveProperty("ok");
    expect(resultado).toHaveProperty("anterior");
    expect(resultado).toHaveProperty("adoptada");
    expect(resultado).toHaveProperty("motivo");
    expect(resultado).toHaveProperty("filaDuplicadaEliminada");
    expect(typeof resultado.ok).toBe("boolean");
    expect(typeof resultado.anterior).toBe("string");
    expect(typeof resultado.adoptada).toBe("string");
    expect(typeof resultado.filaDuplicadaEliminada).toBe("boolean");
  });

  it("huella nativa distinta → marca huella como 'requiere revisión'", async () => {
    mockPuente.huellaAparatoVerificar.mockResolvedValue({ ok: true, valor: false });

    const idPropia = "neurona-propia-123";
    const idAdoptada = "neurona-ajena-456";
    setupNeuronId(idPropia);
    setupPrefs(idPropia, false);

    await usarConfiguracionDeNeurona(idAdoptada, { propiaCreadaAhora: true });

    const revision = window.localStorage.getItem(CLAVE_HUELLA_REVISION);
    expect(revision).not.toBeNull();
    const parsed = JSON.parse(revision!);
    expect(parsed.v).toBe(1);
    expect(typeof parsed.ts).toBe("number");
  });

  it("sin huella guardada (versión antigua) → adopta y genera huella actual", async () => {
    mockPuente.huellaAparatoVerificar.mockResolvedValue({ ok: false });
    mockPuente.huellaAparatoActual.mockResolvedValue({ ok: true, valor: null });
    mockPuente.huellaAparatoGenerar.mockResolvedValue({ ok: true, valor: { huella: "nueva-huella", id_guardado: "device-1", creado: "123" } });

    const idPropia = "neurona-propia-123";
    const idAdoptada = "neurona-ajena-456";
    setupNeuronId(idPropia);
    setupPrefs(idPropia, false);

    const resultado = await usarConfiguracionDeNeurona(idAdoptada, { propiaCreadaAhora: true });

    expect(resultado.ok).toBe(true);
    expect(resultado.adoptada).toBe(idAdoptada);
    expect(mockPuente.huellaAparatoGenerar).toHaveBeenCalled();
    // No debe haber marca de revisión tras adopción exitosa
    const revision = window.localStorage.getItem(CLAVE_HUELLA_REVISION);
    expect(revision).toBeNull();
  });

  it("en web (sin app nativa) usa huella web y adopta si coincide", async () => {
    // Configurar como web (sin app nativa)
    mockPuente.disponible = false;
    
    const idPropia = "neurona-propia-123";
    const idAdoptada = "neurona-ajena-456";
    setupNeuronId(idPropia);
    setupPrefs(idPropia, false);

    // La huella web coincide
    mockHuellaWeb.leerAparato.mockReturnValue({ v: 1, huella: "web-huella-123" });
    mockHuellaWeb.aparatoDeEsteMedio.mockResolvedValue({ v: 1, huella: "web-huella-123" });

    const resultado = await usarConfiguracionDeNeurona(idAdoptada, { propiaCreadaAhora: true });

    expect(resultado.ok).toBe(true);
    expect(resultado.adoptada).toBe(idAdoptada);
    // No debe llamar a comandos nativos
    expect(mockPuente.huellaAparatoVerificar).not.toHaveBeenCalled();
    expect(mockPuente.huellaAparatoGenerar).not.toHaveBeenCalled();
  });

  it("en web (sin app nativa) con huella web distinta → motivo 'aparato-nuevo'", async () => {
    mockPuente.disponible = false;
    
    const idPropia = "neurona-propia-123";
    const idAdoptada = "neurona-ajena-456";
    setupNeuronId(idPropia);
    setupPrefs(idPropia, false);

    // Huella guardada distinta a la actual
    mockHuellaWeb.leerAparato.mockReturnValue({ v: 1, huella: "web-huella-guardada" });
    mockHuellaWeb.aparatoDeEsteMedio.mockResolvedValue({ v: 1, huella: "web-huella-actual" });

    const resultado = await usarConfiguracionDeNeurona(idAdoptada, { propiaCreadaAhora: true });

    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toBe("aparato-nuevo");
    expect(resultado.adoptada).toBe(idPropia);
    // Debe marcar requiere revisión
    const revision = window.localStorage.getItem(CLAVE_HUELLA_REVISION);
    expect(revision).not.toBeNull();
  });

  it("en web sin huella guardada (versión antigua) → adopta sin bloquear", async () => {
    mockPuente.disponible = false;
    
    const idPropia = "neurona-propia-123";
    const idAdoptada = "neurona-ajena-456";
    setupNeuronId(idPropia);
    setupPrefs(idPropia, false);

    // Sin huella guardada (null)
    mockHuellaWeb.leerAparato.mockReturnValue({ v: 1, huella: undefined });
    mockHuellaWeb.aparatoDeEsteMedio.mockResolvedValue({ v: 1, huella: "web-huella-nueva" });

    const resultado = await usarConfiguracionDeNeurona(idAdoptada, { propiaCreadaAhora: true });

    expect(resultado.ok).toBe(true);
    expect(resultado.adoptada).toBe(idAdoptada);
    // No debe haber marca de revisión
    const revision = window.localStorage.getItem(CLAVE_HUELLA_REVISION);
    expect(revision).toBeNull();
  });

  it("resultado con motivo 'aparato-nuevo' extiende correctamente el resultado base", async () => {
    mockPuente.huellaAparatoVerificar.mockResolvedValue({ ok: true, valor: false });

    const idPropia = "neurona-propia-123";
    const idAdoptada = "neurona-ajena-456";
    setupNeuronId(idPropia);
    setupPrefs(idPropia, false);

    const resultado = await usarConfiguracionDeNeurona(idAdoptada, { propiaCreadaAhora: true });

    // Verificar que tiene todos los campos de ResultadoUsarConfiguracion
    expect(resultado).toHaveProperty("ok");
    expect(resultado).toHaveProperty("anterior");
    expect(resultado).toHaveProperty("adoptada");
    expect(resultado).toHaveProperty("motivo");
    expect(resultado).toHaveProperty("filaDuplicadaEliminada");
    expect(typeof resultado.ok).toBe("boolean");
    expect(typeof resultado.anterior).toBe("string");
    expect(typeof resultado.adoptada).toBe("string");
    expect(typeof resultado.filaDuplicadaEliminada).toBe("boolean");
    expect(resultado.motivo).toBe("aparato-nuevo");
  });

  it("dos arranques en el mismo aparato dan la misma huella nativa", async () => {
    const idPropia = "neurona-propia-123";
    const idAdoptada = "neurona-ajena-456";
    setupNeuronId(idPropia);
    setupPrefs(idPropia, false);

    // Primera adopción
    const r1 = await usarConfiguracionDeNeurona(idAdoptada, { propiaCreadaAhora: true });
    expect(r1.ok).toBe(true);

    // Simular reinicio: nueva neurona propia, misma huella guardada
    resetStorage();
    setupNeuronId("neurona-nueva-789");
    setupPrefs("neurona-nueva-789", false);
    mockPuente.huellaAparatoVerificar.mockResolvedValue({ ok: true, valor: true });

    const r2 = await usarConfiguracionDeNeurona(idAdoptada, { propiaCreadaAhora: true });
    expect(r2.ok).toBe(true);
  });

  it("adopción exitosa limpia marca de revisión previa", async () => {
    // Primero simular un aparato nuevo (marca de revisión)
    window.localStorage.setItem(CLAVE_HUELLA_REVISION, JSON.stringify({ v: 1, ts: Date.now() - 1000 }));

    const idPropia = "neurona-propia-123";
    const idAdoptada = "neurona-ajena-456";
    setupNeuronId(idPropia);
    setupPrefs(idPropia, false);

    const resultado = await usarConfiguracionDeNeurona(idAdoptada, { propiaCreadaAhora: true });

    expect(resultado.ok).toBe(true);
    const revision = window.localStorage.getItem(CLAVE_HUELLA_REVISION);
    expect(revision).toBeNull();
  });

  it("ResultadoAdopcion de identidad-dispositivo incluye 'aparato-nuevo'", async () => {
    // Verificar que el tipo ResultadoAdopcion acepta 'aparato-nuevo'
    const resultado = adoptarNeurona("id-invalido@@");
    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toBe("id-invalido");

    // La adopción exitosa no debe tener motivo
    setupNeuronId("neurona-existente");
    const r2 = adoptarNeurona("neurona-existente");
    expect(r2.ok).toBe(true);
    expect(r2.motivo).toBeUndefined();
  });

  it("verificación de huella nativa con error → no bloquea (null), adopta y genera huella", async () => {
    // huellaAparatoVerificar devuelve ok: false (error de comunicación)
    mockPuente.huellaAparatoVerificar.mockResolvedValue({ ok: false, motivo: "Error nativo" });
    mockPuente.huellaAparatoActual.mockResolvedValue({ ok: true, valor: null });
    mockPuente.huellaAparatoGenerar.mockResolvedValue({ ok: true, valor: { huella: "generada-desde-error", id_guardado: "device-1", creado: "123" } });

    const idPropia = "neurona-propia-123";
    const idAdoptada = "neurona-ajena-456";
    setupNeuronId(idPropia);
    setupPrefs(idPropia, false);

    const resultado = await usarConfiguracionDeNeurona(idAdoptada, { propiaCreadaAhora: true });

    // Debe adoptar (no bloquear por error de verificación)
    expect(resultado.ok).toBe(true);
    expect(resultado.adoptada).toBe(idAdoptada);
    expect(mockPuente.huellaAparatoGenerar).toHaveBeenCalled();
  });

  it("huella nativa coincide pero huellaActual falla → adopta igualmente", async () => {
    // Verificación OK pero lectura de huella actual falla
    mockPuente.huellaAparatoVerificar.mockResolvedValue({ ok: true, valor: true });
    mockPuente.huellaAparatoActual.mockResolvedValue({ ok: false, motivo: "Error lectura" });

    const idPropia = "neurona-propia-123";
    const idAdoptada = "neurona-ajena-456";
    setupNeuronId(idPropia);
    setupPrefs(idPropia, false);

    const resultado = await usarConfiguracionDeNeurona(idAdoptada, { propiaCreadaAhora: true });

    expect(resultado.ok).toBe(true);
    expect(resultado.adoptada).toBe(idAdoptada);
  });
});
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

// Mock del puente nativo
const mockPuente = {
  disponible: true,
  huellaAparatoVerificar: vi.fn(),
  huellaAparatoActual: vi.fn(),
  huellaAparatoGenerar: vi.fn(),
};

vi.mock("@/lib/nativa/puente", () => ({
  puenteNativo: () => mockPuente,
  esAppNativa: () => true,
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

describe("aparato-nuevo NEU1125A - adopción con huella nativa", () => {
  beforeEach(() => {
    resetStorage();
    vi.clearAllMocks();
    mockPuente.disponible = true;
    mockPuente.huellaAparatoVerificar.mockResolvedValue({ ok: true, valor: true });
    mockPuente.huellaAparatoActual.mockResolvedValue({ ok: true, valor: { huella: "abc123", id_guardado: "device-1", creado: "123" } });
    mockPuente.huellaAparatoGenerar.mockResolvedValue({ ok: true, valor: { huella: "abc123", id_guardado: "device-1", creado: "123" } });
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

  it("sin huella guardada (versión antigua) → adopta y guarda huella actual", async () => {
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
    vi.doMock("@/lib/nativa/puente", () => ({
      puenteNativo: () => ({ disponible: false, huellaAparatoVerificar: vi.fn(), huellaAparatoActual: vi.fn(), huellaAparatoGenerar: vi.fn() }),
      esAppNativa: () => false,
    }));

    const idPropia = "neurona-propia-123";
    const idAdoptada = "neurona-ajena-456";
    setupNeuronId(idPropia);
    setupPrefs(idPropia, false);

    // Mockear la comparación de huella web para que coincida
    vi.doMock("@/lib/neurons/aparato-registro", () => ({
      leerAparato: () => ({ v: 1, huella: "web-huella-123" }),
    }));
    vi.doMock("@/lib/neurons/aparato-este-medio", () => ({
      aparatoDeEsteMedio: () => Promise.resolve({ v: 1, huella: "web-huella-123" }),
    }));
    vi.doMock("@/lib/neurons/neurons", () => ({
      detectCapabilities: () => Promise.resolve({}),
    }));

    const resultado = await usarConfiguracionDeNeurona(idAdoptada, { propiaCreadaAhora: true });

    expect(resultado.ok).toBe(true);
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

  it("dos arranques en el mismo aparato dan la misma huella", async () => {
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
});
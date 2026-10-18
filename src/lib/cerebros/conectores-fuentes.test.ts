import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the modules
vi.mock('../connectors/store', () => ({
  listConnectors: vi.fn(),
}));
vi.mock('../integrations', () => ({
  INTEGRATIONS: [] as any,
  loadIntegrationConfig: vi.fn(),
}));
vi.mock('../abilities/abilities', () => ({
  loadAbilities: vi.fn(),
  abilitiesFor: vi.fn(),
}));
vi.mock('../realtime/realtime', () => ({
  useRealtimeRows: vi.fn(),
}));

// Import the mocked modules
import { listConnectors } from '../connectors/store';
import { INTEGRATIONS, loadIntegrationConfig } from '../integrations';
import { loadAbilities, abilitiesFor } from '../abilities/abilities';
import { useRealtimeRows } from '../realtime/realtime';

// Now we can mock the functions
const mockedListConnectors = vi.mocked(listConnectors);
const mockedLoadIntegrationConfig = vi.mocked(loadIntegrationConfig);
const mockedLoadAbilities = vi.mocked(loadAbilities);
const mockedAbilitiesFor = vi.mocked(abilitiesFor);
const mockedUseRealtimeRows = vi.mocked(useRealtimeRows);

import { leerFuentesConectores } from "./conectores-fuentes";

// Mock de localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string): string | null => store[key] ?? null,
    setItem: (key: string, value: string): void => {
      store[key] = value.toString();
    },
    clear: (): void => {
      store = {};
    },
  };
})();

// Mock de fetch
const fetchMock = vi.fn();

// Create a mock window object
const windowMock = {
  localStorage: localStorageMock,
  fetch: fetchMock,
};

// Set the mock window as the global window
global.window = windowMock as any;

describe("leerFuentesConectores", () => {
  beforeEach(() => {
    localStorageMock.clear();
    fetchMock.mockClear();
    vi.clearAllMocks();
    // Reset the mock implementations to their initial state
    mockedListConnectors.mockReset();
    mockedLoadIntegrationConfig.mockReset();
    mockedLoadAbilities.mockReset();
    mockedUseRealtimeRows.mockReset();
  });

  it("should return empty arrays when brainId is null", async () => {
    const resultado = await leerFuentesConectores(null);
    expect(resultado.fuentes).toEqual([]);
    expect(resultado.avisos).toContain("No se proporcionó brainId");
  });

  it("should not throw when all sources return empty", async () => {
    // Mock all sources to return empty
    mockedListConnectors.mockReturnValueOnce([]);
    mockedLoadIntegrationConfig.mockResolvedValueOnce(null as any);
    mockedLoadAbilities.mockResolvedValueOnce([]);
    mockedUseRealtimeRows.mockReturnValue({ rows: [], reload: vi.fn(), loading: false });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    const brainId = "test-brain";
    await expect(leerFuentesConectores(brainId)).resolves.toBeDefined();
  });

  it("should process abilities", async () => {
    // Mock loadAbilities to return an ability
    mockedLoadAbilities.mockResolvedValueOnce([
      { kind: "mcp", ref: "test-ability", name: "Test Ability", source: "starseed" },
    ]);
    // Mock abilitiesFor to return an array with one link (so the ability is linked)
    mockedAbilitiesFor.mockResolvedValueOnce([
      { id: "link1", kind: "mcp", ref: "test-ability", target_scope: "cerebro", target_ref: "test-brain", enabled: true, name: "Test Ability Link", config: {} },
    ]);

    // Mock other dependencies
    mockedListConnectors.mockReturnValueOnce([]);
    mockedLoadIntegrationConfig.mockResolvedValueOnce(null as any);
    mockedUseRealtimeRows.mockReturnValue({ rows: [], reload: vi.fn(), loading: false });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    const brainId = "test-brain";
    const resultado = await leerFuentesConectores(brainId);

    expect(resultado.fuentes.length).toBeGreaterThan(0);
    const ability = resultado.fuentes.find((f) => f.id === "mcp:test-ability");
    expect(ability).toBeDefined();
    expect(ability?.tipo).toBe("mcp");
    expect(ability?.estado).toBe("conectado"); // because linked
    expect(ability?.enlace).toBe(`/habilidades/test-ability`);
    expect(ability?.enCerebro).toBe(true);
  });
});
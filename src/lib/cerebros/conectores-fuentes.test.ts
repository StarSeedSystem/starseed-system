import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../connectors/store', () => ({
  listConnectors: vi.fn(),
}));
vi.mock('../integrations', () => ({
  INTEGRATIONS: [],
  loadIntegrationConfig: vi.fn(() => Promise.resolve(null)),
}));
vi.mock('../abilities/abilities', () => ({
  loadAbilities: vi.fn(() => Promise.resolve([])),
}));
vi.mock('../realtime/realtime', () => ({
  useRealtimeRows: vi.fn((table: string, loader: () => Promise<any[]>, opts?: any) => ({ rows: [], reload: vi.fn() })),
}));

// Import the mocked modules to access their mocks
import { listConnectors } from '../connectors/store';
import { loadIntegrationConfig } from '../integrations';
import { loadAbilities } from '../abilities/abilities';
import { useRealtimeRows } from '../realtime/realtime';

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
const windowMock = {};
Object.defineProperty(windowMock, "localStorage", {
  value: localStorageMock,
  writable: true,
});
Object.defineProperty(windowMock, "fetch", {
  value: fetchMock,
  writable: true,
});

// Set the mock window as the global window
global.window = windowMock;

describe("leerFuentesConectores", () => {
  beforeEach(() => {
    localStorageMock.clear();
    fetchMock.mockClear();
    vi.clearAllMocks();
  });

  it("should return empty arrays when brainId is null", async () => {
    const resultado = await leerFuentesConectores(null);
    expect(resultado.fuentes).toEqual([]);
    expect(resultado.avisos).toContain("No se proporcionó brainId");
  });

  it("should process listConnectors", async () => {
    // Mock listConnectors to return a simple conector
    const mockList = [
      {
        connector: { id: "test-conector", name: "Test Conector", category: "test", kind: "test", authType: "none", status: "available", free: true, recommended: true, icon: "Test", description: "Test", repo: "", docsUrl: "", configHint: "" },
        config: { id: "test-conector", enabled: true },
        status: "available",
      },
    ];
    listConnectors.mockReturnValue(mockList);

    // Mock other dependencies
    loadIntegrationConfig.mockResolvedValue(null);
    loadAbilities.mockResolvedValue([]);
    useRealtimeRows.mockReturnValue({ rows: [], reload: vi.fn() });

    const brainId = "test-brain";
    const resultado = await leerFuentesConectores(brainId);

    // Debemos tener al menos un conector de la lista
    expect(resultado.fuentes.length).toBeGreaterThan(0);
    const conector = resultado.fuentes.find((f) => f.id === "test-conector");
    expect(conector).toBeDefined();
    expect(conector?.tipo).toBe("conector");
    expect(conector?.estado).toBe("disponible"); // porque status available -> disponible
    expect(conector?.enCerebro).toBe(false); // por defecto no está en el cerebro
  });
});
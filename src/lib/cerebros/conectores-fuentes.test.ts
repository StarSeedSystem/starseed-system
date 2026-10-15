// Mock de las dependencias con rutas relativas
jest.mock('../connectors', () => ({
  listConnectors: jest.fn(),
}));
jest.mock('../integrations', () => ({
  INTEGRATIONS: [],
  loadIntegrationConfig: jest.fn(),
}));
jest.mock('../abilities/abilities', () => ({
  loadAbilities: jest.fn(),
}));
jest.mock('../realtime/realtime', () => ({
  useRealtimeRows: jest.fn(),
}));

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
const fetchMock = jest.fn();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
  writable: true,
});

Object.defineProperty(window, "fetch", {
  value: fetchMock,
  writable: true,
});

describe("leerFuentesConectores", () => {
  beforeEach(() => {
    localStorageMock.clear();
    fetchMock.mockClear();
    jest.clearAllMocks();
  });

  it("should return empty arrays when brainId is null", async () => {
    const resultado = await leerFuentesConectores(null);
    expect(resultado.fuentes).toEqual([]);
    expect(resultado.avisos).toContain("No se proporcionó brainId");
  });

  it("should process listConnectors", async () => {
    // Mock listConnectors to return a simple conector
    const mockListConnectors = require('../connectors').listConnectors;
    mockListConnectors.mockReturnValueOnce([
      {
        connector: { id: "test-conector", name: "Test Conector", category: "test", kind: "test", authType: "none", status: "available", free: true, recommended: true, icon: "Test", description: "Test", repo: "", docsUrl: "", configHint: "" },
        config: { id: "test-conector", enabled: true },
        status: "available",
      },
    ]);

    // Mock other dependencies
    const mockLoadIntegrationConfig = require('../integrations').loadIntegrationConfig;
    mockLoadIntegrationConfig.mockResolvedValueOnce(null);

    const mockLoadAbilities = require('../abilities/abilities').loadAbilities;
    mockLoadAbilities.mockResolvedValueOnce([]);

    const mockUseRealtimeRows = require('../realtime/realtime').useRealtimeRows;
    mockUseRealtimeRows.mockReturnValue({ rows: [], reload: jest.fn() });

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
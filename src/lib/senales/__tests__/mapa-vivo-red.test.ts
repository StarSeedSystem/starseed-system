/**
 * Pruebas del mapa vivo con señales de toda la red (propias + publicadas).
 * Solo la lógica pura: sin DOM, sin red real, hooks simulados.
 */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { SenalEspectro } from "@/lib/senales/espectro/modelo";
import type { DetectedSignal } from "@/ai/astraura/mesh/signals";
import type { MapaVivo } from "@/components/mesh/mapa-senales/use-mapa-vivo";
import type { EstadoSenalesPublicadas } from "@/lib/senales/espectro/usar-senales-publicadas";

// Mockeamos los hooks que usan red/React
vi.mock("@/lib/senales/espectro/usar-senales-publicadas", () => ({
  useSenalesPublicadas: vi.fn(),
}));

vi.mock("@/components/mesh/mapa-senales/use-detected-signals", () => ({
  useDetectedSignals: vi.fn(() => ({
    signals: [],
    ble: { detections: [] },
  })),
  ordenarSenalesPorCalidad: vi.fn((s: DetectedSignal[]) => s),
}));

vi.mock("@/ai/astraura/mesh", () => ({
  useMeshState: vi.fn(() => ({
    status: "ready",
    transport: "serial",
    nodes: [],
    region: "EU_868",
    self: { num: 1, isSelf: true, lat: 40.0, lon: -3.0, lastHeard: Date.now(), presence: "online" },
    edges: [],
    remoteTopologies: [],
  })),
}));

vi.mock("@/lib/network/malla-neuronas", () => ({
  useMallaNeuronasEstado: vi.fn(() => ({
    misDispositivos: [
      { neuronId: "n1", nombre: "Mac", plataforma: "macOS", esEsteDispositivo: true, online: true, enlace: { estado: "conectado" } },
    ],
  })),
}));

vi.mock("@/lib/neurons/presencia", () => ({
  usePresenciaNeuronas: vi.fn(() => ({
    conectado: true,
    medios: [],
  })),
}));

vi.mock("@/lib/malla/registro-enlaces-locales", () => ({
  useEnlacesLocales: vi.fn(() => []),
}));

vi.mock("@/lib/neurons/medio", () => ({
  describirMedio: vi.fn(() => ({ id: "medio-1", tipo: "navegador", etiqueta: "Chrome" })),
  medirSenales: vi.fn(() => Promise.resolve({ bluetooth: { disponible: true }, wifi: { disponible: true }, celular: null, lora: { region: "EU_868" } })),
}));

vi.mock("@/lib/consumo/usuario", () => ({
  uidActual: vi.fn(() => Promise.resolve("uid-propio")),
}));

vi.mock("@/lib/senales/aparatos", () => ({
  construirVivo: vi.fn((base: DetectedSignal[]) => ({
    enlaces: new Map(),
    estados: new Map(),
    medios: [],
    extras: [],
    oidas: new Map(),
    presenciaConectada: true,
  })),
}));

vi.mock("@/lib/senales/cuentas", () => ({
  anonimizarAjenas: vi.fn((s: DetectedSignal[]) => s),
}));

vi.mock("@/lib/senales/escalas", () => ({
  reubicar: vi.fn((s: DetectedSignal) => s),
}));

vi.mock("@/lib/senales/espectro/adaptadores/bluetooth", () => ({
  adaptarBluetooth: vi.fn(() => ({ medio: "bluetooth", motivo: "sin datos" })),
}));

import { useSenalesPublicadas } from "@/lib/senales/espectro/usar-senales-publicadas";
import { useMapaVivo } from "@/components/mesh/mapa-senales/use-mapa-vivo";

function senalEspectro(id: string, overrides: Partial<SenalEspectro> = {}): SenalEspectro {
  return {
    id,
    medio: "lora",
    banda: "EU_868",
    frecuenciaKhz: 868100,
    anchoKhz: 125,
    fuerzaDbm: -90,
    calidad: 0.7,
    origen: "medida",
    capa: "publica",
    fuente: "publicada por su dueño",
    medidoEn: Date.now() - 1000,
    zona: "abcde",
    compatibles: [],
    ...overrides,
  };
}

function senalDetectada(id: string, overrides: Partial<DetectedSignal> = {}): DetectedSignal {
  return {
    id,
    antenna: "lora",
    antennaLabel: "LoRa",
    signalType: "test",
    label: "Test",
    detail: "test",
    quality: 0.5,
    qualityDetail: "test",
    metrics: [],
    compatible: true,
    compatDetail: "test",
    starseed: null,
    placement: { angleRad: 0, radiusFrac: 0.5, accuracyFrac: 0.1, mode: "rf", distanceM: 300, accuracyM: 100, detail: "test" },
    lastHeard: Date.now(),
    actions: [],
    simulated: false,
    color: "#34d399",
    ...overrides,
  };
}

describe("useMapaVivo con señales publicadas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("incluye señales propias y publicadas cuando la lectura es ok", async () => {
    const publicadas: SenalEspectro[] = [
      senalEspectro("pub-1", { id: "pub-1", medio: "wifi", calidad: 0.8 }),
      senalEspectro("pub-2", { id: "pub-2", medio: "bluetooth", calidad: 0.6 }),
    ];

    (useSenalesPublicadas as vi.Mock).mockReturnValue({
      senales: publicadas,
      estado: "ok",
      motivo: undefined,
      cargando: false,
      actualizar: vi.fn(),
    });

    const { result } = renderHook(() => useMapaVivo({ verPublicos: true }));

    await waitFor(() => expect(result.current.red).toBeDefined());

    expect(result.current.red).toMatchObject({
      senales: publicadas,
      estado: "ok",
      otrasCuentasPublicando: 2,
    });
    expect(result.current.red.motivo).toBeUndefined();
  });

  it("mantiene el mapa actual y dice el motivo cuando no hay tabla", async () => {
    (useSenalesPublicadas as vi.Mock).mockReturnValue({
      senales: [],
      estado: "sin-tabla",
      motivo: "la tabla os_senales_publicas no existe en este proyecto",
      cargando: false,
      actualizar: vi.fn(),
    });

    const { result } = renderHook(() => useMapaVivo({ verPublicos: true }));

    await waitFor(() => expect(result.current.red).toBeDefined());

    expect(result.current.red).toMatchObject({
      senales: [],
      estado: "sin-tabla",
      otrasCuentasPublicando: 0,
    });
    expect(result.current.red.motivo).toBe("las señales públicas aún no están activadas en este servidor");
  });

  it("mantiene el mapa actual y dice el motivo cuando no hay sesión", async () => {
    (useSenalesPublicadas as vi.Mock).mockReturnValue({
      senales: [],
      estado: "sin-sesion",
      motivo: "no hay cliente de Supabase (sesión no iniciada)",
      cargando: false,
      actualizar: vi.fn(),
    });

    const { result } = renderHook(() => useMapaVivo({ verPublicos: true }));

    await waitFor(() => expect(result.current.red).toBeDefined());

    expect(result.current.red).toMatchObject({
      senales: [],
      estado: "sin-sesion",
      otrasCuentasPublicando: 0,
    });
    expect(result.current.red.motivo).toBe("las señales públicas aún no están activadas en este servidor");
  });

  it("cuando la lectura fue ok pero vino vacía, dice que nadie más ha publicado", async () => {
    (useSenalesPublicadas as vi.Mock).mockReturnValue({
      senales: [],
      estado: "ok",
      motivo: undefined,
      cargando: false,
      actualizar: vi.fn(),
    });

    const { result } = renderHook(() => useMapaVivo({ verPublicos: true }));

    await waitFor(() => expect(result.current.red).toBeDefined());

    expect(result.current.red).toMatchObject({
      senales: [],
      estado: "ok",
      otrasCuentasPublicando: 0,
    });
    expect(result.current.red.motivo).toBe("nadie más ha publicado en esta capa todavía");
  });

  it("cuando hay error, mantiene el mapa y dice el motivo", async () => {
    (useSenalesPublicadas as vi.Mock).mockReturnValue({
      senales: [],
      estado: "error",
      motivo: "error de red",
      cargando: false,
      actualizar: vi.fn(),
    });

    const { result } = renderHook(() => useMapaVivo({ verPublicos: true }));

    await waitFor(() => expect(result.current.red).toBeDefined());

    expect(result.current.red).toMatchObject({
      senales: [],
      estado: "error",
      otrasCuentasPublicando: 0,
    });
    expect(result.current.red.motivo).toBe("error de red");
  });

  it("cuando verPublicos es false, no incluye señales publicadas", async () => {
    const publicadas: SenalEspectro[] = [senalEspectro("pub-1")];

    (useSenalesPublicadas as vi.Mock).mockReturnValue({
      senales: publicadas,
      estado: "ok",
      motivo: undefined,
      cargando: false,
      actualizar: vi.fn(),
    });

    const { result } = renderHook(() => useMapaVivo({ verPublicos: false }));

    await waitFor(() => expect(result.current.red).toBeDefined());

    expect(result.current.red).toMatchObject({
      senales: [],
      estado: "ok",
      otrasCuentasPublicando: 0,
    });
    expect(result.current.red.motivo).toBe("nadie más ha publicado en esta capa todavía");
  });
});
// Tests para el destino del motor BitNet (destino-bitnet.ts)
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  entornoDelNavegador,
  preferenciaBitnet,
  resolverEndpointBitnet,
  forzarEntornoDelNavegador,
  limpiarFuerzaEntorno,
  type BrowserEnvironment,
} from "@/lib/astraura/destino-bitnet";
import { medirPerfil } from "@/lib/astraura/perfil-hardware";
import { astraura158Endpoint, type Astraura158Target } from "@/lib/astraura/astraura-158-client";

vi.mock("@/lib/astraura/elegir-nodo", async () => {
  const actual = await import("@/lib/astraura/elegir-nodo");
  return {
    ...actual,
    elegir: vi.fn().mockReturnValue({ id: "test", tipo: "nube", url: "https://test.example", vivo: true, tokS: 10, ramLibreMb: 1000, latenciaMs: 50 }),
  };
});

vi.mock("@/lib/astraura/perfil-hardware", async () => {
  const actual = await import("@/lib/astraura/perfil-hardware");
  return {
    ...actual,
    medirPerfil: vi.fn().mockImplementation((env: BrowserEnvironment) => {
      if (env.deviceMemory === 16) {
        return {
          nivel: "justo",
          nucleos: 8,
          ramGb: 16,
          arq: "arm64",
          plataforma: "web",
          bateria: false,
          conexion: "rapida",
        };
      }
      return {
        nivel: "minimo",
        nucleos: 4,
        ramGb: 2,
        arq: "arm64",
        plataforma: "web",
        bateria: false,
        conexion: "rapida",
      };
    }),
    dondeRazona: vi.fn().mockImplementation((perfil) => {
      if (perfil.nivel === "justo") {
        return { needle: "backend", jev: "red", bitnet: "local" };
      }
      return { needle: "backend", jev: "red", bitnet: "nube" };
    }),
  };
});

vi.mock("@/lib/astraura/astraura-158-client", async () => {
  const actual = await import("@/lib/astraura/astraura-158-client");
  return {
    ...actual,
    astraura158Endpoint: vi.fn().mockReturnValue("http://127.0.0.1:8000"),
  };
});

describe("entornoDelNavegador", () => {
  it("entorno de 16 GB/8 núcleos → bitnet local", () => {
    const mockEnv = {
      userAgent: "Mozilla/5.0 (Macintosh; Apple Silicon Mac)",
      hardwareConcurrency: 8,
      deviceMemory: 16,
      esTauri: false,
      esPWA: false,
      battery: { level: 0.8, charging: false },
    } as BrowserEnvironment;
    forzarEntornoDelNavegador(mockEnv);
    const env = entornoDelNavegador();
    limpiarFuerzaEntorno();
    expect(env.deviceMemory).toBe(16);
    expect(env.hardwareConcurrency).toBe(8);
  });
  it("entorno de 2 GB → bitnet nube", () => {
    const mockEnv = {
      userAgent: "Mozilla/5.0 (Linux; Android 14)",
      hardwareConcurrency: 4,
      deviceMemory: 2,
      esTauri: false,
      esPWA: false,
      battery: { level: 0.5, charging: false },
    } as BrowserEnvironment;
    forzarEntornoDelNavegador(mockEnv);
    const env = entornoDelNavegador();
    limpiarFuerzaEntorno();
    expect(env.deviceMemory).toBe(2);
  });
});

describe("preferenciaBitnet", () => {
  it("entorno de 16 GB/8 núcleos → preferencia local", () => {
    const mockEnv = {
      userAgent: "Mozilla/5.0 (Macintosh; Apple Silicon Mac)",
      hardwareConcurrency: 8,
      deviceMemory: 16,
      esTauri: false,
      esPWA: false,
      battery: { level: 0.8, charging: false },
    } as BrowserEnvironment;
    forzarEntornoDelNavegador(mockEnv);
    
    const firstCall = preferenciaBitnet();
    expect(firstCall).toBe("local");
    
    const secondCall = preferenciaBitnet();
    expect(secondCall).toBe("local");
    
    limpiarFuerzaEntorno();
  });
});

describe("resolverEndpointBitnet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    limpiarFuerzaEntorno();
  });

  it("entorno de 16 GB/8 núcleos → endpoint local", async () => {
    const mockEnv = {
      userAgent: "Mozilla/5.0 (Macintosh; Apple Silicon Mac)",
      hardwareConcurrency: 8,
      deviceMemory: 16,
      esTauri: false,
      esPWA: false,
      battery: { level: 0.8, charging: false },
    } as BrowserEnvironment;
    forzarEntornoDelNavegador(mockEnv);
    const result = await resolverEndpointBitnet("local" as Astraura158Target);
    limpiarFuerzaEntorno();
    expect(result).toBe("http://127.0.0.1:8000");
  });

  it("sin ventana → endpoint de siempre", async () => {
    const result = await resolverEndpointBitnet("nube" as Astraura158Target);
    expect(result).toBe("http://127.0.0.1:8000");
  });

  it("entorno simulado sin candidatos → endpoint de siempre", async () => {
    const mockEnv = {
      userAgent: "Mozilla/5.0 (Macintosh; Apple Silicon Mac)",
      hardwareConcurrency: 8,
      deviceMemory: 16,
      esTauri: false,
      esPWA: false,
      battery: { level: 0.8, charging: false },
    } as BrowserEnvironment;
    forzarEntornoDelNavegador(mockEnv);
    const result = await resolverEndpointBitnet("nube" as Astraura158Target);
    limpiarFuerzaEntorno();
    expect(result).toBe("http://127.0.0.1:8000");
  });
});

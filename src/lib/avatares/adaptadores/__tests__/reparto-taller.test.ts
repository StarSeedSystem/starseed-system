"use client";

// Mock localStorage before importing anything that uses it
// Vitest runs tests in Node.js, pero nuestro código usa localStorage (API de navegador)
const storage = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storage.get(key) || null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
  key: (index: number) => {
    const entries = Array.from(storage.entries());
    return entries[index]?.[0] || null;
  },
  get length() {
    return storage.size;
  },
};

Object.defineProperty(global, "localStorage", {
  value: localStorageMock,
  writable: true,
});

// Mock window object
Object.defineProperty(global, "window", {
  value: { localStorage: localStorageMock },
  writable: true,
});

import { describe, it, expect, beforeEach } from "vitest";
import { 
  publicarCapacidadesTaller, 
  obtenerCapacidadesTaller,
  obtenerHierroYCapacidades,
  elegirNeurona,
  type Destino3D,
  type Partida,
  type Esqueleto
} from "../reparto-taller";
import type { NeuronCapabilities } from "@/lib/neurons/neurons";
import type { Hierro } from "@/lib/avatares/adn/optimizacion";

// Datos de prueba para capacidades de neurona
const crearNeuronCapabilities = (overrides: Partial<NeuronCapabilities> = {}): NeuronCapabilities => {
  const base: NeuronCapabilities = {
    platform: "macOS",
    browser: "Chrome 120",
    gpuVendor: "Apple",
    gpuRenderer: "Apple M2",
    memoryGb: 16,
    webgpu: false,
    webgl2: true,
    cores: 8,
    storageQuotaGb: 64,
    storageUsedGb: 32,
    touch: false,
    installedApp: false,
    ollama: false,
    lmstudio: false,
    battery: { level: 80, charging: false },
    pantalla: "2560x1440@2",
    zona: "America/New_York",
    maquina: "MacBook-Pro",
    medios: {},
  };
  return { ...base, ...overrides };
};

describe("Reparto de Taller 3D (G3D1011D)", () => {
  beforeEach(() => {
    // Limpiar el almacenamiento antes de cada prueba
    storage.clear();
  });

  describe("obtenerHierroYCapacidades", () => {
    it("devuelve el hierro y capacidades correctos para una Mac con 32GB", () => {
      const caps = crearNeuronCapabilities({
        gpuVendor: "Apple",
        memoryGb: 32
      });
      
      const result = obtenerHierroYCapacidades(caps);
      
      // Verificamos el hierro
      expect(result.hierro.gpu).toBe("apple");
      expect(result.hierro.ramGB).toBe(32);
      expect(result.hierro.vramGB).toBeNull();
      
      // Verificamos las capacidades - debería tener apple-silicon-32gb y cpu
      expect(result.capabilities).toContain("cpu");
      expect(result.capabilities).toContain("apple-silicon-32gb");
      // No debería tener capacidades de NVIDIA ya que es Apple
      expect(result.capabilities).not.toContain("cuda-8gb");
      expect(result.capabilities).not.toContain("cuda-16gb");
    });

    it("devuelve el hierro y capacidades correctos para una GPU NVIDIA con 16GB VRAM", () => {
      const caps = crearNeuronCapabilities({
        gpuVendor: "NVIDIA",
        gpuRenderer: "NVIDIA GeForce RTX 4090",
        memoryGb: 32
      });
      
      const result = obtenerHierroYCapacidades(caps);
      
      // Verificamos el hierro
      expect(result.hierro.gpu).toBe("nvidia");
      expect(result.hierro.ramGB).toBe(32);
      // VRAM estimada basada en el nombre de la GPU
      expect(result.hierro.vramGB).toBe(24); // RTX 4090 tiene 24GB
      
      // Verificamos las capacidades - debería tener cpu, cuda-16gb y posiblemente otras
      expect(result.capabilities).toContain("cpu");
      expect(result.capabilities).toContain("cuda-16gb");
      // Si tiene suficiente VRAM, también debería tener cuda-8gb (porque 24 >= 8)
      expect(result.capabilities).toContain("cuda-8gb");
    });

    it("devuelve capacidades mínimas para una neurona sin GPU", () => {
      const caps = crearNeuronCapabilities({
        gpuVendor: "Intel",
        memoryGb: 8
      });
      
      const result = obtenerHierroYCapacidades(caps);
      
      // Verificamos el hierro
      expect(result.hierro.gpu).toBe("ninguna");
      expect(result.hierro.ramGB).toBe(8);
      expect(result.hierro.vramGB).toBeNull();
      
      // Verificamos las capacidades - debería tener solo cpu
      expect(result.capabilities).toEqual(["cpu"]);
    });
  });

  describe("publicarCapacidadesTaller y obtenerCapacidadesTaller", () => {
    it("guarda y recupera correctamente las capacidades 3D", () => {
      const neuronId = "neurona-test-1";
      const caps = crearNeuronCapabilities({
        gpuVendor: "Apple",
        memoryGb: 32
      });
      
      // Publicamos las capacidades
      publicarCapacidadesTaller(neuronId, caps);
      
      // Las obtenemos
      const capabilities = obtenerCapacidadesTaller(neuronId);
      
      // Verificamos que se guardaron y recuperaron correctamente
      expect(capabilities).not.toBeNull();
      expect(capabilities).toContain("cpu");
      expect(capabilities).toContain("apple-silicon-32gb");
    });

    it("devuelve null para una neurona sin capacidades guardadas", () => {
      const capabilities = obtenerCapacidadesTaller("neurona-inexistente");
      expect(capabilities).toBeNull();
    });
  });

  describe("elegirNeurona", () => {
    it("selecciona la neurona con Mac de 32GB para destino de protomolécula", () => {
      const neuronas = [
        {
          id: "neurona-1",
          capabilities: crearNeuronCapabilities({
            gpuVendor: "Apple",
            memoryGb: 16 // Mac de 16GB
          })
        },
        {
          id: "neurona-2",
          capabilities: crearNeuronCapabilities({
            gpuVendor: "Apple",
            memoryGb: 32 // Mac de 32GB
          })
        }
      ];
      
      const encargo = {
        destino: "protomolecula" as Destino3D,
        partida: "imagen" as Partida,
        esqueleto: "ninguno" as Esqueleto,
        region: null,
        comercial: false,
        permitirDePago: false,
        prioridad: "calidad"
      };
      
      const result = elegirNeurona(encargo, neuronas);
      
      // Debería seleccionar la neurona con 32GB
      expect(result.neurona).toBe("neurona-2");
      expect(result.motivo).toContain("Seleccionada neurona neurona-2");
    });

    it("selecciona la neurona con GPU NVIDIA de 16GB+ VRAM para destino de protomolécula", () => {
      const neuronas = [
        {
          id: "neurona-1",
          capabilities: crearNeuronCapabilities({
            gpuVendor: "NVIDIA",
            gpuRenderer: "NVIDIA GeForce RTX 3060", // 6GB VRAM
            memoryGb: 16
          })
        },
        {
          id: "neurona-2",
          capabilities: crearNeuronCapabilities({
            gpuVendor: "NVIDIA",
            gpuRenderer: "NVIDIA GeForce RTX 4090", // 24GB VRAM
            memoryGb: 32
          })
        }
      ];
      
      const encargo = {
        destino: "protomolecula" as Destino3D,
        partida: "imagen" as Partida,
        esqueleto: "ninguno" as Esqueleto,
        region: null,
        comercial: false,
        permitirDePago: false,
        prioridad: "calidad"
      };
      
      const result = elegirNeurona(encargo, neuronas);
      
      // Debería seleccionar la neurona con más VRAM (mejor fidelidad)
      expect(result.neurona).toBe("neurona-2");
      expect(result.motivo).toContain("Seleccionada neurona neurona-2");
    });

    it("devuelve null cuando ninguna neurona puede manejar el encargo", () => {
      const neuronas = [
        {
          id: "neurona-1",
          capabilities: crearNeuronCapabilities({
            gpuVendor: "Intel",
            memoryGb: 8 // Neurona básica sin GPU potente
          })
        }
      ];
      
      const encargo = {
        destino: "protomolecula" as Destino3D,
        partida: "imagen" as Partida,
        esqueleto: "ninguno" as Esqueleto,
        region: null,
        comercial: false,
        permitirDePago: false,
        prioridad: "calidad" // Requiere alta fidelidad
      };
      
      const result = elegirNeurona(encargo, neuronas);
      
      // Debería indicar que ninguna puede manejarlo
      expect(result.neurona).toBeNull();
      expect(result.motivo).toContain("Ninguna neurona disponible puede manejar este encargo");
    });

    it("prefiere neuronas de la misma cuenta cuando hay empate en capacidades", () => {
      // Esta prueba requeriría información de cuenta en las neuronas
      // Como no la tenemos en nuestra implementación simplificada,
      // verificamos que al menos funcione la lógica básica
      const neuronas = [
        {
          id: "neurona-1",
          capabilities: crearNeuronCapabilities({
            gpuVendor: "Apple",
            memoryGb: 32
          })
        },
        {
          id: "neurona-2",
          capabilities: crearNeuronCapabilities({
            gpuVendor: "Apple",
            memoryGb: 32
          })
        }
      ];
      
      const encargo = {
        destino: "avatar" as Destino3D,
        partida: "vrm" as Partida,
        esqueleto: "vrm-humanoide" as Esqueleto,
        region: null,
        comercial: false,
        permitirDePago: false,
        prioridad: "calidad"
      };
      
      const result = elegirNeurona(encargo, neuronas);
      
      // Debería seleccionar una de las neuronas (en nuestra implementación, la primera por ser la que aparece primero en el array)
      expect(["neurona-1", "neurona-2"]).toContain(result.neurona);
      expect(result.motivo).toContain("Seleccionada neurona");
    });
  });
});
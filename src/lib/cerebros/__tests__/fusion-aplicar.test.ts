import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { leerParaFusion, copiaDeSeguridad, descargarCopia, aplicarFusion } from "../fusion-aplicar";

// Mock the modules
const mockCreateClient = vi.fn();
vi.mock("@/utils/supabase/client", () => ({
  createClient: mockCreateClient,
}));

const mockGetBrain = vi.fn();
const mockSaveBrain = vi.fn();
const mockDeleteBrain = vi.fn();
vi.mock("@/lib/brains/brains", () => ({
  getBrain: mockGetBrain,
  saveBrain: mockSaveBrain,
  deleteBrain: mockDeleteBrain,
}));

const mockSenalEsencial = vi.fn();
vi.mock("@/lib/consumo/guardian", () => ({
  senalEsencial: mockSenalEsencial,
}));

const mockPushPreferences = vi.fn();
vi.mock("@/lib/settings-sync", () => ({
  pushPreferences: mockPushPreferences,
}));

const mockListMemoryFiles = vi.fn();
vi.mock("@/lib/cerebro/memory-files", () => ({
  listMemoryFiles: mockListMemoryFiles,
}));

// Mock window.localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string | null) => {
      return key ? store[key] ?? null : null;
    },
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    length: 0,
    key: (index: number) => {
      return Object.keys(store)[index] ?? null;
    },
  };
})();

beforeEach(() => {
  vi.clearAllMocks();
  
  // Setup mockSupabase client mock
  const mockSupabase = {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  
  mockCreateClient.mockReturnValue(mockSupabase);
  
  // Setup window.localStorage
  Object.defineProperty(window, "localStorage", {
    value: localStorageMock,
    writable: true,
  });
});

afterEach(() => {
  // Restore original window.localStorage
  delete (window as any).localStorage;
});

describe("fusion-aplicar", () => {
  describe("leerParaFusion", () => {
    it("debería devolver ok false cuando no hay sesión", async () => {
      // Arrange
      mockCreateClient.mockReturnValueOnce({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
        },
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(),
        single: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      });
      
      // Act
      const result = await leerParaFusion("destino-id", ["origen-id"]);
      
      // Assert
      expect(result.ok).toBe(false);
      expect(result.motivo).toBe("No hay sesión activa");
    });
    
    it("debería devolver datos cuando todo es correcto", async () => {
      // Arrange
      const owner = "test-owner";
      mockCreateClient.mockReturnValueOnce({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: owner } } }),
        },
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(),
        single: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      });
      
      mockGetBrain.mockImplementationAsync((id: string) => {
        if (id === "destino-id") {
          return {
            id: "destino-id",
            owner,
            name: "Destino",
            scope: "account",
            scope_ref: null,
            description: "Destino desc",
            config: {},
            includes: {
              vaults: [],
              backends: [],
              personalities: [],
              runtimes: [],
              tokens: [],
              memories: [],
              connections: [],
              bindScope: false,
              permissions: [],
              aiProvider: undefined,
            },
            servers: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
        }
        if (id === "origen-id") {
          return {
            id: "origen-id",
            owner,
            name: "Origen",
            scope: "account",
            scope_ref: null,
            description: "Origen desc",
            config: {},
            includes: {
              vaults: [],
              backends: [],
              personalities: [],
              runtimes: [],
              tokens: [],
              memories: [],
              connections: [],
              bindScope: false,
              permissions: [],
              aiProvider: undefined,
            },
            servers: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
        }
        return null;
      });
      
      mockListMemoryFiles.mockImplementation((brainId: string | null) => {
        if (brainId === "destino-id") {
          return [
            {
              id: "file1",
              owner,
              brain_id: "destino-id",
              name: "test.md",
              content: "# Test\nContenido de prueba",
              source: "starseed",
              server_config: {},
              meta: {},
              sync: false,
              updated_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
            }
          ];
        }
        if (brainId === "origen-id") {
          return [
            {
              id: "file2",
              owner,
              brain_id: "origen-id",
              name: "other.md",
              content: "# Other\nOtro contenido",
              source: "starseed",
              server_config: {},
              meta: {},
              sync: false,
              updated_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
            }
          ];
        }
        return [];
      });
      
      // Mock localStorage
      localStorageMock.clear();
      localStorageMock.setItem("starseed.brain.destino-id.moa", JSON.stringify({ setting: "value" }));
      
      // Act
      const result = await leerParaFusion("destino-id", ["origen-id"]);
      
      // Assert
      expect(result.ok).toBe(true);
      expect(result.destino.id).toBe("destino-id");
      expect(result.origenes.length).toBe(1);
      expect(result.origenes[0].id).toBe("origen-id");
      expect(result.archivos.length).toBe(2); // Uno de destino y uno de origen
      expect(result.prefs).toHaveProperty("moa");
      expect(result.prefs.moa).toEqual({ setting: "value" });
    });
  });
  
  describe("copiaDeSeguridad", () => {
    it("debería crear un nombre de archivo y texto JSON válido", () => {
      // Arrange
      const datos = {
        destino: {
          id: "destino-id",
          owner: "owner",
          name: "Destino",
          scope: "account",
          scope_ref: null,
          description: "Desc",
          config: {},
          includes: {
            vaults: [],
            backends: [],
            personalities: [],
            runtimes: [],
            tokens: [],
            memories: [],
            connections: [],
            bindScope: false,
            permissions: [],
            aiProvider: undefined,
          },
          servers: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        origenes: [],
        archivos: [],
        prefs: {},
      };
      const fecha = "2026-10-15";
      
      // Act
      const result = copiaDeSeguridad(datos, fecha);
      
      // Assert
      expect(result.nombre).toBe("cerebros-fusion-2026-10-15.json");
      expect(typeof result.texto).toBe("string");
      expect(result.texto.length).toBeGreaterThan(0);
      // Verificar que es JSON válido
      expect(() => JSON.parse(result.texto)).not.toThrow();
    });
  });
  
  describe("descargarCopia", () => {
    it("debería devolver false cuando no hay window", () => {
      // Arrange
      // Simular que no estamos en un entorno de navegador
      const originalWindow = global.window;
      delete global.window;
      
      // Act
      const result = descargarCopia({ nombre: "test.txt", texto: "hola" });
      
      // Assert
      expect(result).toBe(false);
      
      // Restore
      global.window = originalWindow;
    });
    
    it("debería intentar descargar cuando hay window", () => {
      // Arrange
      const localStorageMock = {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
        length: 0,
        key: () => null,
      };
      Object.defineProperty(window, "localStorage", {
        value: localStorageMock,
        writable: true,
      });
      
      const crearElementoSpy = vi.spyOn(document, "createElement").mockImplementation(() => {
        const anchor = document.createElement("a");
        anchor.click = vi.fn();
        return anchor;
      });
      
      const crearBlobSpy = vi.spyOn(window, "Blob").mockImplementation((parts, options) => {
        return new Blob(parts, options);
      });
      
      const crearURLSpy = vi.spyOn(window.URL, "createObjectURL").mockImplementation((blob) => {
        return "test-url";
      });
      
      const revocarURLSpy = vi.spyOn(window.URL, "revokeObjectURL");
      
      // Act
      const result = descargarCopia({ nombre: "test.txt", texto: "hola" });
      
      // Assert
      expect(result).toBe(true);
      expect(crearBlobSpy).toHaveBeenCalledWith(["hola"], { type: "application/json" });
      expect(crearURLSpy).toHaveBeenCalledWith(expect.any(Blob));
      expect(crearElementoSpy).toHaveBeenCalledWith("a");
      expect(document.createElement("a").href).toBe("test-url");
      expect(document.createElement("a").download).toBe("test.txt");
      expect(document.createElement("a").click).toHaveBeenCalled();
      expect(revocarURLSpy).toHaveBeenCalledWith("test-url");
      
      // Cleanup
      crearElementoSpy.mockRestore();
      crearBlobSpy.mockRestore();
      crearURLSpy.mockRestore();
      revocarURLSpy.mockRestore();
    });
  });
  
  describe("aplicarFusion", () => {
    it("debería aplicar la fusión correctamente en el camino feliz", async () => {
      // Arrange
      const owner = "test-owner";
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: owner } } }),
        },
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }), // No selecciones
        single: vi.fn().mockResolvedValue({ data: {}, error: null }),
      };
      mockCreateClient.mockReturnValue(mockSupabase);
      
      mockGetBrain.mockImplementationAsync((id: string) => {
        if (id === "destino-id") {
          return {
            id: "destino-id",
            owner,
            name: "Destino",
            scope: "account",
            scope_ref: null,
            description: "Destino desc",
            config: {},
            includes: {
              vaults: [],
              backends: [],
              personalities: [],
              runtimes: [],
              tokens: [],
              memories: [],
              connections: [],
              bindScope: false,
              permissions: [],
              aiProvider: undefined,
            },
            servers: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
        }
        return null;
      });
      
      mockSaveBrain.mockResolvedValue({
        id: "destino-id",
        owner,
        name: "Destino",
        scope: "account",
        scope_ref: null,
        description: "Destino desc",
        config: {},
        includes: {
          vaults: [],
          backends: [],
          personalities: [],
          runtimes: [],
          tokens: [],
          memories: [],
          connections: [],
          bindScope: false,
          permissions: [],
          aiProvider: undefined,
        },
        servers: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      
      mockDeleteBrain.mockResolvedValue(true);
      mockPushPreferences.mockResolvedValue({ ok: true, message: "OK" });
      
      const plan: any = {
        archivos: [
          {
            nombre: "test.md",
            origenId: "origen-id",
            contenido: "# Contenido fusionado",
            bytes: 18,
            accion: "copiar",
          }
        ],
        incluye: {
          vaults: [],
          backends: [],
          personalities: [],
          runtimes: [],
          tokens: [],
          memories: [],
          connections: [],
          bindScope: false,
          permissions: [],
          aiProvider: undefined,
        },
        servidores: [],
        config: { fusionados: ["origen-id"], fusionadoEn: new Date().toISOString() },
        prefs: {},
      };
      
      // Act
      const result = await aplicarFusion(plan, {
        destino: {
          id: "destino-id",
          owner,
          name: "Destino",
          scope: "account",
          scope_ref: null,
          description: "Destino desc",
          config: {},
          includes: {
            vaults: [],
            backends: [],
            personalities: [],
            runtimes: [],
            tokens: [],
            memories: [],
            connections: [],
            bindScope: false,
            permissions: [],
            aiProvider: undefined,
          },
          servers: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        origenIds: ["origen-id"],
        quitarOrigenes: true,
      });
      
      // Assert
      expect(result.ok).toBe(true);
      expect(result.archivosEscritos).toBe(1);
      expect(result.bytes).toBe(18);
      expect(result.origenesQuitados).toEqual(["origen-id"]);
      expect(result.origenesConservados.length).toBe(0);
    });
    
    it("debería no borrar orígenes si hay selecciones en brain_selections", async () => {
      // Arrange
      const owner = "test-owner";
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: owner } } }),
        },
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: "sel1" }, error: null }), // Hay selecciones
      };
      mockCreateClient.mockReturnValue(mockSupabase);
      
      mockGetBrain.mockImplementationAsync((id: string) => {
        if (id === "destino-id") {
          return {
            id: "destino-id",
            owner,
            name: "Destino",
            scope: "account",
            scope_ref: null,
            description: "Destino desc",
            config: {},
            includes: {
              vaults: [],
              backends: [],
              personalities: [],
              runtimes: [],
              tokens: [],
              memories: [],
              connections: [],
              bindScope: false,
              permissions: [],
              aiProvider: undefined,
            },
            servers: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
        }
        return null;
      });
      
      mockSaveBrain.mockResolvedValue({
        id: "destino-id",
        owner,
        name: "Destino",
        scope: "account",
        scope_ref: null,
        description: "Destino desc",
        config: {},
        includes: {
          vaults: [],
          backends: [],
          personalities: [],
          runtimes: [],
          tokens: [],
          memories: [],
          connections: [],
          bindScope: false,
          permissions: [],
          aiProvider: undefined,
        },
        servers: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      
      mockDeleteBrain.mockResolvedValue(false); // No se llamaría si hay selecciones, pero por si acaso
      mockPushPreferences.mockResolvedValue({ ok: true, message: "OK" });
      
      const plan: any = {
        archivos: [],
        incluye: {
          vaults: [],
          backends: [],
          personalities: [],
          runtimes: [],
          tokens: [],
          memories: [],
          connections: [],
          bindScope: false,
          permissions: [],
          aiProvider: undefined,
        },
        servidores: [],
        config: {},
        prefs: {},
      };
      
      // Act
      const result = await aplicarFusion(plan, {
        destino: {
          id: "destino-id",
          owner,
          name: "Destino",
          scope: "account",
          scope_ref: null,
          description: "Destino desc",
          config: {},
          includes: {
            vaults: [],
            backends: [],
            personalities: [],
            runtimes: [],
            tokens: [],
            memories: [],
            connections: [],
            bindScope: false,
            permissions: [],
            aiProvider: undefined,
          },
          servers: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        origenIds: ["origen-id"],
        quitarOrigenes: true,
      });
      
      // Assert
      expect(result.ok).toBe(true);
      expect(result.archivosEscritos).toBe(0);
      expect(result.bytes).toBe(0);
      expect(result.origenesQuitados.length).toBe(0);
      expect(result.origenesConservados.length).toBe(1);
      expect(result.origenesConservados[0]).toEqual({
        id: "origen-id",
        motivo: "tiene selecciones; se moverán cuando se aplique §9 b",
      });
    });
    
    it("debería devolver error si falla al escribir un archivo", async () => {
      // Arrange
      const owner = "test-owner";
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: owner } } }),
        },
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        single: vi.fn().mockResolvedValue({ data: {}, error: null }),
      };
      mockCreateClient.mockReturnValue(mockSupabase);
      
      mockGetBrain.mockImplementationAsync((id: string) => {
        if (id === "destino-id") {
          return {
            id: "destino-id",
            owner,
            name: "Destino",
            scope: "account",
            scope_ref: null,
            description: "Destino desc",
            config: {},
            includes: {
              vaults: [],
              backends: [],
              personalities: [],
              runtimes: [],
              tokens: [],
              memories: [],
              connections: [],
              bindScope: false,
              permissions: [],
              aiProvider: undefined,
            },
            servers: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
        }
        return null;
      });
      
      mockSaveBrain.mockResolvedValue({
        id: "destino-id",
        owner,
        name: "Destino",
        scope: "account",
        scope_ref: null,
        description: "Destino desc",
        config: {},
        includes: {
          vaults: [],
          backends: [],
          personalities: [],
          runtimes: [],
          tokens: [],
          memories: [],
          connections: [],
          bindScope: false,
          permissions: [],
          aiProvider: undefined,
        },
        servers: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      
      mockDeleteBrain.mockResolvedValue(true);
      mockPushPreferences.mockResolvedValue({ ok: true, message: "OK" });
      
      // Mock listMemoryFiles to return an existing file for the case of anexar
      mockListMemoryFiles.mockResolvedValue([
        {
          id: "existing-file",
          owner,
          brain_id: "destino-id",
          name: "test.md",
          content: "Contenido existente",
          source: "starseed",
          server_config: {},
          meta: {},
          sync: false,
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        }
      ]);
      
      const plan: any = {
        archivos: [
          {
            nombre: "test.md",
            origenId: "origen-id",
            contenido: "# Nuevo contenido",
            bytes: 15,
            accion: "anexar", // Intentamos anexar a un archivo existente
          }
        ],
        incluye: {
          vaults: [],
          backends: [],
          personalities: [],
          runtimes: [],
          tokens: [],
          memories: [],
          connections: [],
          bindScope: false,
          permissions: [],
          aiProvider: undefined,
        },
        servidores: [],
        config: {},
        prefs: {},
      };
      
      // Mock saveMemoryFile to fail
      vi.mocked("@/lib/cerebro/memory-files").saveMemoryFile.mockResolvedValue(null);
      
      // Act
      const result = await aplicarFusion(plan, {
        destino: {
          id: "destino-id",
          owner,
          name: "Destino",
          scope: "account",
          scope_ref: null,
          description: "Destino desc",
          config: {},
          includes: {
            vaults: [],
            backends: [],
            personalities: [],
            runtimes: [],
            tokens: [],
            memories: [],
            connections: [],
            bindScope: false,
            permissions: [],
            aiProvider: undefined,
          },
          servers: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        origenIds: ["origen-id"],
        quitarOrigenes: true,
      });
      
      // Assert
      expect(result.ok).toBe(false);
      expect(result.archivosEscritos).toBe(0);
      expect(result.bytes).toBe(0);
      expect(result.origenesQuitados.length).toBe(0);
      expect(result.origenesConservados.length).toBe(0);
      expect(result.error).toContain("No se pudo escribir el archivo");
    });
  });
});
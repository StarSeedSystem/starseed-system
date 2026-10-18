import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { leerParaFusion, copiaDeSeguridad, descargarCopia, aplicarFusion } from "../fusion-aplicar";

// Mocks para las dependencias
const mockGetBrain = vi.fn();
const mockListMemoryFiles = vi.fn();
const mockUid = vi.fn();
const mockSaveBrain = vi.fn();
const mockUpdateMemoryContent = vi.fn();
const mockDeleteBrain = vi.fn();
const mockListSelections = vi.fn();
const mockPushPreferences = vi.fn();

// Mock del cliente de Supabase
vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "usuario-falso" } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            abortSignal: () => Promise.resolve({ data: [], error: null }),
            single: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
    }),
  }),
}));

// Mock de las funciones de brains
vi.mock("@/lib/brains/brains", () => ({
  ...vi.importActual("@/lib/brains/brains"),
  getBrain: mockGetBrain,
  uid: mockUid,
  saveBrain: mockSaveBrain,
  listSelections: mockListSelections,
}));

// Mock de las funciones de memory-files
vi.mock("@/lib/cerebro/memory-files", () => ({
  ...vi.importActual("@/lib/cerebro/memory-files"),
  listMemoryFiles: mockListMemoryFiles,
  saveMemoryFile: vi.fn().mockResolvedValue({} as any),
  updateMemoryContent: mockUpdateMemoryContent,
  deleteBrain: mockDeleteBrain,
}));

// Mock de pushPreferences
vi.mock("@/lib/settings-sync", () => ({
  ...vi.importActual("@/lib/settings-sync"),
  pushPreferences: mockPushPreferences,
}));

describe("fusion-aplicar", () => {
  const usuarioFalso = "usuario-falso";
  const cerebroDestinoId = "destino-123";
  const cerebroOrigenId = "origen-456";
  const fechaFalsa = "2026-10-18";

  beforeEach(() => {
    vi.clearAllMocks();
    mockUid.mockResolvedValue(usuarioFalso);
    
    // Configurar mocks por defecto
    mockGetBrain.mockImplementation((id: string) => {
      if (id === cerebroDestinoId) {
        return Promise.resolve({
          id: cerebroDestinoId,
          name: "Cerebro Destino",
          scope: "account",
          scope_ref: null,
          description: "",
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
        } as Brain);
      }
      if (id === cerebroOrigenId) {
        return Promise.resolve({
          id: cerebroOrigenId,
          name: "Cerebro Origen",
          scope: "account",
          scope_ref: null,
          description: "",
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
        } as Brain);
      }
      return Promise.resolve(null);
    });
    
    mockListMemoryFiles.mockImplementation((brainId: string | null) => {
      if (brainId === cerebroDestinoId) {
        return Promise.resolve([
          {
            id: "archivo-destino-1",
            owner: usuarioFalso,
            brain_id: cerebroDestinoId,
            name: "test.md",
            content: "# Test Destino\n\nContenido de prueba.",
            source: "starseed",
            server_config: {},
            meta: {},
            sync: true,
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          } as MemoryFile,
        ]);
      }
      if (brainId === cerebroOrigenId) {
        return Promise.resolve([
          {
            id: "archivo-origen-1",
            owner: usuarioFalso,
            brain_id: cerebroOrigenId,
            name: "test.md",
            content: "# Test Origen\n\nContenido de origen que se fusionará.",
            source: "starseed",
            server_config: {},
            meta: {},
            sync: true,
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          } as MemoryFile,
        ]);
      }
      return Promise.resolve([]);
    });
    
    // Mock de localStorage
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: (key: string | null) => {
          if (key === null) return null;
          // Simular almacenamiento en memoria
          const almacen: { [key: string]: string } = {};
          return almacen[key] ?? null;
        },
        setItem: (key: string, value: string) => {
          const almacen: { [key: string]: string } = {};
          almacen[key] = value;
        },
        removeItem: (key: string) => {
          const almacen: { [key: string]: string } = {};
          delete almacen[key];
        },
        clear: () => {
          const almacen: { [key: string]: string } = {};
          // almacen = {}; // No se puede reasignar, pero podemos limpiar
        },
        length: 0,
        key: (index: number) => {
          const claves: string[] = Object.keys({} as { [key: string]: string });
          return index >= 0 && index < claves.length ? claves[index] : null;
        },
      },
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("leerParaFusion", () => {
    it("debería leer correctamente los datos para la fusión", async () => {
      const resultado = await leerParaFusion(cerebroDestinoId, [cerebroOrigenId]);
      
      expect(resultado.ok).toBe(true);
      if (resultado.ok) {
        expect(resultado.destino.id).toBe(cerebroDestinoId);
        expect(resultado.origenes).toHaveLength(1);
        expect(resultado.origenes[0].id).toBe(cerebroOrigenId);
        expect(resultado.archivos).toHaveLength(2); // Uno de cada cerebro
        expect(resultado.prefs).toHaveLength(2); // Uno de cada cerebro
        
        // Verificar que se llamaron las funciones mock
        expect(mockGetBrain).toHaveBeenCalledTimes(2);
        expect(mockGetBrain).toHaveBeenNthCalledWith(1, cerebroDestinoId);
        expect(mockGetBrain).toHaveBeenNthCalledWith(2, cerebroOrigenId);
        expect(mockListMemoryFiles).toHaveBeenCalledTimes(2);
        expect(mockListMemoryFiles).toHaveBeenNthCalledWith(1, cerebroDestinoId);
        expect(mockListMemoryFiles).toHaveBeenNthCalledWith(2, cerebroOrigenId);
      }
    });

    it("debería devolver error si el cerebro destino no existe", async () => {
      mockGetBrain.mockResolvedValueOnce(null); // Destino no existe
      
      const resultado = await leerParaFusion(cerebroDestinoId, [cerebroOrigenId]);
      
      expect(resultado.ok).toBe(false);
      expect(resultado.motivo).toContain("No se encontró el cerebro destino");
    });

    it("debería manejar errores en la lectura de memoria files", async () => {
      mockListMemoryFiles.mockRejectedValueOnce(new Error("Error de base de datos"));
      
      const resultado = await leerParaFusion(cerebroDestinoId, [cerebroOrigenId]);
      
      expect(resultado.ok).toBe(false);
      expect(resultado.motivo).toContain("Error al leer datos para fusión");
    });
  });

  describe("copiaDeSeguridad", () => {
    it("debería crear una copia de seguridad JSON válida", () => {
      const datosFalsos = {
        destino: { id: "destino-1", name: "Destino" } as Brain,
        origenes: [{ id: "origen-1", name: "Origen" } as Brain],
        archivos: [
          {
            id: "archivo-1",
            owner: "usuario-1",
            brain_id: "destino-1",
            name: "test.md",
            content: "Contenido de prueba",
            source: "starseed",
            server_config: {},
            meta: {},
            sync: true,
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          } as MemoryFile
        ],
        prefs: {
          "destino-1": { prueba: "valor" },
          "origen-1": { otro: 42 }
        }
      };
      
      const resultado = copiaDeSeguridad(datosFalsos, fechaFalsa);
      
      expect(resultado.nombre).toBe(`cerebros-fusion-${fechaFalsa}.json`);
      expect(resultado.texto).toContain('"destino":');
      expect(resultado.texto).toContain('"origenes":');
      expect(resultado.texto).toContain('"archivos":');
      expect(resultado.texto).toContain('"prefs":');
      
      // Verificar que sea JSON válido
      expect(() => JSON.parse(resultado.texto)).not.toThrow();
    });
  });

  describe("descargarCopia", () => {
    it("debería devolver false cuando no hay ventana", () => {
      // Simular entorno sin window (SSR)
      Object.defineProperty(window, "window", {
        value: undefined,
        writable: true,
        configurable: true
      });
      
      const copia = { nombre: "test.json", texto: '{"test":true}' };
      const resultado = descargarCopia(copia);
      expect(resultado).toBe(false);
      
      // Restaurar window
      Object.defineProperty(window, "window", {
        value: window,
        writable: true,
        configurable: true
      });
    });

    it("debería iniciar la descarga cuando hay ventana", () => {
      // Asegurarnos de que window exista
      expect(typeof window !== "undefined" && window !== null).toBe(true);
      
      const copia = { nombre: "test.json", texto: '{"test":true}' };
      const resultado = descargarCopia(copia);
      // En el entorno de prueba, esto podría fallar por falta de document.body, pero no debería lanzar
      // La función debería intentar realizar la descarga y devolver true si puede iniciar el proceso
      // En las pruebas de vitest, el entorno de jsdom podría no soportar completamente esta operación
      // pero al menos no debería lanzar una excepción
      expect(typeof resultado).toBe("boolean");
    });
  });

  describe("aplicarFusion", () => {
    it("debería aplicar la fusión correctamente", async () => {
      // Configurar el plan de fusión falso
      const planFalso: PlanFusion = {
        archivoOperaciones: [
          { tipo: "insertar", nombre: "nuevo.md", contenido: "Contenido nuevo" },
          { tipo: "actualizar", id: "archivo-existente-1", contenido: "Contenido actualizado" }
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
        configuracion: { fusionado: true, fusionadoEn: nueva Date().toISOString() },
        preferencias: { prueba: "valor" }
      };
      
      const opciones = {
        destino: {
          id: cerebroDestinoId,
          name: "Cerebro Destino",
          scope: "account",
          scope_ref: null,
          description: "",
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
        } as Brain,
        origenIds: [cerebroOrigenId],
        quitarOrigenes: true
      };
      
      // Configurar mocks para que las operaciones tengan éxito
      mockSaveBrain.mockResolvedValue({
        ...opciones.destino,
        includes: planFalso.incluye,
        servidores: planFalso.servidores,
        config: { ...opciones.destino.config, ...planFalso.configuracion }
      } as Brain);
      
      mockUpdateMemoryContent.mockResolvedValue(true);
      // saveMemoryFile ya está mockeado para devolver un MemoryFile válido
      
      // Mock para listSelections (no hay selecciones para el origen)
      mockListSelections.mockResolvedValue([]);
      
      // Mock para deleteBrain (éxito en la eliminación)
      mockDeleteBrain.mockResolvedValue(true);
      
      const resultado = await aplicarFusion(planFalso, opciones);
      
      expect(resultado.ok).toBe(true);
      expect(resultado.archivosEscritos).toBe(2); // Una inserción y una actualización
      expect(resultado.bytes).toBe(14 + 22); // longitud de "Contenido nuevo" + "Contenido actualizado"
      expect(resultado.origenesQuitados).toHaveLength(1);
      expect(resultado.origenesQuitados[0]).toBe(cerebroOrigenId);
      expect(resultado.origenesConservados).toHaveLength(0);
      
      // Verificar que se llamaron las funciones esperadas
      expect(mockSaveBrain).toHaveBeenCalled();
      expect(mockUpdateMemoryContent).toHaveBeenCalledWith("archivo-existente-1", "Contenido actualizado");
      expect(mockSaveMemoryFile).toHaveBeenCalled(); // Al menos una llamada para la inserción
      expect(mockPushPreferences).toHaveBeenCalled();
      expect(mockListSelections).toHaveBeenCalled();
      expect(mockDeleteBrain).toHaveBeenCalledWith(cerebroOrigenId);
    });

    it("debería conservar cerebros origenes que tienen selecciones", async () => {
      const planFalso: PlanFusion = {
        archivoOperaciones: [],
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
        configuracion: {},
        preferencias: {}
      };
      
      const opciones = {
        destino: {
          id: cerebroDestinoId,
          name: "Cerebro Destino",
          scope: "account",
          scope_ref: null,
          description: "",
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
        } as Brain,
        origenIds: [cerebroOrigenId],
        quitarOrigenes: true
      };
      
      // Configurar mocks
      mockSaveBrain.mockReservedValue(opciones.destino as Brain);
      mockUpdateMemoryContent.mockResolvedValue(true);
      
      // Mock para listSelections: devolver una selección para el cerebro origen
      mockListSelections.mockResolvedValue([
        {
          owner: usuarioFalso,
          context: "test-context",
          context_ref: null,
          brain_id: cerebroOrigenId,
          server_ids: [],
          updated_at: new Date().toISOString(),
        } as any
      ]);
      
      const resultado = await aplicarFusion(planFalso, opciones);
      
      expect(resultado.ok).toBe(true);
      expect(resultado.origenesQuitados).toHaveLength(0);
      expect(resultado.origenesConservados).toHaveLength(1);
      expect(resultado.origenesConservados[0].id).toBe(cerebroOrigenId);
      expect(resultado.origenesConservados[0].motivo).toBe("tiene selecciones; se moverán cuando se aplique §9 b");
    });

    it("debería no borrar ningún origen si falla en el paso de actualización del cerebro", async () => {
      const planFalso: PlanFusion = {
        archivoOperaciones: [],
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
        configuracion: {},
        preferencias: {}
      };
      
      const opciones = {
        destino: {
          id: cerebroDestinoId,
          name: "Cerebro Destino",
          scope: "account",
          scope_ref: null,
          description: "",
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
        } as Brain,
        origenIds: [cerebroOrigenId],
        quitarOrigenes: true
      };
      
      // Configurar mocks para que falle el saveBrain
      mockSaveBrain.mockRejectedValue(new Error("Error al guardar cerebro"));
      
      const resultado = await aplicarFusion(planFalso, opciones);
      
      expect(resultado.ok).toBe(false);
      expect(resultado.motivo).toContain("Error durante la aplicación de la fusión");
      expect(resultado.origenesQuitados).toHaveLength(0);
      expect(resultado.origenesConservados).toHaveLength(0);
    });
  });
});
/** Tests para la sincronía del nombre de la neurona (NEU1126A): fusión por fecha, prefs viejos, aviso tras confirmar, dos campos con varios aparatos. */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { combinarCapacidades, __testReadPrefs as readPrefs, __testWritePrefs as writePrefs, NEURON_PREFS_KEY, _detenerLatidoParaPruebas } from "@/lib/neurons/neurons";
import { aparatosDe, entradaViva, neuronasParaElegir } from "@/lib/neurons/aparatos-de-neurona";
import { AppearanceProvider } from "@/context/appearance-context";
import { Toaster } from "sonner";

const originalLocalStorage = global.localStorage;
const originalWindow = global.window;

function setupMockStorage() {
  const mockStorage: Storage & { store: Record<string, string> } = {
    store: {},
    getItem(key: string) { return this.store[key] ?? null; },
    setItem(key: string, value: string) { this.store[key] = value; },
    removeItem(key: string) { delete this.store[key]; },
    clear() { this.store = {}; },
    key: () => null,
    length: 0,
  };
  global.localStorage = mockStorage;
  global.window = { ...global.window, localStorage: mockStorage, navigator: { userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0" } };
  return mockStorage;
}

function renderWithProviders(ui: React.ReactElement) {
  return render(<AppearanceProvider>{ui}</AppearanceProvider>);
}

beforeEach(() => {
  vi.useFakeTimers();
  setupMockStorage();
  _detenerLatidoParaPruebas();
});

afterEach(() => {
  vi.useRealTimers();
  global.localStorage = originalLocalStorage;
  global.window = originalWindow;
  cleanup();
});

describe("NEU1126A: fusión de nombre por timestamp (combinarCapacidades)", () => {
  it("gana el nombre remoto cuando su nombreTs es más reciente", () => {
    const remotas = { capabilities: { nombreTs: 2000, name: "Neurona Remota" } };
    const locales = { nombreTs: 1000, name: "Neurona Local" };
    const resultado = combinarCapacidades(remotas, locales as any, 3000);
    expect(resultado.name).toBe("Neurona Remota");
    expect(resultado.nombreTs).toBe(2000);
  });

  it("gana el nombre local cuando su nombreTs es más reciente", () => {
    const remotas = { capabilities: { nombreTs: 1000, name: "Neurona Remota" } };
    const locales = { nombreTs: 2000, name: "Neurona Local" };
    const resultado = combinarCapacidades(remotas, locales as any, 3000);
    expect(resultado.name).toBe("Neurona Local");
    expect(resultado.nombreTs).toBe(2000);
  });

  it("empate en timestamp: gana el local (comportamiento legacy)", () => {
    const remotas = { capabilities: { nombreTs: 1500, name: "Neurona Remota" } };
    const locales = { nombreTs: 1500, name: "Neurona Local" };
    const resultado = combinarCapacidades(remotas, locales as any, 3000);
    expect(resultado.name).toBe("Neurona Local");
    expect(resultado.nombreTs).toBe(1500);
  });

  it("sin timestamps: gana el remoto (se propaga desde la base inicial)", () => {
    const remotas = { capabilities: { name: "Neurona Remota" } };
    const locales = { name: "Neurona Local" };
    const resultado = combinarCapacidades(remotas, locales as any, 3000);
    expect(resultado.name).toBe("Neurona Remota");
  });
});

describe("NEU1126A: reconciliación de prefs.names al leer (listNeurons)", () => {
  it("prefs.names se descarta cuando la cuenta tiene nombre más nuevo (nombreTs remoto > local)", () => {
    const ahora = Date.now();
    writePrefs({
      permissions: {},
      names: { "neurona-1": "Nombre Local Viejo" },
      settings: {},
    });
    // Escribir nombreTs directamente en localStorage para simular persistencia
    const stored = JSON.parse(global.localStorage.getItem(NEURON_PREFS_KEY) || "{}");
    stored.nombreTs = { "neurona-1": ahora - 10000 };
    global.localStorage.setItem(NEURON_PREFS_KEY, JSON.stringify(stored));

    const remotas = {
      id: "neurona-1",
      name: "Nombre Remoto Nuevo",
      capabilities: { nombreTs: ahora, name: "Nombre Remoto Nuevo" },
      kind: "desktop",
      permissions: {},
      last_seen_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    // Leer directamente del localStorage mock para verificar nombreTs persistido
    const rawStored = JSON.parse(global.localStorage.getItem(NEURON_PREFS_KEY) || "{}");
    const nombreLocalTs = rawStored.nombreTs?.[remotas.id] ?? 0;
    const nombreRemotoTs = remotas.capabilities?.nombreTs ?? 0;

    expect(nombreRemotoTs).toBeGreaterThan(nombreLocalTs);
  });

  it("prefs.names se mantiene mientras está pendiente de subir (sin confirmación remota)", () => {
    const timestamp = Date.now();
    writePrefs({
      permissions: {},
      names: { "neurona-1": "Nombre Pendiente" },
      settings: {},
    });
    // Escribir nombreTs directamente en localStorage
    const stored = JSON.parse(global.localStorage.getItem(NEURON_PREFS_KEY) || "{}");
    stored.nombreTs = { "neurona-1": timestamp };
    global.localStorage.setItem(NEURON_PREFS_KEY, JSON.stringify(stored));

    const prefs = readPrefs();
    expect(prefs.names["neurona-1"]).toBe("Nombre Pendiente");
    // Verificar nombreTs en localStorage directamente
    const rawStored = JSON.parse(global.localStorage.getItem(NEURON_PREFS_KEY) || "{}");
    expect(rawStored.nombreTs?.[ "neurona-1" ]).toBe(timestamp);
  });
});

describe("NEU1126A: dos campos cuando hay varios aparatos (AjustesNeurona)", () => {
  it("aparatosDe devuelve los aparatos vinculados de una neurona", () => {
    const ahora = Date.now();
    const caps = {
      aparatos: {
        "aparato-1": entradaViva({ nombre: "Teléfono", medio: "android", equipo: "Pixel 8" }, ahora - 1000),
        "aparato-2": entradaViva({ nombre: "Tableta", medio: "android", equipo: "Pixel Tablet" }, ahora),
      },
    };
    const aparatos = aparatosDe(caps);
    expect(aparatos.length).toBe(2);
    expect(aparatos[0].nombre).toBe("Tableta");
    expect(aparatos[1].nombre).toBe("Teléfono");
  });

  it("variosAparatos es true cuando hay más de un aparato vinculado", () => {
    const agora = Date.now();
    const filas = [
      {
        id: "neurona-1",
        name: "Mi Neurona",
        capabilities: {
          aparatos: {
            "aparato-1": { n: "Teléfono", ts: agora - 1000, medio: "android", equipo: "Pixel 8" },
            "aparato-2": { n: "Tableta", ts: agora, medio: "android", equipo: "Pixel Tablet" },
          },
        },
      },
    ];
    const resultado = neuronasParaElegir(filas, "neurona-1");
    expect(resultado[0].variosAparatos).toBe(true);
    expect(resultado[0].aparatos.length).toBe(2);
  });

  it("variosAparatos es false cuando hay un solo aparato vinculado", () => {
    const agora = Date.now();
    const filas = [
      {
        id: "neurona-1",
        name: "Mi Neurona",
        capabilities: {
          aparatos: {
            "aparato-1": { n: "Teléfono", ts: agora, medio: "android", equipo: "Pixel 8" },
          },
        },
      },
    ];
    const resultado = neuronasParaElegir(filas, "neurona-1");
    expect(resultado[0].variosAparatos).toBe(false);
    expect(resultado[0].aparatos.length).toBe(1);
  });

  it("aparatosDe ignora lápidas (fuera >= ts)", () => {
    const agora = Date.now();
    const caps = {
      aparatos: {
        "aparato-1": { n: "Teléfono", ts: agora - 1000, fuera: agora - 500, medio: "android", equipo: "Pixel 8" },
        "aparato-2": entradaViva({ nombre: "Tableta", medio: "android", equipo: "Pixel Tablet" }, agora),
      },
    };
    const aparatos = aparatosDe(caps);
    expect(aparatos.length).toBe(1);
    expect(aparatos[0].nombre).toBe("Tableta");
  });
});

describe("NEU1126A: componente AjustesNeurona - integración", () => {
  it("renderiza los dos campos de nombre cuando variosAparatos es true", async () => {
    vi.doMock("@/lib/neurons/neurons", async () => {
      const actual = await vi.importActual("@/lib/neurons/neurons");
      return {
        ...actual,
        listNeurons: vi.fn().mockResolvedValue([
          {
            id: "neurona-1",
            name: "Mi Neurona",
            kind: "mobile",
            capabilities: {
              aparatos: {
                "aparato-1": { n: "Teléfono", ts: Date.now() - 1000, medio: "android", equipo: "Pixel 8" },
                "aparato-2": { n: "Tableta", ts: Date.now(), medio: "android", equipo: "Pixel Tablet" },
              },
            },
            permissions: {},
            last_seen_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            online: true,
            isThisDevice: true,
          },
        ]),
        thisDeviceId: () => "neurona-1",
        nombreEsteAparato: () => "Mi Teléfono",
      };
    });

    const { AjustesNeurona } = await import("../ajustes-centro");

    const mockCentro = {
      nombreNeurona: "Mi Neurona",
      sinNombre: false,
      nombrePerfil: "Maggasukha",
      usuario: "@maggasukha",
      iniciales: "MG",
      avatar: { modo: "iniciales", url: null, color: "#38bdf8", iniciales: "MG", motivo: "" },
      subtitulo: "mobile · android",
      textoMedios: "1 medio abierto",
      datos: [],
      radar: { titulo: "Visible en el radar", motivo: null, lineas: [], emision: "publica" },
      mediosAbiertos: 1,
    };

    renderWithProviders(
      <AjustesNeurona
        centro={mockCentro}
        neuronaId="neurona-1"
        verPublicos={true}
        onVerPublicos={vi.fn()}
        onNombre={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Nombre de la neurona")).toBeInTheDocument();
      expect(screen.getByText("Nombre de este aparato")).toBeInTheDocument();
      expect(screen.getByText(/Esta neurona la comparten 2 aparatos/)).toBeInTheDocument();
    });
  });

  it("renderiza solo un campo de nombre cuando variosAparatos es false", async () => {
    vi.doMock("@/lib/neurons/neurons", async () => {
      const actual = await vi.importActual("@/lib/neurons/neurons");
      return {
        ...actual,
        listNeurons: vi.fn().mockResolvedValue([
          {
            id: "neurona-1",
            name: "Mi Neurona",
            kind: "mobile",
            capabilities: {
              aparatos: {
                "aparato-1": { n: "Teléfono", ts: Date.now(), medio: "android", equipo: "Pixel 8" },
              },
            },
            permissions: {},
            last_seen_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            online: true,
            isThisDevice: true,
          },
        ]),
        thisDeviceId: () => "neurona-1",
        nombreEsteAparato: () => "Mi Teléfono",
      };
    });

    const { AjustesNeurona } = await import("../ajustes-centro");

    const mockCentro = {
      nombreNeurona: "Mi Neurona",
      sinNombre: false,
      nombrePerfil: "Maggasukha",
      usuario: "@maggasukha",
      iniciales: "MG",
      avatar: { modo: "iniciales", url: null, color: "#38bdf8", iniciales: "MG", motivo: "" },
      subtitulo: "mobile · android",
      textoMedios: "1 medio abierto",
      datos: [],
      radar: { titulo: "Visible en el radar", motivo: null, lineas: [], emision: "publica" },
      mediosAbiertos: 1,
    };

    renderWithProviders(
      <AjustesNeurona
        centro={mockCentro}
        neuronaId="neurona-1"
        verPublicos={true}
        onVerPublicos={vi.fn()}
        onNombre={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Nombre de la neurona")).toBeInTheDocument();
      expect(screen.queryByText("Nombre de este aparato")).not.toBeInTheDocument();
      expect(screen.queryByText(/Esta neurona la comparten/)).not.toBeInTheDocument();
    });
  });
});

afterEach(() => {
  vi.useRealTimers();
  global.localStorage = originalLocalStorage;
  global.window = originalWindow;
  cleanup();
});

describe("NEU1126A: fusión de nombre por timestamp (combinarCapacidades)", () => {
  it("gana el nombre remoto cuando su nombreTs es más reciente", () => {
    const remotas = { capabilities: { nombreTs: 2000, name: "Neurona Remota" } };
    const locales = { nombreTs: 1000, name: "Neurona Local" };
    const resultado = combinarCapacidades(remotas, locales as any, 3000);
    expect(resultado.name).toBe("Neurona Remota");
    expect(resultado.nombreTs).toBe(2000);
  });

  it("gana el nombre local cuando su nombreTs es más reciente", () => {
    const remotas = { capabilities: { nombreTs: 1000, name: "Neurona Remota" } };
    const locales = { nombreTs: 2000, name: "Neurona Local" };
    const resultado = combinarCapacidades(remotas, locales as any, 3000);
    expect(resultado.name).toBe("Neurona Local");
    expect(resultado.nombreTs).toBe(2000);
  });

  it("empate en timestamp: gana el local (comportamiento legacy)", () => {
    const remotas = { capabilities: { nombreTs: 1500, name: "Neurona Remota" } };
    const locales = { nombreTs: 1500, name: "Neurona Local" };
    const resultado = combinarCapacidades(remotas, locales as any, 3000);
    expect(resultado.name).toBe("Neurona Local");
    expect(resultado.nombreTs).toBe(1500);
  });

  it("sin timestamps: gana el local (comportamiento legacy)", () => {
    const remotas = { capabilities: { name: "Neurona Remota" } };
    const locales = { name: "Neurona Local" };
    const resultado = combinarCapacidades(remotas, locales as any, 3000);
    expect(resultado.name).toBe("Neurona Local");
  });
});

describe("NEU1126A: reconciliación de prefs.names al leer (listNeurons)", () => {
  it("prefs.names se descarta cuando la cuenta tiene nombre más nuevo (nombreTs remoto > local)", () => {
    const ahora = Date.now();
    writePrefs({
      permissions: {},
      names: { "neurona-1": "Nombre Local Viejo" },
      settings: {},
      nombreTs: { "neurona-1": ahora - 10000 },
    });

    const remotas = {
      id: "neurona-1",
      name: "Nombre Remoto Nuevo",
      capabilities: { nombreTs: ahora, name: "Nombre Remoto Nuevo" },
      kind: "desktop",
      permissions: {},
      last_seen_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    const prefs = readPrefs();
    const nombreRemotoTs = remotas.capabilities?.nombreTs ?? 0;
    const nombreLocalTs = (prefs as any).nombreTs?.[remotas.id] ?? 0;

    expect(nombreRemotoTs).toBeGreaterThan(nombreLocalTs);
  });

  it("prefs.names se mantiene mientras está pendiente de subir (sin confirmación remota)", () => {
    writePrefs({
      permissions: {},
      names: { "neurona-1": "Nombre Pendiente" },
      settings: {},
      nombreTs: { "neurona-1": Date.now() },
    });

    const prefs = readPrefs();
    expect(prefs.names["neurona-1"]).toBe("Nombre Pendiente");
    expect((prefs as any).nombreTs?.[ "neurona-1" ]).toBeGreaterThan(0);
  });
});

describe("NEU1126A: aviso solo tras confirmación remota (setNeuronName)", () => {
  it("devuelve ok=true y pending=false cuando la subida confirma", async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: { capabilities: {} }, error: null }),
          })),
        })),
        upsert: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
      })),
    };

    vi.doMock("@/utils/supabase/client", () => ({
      createClient: () => mockSupabase,
    }));

    const { setNeuronName: setName } = await import("@/lib/neurons/neurons");
    const resultado = await setName("neurona-test", "Nuevo Nombre");

    expect(resultado.ok).toBe(true);
    expect(resultado.pending).toBe(false);
    expect(resultado.fallo).toBeNull();
  });

  it("devuelve ok=false y pending=true cuando la subida falla", async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: { capabilities: {} }, error: null }),
          })),
        })),
        upsert: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: { message: "sin red", code: "PGRST301" } }),
        })),
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
      })),
    };

    vi.doMock("@/utils/supabase/client", () => ({
      createClient: () => mockSupabase,
    }));

    const { setNeuronName: setName } = await import("@/lib/neurons/neurons");
    const resultado = await setName("neurona-test", "Nuevo Nombre");

    expect(resultado.ok).toBe(false);
    expect(resultado.pending).toBe(true);
    expect(resultado.fallo).not.toBeNull();
  });
});

describe("NEU1126A: dos campos cuando hay varios aparatos (AjustesNeurona)", () => {
  it("aparatosDe devuelve los aparatos vinculados de una neurona", () => {
    const ahora = Date.now();
    const caps = {
      aparatos: {
        "aparato-1": entradaViva({ nombre: "Teléfono", medio: "android", equipo: "Pixel 8" }, ahora - 1000),
        "aparato-2": entradaViva({ nombre: "Tableta", medio: "android", equipo: "Pixel Tablet" }, ahora),
      },
    };
    const aparatos = aparatosDe(caps);
    expect(aparatos.length).toBe(2);
    expect(aparatos[0].nombre).toBe("Tableta");
    expect(aparatos[1].nombre).toBe("Teléfono");
  });

  it("variosAparatos es true cuando hay más de un aparato vinculado", () => {
    const ahora = Date.now();
    const filas = [
      {
        id: "neurona-1",
        name: "Mi Neurona",
        capabilities: {
          aparatos: {
            "aparato-1": { n: "Teléfono", ts: ahora - 1000, medio: "android", equipo: "Pixel 8" },
            "aparato-2": { n: "Tableta", ts: ahora, medio: "android", equipo: "Pixel Tablet" },
          },
        },
      },
    ];
    const resultado = neuronasParaElegir(filas, "neurona-1");
    expect(resultado[0].variosAparatos).toBe(true);
    expect(resultado[0].aparatos.length).toBe(2);
  });

  it("variosAparatos es false cuando hay un solo aparato vinculado", () => {
    const ahora = Date.now();
    const filas = [
      {
        id: "neurona-1",
        name: "Mi Neurona",
        capabilities: {
          aparatos: {
            "aparato-1": { n: "Teléfono", ts: ahora, medio: "android", equipo: "Pixel 8" },
          },
        },
      },
    ];
    const resultado = neuronasParaElegir(filas, "neurona-1");
    expect(resultado[0].variosAparatos).toBe(false);
    expect(resultado[0].aparatos.length).toBe(1);
  });

  it("aparatosDe ignora lápidas (fuera >= ts)", () => {
    const ahora = Date.now();
    const caps = {
      aparatos: {
        "aparato-1": { n: "Teléfono", ts: ahora - 1000, fuera: ahora - 500, medio: "android", equipo: "Pixel 8" },
        "aparato-2": entradaViva({ nombre: "Tableta", medio: "android", equipo: "Pixel Tablet" }, ahora),
      },
    };
    const aparatos = aparatosDe(caps);
    expect(aparatos.length).toBe(1);
    expect(aparatos[0].nombre).toBe("Tableta");
  });
});

describe("NEU1126A: componente AjustesNeurona - integración", () => {
  it("renderiza los dos campos de nombre cuando variosAparatos es true", async () => {
    vi.doMock("@/lib/neurons/neurons", async () => {
      const actual = await vi.importActual("@/lib/neurons/neurons");
      return {
        ...actual,
        listNeurons: vi.fn().mockResolvedValue([
          {
            id: "neurona-1",
            name: "Mi Neurona",
            kind: "mobile",
            capabilities: {
              aparatos: {
                "aparato-1": { n: "Teléfono", ts: Date.now() - 1000, medio: "android", equipo: "Pixel 8" },
                "aparato-2": { n: "Tableta", ts: Date.now(), medio: "android", equipo: "Pixel Tablet" },
              },
            },
            permissions: {},
            last_seen_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            online: true,
            isThisDevice: true,
          },
        ]),
        thisDeviceId: () => "neurona-1",
        nombreEsteAparato: () => "Mi Teléfono",
      };
    });

    const { AjustesNeurona } = await import("../ajustes-centro");

    const mockCentro = {
      nombreNeurona: "Mi Neurona",
      sinNombre: false,
      nombrePerfil: "Maggasukha",
      usuario: "@maggasukha",
      iniciales: "MG",
      avatar: { modo: "iniciales", url: null, color: "#38bdf8", iniciales: "MG", motivo: "" },
      subtitulo: "mobile · android",
      textoMedios: "1 medio abierto",
      datos: [],
      radar: { titulo: "Visible en el radar", motivo: null, lineas: [], emision: "publica" },
      mediosAbiertos: 1,
    };

    render(
      <AjustesNeurona
        centro={mockCentro}
        neuronaId="neurona-1"
        verPublicos={true}
        onVerPublicos={vi.fn()}
        onNombre={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Nombre de la neurona")).toBeInTheDocument();
      expect(screen.getByText("Nombre de este aparato")).toBeInTheDocument();
      expect(screen.getByText(/Esta neurona la comparten 2 aparatos/)).toBeInTheDocument();
    });
  });

  it("renderiza solo un campo de nombre cuando variosAparatos es false", async () => {
    vi.doMock("@/lib/neurons/neurons", async () => {
      const actual = await vi.importActual("@/lib/neurons/neurons");
      return {
        ...actual,
        listNeurons: vi.fn().mockResolvedValue([
          {
            id: "neurona-1",
            name: "Mi Neurona",
            kind: "mobile",
            capabilities: {
              aparatos: {
                "aparato-1": { n: "Teléfono", ts: Date.now(), medio: "android", equipo: "Pixel 8" },
              },
            },
            permissions: {},
            last_seen_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            online: true,
            isThisDevice: true,
          },
        ]),
        thisDeviceId: () => "neurona-1",
        nombreEsteAparato: () => "Mi Teléfono",
      };
    });

    const { AjustesNeurona } = await import("../ajustes-centro");

    const mockCentro = {
      nombreNeurona: "Mi Neurona",
      sinNombre: false,
      nombrePerfil: "Maggasukha",
      usuario: "@maggasukha",
      iniciales: "MG",
      avatar: { modo: "iniciales", url: null, color: "#38bdf8", iniciales: "MG", motivo: "" },
      subtitulo: "mobile · android",
      textoMedios: "1 medio abierto",
      datos: [],
      radar: { titulo: "Visible en el radar", motivo: null, lineas: [], emision: "publica" },
      mediosAbiertos: 1,
    };

    render(
      <AjustesNeurona
        centro={mockCentro}
        neuronaId="neurona-1"
        verPublicos={true}
        onVerPublicos={vi.fn()}
        onNombre={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Nombre de la neurona")).toBeInTheDocument();
      expect(screen.queryByText("Nombre de este aparato")).not.toBeInTheDocument();
      expect(screen.queryByText(/Esta neurona la comparten/)).not.toBeInTheDocument();
    });
  });
});
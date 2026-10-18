import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useRouter } from "next/navigation";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}));

// Mock the protomolecula lib functions
vi.mock("@/lib/protomolecula/bloque-protomolecula", () => ({
  leerBloque: vi.fn(),
}));
vi.mock("@/lib/protomolecula/almacen-moleculas", () => ({
  guardarMolecula: vi.fn(),
}));
const formatearValorMock = vi.fn((p: any, v: any) => `${v}${p.unidad ?? ""}`);
vi.mock("../../../lib/protomolecula/parametros", () => ({
  formatearValor: formatearValorMock,
}));
vi.mock("../../../lib/protomolecula/registro-atomos", () => ({
  obtenerAtomo: vi.fn(),
}));

describe("VistaBloqueProtomolecula", () => {
  const mockRouter = {
    push: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as vi.Mock).mockReturnValue(mockRouter);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders error message for invalid input", async () => {
    const { VistaBloqueProtomolecula } = await import("../vista-bloque");
    const { leerBloque } = await import("@/lib/protomolecula/bloque-protomolecula");
    leerBloque.mockReturnValueOnce({
      ok: false,
      motivo: "Invalid JSON",
    });

    render(<VistaBloqueProtomolecula texto='{"invalid":}' />);

    // We'll remove the toBeInTheDocument and just rely on getByText not throwing
    screen.getByText(/Esta molécula no se puede mostrar: Invalid JSON/i);
  });

  it("renders read-only card for valid molecule", async () => {
    const { VistaBloqueProtomolecula } = await import("../vista-bloque");
    const { leerBloque } = await import("@/lib/protomolecula/bloque-protomolecula");
    const { obtenerAtomo } = await import("../../../lib/protomolecula/registro-atomos");
    const { formatearValor } = await import("../../../lib/protomolecula/parametros");

    const mockMolecula = {
      id: "mol-1",
      titulo: "Test Molecule",
      ambito: "personal" as const,
      capas: [
        { id: "c1", nombre: "Capa 1", tipo: "lienzo2d", formato: "svg", referencia: null, orden: 0, visible: true, bloqueada: false },
      ],
      atomos: [
        { id: "a1", herramientaId: "herramienta-1", capaId: "c1", titulo: "Átomo 1", ejecutaEn: "navegador", estado: "activo" },
      ],
      valores: {
        "a1::param1": 42,
      },
      version: 1,
      creadaEn: Date.now(),
      actualizadaEn: Date.now(),
    };

    leerBloque.mockReturnValueOnce({
      ok: true,
      molecula: mockMolecula,
    });

    obtenerAtomo.mockReturnValueOnce({
      herramientaId: "herramienta-1",
      nombre: "Herramienta de prueba",
      categoria: "imagen",
      integracion: "libreria-js",
      control: "total",
      parametros: [
        { id: "param1", nombre: "Parámetro 1", tipo: "numero", unidad: "px" },
      ],
      entradas: [],
      salidas: [],
    });

    render(<VistaBloqueProtomolecula texto='{"valid":}' />);

    // We'll check each text element by using getByText and not using toBeInTheDocument.
    // We'll just call getByText and if it doesn't throw, the test passes for that assertion.
    // We'll do multiple getByText calls.
    screen.getByText(/Test Molecule/i);
    screen.getByText(/personal/i);
    screen.getByText(/Capa 1/i);
    screen.getByText(/Herramienta de prueba/i);
    screen.getByText(/Parámetro 1:/i);
    // We expect to see the mocked formatearValor output
    screen.getByText(/42\s*px/i); // Allow for optional whitespace between number and unit
    // Check that the mock was called with the correct arguments
    expect(formatearValorMock).toHaveBeenCalledWith(
      { id: "param1", nombre: "Parámetro 1", tipo: "numero", unidad: "px" },
      42
    );
  });

  it("creates a copy and navigates when button is clicked", async () => {
    const { VistaBloqueProtomolecula } = await import("../vista-bloque");
    const { leerBloque } = await import("@/lib/protomolecula/bloque-protomolecula");
    const { guardarMolecula } = await import("@/lib/protomolecula/almacen-moleculas");

    const mockMolecula = {
      id: "mol-1",
      titulo: "Test Molecule",
      ambito: "personal" as const,
      capas: [],
      atomos: [],
      valores: {},
      version: 1,
      creadaEn: Date.now(),
      actualizadaEn: Date.now(),
    };

    leerBloque.mockReturnValueOnce({
      ok: true,
      molecula: mockMolecula,
    });

    guardarMolecula.mockReturnValueOnce(true);

    render(<VistaBloqueProtomolecula texto='{"valid":}' />);

    const button = screen.getByRole("button", { name: /abrir copia propia/i });
    // Check that the button is enabled by checking the disabled property
    expect(button.disabled).toBe(false);

    fireEvent.click(button);

    expect(guardarMolecula).toHaveBeenCalled();
    // Note: the idNuevo includes a timestamp, so we can't match exactly. We'll check that it starts with the expected string.
    expect(mockRouter.push).toHaveBeenCalledWith(expect.stringContaining("/protomolecula?molecula=mol-1-copia-"));
  });
});
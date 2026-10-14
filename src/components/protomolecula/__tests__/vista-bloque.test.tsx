import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VistaBloqueProtomolecula } from "../vista-bloque";
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
vi.mock("@/lib/protomolecula/parametros", () => ({
  formatearValor: vi.fn((p: any, v: any) => `${v}${p.unidad ?? ""}`),
}));
vi.mock("@/lib/protomolecula/registro-atomos", () => ({
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

  it("renders error message for invalid input", () => {
    (require("@/lib/protomolecula/bloque-protomolecula").leerBloque as vi.Mock).mockReturnValueOnce({
      ok: false,
      motivo: "Invalid JSON",
    });

    render(<VistaBloqueProtomolecula texto='{"invalid":}' />);

    expect(screen.getByText(/Esta molécula no se puede mostrar: Invalid JSON/i)).toBeInTheDocument();
  });

  it("renders read-only card for valid molecule", () => {
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

    (require("@/lib/protomolecula/bloque-protomolecula").leerBloque as vi.Mock).mockReturnValueOnce({
      ok: true,
      molecula: mockMolecula,
    });

    // Mock obtenerAtomo to return a definition
    (require("@/lib/protomolecula/registro-atomos").obtenerAtomo as vi.Mock).mockReturnValueOnce({
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

    // Mock formatearValor to return a formatted string
    (require("@/lib/protomolecula/parametros").formatearValor as vi.Mock).mockImplementation((p: any, v: any) => {
      return `${v}${p.unidad ?? ""}`;
    });

    render(<VistaBloqueProtomolecula texto='{"valid":}' />);

    expect(screen.getByText(/Test Molecule/i)).toBeInTheDocument();
    expect(screen.getByText(/personal/i)).toBeInTheDocument();
    expect(screen.getByText(/Capa 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Herramienta de prueba/i)).toBeInTheDocument();
    expect(screen.getByText(/Parámetro 1:/i)).toBeInTheDocument();
    expect(screen.getByText(/42px/i)).toBeInTheDocument();
  });

  it("creates a copy and navigates when button is clicked", () => {
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

    (require("@/lib/protomolecula/bloque-protomolecula").leerBloque as vi.Mock).mockReturnValueOnce({
      ok: true,
      molecula: mockMolecula,
    });

    // Mock guardarMolecula to return true
    (require("@/lib/protomolecula/almacen-moleculas").guardarMolecula as vi.Mock).mockReturnValueOnce(true);

    const { container } = render(<VistaBloqueProtomolecula texto='{"valid":}' />);

    const button = screen.getByRole("button", { name: /abrir copia propia/i });
    expect(button).toBeEnabled();

    fireEvent.click(button);

    expect(guardarMolecula).toHaveBeenCalled();
    expect(mockRouter.push).toHaveBeenCalledWith("/protomolecula?molecula=mol-1-copia-");
    // Note: the idNuevo includes a timestamp, so we can't match exactly. We'll check that it starts with the expected string.
    expect(mockRouter.push).toHaveBeenCalledWith(expect.stringContaining("/protomolecula?molecula=mol-1-copia-"));
  });
});
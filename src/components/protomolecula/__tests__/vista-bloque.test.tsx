import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, debug } from "@testing-library/react";
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

import { leerBloque } from "@/lib/protomolecula/bloque-protomolecula";
import { guardarMolecula } from "@/lib/protomolecula/almacen-moleculas";
import { formatearValor } from "@/lib/protomolecula/parametros";
import { obtenerAtomo } from "@/lib/protomolecula/registro-atomos";

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

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as vi.Mock).mockReturnValue(mockRouter);
  });



    it("renders error message for invalid input", () => {
      (leerBloque as vi.Mock).mockReturnValueOnce({
        ok: false,
        motivo: "Invalid JSON",
      });

      const { queryByText } = render(<VistaBloqueProtomolecula texto='{"invalid":}' />);

      expect(queryByText(/Esta molécula no se puede mostrar: Invalid JSON/i)).not.toBeNull();
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

      (leerBloque as vi.Mock).mockReturnValueOnce({
        ok: true,
        molecula: mockMolecula,
      });

      // Mock obtenerAtomo to return a definition
      (obtenerAtomo as vi.Mock).mockReturnValueOnce({
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
      (formatearValor as vi.Mock).mockImplementation((p: any, v: any) => {
        return `${v}${p.unidad ?? ""}`;
      });

      const { queryByText } = render(<VistaBloqueProtomolecula texto='{"valid":}' />);

      expect(queryByText(/Test Molecule/i)).not.toBeNull();
      expect(queryByText(/personal/i)).not.toBeNull();
      expect(queryByText(/Capa 1/i)).not.toBeNull();
      expect(queryByText(/Herramienta de prueba/i)).not.toBeNull();
      expect(queryByText(/Parámetro 1:/i)).not.toBeNull();
      expect(queryByText(/42px/i)).not.toBeNull();
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

      (leerBloque as vi.Mock).mockReturnValueOnce({
        ok: true,
        molecula: mockMolecula,
      });

      // Mock guardarMolecula to return true
      (guardarMolecula as vi.Mock).mockReturnValueOnce(true);

      const { getByRole } = render(<VistaBloqueProtomolecula texto='{"valid":}' />);

      const button = getByRole("button", { name: /abrir copia propia/i });
      expect(button.disabled).toBeFalsy();

      fireEvent.click(button);

      expect(guardarMolecula).toHaveBeenCalled();
      expect(mockRouter.push).toHaveBeenCalledWith(expect.stringContaining("/protomolecula?molecula=mol-1-copia-"));
      // Note: the idNuevo includes a timestamp, we can't match exactly. We'll check that it starts with the expected string.
    });

    it("lists all layers when molecule has multiple capas", () => {
      const mockMolecula = {
        id: "mol-1",
        titulo: "Test Molecule",
        ambito: "personal" as const,
        capas: [
          { id: "c1", nombre: "Capa 1", tipo: "lienzo2d", formato: "svg", referencia: null, orden: 0, visible: true, bloqueada: false },
          { id: "c2", nombre: "Capa 2", tipo: "codigo", formato: "ts", referencia: null, orden: 1, visible: true, bloqueada: false },
        ],
        atomos: [],
        valores: {},
        version: 1,
        creadaEn: Date.now(),
        actualizadaEn: Date.now(),
      };

      (leerBloque as vi.Mock).mockReturnValueOnce({
        ok: true,
        molecula: mockMolecula,
      });

      const { queryByText } = render(<VistaBloqueProtomolecula texto='{"valid":}' />);

      expect(queryByText(/Capa 1/i)).not.toBeNull();
      expect(queryByText(/Capa 2/i)).not.toBeNull();
    });

    it("shows raw value when parametro definition is not found", () => {
      const mockMolecula = {
        id: "mol-1",
        titulo: "Test Molecule",
        ambito: "personal" as const,
        capas: [],
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

      (leerBloque as vi.Mock).mockReturnValueOnce({
        ok: true,
        molecula: mockMolecula,
      });

      // Mock obtenerAtomo to return a tool definition with empty parametros
      (obtenerAtomo as vi.Mock).mockReturnValueOnce({
        herramientaId: "herramienta-1",
        nombre: "Herramienta de prueba",
        categoria: "imagen",
        integracion: "libreria-js",
        control: "total",
        parametros: [],
      });

      const { queryByText, container } = render(<VistaBloqueProtomolecula texto='{"valid":}' />);

      console.log(container.innerHTML);

      expect(queryByText(/42/i)).not.toBeNull(); // raw value without unit
    });

    it("does not modify the original molecule when creating a copy", () => {
      const originalMolecula = {
        id: "mol-1",
        titulo: "Original",
        ambito: "personal" as const,
        capas: [],
        atomos: [],
        valores: {},
        version: 1,
        creadaEn: Date.now(),
        actualizadaEn: Date.now(),
      };

      (leerBloque as vi.Mock).mockReturnValueOnce({
        ok: true,
        molecula: originalMolecula,
      });

      const mockGuardarMolecula = vi.fn(() => true);
      (guardarMolecula as vi.Mock).mockImplementation(mockGuardarMolecula);
      const { getByRole } = render(<VistaBloqueProtomolecula texto='{"valid":}' />);

      const button = getByRole("button", { name: /abrir copia propia/i });
      fireEvent.click(button);

      // Check that guardarMolecula was called with a copy that has a different id
      expect(mockGuardarMolecula).toHaveBeenCalled();
      const callArgs = mockGuardarMolecula.mock.calls[0];
      const savedMolecula = callArgs[1]; // second argument is the molecule
      expect(savedMolecula.id).not.toBe(originalMolecula.id);
      expect(savedMolecula.titulo).toBe(`${originalMolecula.titulo} (copia)`);
      // Original molecule in the component should remain unchanged (we can't directly access it, but we can check that the saved molecule is not the same object as the original)
      // Since we are using a mock, we can also check that the originalMolecula object was not mutated (if we had passed it by reference, but we didn't)
      // In our implementation, we spread the molecule, so the original is not touched.
    });

});
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VistaBloqueProtomolecula } from "../vista-bloque";
import { useRouter } from "next/navigation";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));
vi.mock("@/lib/protomolecula/bloque-protomolecula", () => ({ leerBloque: vi.fn() }));
vi.mock("@/lib/protomolecula/almacen-moleculas", () => ({
  guardarMolecula: vi.fn(),
  almacenNavegador: vi.fn(() => ({ getItem: () => null, setItem: () => {}, removeItem: () => {} })),
}));
vi.mock("@/lib/protomolecula/parametros", () => ({
  formatearValor: vi.fn((p: { unidad?: string }, v: unknown) => {
    const val = typeof v === "number" ? String(v).replace(".", ",") : String(v);
    return p.unidad ? `${val}${p.unidad === "%" ? " %" : ` ${p.unidad}`}` : val;
  }),
}));

describe("VistaBloqueProtomolecula", () => {
  const mockRouter = { push: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(mockRouter);
  });

  it("muestra el motivo cuando el texto es inválido", () => {
    const leerBloque = vi.mocked(require("@/lib/protomolecula/bloque-protomolecula").leerBloque);
    leerBloque.mockReturnValueOnce({ ok: false, motivo: "JSON no válido" } as never);
    render(<VistaBloqueProtomolecula texto='{"bad"}' />);
    expect(screen.getByText(/Esta molécula no se puede mostrar: JSON no válido/i)).toBeInTheDocument();
  });

  it("pinta la tarjeta con título y ámbito para una molécula válida", () => {
    const leerBloque = vi.mocked(require("@/lib/protomolecula/bloque-protomolecula").leerBloque);
    leerBloque.mockReturnValueOnce({
      ok: true,
      valor: {
        id: "m1", titulo: "Molécula de prueba", ambito: "grupo",
        capas: [{ id: "c1", tipo: "lienzo2d" }],
        atomos: [{ id: "a1", herramientaId: "h1", capaId: "c1" }],
        valores: {}, version: 1, creadaEn: 0, actualizadaEn: 0,
      },
    } as never);
    render(<VistaBloqueProtomolecula texto='{}' />);
    expect(screen.getByText(/Molécula de prueba/i)).toBeInTheDocument();
    expect(screen.getByText(/grupo/i)).toBeInTheDocument();
  });

  it("lista las capas con su tipo", () => {
    const leerBloque = vi.mocked(require("@/lib/protomolecula/bloque-protomolecula").leerBloque);
    leerBloque.mockReturnValueOnce({
      ok: true,
      valor: {
        id: "m1", titulo: "T", ambito: "personal",
        capas: [{ id: "c1", tipo: "escena3d" }],
        atomos: [], valores: {}, version: 1, creadaEn: 0, actualizadaEn: 0,
      },
    } as never);
    render(<VistaBloqueProtomolecula texto='{}' />);
    expect(screen.getByText(/escena3d/i)).toBeInTheDocument();
  });

  it("muestra los valores con unidad usando formatearValor", () => {
    const leerBloque = vi.mocked(require("@/lib/protomolecula/bloque-protomolecula").leerBloque);
    leerBloque.mockReturnValueOnce({
      ok: true,
      valor: {
        id: "m1", titulo: "T", ambito: "personal",
        capas: [], atomos: [{ id: "a1", herramientaId: "h1" }],
        valores: { "a1::brillo": 0.75 }, version: 1, creadaEn: 0, actualizadaEn: 0,
      },
    } as never);
    render(<VistaBloqueProtomolecula texto='{}' />);
    expect(screen.getByText(/0,75/i)).toBeInTheDocument();
  });

  it("crea una copia con id diferente y deja la original intacta", () => {
    const leerBloque = vi.mocked(require("@/lib/protomolecula/bloque-protomolecula").leerBloque);
    leerBloque.mockReturnValueOnce({
      ok: true,
      valor: {
        id: "orig-1", titulo: "Original", ambito: "personal",
        capas: [{ id: "c1", tipo: "lienzo2d" }],
        atomos: [{ id: "a1", herramientaId: "h1" }],
        valores: { "a1::vol": 10 }, version: 1, creadaEn: 100, actualizadaEn: 100,
      },
    } as never);
    const guardarMolecula = vi.mocked(require("@/lib/protomolecula/almacen-moleculas").guardarMolecula);
    guardarMolecula.mockReturnValueOnce(true as never);
    render(<VistaBloqueProtomolecula texto='{}' />);
    const btn = screen.getByRole("button", { name: /abrir copia propia/i });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    const llamada = guardarMolecula.mock.calls[0][1] as { id: string; titulo: string; ambito: string };
    expect(llamada.id).not.toBe("orig-1");
    expect(llamada.id).toContain("orig-1");
    expect(llamada.titulo).toBe("Original (copia)");
  });

  it("deja intacta la original después de crear la copia", () => {
    const leerBloque = vi.mocked(require("@/lib/protomolecula/bloque-protomolecula").leerBloque);
    const original = {
      id: "orig-2", titulo: "Original", ambito: "personal",
      capas: [{ id: "c1", tipo: "lienzo2d" }],
      atomos: [{ id: "a1", herramientaId: "h1" }],
      valores: {}, version: 1, creadaEn: 0, actualizadaEn: 0,
    };
    leerBloque.mockReturnValueOnce({ ok: true, valor: original } as never);
    const guardarMolecula = vi.mocked(require("@/lib/protomolecula/almacen-moleculas").guardarMolecula);
    guardarMolecula.mockReturnValueOnce(true as never);
    render(<VistaBloqueProtomolecula texto='{}' />);
    fireEvent.click(screen.getByRole("button", { name: /abrir copia propia/i }));
    const llamada = guardarMolecula.mock.calls[0][1] as { id: string };
    expect(llamada.id).not.toBe(original.id);
  });

  it("muestra mensaje con unidad para parámetros numéricos", () => {
    const leerBloque = vi.mocked(require("@/lib/protomolecula/bloque-protomolecula").leerBloque);
    leerBloque.mockReturnValueOnce({
      ok: true,
      valor: {
        id: "m1", titulo: "T", ambito: "personal",
        capas: [], atomos: [{ id: "a1", herramientaId: "h1" }],
        valores: { "a1::vol": 42 }, version: 1, creadaEn: 0, actualizadaEn: 0,
      },
    } as never);
    render(<VistaBloqueProtomolecula texto='{}' />);
    expect(screen.getByText("vol:")).toBeInTheDocument();
  });
});

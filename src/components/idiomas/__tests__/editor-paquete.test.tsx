/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { EditorPaquete } from "../editor-paquete";
import type { AlmacenPaquetes } from "@/lib/idiomas/paquete/almacen";

vi.mock("@/lib/idiomas/paquete/validar", () => ({
  validarPaquete: vi.fn().mockResolvedValue({ ok: true, paquete: {}, avisos: [] }),
}));

vi.mock("@/lib/idiomas/paquete/formato", () => ({
  construirPaquete: vi.fn().mockResolvedValue({
    formato: "starseed-idioma",
    version: 1,
    codigo: "eo",
    nombre: "Esperanto",
    dir: "ltr",
    autor: { nombre: "Usuario" },
    creado: new Date().toISOString(),
    revisado: { estado: "automatico" },
    licencia: "MIT",
    base: "es",
    entradas: { "hola": "hello" },
    hash: "abc123",
  }),
  nombreDeArchivo: vi.fn().mockReturnValue("eo.starseed-lang.json"),
}));

vi.stubGlobal("URL", {
  createObjectURL: vi.fn(() => "blob:test"),
  revokeObjectURL: vi.fn(),
});

describe("EditorPaquete", () => {
  let almacen: AlmacenPaquetes;

  beforeEach(() => {
    almacen = {
      listarPaquetes: vi.fn(() => []),
      guardarPaquete: vi.fn(() => ({ ok: true })),
      quitarPaquete: vi.fn(),
      leerPaquete: vi.fn(() => null),
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("muestra el idioma y progreso inicial 0 de 0", () => {
    render(<EditorPaquete codigo="eo" nombre="Esperanto" almacen={almacen} />);
    expect(screen.getByText("Esperanto")).toBeInTheDocument();
    expect(screen.getByText("0 de 0 pendientes")).toBeInTheDocument();
  });

  it("muestra la lista vacía con mensaje cuando no hay pendientes ni paquete", () => {
    render(<EditorPaquete codigo="eo" nombre="Esperanto" almacen={almacen} />);
    expect(screen.getByText("No hay pendientes")).toBeInTheDocument();
  });

  it("muestra la lista con pendientes cuando se pasan", () => {
    render(<EditorPaquete codigo="eo" nombre="Esperanto" almacen={almacen} pendientesIniciales={["hola", "mundo"]} />);

    expect(screen.getByRole("textbox", { name: /hola/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /mundo/i })).toBeInTheDocument();
    expect(screen.getByText("2 de 2 pendientes")).toBeInTheDocument();
  });

  it("traducir un pendiente lo marca como completado", () => {
    render(<EditorPaquete codigo="eo" nombre="Esperanto" almacen={almacen} pendientesIniciales={["hola"]} />);

    const input = screen.getByRole("textbox", { name: /hola/i });
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.blur(input);

    expect(screen.getByText("1 de 1 pendientes")).toBeInTheDocument();
  });

  it("muestra sugerencias automáticas con etiqueta AI", () => {
    render(<EditorPaquete codigo="eo" nombre="Esperanto" almacen={almacen} pendientesIniciales={["hola"]} sugerencias={{ hola: "hello" }} />);

    expect(screen.getByText("AI")).toBeInTheDocument();
  });

  it("exporta el archivo al pulsar el botón Exportar", () => {
    render(<EditorPaquete codigo="eo" nombre="Esperanto" almacen={almacen} pendientesIniciales={["hola"]} />);

    const btnExportar = screen.getByRole("button", { name: /Exportar archivo/i });
    fireEvent.click(btnExportar);

    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it("cierra la edición y vuelve al estado inicial", () => {
    render(<EditorPaquete codigo="eo" nombre="Esperanto" almacen={almacen} pendientesIniciales={["hola"]} />);

    const btnCerrar = screen.getByRole("button", { name: /Cerrar edición/i });
    fireEvent.click(btnCerrar);

    expect(screen.getByText("No hay pendientes")).toBeInTheDocument();
  });
});
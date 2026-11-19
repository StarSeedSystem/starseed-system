/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorPaquete } from "../editor-paquete";
import type { AlmacenPaquetes } from "@/lib/idiomas/paquete/almacen";
import type { PaqueteIdioma } from "@/lib/idiomas/paquete/formato";

function crearAlmacenFalso(): AlmacenPaquetes {
  const paquetes: PaqueteIdioma[] = [];
  const listeners: Set<() => void> = new Set();

  const notificar = () => {
    listeners.forEach((l) => l());
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("starseed:idiomas-paquetes"));
    }
  };

  return {
    listarPaquetes: () => [...paquetes],
    guardarPaquete: (paquete: PaqueteIdioma) => {
      const idx = paquetes.findIndex((p) => p.codigo === paquete.codigo);
      if (idx >= 0) paquetes[idx] = paquete;
      else paquetes.push(paquete);
      notificar();
      return { ok: true as const };
    },
    quitarPaquete: (codigo: string) => {
      const antes = paquetes.length;
      const filtrados = paquetes.filter((p) => p.codigo !== codigo);
      if (filtrados.length !== antes) {
        paquetes.length = 0;
        paquetes.push(...filtrados);
        notificar();
      }
    },
    leerPaquete: (codigo: string) => paquetes.find((p) => p.codigo === codigo) ?? null,
  };
}

function crearPaqueteConPendientes(codigo = "eo", nombre = "Esperanto"): PaqueteIdioma {
  return {
    formato: "starseed-idioma",
    version: 1,
    codigo,
    nombre,
    dir: "ltr",
    autor: { nombre: "Usuario" },
    creado: "2026-01-15T00:00:00.000Z",
    revisado: { estado: "automatico" },
    licencia: "MIT",
    base: "es",
    entradas: { Guardar: "", Cancelar: "" },
    hash: "abc123",
  };
}

function crearPaqueteConSugerencias(codigo = "fr", nombre = "Francés"): PaqueteIdioma {
  return {
    formato: "starseed-idioma",
    version: 1,
    codigo,
    nombre,
    dir: "ltr",
    autor: { nombre: "Usuario" },
    creado: "2026-01-15T00:00:00.000Z",
    revisado: { estado: "automatico" },
    licencia: "MIT",
    base: "es",
    entradas: { "Bonjour": "", "Merci": "Gracias (auto)" },
    hash: "abc123",
  };
}

beforeEach(() => {
  cleanup();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  localStorage.clear();
  // Mock URL.createObjectURL y revokeObjectURL para jsdom
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:mock"),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("EditorPaquete", () => {
  it("muestra cabecera con nombre del idioma y progreso", async () => {
    const almacen = crearAlmacenFalso();
    const paquete = crearPaqueteConPendientes();
    almacen.guardarPaquete(paquete);

    render(<EditorPaquete codigo="eo" almacen={almacen} />);

    await waitFor(() => expect(screen.getByText("Esperanto")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/0 de 2/)).toBeInTheDocument());
  });

  it("lista pendientes con campo de traducción y guarda al salir del campo", async () => {
    const almacen = crearAlmacenFalso();
    const paquete = crearPaqueteConPendientes();
    almacen.guardarPaquete(paquete);

    render(<EditorPaquete codigo="eo" almacen={almacen} />);

    await waitFor(() => expect(screen.getByText("Esperanto")).toBeInTheDocument());

    const inputGuardar = screen.getByLabelText(/traducción de "guardar"/i);
    await act(async () => {
      fireEvent.change(inputGuardar, { target: { value: "Konservi" } });
      fireEvent.blur(inputGuardar);
    });

    await waitFor(() => expect(screen.getByText(/1 de 2/)).toBeInTheDocument());
  });

  it("traducir un pendiente lo mueve a completadas", async () => {
    const almacen = crearAlmacenFalso();
    const paquete = crearPaqueteConPendientes();
    almacen.guardarPaquete(paquete);

    render(<EditorPaquete codigo="eo" almacen={almacen} />);

    await waitFor(() => expect(screen.getByText("Esperanto")).toBeInTheDocument());

    const inputGuardar = screen.getByLabelText(/traducción de "guardar"/i);
    await act(async () => {
      fireEvent.change(inputGuardar, { target: { value: "Konservi" } });
      fireEvent.blur(inputGuardar);
    });

    await waitFor(() => expect(screen.getByText(/Completadas: 1/)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/Pendientes: 1/)).toBeInTheDocument());
  });

  it("muestra 'Sugerencia automática' para traducciones de motor y solo entra si se acepta", async () => {
    const almacen = crearAlmacenFalso();
    const paquete = crearPaqueteConSugerencias();
    almacen.guardarPaquete(paquete);

    render(<EditorPaquete codigo="fr" almacen={almacen} />);

    await waitFor(() => expect(screen.getByText("Francés")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/sugerencia automática/i)).toBeInTheDocument());

    const inputBonjour = screen.getByLabelText(/traducción de "bonjour"/i);
    await act(async () => {
      fireEvent.change(inputBonjour, { target: { value: "Hola" } });
      fireEvent.blur(inputBonjour);
    });

    await waitFor(() => expect(screen.getByText(/Completadas: 1/)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/Pendientes: 1/)).toBeInTheDocument());
  });

  it("botón 'Guardar borrador' invoca guardarPaquete si valida", async () => {
    const almacen = crearAlmacenFalso();
    const paquete = crearPaqueteConPendientes();
    almacen.guardarPaquete(paquete);
    const guardarMock = vi.fn().mockReturnValue({ ok: true });
    const almacenMock = { ...almacen, guardarPaquete: guardarMock };

    render(<EditorPaquete codigo="eo" almacen={almacenMock} />);

    await waitFor(() => expect(screen.getByText("Esperanto")).toBeInTheDocument());

    const botonGuardar = screen.getByRole("button", { name: /guardar borrador/i });
    await act(async () => {
      fireEvent.click(botonGuardar);
    });

    await waitFor(() => expect(guardarMock).toHaveBeenCalled());
  });

  it("guardar un borrador inválido muestra el motivo", async () => {
    const almacen = crearAlmacenFalso();
    const paquete = crearPaqueteConPendientes();
    almacen.guardarPaquete(paquete);
    const guardarMock = vi.fn().mockReturnValue({ ok: false, motivo: "Código BCP-47 inválido" });
    const almacenMock = { ...almacen, guardarPaquete: guardarMock };

    render(<EditorPaquete codigo="eo" almacen={almacenMock} />);

    await waitFor(() => expect(screen.getByText("Esperanto")).toBeInTheDocument());

    const botonGuardar = screen.getByRole("button", { name: /guardar borrador/i });
    await act(async () => {
      fireEvent.click(botonGuardar);
    });

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/código bcp-47 inválido/i)).toBeInTheDocument());
  });

  it("botón 'Exportar archivo' existe y es clicable", async () => {
    const almacen = crearAlmacenFalso();
    const paquete = crearPaqueteConPendientes();
    almacen.guardarPaquete(paquete);

    render(<EditorPaquete codigo="eo" almacen={almacen} />);

    await waitFor(() => expect(screen.getByText("Esperanto")).toBeInTheDocument());

    const botonExportar = screen.getByRole("button", { name: /exportar archivo/i });
    expect(botonExportar).toBeInTheDocument();
    expect(botonExportar).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(botonExportar);
    });

    // Verificar que el botón responde al click (no lanza error)
    expect(botonExportar).toBeInTheDocument();
  });

  it("botón 'Cerrar edición' cierra el editor", async () => {
    const almacen = crearAlmacenFalso();
    const paquete = crearPaqueteConPendientes();
    almacen.guardarPaquete(paquete);
    const onCerrar = vi.fn();

    render(<EditorPaquete codigo="eo" almacen={almacen} onCerrar={onCerrar} />);

    await waitFor(() => expect(screen.getByText("Esperanto")).toBeInTheDocument());

    const botonCerrar = screen.getAllByRole("button", { name: /cerrar edición/i })[1];
    await act(async () => {
      fireEvent.click(botonCerrar);
    });

    expect(onCerrar).toHaveBeenCalled();
  });

  it("elementos son enfocables y accesibles por teclado", async () => {
    const almacen = crearAlmacenFalso();
    const paquete = crearPaqueteConPendientes();
    almacen.guardarPaquete(paquete);

    render(<EditorPaquete codigo="eo" almacen={almacen} />);

    await waitFor(() => expect(screen.getByText("Esperanto")).toBeInTheDocument());

    const inputGuardar = screen.getByLabelText(/traducción de "guardar"/i);
    inputGuardar.focus();
    expect(inputGuardar).toHaveFocus();

    const botonGuardar = screen.getByRole("button", { name: /guardar borrador/i });
    botonGuardar.focus();
    expect(botonGuardar).toHaveFocus();

    const botonExportar = screen.getByRole("button", { name: /exportar archivo/i });
    botonExportar.focus();
    expect(botonExportar).toHaveFocus();

    const botonCerrar = screen.getAllByRole("button", { name: /cerrar edición/i })[1];
    botonCerrar.focus();
    expect(botonCerrar).toHaveFocus();
  });

  it("respeta ancho de 360px en contenedor", async () => {
    const almacen = crearAlmacenFalso();
    const paquete = crearPaqueteConPendientes();
    almacen.guardarPaquete(paquete);

    const { container } = render(<EditorPaquete codigo="eo" almacen={almacen} />);

    await waitFor(() => expect(screen.getByText("Esperanto")).toBeInTheDocument());

    const panel = container.querySelector('[data-testid="editor-paquete"]');
    expect(panel).toHaveClass("max-w-[360px]");
  });
});
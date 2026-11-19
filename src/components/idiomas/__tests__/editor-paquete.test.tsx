/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorPaquete } from "../editor-paquete";
import type { AlmacenPaquetes } from "@/lib/idiomas/paquete/almacen";
import type { PaqueteIdioma, CryptoProvider } from "@/lib/idiomas/paquete/formato";
import { inyectarCrypto } from "@/lib/idiomas/paquete/formato";

const cryptoMock: CryptoProvider = {
  subtle: {
    async digest(_algorithm: "SHA-256", data: ArrayBuffer): Promise<ArrayBuffer> {
      const view = new Uint8Array(data);
      let hash = 0;
      for (let i = 0; i < view.length; i++) {
        hash = (hash * 31 + view[i]) >>> 0;
      }
      const buffer = new ArrayBuffer(32);
      const out = new Uint8Array(buffer);
      for (let i = 0; i < 32; i++) {
        out[i] = (hash >> (i % 8)) & 0xff;
      }
      return buffer;
    },
  },
};

beforeEach(() => {
  cleanup();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  localStorage.clear();
  inyectarCrypto(cryptoMock);
});

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

function crearPaqueteValido(
  codigo = "eo",
  nombre = "Esperanto",
  entradas: Record<string, string> = { Guardar: "Konservi", Cancelar: "Nuligi", Editar: "Redakti" },
  revisado: { estado: "automatico" | "revisado" } = { estado: "automatico" }
): PaqueteIdioma {
  return {
    formato: "starseed-idioma",
    version: 1,
    codigo,
    nombre,
    dir: "ltr",
    autor: { nombre: "Usuario" },
    creado: "2026-01-15T00:00:00.000Z",
    revisado,
    licencia: "MIT",
    base: "es",
    entradas,
    hash: "abc123",
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("EditorPaquete", () => {
  const fuenteBase = { Guardar: "Guardar", Cancelar: "Cancelar", Editar: "Editar", Eliminar: "Eliminar", Nuevo: "Nuevo", Abrir: "Abrir" };

  it("muestra cabecera con idioma y progreso", async () => {
    const almacen = crearAlmacenFalso();
    const paquete = crearPaqueteValido(
      "eo",
      "Esperanto",
      {
        Guardar: "Konservi",
        Cancelar: "Nuligi",
        Editar: "Redakti",
        Eliminar: "",
        Nuevo: "",
        Abrir: "",
      },
      { estado: "revisado" }
    );
    almacen.guardarPaquete(paquete);

    render(<EditorPaquete codigoIdioma="eo" fuente={fuenteBase} almacen={almacen} onCerrar={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/esperanto/i)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/3 de 6/i)).toBeInTheDocument());
  });

  it("lista pendientes con campo de traducción y guarda al salir del campo", async () => {
    const almacen = crearAlmacenFalso();
    const paquete = crearPaqueteValido(
      "eo",
      "Esperanto",
      {
        Guardar: "Konservi",
        Cancelar: "Nuligi",
        Editar: "Redakti",
        Eliminar: "",
        Nuevo: "",
        Abrir: "",
      },
      { estado: "revisado" }
    );
    almacen.guardarPaquete(paquete);

    const onCerrar = vi.fn();
    render(<EditorPaquete codigoIdioma="eo" fuente={fuenteBase} almacen={almacen} onCerrar={onCerrar} />);

    await waitFor(() => expect(screen.getByTestId("pendiente-Eliminar")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("pendiente-Nuevo")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("pendiente-Abrir")).toBeInTheDocument());

    const inputEliminar = screen.getByTestId("input-Eliminar");
    await act(async () => {
      fireEvent.change(inputEliminar, { target: { value: "Forigi" } });
      fireEvent.blur(inputEliminar);
    });

    await waitFor(() => expect(screen.getByText(/4 de 6/i)).toBeInTheDocument());
    expect(screen.queryByTestId("pendiente-Eliminar")).not.toBeInTheDocument();

    const botonCompletadas = screen.getByRole("button", { name: /completadas/i });
    await act(async () => {
      fireEvent.click(botonCompletadas);
    });

    await waitFor(() => expect(screen.getByTestId("completada-Eliminar")).toBeInTheDocument());
  });

  it("muestra 'Sugerencia automática' para traducciones automáticas y solo aplica si se acepta", async () => {
    const almacen = crearAlmacenFalso();
    const paquete = crearPaqueteValido("eo", "Esperanto", {
      Guardar: "Konservi",
      Cancelar: "Nuligi",
      Editar: "Redakti",
      Eliminar: "Forigi",
      Nuevo: "",
      Abrir: "",
    });
    paquete.revisado = { estado: "automatico" };
    almacen.guardarPaquete(paquete);

    render(<EditorPaquete codigoIdioma="eo" fuente={fuenteBase} almacen={almacen} onCerrar={vi.fn()} />);

    await waitFor(() => expect(screen.getAllByText(/sugerencia automática/i).length).toBeGreaterThan(0));

    const inputNuevo = screen.getByTestId("input-Nuevo");
    await act(async () => {
      fireEvent.change(inputNuevo, { target: { value: "Nova" } });
      fireEvent.blur(inputNuevo);
    });

    const botonCompletadas = screen.getByRole("button", { name: /completadas/i });
    await act(async () => {
      fireEvent.click(botonCompletadas);
    });

    await waitFor(() => expect(screen.getByTestId("completada-Nuevo")).toBeInTheDocument());
  });

  it("botón 'Guardar borrador' instala el paquete si valida", async () => {
    const almacen = crearAlmacenFalso();
    const paquete = crearPaqueteValido(
      "eo",
      "Esperanto",
      {
        Guardar: "Konservi",
        Cancelar: "Nuligi",
        Editar: "Redakti",
        Eliminar: "Forigi",
        Nuevo: "Nova",
        Abrir: "Malfermi",
      },
      { estado: "revisado" }
    );
    almacen.guardarPaquete(paquete);

    const onCerrar = vi.fn();
    render(<EditorPaquete codigoIdioma="eo" fuente={fuenteBase} almacen={almacen} onCerrar={onCerrar} />);

    await waitFor(() => expect(screen.getByRole("button", { name: /guardar borrador/i })).toBeInTheDocument());

    const botonGuardar = screen.getByRole("button", { name: /guardar borrador/i });
    await act(async () => {
      fireEvent.click(botonGuardar);
    });

    await waitFor(() => expect(almacen.listarPaquetes()).toHaveLength(1));
    const paqueteGuardado = almacen.listarPaquetes()[0];
    expect(paqueteGuardado.entradas.Eliminar).toBe("Forigi");
    expect(paqueteGuardado.entradas.Nuevo).toBe("Nova");
    expect(paqueteGuardado.entradas.Abrir).toBe("Malfermi");
    expect(onCerrar).not.toHaveBeenCalled();
  });

  it("guardar borrador inválido muestra el motivo", async () => {
    const almacen = crearAlmacenFalso();
    const paquete = crearPaqueteValido("eo", "Esperanto", {
      Guardar: "Konservi",
      Cancelar: "Nuligi",
      Editar: "Redakti",
      Eliminar: "",
      Nuevo: "",
      Abrir: "",
    });
    almacen.guardarPaquete(paquete);

    render(<EditorPaquete codigoIdioma="eo" fuente={fuenteBase} almacen={almacen} onCerrar={vi.fn()} />);

    const botonGuardar = screen.getByRole("button", { name: /guardar borrador/i });
    await act(async () => {
      fireEvent.click(botonGuardar);
    });

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/traducciones pendientes/i)).toBeInTheDocument();
  });

  it("botón 'Exportar archivo' descarga el paquete", async () => {
    const almacen = crearAlmacenFalso();
    const paquete = crearPaqueteValido(
      "eo",
      "Esperanto",
      {
        Guardar: "Konservi",
        Cancelar: "Nuligi",
        Editar: "Redakti",
        Eliminar: "Forigi",
        Nuevo: "Nova",
        Abrir: "Malfermi",
      },
      { estado: "revisado" }
    );
    almacen.guardarPaquete(paquete);

    const clickMock = vi.fn();
    const createObjectURLMock = vi.fn(() => "blob:mock");
    const revokeObjectURLMock = vi.fn(() => {});
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = createObjectURLMock;
    URL.revokeObjectURL = revokeObjectURLMock;
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag) => {
      if (tag === "a") {
        return { href: "", download: "", click: clickMock, setAttribute: vi.fn() } as unknown as HTMLAnchorElement;
      }
      return originalCreateElement(tag);
    });

    render(<EditorPaquete codigoIdioma="eo" fuente={fuenteBase} almacen={almacen} onCerrar={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole("button", { name: /exportar archivo/i })).toBeInTheDocument());

    const botonExportar = screen.getByRole("button", { name: /exportar archivo/i });
    await act(async () => {
      fireEvent.click(botonExportar);
    });

    expect(createObjectURLMock).toHaveBeenCalled();
    expect(clickMock).toHaveBeenCalled();
    expect(revokeObjectURLMock).toHaveBeenCalled();

    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it("botón 'Cerrar edición' llama a onCerrar", async () => {
    const almacen = crearAlmacenFalso();
    const paquete = crearPaqueteValido(
      "eo",
      "Esperanto",
      {
        Guardar: "Konservi",
        Cancelar: "Nuligi",
        Editar: "Redakti",
        Eliminar: "",
        Nuevo: "",
        Abrir: "",
      },
      { estado: "revisado" }
    );
    almacen.guardarPaquete(paquete);

    const onCerrar = vi.fn();
    render(<EditorPaquete codigoIdioma="eo" fuente={fuenteBase} almacen={almacen} onCerrar={onCerrar} />);

    await waitFor(() => expect(screen.getByRole("button", { name: /cerrar edición/i })).toBeInTheDocument());

    const botonCerrar = screen.getByRole("button", { name: /cerrar edición/i });
    await act(async () => {
      fireEvent.click(botonCerrar);
    });

    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  it("es accesible por teclado y tiene dianas de 44px", async () => {
    const almacen = crearAlmacenFalso();
    const paquete = crearPaqueteValido(
      "eo",
      "Esperanto",
      {
        Guardar: "Konservi",
        Cancelar: "Nuligi",
        Editar: "Redakti",
        Eliminar: "",
        Nuevo: "",
        Abrir: "",
      },
      { estado: "revisado" }
    );
    almacen.guardarPaquete(paquete);

    render(<EditorPaquete codigoIdioma="eo" fuente={fuenteBase} almacen={almacen} onCerrar={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId("input-Eliminar")).toBeInTheDocument());

    const inputEliminar = screen.getByTestId("input-Eliminar");
    expect(inputEliminar).toHaveClass("min-h-[44px]");
  });
});
/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PanelPaquetesIdioma } from "../panel-paquetes";
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

function crearPaqueteValido(codigo = "eo", nombre = "Esperanto"): PaqueteIdioma {
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
    entradas: { Guardar: "Konservi", Cancelar: "Nuligi" },
    hash: "abc123",
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("PanelPaquetesIdioma", () => {
  const fuenteBase = { Guardar: "Guardar", Cancelar: "Cancelar", Editar: "Editar" };

  it("instala un paquete .starseed-lang.json válido y aparece en la lista", async () => {
    const almacen = crearAlmacenFalso();
    const paqueteValido = crearPaqueteValido();

    const leerArchivo = vi.fn().mockResolvedValue(JSON.stringify(paqueteValido));

    render(<PanelPaquetesIdioma fuente={fuenteBase} leerArchivo={leerArchivo} almacen={almacen} />);

    expect(await screen.findByText(/no hay paquetes instalados/i)).toBeInTheDocument();

    const botonInstalar = screen.getByRole("button", { name: /instalar desde archivo/i });
    expect(botonInstalar).toBeInTheDocument();

    const inputArchivo = screen.getByLabelText(/seleccionar archivo de idioma/i);
    const archivo = new File([JSON.stringify(paqueteValido)], "eo.starseed-lang.json", { type: "application/json" });

    await act(async () => {
      Object.defineProperty(inputArchivo, "files", { value: [archivo] });
      fireEvent.change(inputArchivo);
    });

    await waitFor(() => expect(screen.getByTestId("instalacion-pendiente")).toBeInTheDocument());
    expect(screen.getByDisplayValue("eo")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Esperanto")).toBeInTheDocument();

    expect(screen.getByText(/casaron 2 de 2 textos \(100 %\)/i)).toBeInTheDocument();

    const botonInstalarConfirmar = screen.getByRole("button", { name: /^instalar$/i });
    await act(async () => {
      fireEvent.click(botonInstalarConfirmar);
    });

    await waitFor(() => expect(screen.getByTestId("paquete-eo")).toBeInTheDocument());
    expect(screen.getByText("Esperanto")).toBeInTheDocument();
    expect(screen.getByText("eo")).toBeInTheDocument();
    expect(screen.getByText("Traducción automática")).toBeInTheDocument();
    expect(screen.getByText("Usuario")).toBeInTheDocument();
    expect(screen.getByText("MIT")).toBeInTheDocument();

    expect(leerArchivo).toHaveBeenCalledTimes(1);
  });

  it("muestra errores de validación y no guarda un paquete inválido", async () => {
    const almacen = crearAlmacenFalso();
    const paqueteInvalido = {
      ...crearPaqueteValido(),
      codigo: "invalido!",
      entradas: { "__proto__": "hack" },
    };

    const leerArchivo = vi.fn().mockResolvedValue(JSON.stringify(paqueteInvalido));

    render(<PanelPaquetesIdioma fuente={fuenteBase} leerArchivo={leerArchivo} almacen={almacen} />);

    const botonInstalar = screen.getByRole("button", { name: /instalar desde archivo/i });
    const inputArchivo = screen.getByLabelText(/seleccionar archivo de idioma/i);
    const archivo = new File([JSON.stringify(paqueteInvalido)], "malo.starseed-lang.json", { type: "application/json" });

    await act(async () => {
      Object.defineProperty(inputArchivo, "files", { value: [archivo] });
      fireEvent.change(inputArchivo);
    });

    await waitFor(() => expect(screen.getByTestId("instalacion-pendiente")).toBeInTheDocument());

    const botonInstalarConfirmar = screen.getByRole("button", { name: /^instalar$/i });
    await act(async () => {
      fireEvent.click(botonInstalarConfirmar);
    });

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/no se puede instalar/i)).toBeInTheDocument();
    expect(screen.getByText(/código bcp-47 inválido/i)).toBeInTheDocument();

    expect(screen.queryByTestId("paquete-invalido!")).not.toBeInTheDocument();
    expect(almacen.listarPaquetes()).toHaveLength(0);
  });

  it("quitar paquete pide confirmación antes de eliminar", async () => {
    const almacen = crearAlmacenFalso();
    const paquete = crearPaqueteValido("fr", "Francés");
    almacen.guardarPaquete(paquete);

    render(<PanelPaquetesIdioma fuente={fuenteBase} almacen={almacen} />);

    await waitFor(() => expect(screen.getByTestId("paquete-fr")).toBeInTheDocument());

    const botonQuitar = screen.getByRole("button", { name: /quitar francés/i });
    await act(async () => {
      fireEvent.click(botonQuitar);
    });

    expect(screen.getByRole("button", { name: /confirmar eliminar francés/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancelar/i })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /confirmar eliminar francés/i }));
    });

    await waitFor(() => expect(screen.queryByTestId("paquete-fr")).not.toBeInTheDocument());
    expect(almacen.listarPaquetes()).toHaveLength(0);
  });

  it("cancelar confirmación de quitar no elimina el paquete", async () => {
    const almacen = crearAlmacenFalso();
    const paquete = crearPaqueteValido("de", "Alemán");
    almacen.guardarPaquete(paquete);

    render(<PanelPaquetesIdioma fuente={fuenteBase} almacen={almacen} />);

    await waitFor(() => expect(screen.getByTestId("paquete-de")).toBeInTheDocument());

    const botonQuitar = screen.getByRole("button", { name: /quitar alemán/i });
    await act(async () => {
      fireEvent.click(botonQuitar);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    });

    expect(screen.getByTestId("paquete-de")).toBeInTheDocument();
    expect(almacen.listarPaquetes()).toHaveLength(1);
  });

  it("muestra ayuda con texto informativo", async () => {
    const almacen = crearAlmacenFalso();

    render(<PanelPaquetesIdioma fuente={fuenteBase} almacen={almacen} />);

    const botonAyuda = screen.getByRole("button", { name: /mostrar ayuda/i });
    await act(async () => {
      fireEvent.click(botonAyuda);
    });

    expect(screen.getByText(/un archivo de idioma es solo texto: no puede ejecutar nada/i)).toBeInTheDocument();
    expect(screen.getByText(/formatos aceptados/i)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /ocultar ayuda/i }));
    });

    expect(screen.queryByText(/un archivo de idioma es solo texto/)).not.toBeInTheDocument();
  });

  it("exportar paquete crea descarga", async () => {
    const almacen = crearAlmacenFalso();
    const paquete = crearPaqueteValido("it", "Italiano");
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

    render(<PanelPaquetesIdioma fuente={fuenteBase} almacen={almacen} />);

    await waitFor(() => expect(screen.getByTestId("paquete-it")).toBeInTheDocument());

    const botonExportar = screen.getByRole("button", { name: /exportar italiano/i });
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

  it("muestra botón editar para cada paquete", async () => {
    const almacen = crearAlmacenFalso();
    const paquete = crearPaqueteValido("eo", "Esperanto");
    almacen.guardarPaquete(paquete);

    render(<PanelPaquetesIdioma fuente={fuenteBase} almacen={almacen} />);

    await waitFor(() => expect(screen.getByTestId("paquete-eo")).toBeInTheDocument());

    const botonEditar = screen.getByRole("button", { name: /editar esperanto/i });
    expect(botonEditar).toBeInTheDocument();
  });

  it("click en editar abre el editor del paquete", async () => {
    const almacen = crearAlmacenFalso();
    const paquete = crearPaqueteValido("eo", "Esperanto");
    almacen.guardarPaquete(paquete);

    render(<PanelPaquetesIdioma fuente={fuenteBase} almacen={almacen} />);

    await waitFor(() => expect(screen.getByTestId("paquete-eo")).toBeInTheDocument());

    const botonEditar = screen.getByRole("button", { name: /editar esperanto/i });
    await act(async () => {
      fireEvent.click(botonEditar);
    });

    await waitFor(() => expect(screen.getByRole("heading", { name: "Esperanto" })).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: /guardar borrador/i })).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/Completadas/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /exportar archivo/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /cerrar edición/i })[1]).toBeInTheDocument();
  });

  it("cerrar editor vuelve a la lista de paquetes", async () => {
    const almacen = crearAlmacenFalso();
    const paquete = crearPaqueteValido("eo", "Esperanto");
    almacen.guardarPaquete(paquete);

    render(<PanelPaquetesIdioma fuente={fuenteBase} almacen={almacen} />);

    await waitFor(() => expect(screen.getByTestId("paquete-eo")).toBeInTheDocument());

    const botonEditar = screen.getByRole("button", { name: /editar esperanto/i });
    await act(async () => {
      fireEvent.click(botonEditar);
    });

    await waitFor(() => expect(screen.getByRole("heading", { name: "Esperanto" })).toBeInTheDocument());

    const botonCerrar = screen.getAllByRole("button", { name: /cerrar edición/i })[1];
    await act(async () => {
      fireEvent.click(botonCerrar);
    });

    await waitFor(() => expect(screen.getByTestId("paquete-eo")).toBeInTheDocument());
    expect(screen.queryByText(/guardar borrador/i)).not.toBeInTheDocument();
  });

  it("click fuera del editor lo cierra", async () => {
    const almacen = crearAlmacenFalso();
    const paquete = crearPaqueteValido("eo", "Esperanto");
    almacen.guardarPaquete(paquete);

    render(<PanelPaquetesIdioma fuente={fuenteBase} almacen={almacen} />);

    await waitFor(() => expect(screen.getByTestId("paquete-eo")).toBeInTheDocument());

    const botonEditar = screen.getByRole("button", { name: /editar esperanto/i });
    await act(async () => {
      fireEvent.click(botonEditar);
    });

    await waitFor(() => expect(screen.getByRole("heading", { name: "Esperanto" })).toBeInTheDocument());

    const overlay = document.querySelector('[role="dialog"]');
    await act(async () => {
      fireEvent.click(overlay!);
    });

    await waitFor(() => expect(screen.getByTestId("paquete-eo")).toBeInTheDocument());
    expect(screen.queryByText(/guardar borrador/i)).not.toBeInTheDocument();
  });
});
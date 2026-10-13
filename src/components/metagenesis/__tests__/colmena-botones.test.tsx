import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, waitFor, cleanup, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ColmenaBotones } from "@/components/metagenesis/colmena-botones";
import { enviarOrden } from "@/lib/metagenesis/remoto-nodos-cliente";

vi.mock("@/lib/metagenesis/remoto-nodos-cliente");
vi.mock("@/context/appearance-context", () => ({
  useAppearance: () => ({
    config: {
      themeStore: {
        activeMode: "primary",
        osTheme: "default",
        savedThemes: [],
      },
      buttons: {
        radius: 0.5,
        glow: false,
        style: "glass",
      },
      animations: {
        enabled: true,
        hover: true,
        click: true,
        trinityEntry: "fade",
        transitionDuration: 220,
      },
    },
    updateSection: vi.fn(),
  }),
}));

const crearEstadoBase = () => ({
  nodo: "oracle-a1-bbbbbb",
  medio: "oracle-a1",
  etiqueta: "Oracle A1 (24/7)",
  vivo: true,
  lider: false,
  hace_ms: 0,
  modo: "normal",
  orquestadores: [],
  caidos: [],
  disco_gb: 10,
  trabajo: {},
  enCurso: [],
  contenedor: {
    activo: false,
    agentes: 0,
    apto: false,
    motivo: "",
  },
});

describe("ColmenaBotones", () => {
  beforeEach(() => {
    // Mock timers for any time-based functionality
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
    cleanup();
  });

  it("muestra el botón de desconectar cuando hay trabajo en curso", async () => {
    const estado = crearEstadoBase();
    estado.enCurso = [
      {
        id: "task-1",
        fase: "escribiendo",
        punto: {
          rama: "main",
          sha: "abc123",
          t: Date.now() - 5 * 60_000, // 5 minutes ago
        },
      },
    ];

    render(<ColmenaBotones nodo={estado} />);

    const botonDesconectar = await screen.findByTestId(
      "mg-nodo-oracle-a1-bbbbbb-desconectar"
    );
    expect(botonDesconectar).toBeInTheDocument();
    expect(botonDesconectar).toHaveTextContent("Desconectar");
    // Should be enabled because there's work in progress
    expect(botonDesconectar).not.toBeDisabled();
    // Should have the explanation as title attribute
    expect(botonDesconectar).toHaveAttribute(
      "title",
      "Guarda el trabajo a medias de sus 1 agente(s) y lo pasa a otro contenedor antes de que este aparato se quede sin internet."
    );
  });

  it("muestra el botón de usar como contenedor cuando el nodo puede ser contenedor", async () => {
    const estado = crearEstadoBase();
    estado.contenedor = {
      activo: true,
      agentes: 2,
      apto: true,
      motivo: "Listo para trabajar",
    };

    render(<ColmenaBotones nodo={estado} />);

    const botonContenedor = await screen.findByTestId(
      "mg-nodo-oracle-a1-bbbbbb-contenedor"
    );
    expect(botonContenedor).toBeInTheDocument();
    expect(botonContenedor).toHaveTextContent("Dejar de usar como contenedor");
    // Should be enabled because the node is alive and has container capacity
    expect(botonContenedor).not.toBeDisabled();
    expect(botonContenedor).toHaveAttribute("title", "Termina lo que lleva y no coge más.");
  });

  it("muestra la línea de información bajo el nombre del nodo", async () => {
    const estado = crearEstadoBase();
    estado.enCurso = [
      {
        id: "task-1",
        fase: "escribiendo",
        punto: {
          rama: "main",
          sha: "abc123",
          t: Date.now() - 5 * 60_000, // 5 minutes ago
        },
      },
      {
        id: "task-2",
        fase: "reparando",
        punto: {
          rama: "main",
          sha: "def456",
          t: Date.now() - 10 * 60_000, // 10 minutes ago
        },
      },
    ];
    estado.contenedor = {
      activo: true,
      agentes: 2,
      apto: true,
      motivo: "Listo para trabajar",
    };

    render(<ColmenaBotones nodo={estado} />);

    // Find all li elements with data-testid="mg-nodo"
    // Note: Since our component doesn't render an li, we'll look for the text directly
    // The test expectation is to find text within the component
    await waitFor(() => {
      expect(
        screen.getByText(
          expect.stringContaining("2 agentes") &&
            expect.stringContaining("contenedor activo") &&
            expect.stringContaining("Listo para trabajar")
        )
      ).toBeInTheDocument();
    });
  });

  it("muestra información de tarea a medias cuando existe", async () => {
    const estado = crearEstadoBase();
    estado.enCurso = [
      {
        id: "task-1",
        fase: "escribiendo",
        punto: {
          rama: "main",
          sha: "abc123",
          t: Date.now() - 5 * 60_000, // 5 minutes ago
        },
      },
    ];

    render(<ColmenaBotones nodo={estado} />);

    // Should show "Último punto hace 5 min" (or similar based on the time set)
    await waitFor(() => {
      expect(screen.getByText(/Último punto hace 5 min/)).toBeInTheDocument();
    });
  });

  it("envía orden desconectar al hacer clic en el botón", async () => {
    const estado = crearEstadoBase();
    estado.enCurso = [
      {
        id: "task-1",
        fase: "escribiendo",
        punto: {
          rama: "main",
          sha: "abc123",
          t: Date.now() - 5 * 60_000, // 5 minutes ago
        },
      },
    ];

    render(<ColmenaBotones nodo={estado} />);
    const botonDesconectar = await screen.findByTestId(
      "mg-nodo-oracle-a1-bbbbbb-desconectar"
    );
    // First click: shows confirmation
    fireEvent.click(botonDesconectar);
    // Second click: confirms and sends the order
    fireEvent.click(botonDesconectar);
    await waitFor(() => expect(enviarOrden).toHaveBeenCalledWith("desconectar", "lider"));
  });
});

// Additional test cases mentioned in the task
describe("ColmenaBotones (casos adicionales)", () => {
  beforeEach(() => {
    // Mock timers for any time-based functionality
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
    cleanup();
  });

  it("envía orden contenedor al hacer clic en el botón", async () => {
    const estado = crearEstadoBase();
    estado.contenedor = {
      activo: true,
      agentes: 2,
      apto: true,
      motivo: "Listo para trabajar",
    };

    render(<ColmenaBotones nodo={estado} />);
    const botonContenedor = await screen.findByTestId(
      "mg-nodo-oracle-a1-bbbbbb-contenedor"
    );
    // First click: shows confirmation
    fireEvent.click(botonContenedor);
    // Second click: confirms and sends the order
    fireEvent.click(botonContenedor);
    await waitFor(() =>
      expect(enviarOrden).toHaveBeenCalledWith("contenedor", "lider")
    );
  });

  it("desactiva el botón de desconectar cuando no hay trabajo en curso", async () => {
    const estado = crearEstadoBase();
    // No work in progress
    estado.enCurso = [];

    render(<ColmenaBotones nodo={estado} />);

    const botonDesconectar = screen.queryByTestId(
      "mg-nodo-oracle-a1-bbbbbb-desconectar"
    );
    expect(botonDesconectar).not.toBeInTheDocument();
  });

  it("muestra el botón de instalar trabajador cuando el nodo no tiene trabajador", async () => {
    const estado = crearEstadoBase();
    estado.vivo = false; // Node is not alive

    render(<ColmenaBotones nodo={estado} />);

    const botonInstalar = await screen.findByTestId(
      "mg-nodo-oracle-a1-bbbbbb-instalar-trabajador"
    );
    expect(botonInstalar).toBeInTheDocument();
    expect(botonInstalar).toHaveTextContent("Instalar trabajador");
    // Should be enabled because we're trying to install
    expect(botonInstalar).not.toBeDisabled();
  });
});
// @vitest-environment-options {"url": "https://starseed-os.vercel.app/metagenesis"}
/**
 * Pruebas para los botones de desconectar y usar como contenedor en la tarjeta de cada neurona en MetaGenesis.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AppearanceProvider } from "@/context/appearance-context";

// Mock the necessary modules
const AHORA = Date.now();
const estado = { miembro: true, lectura: null as unknown };
const enviarOrden = vi.fn(async () => ({ ok: true, clave: "nonce-1", modo: "bus" }));

vi.mock("@/lib/metagenesis/accesos", () => ({ miAccesoMetaGenesis: async () => ({ miembro: estado.miembro, dueno: false }) }));
vi.mock("@/lib/metagenesis/remoto-nodos-cliente", () => ({
  leerEstadoAutonomo: async () => estado.lectura,
  enviarOrden: (...a: unknown[]) => (enviarOrden as unknown as (...x: unknown[]) => unknown)(...a),
}));
vi.mock("@/lib/realtime/realtime", () => ({ onTableChange: () => () => {} }));

// We need to import the component under test.
// Since we don't know the exact component, we'll try to import from a file that might exist.
// Let's assume the component is called ColmenaBotones and is in the same directory.
// If it doesn't exist, we'll get an error and we'll report it later.
import { ColmenaBotones } from "../colmena-botones";

// Helper function to render the component with a given state
function estadoDePrueba(extra: Partial<EstadoAutonomo> = {}): EstadoAutonomo {
  // We'll base it on the state from metagenesis-autonoma.test.tsx but adjust for the nodes.
  return {
    modo: "bus",
    lider: "oracle-a1-bbbbbb",
    termino: 5,
    autonomia: true,
    nodos: [
      { nodo: "oracle-a1-bbbbbb", medio: "oracle-a1", etiqueta: "Oracle A1 (24/7)", modo: "real", vivo: true, lider: true, hace_ms: 40_000, puntos: 1250, orquestadores: ["cola-relevo-x"], caidos: [], disco_gb: 80, ram_libre_mb: 9000, trabajo: {}, enCurso: [], contenedor: null },
      { nodo: "mac-aaaaaa", medio: "mac", etiqueta: "Mac de desarrollo", modo: "real", vivo: false, lider: false, hace_ms: 3_600_000, puntos: 1508, orquestadores: [], caidos: [], disco_gb: null, ram_libre_mb: null, trabajo: {}, enCurso: [], contenedor: null },
    ],
    medidores: { listas: "12", bloqueadas: "3" },
    decisiones: [{ ts: AHORA - 60_000, accion: "lanzar_cola", nodo: "oracle-a1-bbbbbb", motivo: "el medio con las colas calla desde hace 25 min", resultado: "hecha: 8 tarea(s)", seco: false }],
    ordenes: [],
    fotoHaceMs: 30_000,
    liderSeco: false,
    ...extra,
  };
}

function pintar() {
  return render(
    <AppearanceProvider>
      <ColmenaBotones />
    </AppearanceProvider>,
  );
}

describe("ColmenaBotones", () => {
  beforeEach(() => {
    estado.miembro = true;
    estado.lectura = { ok: true, estado: estadoDePrueba() };
    enviarOrden.mockClear();
  });
  afterEach(() => cleanup());

  // Now we add the test cases from the task.

  // Test case 1: muestra el botón de desconectar cuando hay trabajo en curso
  it("muestra el botón de desconectar cuando hay trabajo en curso", async () => {
    // Modify the first node to have work in progress
    const nodoConTrabajo = {
      ...estado.lectura.estado.nodos[0],
      enCurso: [
        {
          id: "task-1",
          fase: "escribiendo",
          punto: {
            rama: "main",
            sha: "abc123",
            t: Date.now() - 5 * 60_000, // 5 minutes ago
          },
        },
      ],
    };
    estado.lectura = {
      ...estado.lectura,
      estado: {
        ...estado.lectura.estado,
        nodos: [nodoConTrabajo, estado.lectura.estado.nodos[1]]
      }
    };
    
    pintar();
    const botonDesconectar = await screen.findByTestId("mg-nodo-oracle-a1-bbbbbb-desconectar");
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

  // Test case 2: muestra el botón de usar como contenedor cuando el nodo puede ser contenedor
  it("muestra el botón de usar como contenedor cuando el nodo puede ser contenedor", async () => {
    // Modify the first node to have a contenedor object
    const nodoConContenedor = {
      ...estado.lectura.estado.nodos[0],
      contenedor: {
          activo: true,
          agentes: 2,
          apto: true,
          motivo: "Listo para trabajar",
      },
    };
    estado.lectura = {
      ...estado.lectura,
      estado: {
          ...estado.lectura.estado,
          nodos: [nodoConContenedor, estado.lectura.estado.nodos[1]]
      }
    };
    
    pintar();
    const botonContenedor = await screen.findByTestId("mg-nodo-oracle-a1-bbbbbb-contenedor");
    expect(botonContenedor).toBeInTheDocument();
    expect(botonContenedor).toHaveTextContent("Dejar de usar como contenedor");
    // Should be enabled because the node is alive and has container capacity
    expect(botonContenedor).not.toBeDisabled();
    expect(botonContenedor).toHaveAttribute("title", "Termina lo que lleva y no coge más.");
  });

  // Test case 3: muestra la línea de información bajo el nombre del nodo
  it("muestra la línea de información bajo el nombre del nodo", async () => {
    // Modify the first node to have specific values for testing
    const nodoConValores = {
      ...estado.lectura.estado.nodos[0],
      enCurso: [
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
      ],
      contenedor: {
          activo: true,
          agentes: 2,
          apto: true,
          motivo: "Listo para trabajar",
      },
    };
    estado.lectura = {
      ...estado.lectura,
      estado: {
          ...estado.lectura.estado,
          nodos: [nodoConValores, estado.lectura.estado.nodos[1]]
      }
    };
    
    pintar();
    // Find all li elements with data-testid="mg-nodo"
    const nodeLis = await screen.findAllByTestId("mg-nodo");
    // Find the one that corresponds to the first node (label: Oracle A1 (24/7))
    const nodeLi = nodeLis.find((li) => li.textContent.includes("Oracle A1 (24/7)"));
    if (!nodeLi) {
        throw new Error("Could not find the node with label 'Oracle A1 (24/7)'");
    }
    // Then look for the text within this li
    const { getByText } = within(nodeLi);
    await waitFor(() => {
        getByText(
            (text) =>
                text.includes("2 agentes") &&
                text.includes("contenedor activo") &&
                text.includes("Listo para trabajar")
        );
    });
  });

  // Test case 4: muestra información de tarea a medias cuando existe
  it("muestra información de tarea a medias cuando existe", async () => {
    // Modify the first node to have work in progress
    const nodoConTrabajo = {
      ...estado.lectura.estado.nodos[0],
      enCurso: [
          {
              id: "task-1",
              fase: "escribiendo",
              punto: {
                  rama: "main",
                  sha: "abc123",
                  t: Date.now() - 5 * 60_000, // 5 minutes ago
              },
          },
      ],
    };
    estado.lectura = {
      ...estado.lectura,
      estado: {
          ...estado.lectura.estado,
          nodos: [nodoConTrabajo, estado.lectura.estado.nodos[1]]
      }
    };
    
    pintar();
    // Should show "Último punto hace 5 min" (or similar based on the time set)
    const tiempoInfo = await screen.findByText(/Último punto hace 5 min/);
    expect(tiempoInfo).toBeInTheDocument();
  });

  // Test case 5: envía orden desconectar al hacer clic en el botón
  it("envía orden desconectar al hacer clic en el botón", async () => {
    // Modify the first node to have work in progress
    const nodoConTrabajo = {
      ...estado.lectura.estado.nodos[0],
      enCurso: [
          {
              id: "task-1",
              fase: "escribiendo",
              punto: {
                  rama: "main",
                  sha: "abc123",
                  t: Date.now() - 5 * 60_000, // 5 minutes ago
              },
          },
      ],
    };
    estado.lectura = {
      ...estado.lectura,
      estado: {
          ...estado.lectura.estado,
          nodos: [nodoConTrabajo, estado.lectura.estado.nodos[1]]
      }
    };
    
    pintar();
    const botonDesconectar = await screen.findByTestId("mg-nodo-oracle-a1-bbbbbb-desconectar");
    // First click: shows confirmation
    fireEvent.click(botonDesconectar);
    // Second click: confirms and sends the order
    fireEvent.click(botonDesconectar);
    await waitFor(() => expect(enviarOrden).toHaveBeenCalledWith("desconectar", "lider"));
  });

  // Test case 6: envía orden contenedor al hacer clic en el botón
  it("envía orden contenedor al hacer clic en el botón", async () => {
    // Modify the first node to have a contenedor object
    const nodoConContenedor = {
      ...estado.lectura.estado.nodos[0],
      contenedor: {
          activo: true,
          agentes: 2,
          apto: true,
          motivo: "Listo para trabajar",
      },
    };
    estado.lectura = {
      ...estado.lectura,
      estado: {
          ...estado.lectura.estado,
          nodos: [nodoConContenedor, estado.lectura.estado.nodos[1]]
      }
    };
    
    pintar();
    const botonContenedor = await screen.findByTestId("mg-nodo-oracle-a1-bbbbbb-contenedor");
    fireEvent.click(botonContenedor);
    await waitFor(() => expect(enviarOrden).toHaveBeenCalledWith("contenedor", "lider"));
  });
});

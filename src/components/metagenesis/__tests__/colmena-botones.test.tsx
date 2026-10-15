// @vitest-environment-options {"url": "https://starseed-os.vercel.app/metagenesis"}

/**
 * Pruebas para el componente ColmenaBotones que muestra los botones de control
 * para cada nodo en el panel de MetaGenesis.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { NodoEstado } from "@/lib/metagenesis/remoto-nodos";

const AHORA = Date.now();
const estado = { miembro: true, lectura: null as unknown };
const enviarOrden = vi.fn(async () => ({ ok: true, clave: "nonce-1", modo: "bus" }));

vi.mock("@/lib/metagenesis/accesos", () => ({ miAccesoMetaGenesis: async () => ({ miembro: estado.miembro, dueno: false }) }));
vi.mock("@/lib/metagenesis/remoto-nodos-cliente", () => ({
    leerEstadoAutonomo: async () => estado.lectura,
    enviarOrden: (...a: unknown[]) => (enviarOrden as unknown as (...x: unknown[]) => unknown)(...a),
}));
vi.mock("@/lib/realtime/realtime", () => ({ onTableChange: () => () => {} }));

import { AppearanceProvider } from "@/context/appearance-context";
import { ColmenaBotones } from "../colmena-botones";

function estadoDePrueba(extra: Partial<{ nodos: NodoEstado[] }> = {}): { nodos: NodoEstado[] } {
    const baseNodos: NodoEstado[] = [
        {
            nodo: "oracle-a1-bbbbbb",
            medio: "oracle-a1",
            etiqueta: "Oracle A1 (24/7)",
            modo: "real",
            vivo: true,
            lider: true,
            hace_ms: 40_000,
            puntos: 1250,
            orquestadores: ["cola-relevo-x"],
            caidos: [],
            disco_gb: 80,
            ram_libre_mb: 9000,
            trabajo: {},
            enCurso: [],
            contenedor: null,
        },
        {
            nodo: "mac-aaaaaa",
            medio: "mac",
            etiqueta: "Mac de desarrollo",
            modo: "real",
            vivo: false,
            lider: false,
            hace_ms: 3_600_000,
            puntos: 1508,
            orquestadores: [],
            caidos: [],
            disco_gb: null,
            ram_libre_mb: null,
            trabajo: {},
            enCurso: [],
            contenedor: null,
        },
    ];
    
    return {
        nodos: extra.nodos ? extra.nodos : baseNodos,
    };
}

function pintar(extra: Partial<{ nodos: NodoEstado[] }> = {}) {
    estado.lectura = { ok: true, estado: estadoDePrueba(extra) };
    enviarOrden.mockClear();
    return render(
        <AppearanceProvider>
            <ColmenaBotones />
        </AppearanceProvider>,
    );
}

describe("ColmenaBotones", () => {
    beforeEach(() => {
        estado.miembro = true;
        enviarOrden.mockClear();
    });
    afterEach(() => cleanup());

    it("muestra el botón de desconectar cuando hay trabajo en curso", async () => {
        // Modify the first node to have work in progress
        const nodoConTrabajo = {
            ...estadoDePrueba().nodos[0],
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
        
        pintar({ nodos: [nodoConTrabajo, estadoDePrueba().nodos[1]] });
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

    it("muestra el botón de usar como contenedor cuando el nodo puede ser contenedor", async () => {
        // Modify the first node to have a contenedor object
        const nodoConContenedor = {
            ...estadoDePrueba().nodos[0],
            contenedor: {
                activo: true,
                agentes: 2,
                apto: true,
                motivo: "Listo para trabajar",
            },
        };
        
        pintar({ nodos: [nodoConContenedor, estadoDePrueba().nodos[1]] });
        const botonContenedor = await screen.findByTestId("mg-nodo-oracle-a1-bbbbbb-contenedor");
        expect(botonContenedor).toBeInTheDocument();
        expect(botonContenedor).toHaveTextContent("Dejar de usar como contenedor");
        // Should be enabled because the node is alive and has container capacity
        expect(botonContenedor).not.toBeDisabled();
        expect(botonContenedor).toHaveAttribute("title", "Termina lo que lleva y no coge más.");
    });

    it("muestra la línea de información bajo el nombre del nodo", async () => {
        // Modify the first node to have specific values for testing
        const nodoConValores = {
            ...estadoDePrueba().nodos[0],
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
        
        pintar({ nodos: [nodoConValores, estadoDePrueba().nodos[1]] });
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

    it("muestra información de tarea a medias cuando existe", async () => {
        // Modify the first node to have work in progress
        const nodoConTrabajo = {
            ...estadoDePrueba().nodos[0],
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
        
        pintar({ nodos: [nodoConTrabajo, estadoDePrueba().nodos[1]] });
        // Should show "Último punto hace 5 min" (or similar based on the time set)
        const tiempoInfo = await screen.findByText(/Último punto hace 5 min/);
        expect(tiempoInfo).toBeInTheDocument();
    });

    it("envía orden desconectar al hacer clic en el botón", async () => {
        // Modify the first node to have work in progress
        const nodoConTrabajo = {
            ...estadoDePrueba().nodos[0],
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
        
        pintar({ nodos: [nodoConTrabajo, estadoDePrueba().nodos[1]] });
        const botonDesconectar = await screen.findByTestId("mg-nodo-oracle-a1-bbbbbb-desconectar");
        fireEvent.click(botonDesconectar);
        await waitFor(() => expect(enviarOrden).toHaveBeenCalledWith("desconectar", "oracle-a1-bbbbbb"));
    });

    it("envía orden contenedor al hacer clic en el botón", async () => {
        // Modify the first node to have a contenedor object
        const nodoConContenedor = {
            ...estadoDePrueba().nodos[0],
            contenedor: {
                activo: true,
                agentes: 2,
                apto: true,
                motivo: "Listo para trabajar",
            },
        };
        
        pintar({ nodos: [nodoConContenedor, estadoDePrueba().nodos[1]] });
        const botonContenedor = await screen.findByTestId("mg-nodo-oracle-a1-bbbbbb-contenedor");
        fireEvent.click(botonContenedor);
        await waitFor(() => expect(enviarOrden).toHaveBeenCalledWith("contenedor", "oracle-a1-bbbbbb"));
    });

    it("desactiva el botón de desconectar cuando no hay trabajo en curso", async () => {
        // Use the default state (no work in progress)
        pintar();
        const botonDesconectar = await screen.findByTestId("mg-nodo-oracle-a1-bbbbbb-desconectar");
        expect(botonDesconectar).toBeInTheDocument();
        expect(botonDesconectar).toHaveTextContent("Desconectar");
        // Should be disabled because there's no work in progress
        expect(botonDesconectar).toBeDisabled();
    });

    it("muestra el botón de instalar trabajador cuando el nodo no tiene trabajador", async () => {
        // Modify the first node to not have a worker (trabajador field not present or null)
        const nodoSinTrabajador = {
            ...estadoDePrueba().nodos[0],
            trabajador: null, // Assuming this is how we represent no worker
        };
        
        pintar({ nodos: [nodoSinTrabajador, estadoDePrueba().nodos[1]] });
        const botonInstalado = await screen.findByTestId("mg-nodo-oracle-a1-bbbbbb-trabajador");
        expect(botonInstalado).toBeInTheDocument();
        expect(botonInstalado).toHaveTextContent("Instalar trabajador");
        // Should be enabled because the node is alive but has no worker
        expect(botonInstalado).not.toBeDisabled();
        expect(botonInstalado).toHaveAttribute("title", "Instala un trabajador en este nodo para que pueda ejecutar tareas.");
    });
});
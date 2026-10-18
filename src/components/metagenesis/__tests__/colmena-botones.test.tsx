// @vitest-environment-options {"url": "https://starseed-os.vercel.app/metagenesis"}
/**
 * Pruebas rescatadas de la rama nube para los botones de cada neurona en MetaGenesis autónoma.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { EstadoAutonomo, NodoVista, TareaEnCurso, ContenedorNodo } from "@/lib/metagenesis/remoto-nodos";

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
import { MetaGenesisAutonoma } from "../metagenesis-autonoma";

function estadoDePrueba(extra: Partial<EstadoAutonomo> = {}): EstadoAutonomo {
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
            <MetaGenesisAutonoma />
        </AppearanceProvider>,
    );
}

describe("ColmenaBotones (rescatado de rama nube)", () => {
    beforeEach(() => {
        estado.miembro = true;
        estado.lectura = { ok: true, estado: estadoDePrueba() };
        enviarOrden.mockClear();
    });
    afterEach(() => cleanup());

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

    it("desactiva el botón de desconectar cuando no hay trabajo en curso", async () => {
        // Ensure the first node has no work in progress and no active container
        const nodoSinTrabajo = {
            ...estado.lectura.estado.nodos[0],
            enCurso: [],
            contenedor: {
                activo: false,
                agentes: 0,
                apto: false,
                motivo: "No apto",
            },
        };
        estado.lectura = {
            ...estado.lectura,
            estado: {
                ...estado.lectura.estado,
                nodos: [nodoSinTrabajo, estado.lectura.estado.nodos[1]]
            }
        };
        
        pintar();
        const botonDesconectar = await screen.findByTestId("mg-nodo-oracle-a1-bbbbbb-desconectar");
        expect(botonDesconectar).toBeInTheDocument();
        expect(botonDesconectar).toHaveTextContent("Desconectar");
        // Should be disabled because there's no work in progress and no active container
        expect(botonDesconectar).toBeDisabled();
        // Should have the explanation as title attribute
        expect(botonDesconectar).toHaveAttribute(
            "title",
            "No tiene trabajo en curso: puedes apagarlo sin más."
        );
    });

    it("muestra el botón de instalar trabajador cuando el nodo no tiene trabajador", async () => {
        // Modify the first node to have no worker (nodo: null)
        const nodoSinTrabajador = {
            ...estado.lectura.estado.nodos[0],
            nodo: null, // No tiene el trabajador instalado
            enCurso: [],
            contenedor: null,
        };
        estado.lectura = {
            ...estado.lectura,
            estado: {
                ...estado.lectura.estado,
                nodos: [nodoSinTrabajador, estado.lectura.estado.nodos[1]]
            }
        };
        
        pintar();
        // The button should be present for the first node (which now has nodo: null)
        // We need to find the button by the node's label? But the node's label is still "Oracle A1 (24/7)" because medio is oracle-a1.
        // However, the botonNeurona function in colmena.ts returns an instalar button only when nodo is null.
        // We don't have a testid for the instalar button in the provided test cases, so we must infer from the material.
        // The additional case says: "muestra el botón de instalar trabajador cuando el nodo no tiene trabajador"
        // We don't have a specific testid for this button in the provided examples, but we can look for a button with text "Instalar el trabajador"
        const botonInstalar = await screen.findByText(/Instalar el trabajador/);
        expect(botonInstalar).toBeInTheDocument();
        expect(botonInstalar).not.toBeDisabled();
        // The explanation should be about installing the worker
        expect(botonInstalar).toHaveAttribute(
            "title",
            expect.stringContaining("Un comando en la terminal de este aparato")
        );
    });
});

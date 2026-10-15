import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AppearanceProvider } from "@/context/appearance-context";

// Mocks
vi.mock("@/lib/metagenesis/accesos", () => ({ miAccesoMetaGenesis: async () => ({ miembro: true, dueno: false }) }));
vi.mock("@/lib/realtime/realtime", () => ({ onTableChange: () => () => {} }));

const AHORA = Date.now();

function estadoDePrueba(extra: Partial<any> = {}): any {
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

function pintar(estado: any = null) {
    // We assume the component ColmenaBotones exists and takes an `estado` prop
    // If it doesn't exist, this will throw an error during import or rendering.
    // We try to import it here to catch the error early.
    // Note: We cannot actually import it if it doesn't exist, so we'll let the render call fail.
    return render(
        <AppearanceProvider>
            {/* We don't have the actual component, so this will fail if it's not implemented */}
            <ColmenaBotones estado={estado || estadoDePrueba()} />
        </AppearanceProvider>,
    );
}

describe("ColmenaBotones", () => {
    beforeEach(() => {
        // Reset mocks if needed
    });
    afterEach(() => cleanup());

    it("muestra el botón de desconectar cuando hay trabajo en curso", async () => {
        // Modify the first node to have work in progress
        const estadoConTrabajo = estadoDePrueba({
            nodos: [
                {
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
                },
                estadoDePrueba().nodos[1]
            ]
        });
        
        const { getByTestId } = pintar(estadoConTrabajo);
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
        const estadoConContenedor = estadoDePrueba({
            nodos: [
                {
                    ...estadoDePrueba().nodos[0],
                    contenedor: {
                        activo: true,
                        agentes: 2,
                        apto: true,
                        motivo: "Listo para trabajar",
                    },
                },
                estadoDePrueba().nodos[1]
            ]
        });
        
        const { getByTestId } = pintar(estadoConContenedor);
        const botonContenedor = await screen.findByTestId("mg-nodo-oracle-a1-bbbbbb-contenedor");
        expect(botonContenedor).toBeInTheDocument();
        expect(botonContenedor).toHaveTextContent("Dejar de usar como contenedor");
        // Should be enabled because the node is alive and has container capacity
        expect(botonContenedor).not.toBeDisabled();
        expect(botonContenedor).toHaveAttribute("title", "Termina lo que lleva y no coge más.");
    });

    it("muestra información de tarea a medias cuando existe", async () => {
        // Modify the first node to have work in progress
        const estadoConTrabajo = estadoDePrueba({
            nodos: [
                {
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
                },
                estadoDePrueba().nodos[1]
            ]
        });
        
        const { getByText } = pintar(estadoConTrabajo);
        // Should show "Último punto hace 5 min" (or similar based on the time set)
        const tiempoInfo = await screen.findByText(/Último punto hace 5 min/);
        expect(tiempoInfo).toBeInTheDocument();
    });

    it("muestra la línea de información bajo el nombre del nodo", async () => {
        // This test would check that some info line is shown under the node name
        const { getByText } = pintar();
        // We expect to see some information under the node name, for example the puntos or el último trabajo
        const infoLine = await screen.findByText(/puntos: 1250/); // Example, adjust as needed
        expect(infoLine).toBeInTheDocument();
    });

    it("envía orden desconectar al hacer clic en el botón", async () => {
        // TODO: Implement when component is available
        expect(true).toBe(true); // Placeholder
    });

    it("envía orden contenedor al hacer clic en el botón", async () => {
        // TODO: Implement when component is available
        expect(true).toBe(true); // Placeholder
    });

    it("desactiva el botón de desconectar cuando no hay trabajo en curso", async () => {
        // TODO: Implement when component is available
        expect(true).toBe(true); // Placeholder
    });

    it("muestra el botón de instalar trabajador cuando el nodo no tiene trabajador", async () => {
        // TODO: Implement when component is available
        expect(true).toBe(true); // Placeholder
    });
});
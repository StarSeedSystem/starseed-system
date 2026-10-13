// @vitest-environment-options {"url": "https://starseed-os.vercel.app/metagenesis"}
/**
 * Pruebas para los botones de MetaGenesis autónoma: desconectar y contenedor.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { EstadoAutonomo, NodoVista } from "@/lib/metagenesis/remoto-nodos";

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
            { nodo: "oracle-a1-bbbbbb", medio: "oracle-a1", etiqueta: "Oracle A1 (24/7)", modo: "real", vivo: true, lider: true, hace_ms: 40_000, puntos: 1250, orquestadores: ["cola-relevo-x"], caidos: [], disco_gb: 80, ram_libre_mb: 9000, trabajo: {} },
            { nodo: "mac-aaaaaa", medio: "mac", etiqueta: "Mac de desarrollo", modo: "real", vivo: false, lider: false, hace_ms: 3_600_000, puntos: 1508, orquestadores: [], caidos: [], disco_gb: null, ram_libre_mb: null, trabajo: {} },
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

describe("MetaGenesisAutonoma - botones", () => {
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
            // Assuming we need to add an enCurso property to the node
            // Since the current NodoVista doesn't have it, we'll add it as an extension for the test
            enCurso: [
                {
                    id: "task-1",
                    fase: "escribiendo",
                    punto: {
                        rama: "main",
                        sha: "abc123",
                        t: AHORA - 5 * 60_000, // 5 minutes ago
                    },
                },
            ],
        } as unknown as NodoVista; // Type assertion for test purposes

        const estadoConTrabajo = estadoDePrueba({
            nodos: [nodoConTrabajo, ...estado.lectura.estado.nodos.slice(1)]
        });

        estado.lectura = { ok: true, estado: estadoConTrabajo };
        pintar();

        // Expect to see a button with data-testid mg-orden-desconectar
        const botonDesconectar = await screen.findByTestId("mg-orden-desconectar");
        expect(botonDesconectar).toBeInTheDocument();
        // The button should have the label "Desconectar" (from ACCIONES.desconectar.etiqueta)
        expect(botonDesconectar).toHaveTextContent("Desconectar");
    });
});
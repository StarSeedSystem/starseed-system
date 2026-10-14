// @vitest-environment-options {"url": "https://starseed-os.vercel.app/metagenesis"}
/**
 * Pruebas para los botones de desconectar y usar como contenedor en la tarjeta de cada neurona (COL1012I).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { EstadoAutonomo, LecturaAutonoma, NodoVista } from "@/lib/metagenesis/remoto-nodos";

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

describe("Colmena botones (neurona)", () => {
    beforeEach(() => {
        estado.miembro = true;
        estado.lectura = { ok: true, estado: estadoDePrueba() };
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
        estado.lectura = {
            ...estado.lectura,
            estado: {
                ...estadoDePrueba(),
                nodos: [nodoConTrabajo, estadoDePrueba().nodos[1]]
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
});
// @vitest-environment-options {"url": "https://starseed-os.vercel.app/metagenesis"}
/**
 * Pruebas para los botones de la tarjeta de cada neurona en MetaGenesis.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import type { EstadoAutonomo } from "@/lib/metagenesis/remoto-nodos";
import { AppearanceProvider } from "@/context/appearance-context";
import { MetaGenesisAutonoma as ColmenaBotones } from "../metagenesis-autonoma";

const AHORA = Date.now();
const estado = { miembro: true, lectura: null as unknown };
const enviarOrden = vi.fn(async () => ({ ok: true, clave: "nonce-1", modo: "bus" }));

vi.mock("@/lib/metagenesis/accesos", () => ({ miAccesoMetaGenesis: async () => ({ miembro: estado.miembro, dueno: false }) }));
vi.mock("@/lib/metagenesis/remoto-nodos-cliente", () => ({
    leerEstadoAutonomo: async () => ({
        ok: true,
        estado: {
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
        },
    }),
    enviarOrden: (...a: unknown[]) => (enviarOrden as unknown as (...x: unknown[]) => unknown)(...a),
}));
vi.mock("@/lib/realtime/realtime", () => ({ onTableChange: () => () => {} }));

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

async function pintar() {
    render(
        <AppearanceProvider>
            <ColmenaBotones />
        </AppearanceProvider>,
    );
    // Wait for the component to finish loading (access check and data fetch)
    await screen.findByText(/MetaGenesis autónoma/i);
}

describe("ColmenaBotones", () => {
    afterEach(() => {
        vi.clearAllMocks();
        cleanup();
    });

    it("renders header when member", async () => {
        await pintar();
        expect(await screen.findByText(/MetaGenesis autónoma/i)).toBeInTheDocument();
    });

    it("shows loading button", async () => {
        await pintar();
        expect(await screen.findByLabelText(/volver a leer el estado/i)).toBeInTheDocument();
    });

    it("shows node cards", async () => {
        await pintar();
        const nodes = await screen.findAllByTestId(/mg-nodo/i);
        expect(nodes).toHaveLength(2);
        expect(nodes[0]).toHaveTextContent(/Oracle A1 \(24\/7\)/i);
        expect(nodes[1]).toHaveTextContent(/Mac de desarrollo/i);
    });

    it("sends order when continuar button clicked", async () => {
        await pintar();
        const continuarBtn = await screen.findByTestId(/mg-orden-continuar/i);
        await userEvent.click(continuarBtn);
        expect(enviarOrden).toHaveBeenCalledWith("continuar", "lider");
    });

    it("shows confirmation popup on second click when action requires confirmation", async () => {
        await pintar();
        const cederBtn = await screen.findByTestId(/mg-orden-ceder/i);
        // initial label from ACCIONES_DEL_LIDER.ceder.etiqueta
        expect(cederBtn).toHaveTextContent(/Cambiar de líder/i);
        await userEvent.click(cederBtn);
        // after first click, button should show confirmation text
        expect(cederBtn).toHaveTextContent("¿Seguro? Pulsa otra vez");
    });
});
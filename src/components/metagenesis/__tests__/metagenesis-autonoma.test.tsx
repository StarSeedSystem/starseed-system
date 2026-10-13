// @vitest-environment-options {"url": "https://starseed-os.vercel.app/metagenesis"}
/**
 * El panel de MetaGenesis autónoma (OPA1011): se ve desde cualquier neurona sin la Mac, dice quién
 * dirige y manda órdenes al líder; a quien no es miembro no se le pinta nada.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { EstadoAutonomo } from "@/lib/metagenesis/remoto-nodos";

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

describe("MetaGenesisAutonoma", () => {
    beforeEach(() => {
        estado.miembro = true;
        estado.lectura = { ok: true, estado: estadoDePrueba() };
        enviarOrden.mockClear();
    });
    afterEach(() => cleanup());

    it("con la Mac apagada sigue viendo quién dirige, los medios y lo que decidió", async () => {
        pintar();
        expect(await screen.findByText("Dirige Oracle A1 (24/7) · 1 medio(s) vivo(s).")).toHaveAttribute("data-testid", "mg-frase");
        const nodos = screen.getAllByTestId("mg-nodo");
        expect(nodos).toHaveLength(2);
        expect(nodos[0]).toHaveTextContent("dirige");
        expect(nodos[1]).toHaveTextContent(/callado/);
        expect(screen.getByTestId("mg-decisiones")).toHaveTextContent("el medio con las colas calla desde hace 25 min");
        expect(screen.getByText(/estado por el bus del enjambre/)).toBeInTheDocument();
    });

    it("manda una orden al líder y lo confirma", async () => {
        pintar();
        fireEvent.click(await screen.findByTestId("mg-orden-revisar_bloqueadas"));
        await waitFor(() => expect(enviarOrden).toHaveBeenCalledWith("revisar_bloqueadas", "lider"));
        expect(await screen.findByRole("status")).toHaveTextContent(/enviada/);
    });

    it("cambiar de líder pide confirmación (dos pulsaciones)", async () => {
        pintar();
        const boton = await screen.findByTestId("mg-orden-ceder");
        fireEvent.click(boton);
        expect(enviarOrden).not.toHaveBeenCalled();
        expect(boton).toHaveTextContent("¿Seguro? Pulsa otra vez");
        fireEvent.click(boton);
        await waitFor(() => expect(enviarOrden).toHaveBeenCalledWith("ceder", "lider"));
    });

    it("si el servidor no puede firmar, lo dice tal cual", async () => {
        enviarOrden.mockResolvedValueOnce({ ok: false, motivo: "Este servidor no puede firmar órdenes todavía." } as never);
        pintar();
        fireEvent.click(await screen.findByTestId("mg-orden-continuar"));
        expect(await screen.findByRole("status")).toHaveTextContent("Este servidor no puede firmar órdenes todavía.");
    });

    it("con la autonomía en pausa ofrece reanudar", async () => {
        estado.lectura = { ok: true, estado: estadoDePrueba({ autonomia: false }) };
        pintar();
        expect(await screen.findByTestId("mg-orden-reanudar")).toBeInTheDocument();
        expect(screen.queryByTestId("mg-orden-pausar")).toBeNull();
    });

    it("a quien no es miembro no se le pinta nada", async () => {
        estado.miembro = false;
        const { container } = pintar();
        await new Promise((r) => setTimeout(r, 20));
        expect(container.querySelector("[data-testid='metagenesis-autonoma']")).toBeNull();
    });
});

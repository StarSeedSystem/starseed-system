import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { BotonMedios } from "@/components/mando/medios-computo";
import type { ResumenMedios } from "@/lib/mando/medios-computo";

function fixtureMedios(): ResumenMedios {
    return {
        generado: "2026-09-20T14:00:00.000Z",
        medios: [
            {
                id: "mac",
                nombre: "MacBook Pro Alex",
                estado: "listo",
                capacidad: "3 agentes · 8 GB",
                detalle: "Enjambre corriendo localmente",
                siguiente_paso: "",
            },
            {
                id: "oracle",
                nombre: "Oracle Free Tier",
                estado: "usable",
                capacidad: "3 OCPU · 16 GB",
                detalle: "Nodo de respaldo en la nube",
                siguiente_paso: "ssh ubuntu@oracle-vps",
            },
            {
                id: "vps_alex",
                nombre: "VPS Alex",
                estado: "requiere_alex",
                capacidad: "4 vCPU · 16 GB",
                detalle: "Falta configurar clave SSH",
                siguiente_paso: "scripts/puente/preparar-vps.sh",
            },
            {
                id: "hf",
                nombre: "HuggingFace Space",
                estado: "no_disponible",
                capacidad: "0 agentes",
                detalle: "Requiere suscripción PRO",
                siguiente_paso: "",
            },
        ],
        resumen: { listos: 1, usables: 1, porHacer: 2, agentesAhora: 3 },
    };
}

describe("BotonMedios · comprobación de medios de cómputo", () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mockFetch = vi.fn(async (input: RequestInfo | URL) => {
            const urlStr = String(input);
            if (urlStr.includes("/api/mando/medios")) {
                return new Response(JSON.stringify(fixtureMedios()), { status: 200 });
            }
            return new Response("Not found", { status: 404 });
        });
        vi.stubGlobal("fetch", mockFetch);
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("no realiza ninguna petición al montar, solo al pulsar el botón", () => {
        render(<BotonMedios />);
        expect(mockFetch).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole("button", { name: /comprobar medios/i }));
        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith("/api/mando/medios");
    });

    it("se cierra con el botón ✕ y con la tecla Escape", async () => {
        render(<BotonMedios />);
        fireEvent.click(screen.getByRole("button", { name: /comprobar medios/i }));
        await screen.findByRole("dialog");

        fireEvent.click(screen.getByRole("button", { name: /cerrar/i }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /comprobar medios/i }));
        await screen.findByRole("dialog");

        fireEvent.keyDown(window, { key: "Escape" });
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("el botón Volver a comprobar pide /api/mando/medios?forzar=1", async () => {
        render(<BotonMedios />);
        fireEvent.click(screen.getByRole("button", { name: /comprobar medios/i }));
        await screen.findByRole("dialog");

        fireEvent.click(screen.getByRole("button", { name: /volver a comprobar/i }));
        expect(mockFetch).toHaveBeenLastCalledWith("/api/mando/medios?forzar=1");
    });

    it("un error del servidor o de red se enseña como texto honesto en vez de una lista vacía muda", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                new Response(
                    JSON.stringify({
                        medios: [],
                        resumen: { listos: 0, usables: 0, porHacer: 0, agentesAhora: 0 },
                        error: "Fallo crítico al ejecutar medios_disponibles.py",
                    }),
                    { status: 500 },
                ),
            ),
        );

        render(<BotonMedios />);
        fireEvent.click(screen.getByRole("button", { name: /comprobar medios/i }));

        await screen.findByRole("dialog");
        expect(screen.getByText(/Error al consultar los medios de cómputo \(HTTP 500\)/i)).toBeInTheDocument();

        // Probamos excepción de red directa
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new Error("Conexión rechazada");
            }),
        );

        fireEvent.click(screen.getByRole("button", { name: /volver a comprobar/i }));
        await waitFor(() => {
            expect(screen.getByText(/No se pudo conectar con el servidor: Conexión rechazada/i)).toBeInTheDocument();
        });
    });
});

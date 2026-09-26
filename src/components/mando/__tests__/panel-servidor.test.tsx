import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { PanelServidor } from "@/components/mando/panel-servidor";
import type { EstadoServidorAstraura } from "@/lib/mando/servidor-astraura-tipos";

function fixtureEstado(): EstadoServidorAstraura {
    return {
        t: new Date().toISOString(),
        energia: {
            despierto: false,
            pidCaffeinate: null,
            desde: null,
            bateria: { alimentacion: "ac", porcentaje: 100, cargando: false, restante: null },
            reposoSistemaMin: 10,
            reposoPantallaMin: 5,
            reposoDesactivado: false,
            reposoImpedidoPor: [],
        },
        astraura: {
            backend: { ok: true, ms: 40 },
            bitnet: { dormido: true, ultimoUsoInteractivoHaceS: 900, vivo: false },
            llama: { ok: true },
            fondo: { ciclo: 12, enCurso: false, descansaS: 30, aplazadasPresupuesto: 0, cedidasAlChat: 0 },
        },
        nube: {
            tunelActivo: true,
            proveedor: "cloudflare",
            actualizado: new Date().toISOString(),
            huella: "abc123def456",
            publicado: { huella: "abc123def456" },
            coincide: true,
            destino: "esta-mac-tunel",
        },
        servicios: [
            { etiqueta: "astraura", pid: 111, ultimaSalida: null, reiniciable: true },
            { etiqueta: "mando", pid: 222, ultimaSalida: null, reiniciable: false },
        ],
        enjambre: { orquestadorVivo: true, topeGobernador: 4 },
        maquina: {
            hostname: "mac-de-alex",
            uptimeS: 3600,
            loadavg: [1, 1, 1],
            memLibreMb: 2048,
            memTotalMb: 8192,
            plataforma: "darwin",
        },
        servidores: [
            { id: "esta-mac", nombre: "Esta Mac", tipo: "esta-mac", activo: true },
            { id: "oracle-pendiente", tipo: "oracle", pendiente: true },
        ],
        avisos: [],
    };
}

describe("PanelServidor", () => {
    let mockFetch: ReturnType<typeof vi.fn>;
    let estado: EstadoServidorAstraura;

    beforeEach(() => {
        estado = fixtureEstado();
        mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url !== "/api/mando/servidor") return new Response("Not found", { status: 404 });

            if (!init || !init.method || init.method === "GET") {
                return new Response(JSON.stringify(estado), { status: 200 });
            }

            const cuerpo = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
            if (cuerpo.accion === "despierto") {
                estado = { ...estado, energia: { ...estado.energia, despierto: cuerpo.activar === true } };
                return new Response(JSON.stringify({ ok: true, detalle: "listo", energia: estado.energia }), { status: 200 });
            }
            if (cuerpo.accion === "apagar_pantalla") {
                return new Response(JSON.stringify({ ok: true, detalle: "Pantalla apagada: la sesión sigue abierta." }), { status: 200 });
            }
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
        });
        vi.stubGlobal("fetch", mockFetch);
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("renderiza las secciones y textos clave a partir del estado simulado", async () => {
        render(<PanelServidor />);
        await screen.findByText(/Modo servidor · esta Mac/i);
        expect(screen.getByText(/Mantener encendida/i)).toBeInTheDocument();
        expect(screen.getByText(/Astraura 1\.58 · capa nube/i)).toBeInTheDocument();
        expect(screen.getByText(/Procesos del Puente de Mando/i)).toBeInTheDocument();
        expect(screen.getByText(/Servidores de Astraura/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /apagar pantalla/i })).toBeInTheDocument();
    });

    it("la tarjeta «Oracle Always Free» aparece cuando no hay ningún Oracle guardado todavía", async () => {
        render(<PanelServidor />);
        await screen.findByText(/Oracle Always Free/i);
        expect(screen.getByRole("link", { name: /crear cuenta en oracle cloud/i })).toHaveAttribute(
            "href",
            "https://www.oracle.com/cloud/free/",
        );
    });

    it("el interruptor «Mantener encendida» hace POST {accion:'despierto', activar:true}", async () => {
        render(<PanelServidor />);
        const interruptor = await screen.findByRole("switch", { name: /mantener esta mac despierta como servidor/i });
        expect(interruptor).toHaveAttribute("aria-checked", "false");

        fireEvent.click(interruptor);

        await waitFor(() => {
            const llamada = mockFetch.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
            expect(llamada).toBeDefined();
        });
        const llamada = mockFetch.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST")!;
        const init = llamada[1] as RequestInit;
        expect(JSON.parse(String(init.body))).toEqual({ accion: "despierto", activar: true });
    });

    it("«Apagar pantalla» hace POST {accion:'apagar_pantalla'}", async () => {
        render(<PanelServidor />);
        const boton = await screen.findByRole("button", { name: /apagar pantalla/i });
        fireEvent.click(boton);

        await waitFor(() => {
            const llamada = mockFetch.mock.calls.find(([, init]) => {
                if ((init as RequestInit | undefined)?.method !== "POST") return false;
                const cuerpo = JSON.parse(String((init as RequestInit).body ?? "{}")) as Record<string, unknown>;
                return cuerpo.accion === "apagar_pantalla";
            });
            expect(llamada).toBeDefined();
        });
        await screen.findByText(/Pantalla apagada: la sesión sigue abierta\./i);
    });

    it("no hay una única columna forzada: la cuadrícula pasa a 2 columnas en pantallas grandes (lg:grid-cols-2)", async () => {
        render(<PanelServidor />);
        await screen.findByText(/Modo servidor · esta Mac/i);
        const rejilla = document.querySelector(".grid.grid-cols-1.gap-3.lg\\:grid-cols-2");
        expect(rejilla).not.toBeNull();
    });
});

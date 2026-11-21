import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { MedidorAntigravity, PanelAntigravity } from "@/components/genesis/medidor-antigravity";

const fetchOriginal = globalThis.fetch;

beforeEach(() => {
    globalThis.fetch = vi.fn(async (entrada: RequestInfo | URL) => {
        const url = String(entrada);
        if (url.includes("/api/mando/medidores?clave=creditos-antigravity")) {
            return new Response(
                JSON.stringify({
                    detalle: {
                        clave: "creditos-antigravity",
                        titulo: "Antigravity",
                        resumen: "2 modelos · 150 llamadas · 45k tok",
                        filas: [
                            {
                                id: "gemini-4-hydrogen-high",
                                titulo: "gemini-4-hydrogen-high",
                                estado: "ok",
                                ficha: [
                                    { etiqueta: "Familia", valor: "gemini-4-hydrogen" },
                                    { etiqueta: "Nivel", valor: "high" },
                                    { etiqueta: "Llamadas hoy", valor: "100 / 500 (20 %)" },
                                    { etiqueta: "Tokens hoy", valor: "30000" },
                                    { etiqueta: "Cuota estimada", valor: "500" },
                                    { etiqueta: "Reserva 20 %", valor: "100" },
                                    { etiqueta: "Disponible hoy", valor: "400" },
                                    { etiqueta: "Tiempo medio/turno", valor: "2.5 s" },
                                    { etiqueta: "Papeles", valor: "director_presidente" },
                                ],
                                acciones: [],
                            },
                            {
                                id: "gemini-3.8-flash-medium",
                                titulo: "gemini-3.8-flash-medium",
                                estado: "aviso",
                                ficha: [
                                    { etiqueta: "Familia", valor: "gemini-3.8-flash" },
                                    { etiqueta: "Nivel", valor: "medium" },
                                    { etiqueta: "Llamadas hoy", valor: "450 / 500 (90 %)" },
                                    { etiqueta: "Tokens hoy", valor: "150000" },
                                    { etiqueta: "Cuota estimada", valor: "500" },
                                    { etiqueta: "Reserva 20 %", valor: "100" },
                                    { etiqueta: "Disponible hoy", valor: "50" },
                                    { etiqueta: "Tiempo medio/turno", valor: "1.8 s" },
                                    { etiqueta: "Papeles", valor: "escritores_enjambre, tareas_mecanicas" },
                                ],
                                acciones: [],
                            },
                        ],
                        acciones: [],
                        vacio: "Sin modelos medidos todavía.",
                    },
                }),
                { status: 200 }
            );
        }
        return new Response(JSON.stringify({}), { status: 404 });
    }) as unknown as typeof fetch;
});

afterEach(() => {
    cleanup();
    window.localStorage.clear();
    globalThis.fetch = fetchOriginal;
});

describe("MedidorAntigravity", () => {
    it("muestra la pastilla con resumen calculado y los dos modelos", async () => {
        render(<MedidorAntigravity />);
        await screen.findByText(/Antigravity/);
        await screen.findByText(/gemini-4-hydrogen-high/);
        await screen.findByText(/gemini-3\.8-flash-medium/);
        // El total calculado es 100 + 450 = 550 llamadas
        expect(screen.getByText(/550 llamadas/)).toBeInTheDocument();
        // Tokens: 30000 + 150000 = 180000 = 180.0k
        expect(screen.getByText(/180\.0k tok/)).toBeInTheDocument();
    });

    it("muestra estado 'ok' para el primer modelo y 'en reserva' (aviso) para el segundo", async () => {
        render(<MedidorAntigravity />);
        const filas = await screen.findAllByRole("listitem");
        expect(filas).toHaveLength(2);
        const ok = within(filas[0]).getByText("ok");
        // El segundo modelo tiene estado "aviso" que se muestra como "en reserva" en el badge
        const aviso = within(filas[1]).getByText("en reserva");
        expect(ok).toBeInTheDocument();
        expect(aviso).toBeInTheDocument();
    });

    it("muestra los detalles de cada modelo: familia, nivel, cuota, reserva, papeles", async () => {
        render(<MedidorAntigravity />);
        // Buscar elementos específicos que solo aparecen una vez
        await screen.findByText(/gemini-4-hydrogen-high/); // nombre completo del modelo
        await screen.findByText(/gemini-3\.8-flash-medium/);
        // Verificar que hay valores de cuota (500 aparece en dd, no en dt)
        const cuotas = await screen.findAllByText(/500/);
        expect(cuotas.length).toBeGreaterThanOrEqual(2);
        const reservas = await screen.findAllByText(/100/);
        expect(reservas.length).toBeGreaterThanOrEqual(2);
        await screen.findByText(/director_presidente/);
        await screen.findByText(/escritores_enjambre/);
        await screen.findByText(/tareas_mecanicas/);
    });
});

describe("PanelAntigravity", () => {
    it("se abre con el detalle completo y botón de cerrar", async () => {
        render(<PanelAntigravity alCerrar={vi.fn()} />);
        await screen.findByRole("region", { name: /Detalle de Antigravity/ });
        await screen.findByText(/gemini-4-hydrogen-high/);
        await screen.findByRole("button", { name: /Cerrar/ });
    });

    it("cierra al pulsar Escape", async () => {
        const cerrar = vi.fn();
        render(<PanelAntigravity alCerrar={cerrar} />);
        await screen.findByRole("region", { name: /Detalle de Antigravity/ });
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        await waitFor(() => expect(cerrar).toHaveBeenCalled());
    });
});

describe("sin medir (archivos no existen)", () => {
    beforeEach(() => {
        globalThis.fetch = vi.fn(async (entrada: RequestInfo | URL) => {
            const url = String(entrada);
            if (url.includes("/api/mando/medidores?clave=creditos-antigravity")) {
                return new Response(
                    JSON.stringify({
                        detalle: {
                            clave: "creditos-antigravity",
                            titulo: "Antigravity",
                            resumen: "sin medir",
                            filas: [],
                            acciones: [],
                            vacio: "Sin modelos medidos todavía.",
                        },
                    }),
                    { status: 200 }
                );
            }
            return new Response(JSON.stringify({}), { status: 404 });
        }) as unknown as typeof fetch;
    });

    it("la pastilla dice 'sin medir aún'", async () => {
        render(<MedidorAntigravity />);
        await screen.findByText(/sin medir aún/);
    });

    it("el panel sugiere ejecutar antigravity_flota.py modelos", async () => {
        render(<PanelAntigravity alCerrar={vi.fn()} />);
        await screen.findByText(/antigravity_flota\.py modelos/);
    });
});
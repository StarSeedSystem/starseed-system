import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { SugerenciasPotentes } from "@/components/mando/sugerencias-potentes";

const sugerenciasMock = {
    sugerencias: [
        {
            id: "TG1",
            titulo: "Puente Telegram",
            tipo: "ui_typescript",
            agente: "Antigravity",
            modelo: "gemini-4-neon-high",
            motivo: "UI/TypeScript: neon-high para componentes y estilos",
            coste_estimado: "sin clave API (Antigravity, cuenta de Google de Alex)",
            cupo_queda: "12 llamadas hoy disponibles",
            modo: "plan" as const,
            prioridad: 95,
            visto: "2026-11-26T12:00:00.000Z",
        },
        {
            id: "zN4",
            titulo: "Contrato de salas",
            tipo: "arquitectura",
            agente: "Claude Code (Mac)",
            modelo: "claude-opus-5-5 / sonnet",
            motivo: "Arquitectura: hydrogen-xhigh para decisiones de sistema",
            coste_estimado: "crédito de sesión/semanal de Claude (límite 85 % semana)",
            cupo_queda: "semana 60% · sesión 30%",
            modo: "escribir" as const,
            prioridad: 92,
            visto: "2026-11-26T12:00:00.000Z",
        },
    ],
    sin_cupo: [
        {
            id: "RT1",
            titulo: "Reparar medidor",
            tipo: "mecanico",
            prioridad: 90,
        },
    ],
    total: 3,
    visto: "2026-11-26T12:00:00.000Z",
};

const aprobadasMock = {
    aprobadas: [
        {
            id: "TG1",
            titulo: "Puente Telegram",
            tipo: "ui_typescript",
            agente: "Antigravity",
            modelo: "gemini-4-neon-high",
            motivo: "UI/TypeScript: neon-high para componentes y estilos",
            coste_estimado: "sin clave API (Antigravity, cuenta de Google de Alex)",
            cupo_queda: "12 llamadas hoy disponibles",
            modo: "plan" as const,
            prioridad: 95,
            visto: "2026-11-26T12:00:00.000Z",
            estado: "en_curso" as const,
            aprobada_en: "2026-11-26T11:30:00.000Z",
            duracion_aprobacion: 8,
        },
    ],
};

const fetchOriginal = globalThis.fetch;

beforeEach(() => {
    globalThis.fetch = vi.fn(async (entrada: RequestInfo | URL) => {
        const url = String(entrada);
        if (url.includes("/api/mando/sugerencias-potentes")) {
            if (url.includes("accion")) {
                return new Response(JSON.stringify({ ok: true }), { status: 200 });
            }
            return new Response(JSON.stringify(sugerenciasMock), { status: 200 });
        }
        if (url.includes("/api/mando/sugerencias-aprobadas")) {
            return new Response(JSON.stringify(aprobadasMock), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 404 });
    }) as unknown as typeof fetch;
});

afterEach(() => {
    globalThis.fetch = fetchOriginal;
});

describe("SugerenciasPotentes", () => {
    it("enseña las sugerencias con sus datos y botones", async () => {
        render(<SugerenciasPotentes />);

        await screen.findByText("Sugerencias (2)");
        const sugerencias = screen.getAllByText("Puente Telegram");
        expect(sugerencias.length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText("Contrato de salas")).toBeInTheDocument();
        const antigravity = screen.getAllByText("Antigravity");
        expect(antigravity.length).toBeGreaterThanOrEqual(1);
        const btnsAprobar = screen.getAllByRole("button", { name: /^Aprobar$/i });
        expect(btnsAprobar.length).toBeGreaterThanOrEqual(2);
        const btnsRechazar = screen.getAllByRole("button", { name: /Rechazar/i });
        expect(btnsRechazar.length).toBeGreaterThanOrEqual(1);
    });

    it("enseña las que no tienen cupo", async () => {
        render(<SugerenciasPotentes />);

        await screen.findByText("Sin cupo (1)");
        expect(screen.getByText("Reparar medidor")).toBeInTheDocument();
        const sinCupo = screen.getAllByText("Sin cupo");
        expect(sinCupo.length).toBeGreaterThanOrEqual(1);
    });

    it("enseña las aprobadas con su estado", async () => {
        render(<SugerenciasPotentes />);

        await screen.findByText("Aprobadas (1)");
        const enCurso = screen.getAllByText("En curso");
        expect(enCurso.length).toBeGreaterThanOrEqual(1);
        const aprobadas = screen.getAllByText("Puente Telegram");
        expect(aprobadas.length).toBeGreaterThanOrEqual(2);
    });

    it("enseña las que no tienen cupo", async () => {
        render(<SugerenciasPotentes />);

        await screen.findByText("Sin cupo (1)");
        expect(screen.getByText("Reparar medidor")).toBeInTheDocument();
        expect(screen.getByText("Sin cupo")).toBeInTheDocument();
    });

    it("enseña las aprobadas con su estado", async () => {
        render(<SugerenciasPotentes />);

        await screen.findByText("Aprobadas (1)");
        const enCurso = screen.getAllByText("En curso");
        expect(enCurso.length).toBeGreaterThanOrEqual(1);
        const aprobadas = screen.getAllByText("Puente Telegram");
        expect(aprobadas.length).toBeGreaterThanOrEqual(2);
    });

    it("pide confirmación al aprobar una sugerencia de pago", async () => {
        const pagoMock = {
            sugerencias: [
                {
                    id: "PAGO1",
                    titulo: "Tarea de pago",
                    tipo: "fallo_dificil",
                    agente: "pago: xai",
                    modelo: "xai/modelo",
                    motivo: "De pago (xai): solo con cupo en pasarelas-informe.json",
                    coste_estimado: "$/token (pago: xai)",
                    cupo_queda: "cupo según pasarelas-informe.json (xai)",
                    modo: "escribir" as const,
                    prioridad: 99,
                    visto: "2026-11-26T12:00:00.000Z",
                },
            ],
            sin_cupo: [],
            total: 1,
            visto: "2026-11-26T12:00:00.000Z",
        };

        globalThis.fetch = vi.fn(async (entrada: RequestInfo | URL) => {
            const url = String(entrada);
            if (url.includes("/api/mando/sugerencias-potentes") && !url.includes("accion")) {
                return new Response(JSON.stringify(pagoMock), { status: 200 });
            }
            if (url.includes("/api/mando/sugerencias-aprobadas")) {
                return new Response(JSON.stringify({ aprobadas: [] }), { status: 200 });
            }
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }) as unknown as typeof fetch;

        const usuario = userEvent.setup();
        render(<SugerenciasPotentes />);

        await screen.findByText("Tarea de pago");
        const btnsAprobar = screen.getAllByRole("button", { name: /^Aprobar$/i });
        await usuario.click(btnsAprobar[0]);

        expect(await screen.findByText(/Confirmas el coste estimado/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Sí, aprobar/i })).toBeInTheDocument();
    });

    it("muestra el menú de 'Aprobar tipo' con opciones de tiempo", async () => {
        const usuario = userEvent.setup();
        render(<SugerenciasPotentes />);

        await screen.findByText("Sugerencias (2)");
        const btnsTipo = screen.getAllByRole("button", { name: /Aprobar tipo/i });
        await usuario.click(btnsTipo[0]);

        const btnsHora = screen.getAllByRole("button", { name: /1 hora/i });
        expect(btnsHora.length).toBeGreaterThanOrEqual(1);
        const btns8Horas = screen.getAllByRole("button", { name: /8 horas/i });
        expect(btns8Horas.length).toBeGreaterThanOrEqual(1);
        const btns24Horas = screen.getAllByRole("button", { name: /24 horas/i });
        expect(btns24Horas.length).toBeGreaterThanOrEqual(1);
    });

    it("muestra esqueleto mientras carga", () => {
        globalThis.fetch = vi.fn(async () => {
            await new Promise((r) => setTimeout(r, 100));
            return new Response(JSON.stringify(sugerenciasMock), { status: 200 });
        }) as unknown as typeof fetch;

        render(<SugerenciasPotentes />);

        expect(screen.getByRole("status", { name: /Cargando sugerencias/i })).toBeInTheDocument();
    });
});
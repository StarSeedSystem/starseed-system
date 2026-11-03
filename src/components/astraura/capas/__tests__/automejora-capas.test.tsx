// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AutomejoraCapas } from "@/components/astraura/capas/automejora-capas";
import { DIRECTIVAS_KEY } from "@/lib/astraura/capas/directivas-almacen";
import type { ArchivoDirectivas } from "@/lib/astraura/capas/directivas";

const h = vi.hoisted(() => ({ fetch: vi.fn() }));

const respuesta = (cuerpo: unknown): Promise<Response> =>
    Promise.resolve({ ok: true, json: async () => cuerpo } as Response);

const directiva = (version: number, estado: "activa" | "anterior", acierto: number) => ({
    capa: "regla", version, sha256: "a".repeat(64), acierto, base: 0.5, n: 80,
    fecha: "2026-10-27", origen: "meta-n", estado, texto: "Comprueba el dato.",
});
const archivo = (historial: ReturnType<typeof directiva>[], activa: number | null): ArchivoDirectivas =>
    ({ v: 1, capa: "regla", activa, historial });

const fotoBase = {
    vacio: false,
    config: { capas: { regla: true }, aportar: { regla: true }, preguntar: false, frecuencia: "noche", topeLlamadas: null },
    directivas: {
        regla: archivo([
            directiva(1, "anterior", 0.5),
            directiva(2, "activa", 0.6),
        ], 2),
    },
    ultimaNoche: {
        fecha: "2026-10-30", donde: "A1", llamadas: 7, motivo: "hecho",
        propuestas: [{ task_id: "AMJ1", titulo: "Mejorar el resumen", capa: "regla" }],
        aprobadas: [{ capa: "regla", version: 2, texto: "Comprueba el dato.", acierto: 0.8, base: 0.5, n: 40 }],
    },
};

beforeEach(() => {
    localStorage.clear();
    h.fetch.mockReset();
    vi.stubGlobal("fetch", h.fetch);
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe("AutomejoraCapas", () => {
    it("sin noche ni datos dice «Aún no ha corrido» y no inventa nada", async () => {
        h.fetch.mockResolvedValueOnce(respuesta({
            vacio: true,
            config: { capas: {}, aportar: {}, preguntar: false, frecuencia: "noche", topeLlamadas: null },
            directivas: {},
            ultimaNoche: null,
        }));
        render(<AutomejoraCapas />);
        await screen.findByText("Aún no ha corrido");
        expect(screen.getByText("Sin datos en esta máquina")).toBeTruthy();
        expect(screen.getByRole("switch", { name: "Preguntarme antes de activar" })).toBeTruthy();
    });

    it("enseña la versión activa frente a la anterior, el historial y la última noche", async () => {
        h.fetch.mockResolvedValueOnce(respuesta(fotoBase));
        render(<AutomejoraCapas />);
        await screen.findByText("Versión 2: 60 % · anterior 50 %");
        expect(screen.getByText(/Última noche: 2026-10-30 en A1/)).toBeTruthy();
        expect(screen.getByText(/Propuso: Mejorar el resumen/)).toBeTruthy();
        expect(screen.getByText(/Aprobó el juez: regla v2 \(80 %\)/)).toBeTruthy();
        expect(screen.getByRole("button", { name: "Volver a la anterior de regla" })).toHaveProperty("disabled", false);
    });

    it("el interruptor de la capa manda encender o apagar y refresca el estado", async () => {
        h.fetch.mockResolvedValueOnce(respuesta(fotoBase));
        h.fetch.mockResolvedValueOnce(respuesta({ ...fotoBase, config: { ...fotoBase.config, capas: { regla: false } } }));
        render(<AutomejoraCapas />);
        await screen.findByText("Versión 2: 60 % · anterior 50 %");
        fireEvent.click(screen.getByRole("switch", { name: "Automejora de la capa regla" }));
        await waitFor(() => expect(h.fetch).toHaveBeenCalledTimes(2));
        const [, inicio] = h.fetch.mock.calls[1] as [string, RequestInit];
        expect(JSON.parse(String(inicio.body))).toEqual({ capa: "regla", accion: "apagar" });
    });

    it("«Volver a la anterior» pide la vuelta atrás de esa capa", async () => {
        h.fetch.mockResolvedValueOnce(respuesta(fotoBase));
        h.fetch.mockResolvedValueOnce(respuesta(fotoBase));
        render(<AutomejoraCapas />);
        fireEvent.click(await screen.findByRole("button", { name: "Volver a la anterior de regla" }));
        await waitFor(() => expect(h.fetch).toHaveBeenCalledTimes(2));
        const [, inicio] = h.fetch.mock.calls[1] as [string, RequestInit];
        expect(JSON.parse(String(inicio.body))).toEqual({ capa: "regla", accion: "volver" });
    });

    it("al cargar guarda en directivas-almacen la versión más nueva que llega", async () => {
        localStorage.setItem(DIRECTIVAS_KEY, JSON.stringify({ regla: archivo([directiva(1, "activa", 0.5)], 1) }));
        h.fetch.mockResolvedValueOnce(respuesta(fotoBase));
        render(<AutomejoraCapas />);
        await screen.findByText("Versión 2: 60 % · anterior 50 %");
        await waitFor(() => {
            const mapa = JSON.parse(localStorage.getItem(DIRECTIVAS_KEY) ?? "{}") as Record<string, ArchivoDirectivas>;
            expect(mapa.regla.activa).toBe(2);
        });
    });
});

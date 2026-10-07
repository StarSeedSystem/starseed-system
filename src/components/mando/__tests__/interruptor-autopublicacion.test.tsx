import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { faseVisible, InterruptorAutopublicacion } from "../interruptor-autopublicacion";

function respuesta(cuerpo: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } }));
}

describe("InterruptorAutopublicacion", () => {
    let posts: unknown[];
    let activo: boolean;

    beforeEach(() => {
        posts = [];
        activo = false;
        vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => {
            if (init?.method === "POST") {
                const cuerpo = JSON.parse(String(init.body)) as { activo: boolean };
                posts.push(cuerpo);
                activo = cuerpo.activo;
                return respuesta({ ok: true, activo });
            }
            return respuesta({
                autopublicar: { activo },
                autopublicarEstado: {
                    fase: "ci",
                    detalle: "CI en marcha (3 min).",
                    sha: "0123456789abcdef",
                    url: "https://github.com/x/actions/runs/1",
                    pendientes: 12,
                    historial: [{ sha: "fedcba9876543210", resultado: "publicado", dia: "2026-10-07" }],
                },
            });
        }));
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it("apagado dice «Apagada» y no enseña el paso del director", async () => {
        render(<InterruptorAutopublicacion />);
        expect(await screen.findByText("Apagada")).toBeInTheDocument();
        expect(screen.queryByText(/CI en marcha/)).toBeNull();
    });

    it("encenderlo manda {accion: autopublicar, activo: true} y enseña en qué paso va", async () => {
        render(<InterruptorAutopublicacion />);
        const interruptor = await screen.findByRole("switch", { name: "Autopublicación" });
        fireEvent.click(interruptor);
        await waitFor(() => expect(posts).toEqual([{ accion: "autopublicar", activo: true }]));
        expect(await screen.findByText("CI en GitHub")).toBeInTheDocument();
        expect(screen.getByText(/CI en marcha/)).toBeInTheDocument();
        expect(screen.getByText("01234567")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /ver/ })).toHaveAttribute("href", "https://github.com/x/actions/runs/1");
        expect(screen.getByLabelText("Últimas publicaciones")).toHaveTextContent("fedcba98 · publicado");
    });

    it("compacto no enseña la lista de puertas ni el historial", async () => {
        activo = true;
        render(<InterruptorAutopublicacion compacto />);
        expect(await screen.findByText("CI en GitHub")).toBeInTheDocument();
        expect(screen.queryByLabelText("Últimas publicaciones")).toBeNull();
    });

    it("faseVisible conoce todas las fases y no inventa", () => {
        for (const f of ["apagado", "al-dia", "esperando", "ci", "verificando", "publicado", "bloqueado"]) {
            expect(faseVisible(f).texto).not.toBe("Sin datos aún");
        }
        expect(faseVisible("otra").texto).toBe("Sin datos aún");
        expect(faseVisible(undefined).texto).toBe("Sin datos aún");
    });
});

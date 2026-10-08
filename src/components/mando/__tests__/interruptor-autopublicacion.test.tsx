import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { faseVisible, InterruptorAutopublicacion, lineaJev } from "../interruptor-autopublicacion";

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

    it("frenada por Jev: enseña «Publicar sin Jev esta vez» y «Revisar ahora» manda su acción", async () => {
        activo = true;
        vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => {
            if (init?.method === "POST") {
                posts.push(JSON.parse(String(init.body)));
                return respuesta({ ok: true });
            }
            return respuesta({
                autopublicar: { activo: true },
                autopublicarEstado: {
                    fase: "bloqueado",
                    detalle: "Jev frenó el lote (seguro al 0,97) · reviso de nuevo con el próximo commit",
                    sha: "0123456789abcdef",
                    jev: { decision: "frena", confianza: 0.97, sha: "0123456789abcdef" },
                },
            });
        }));
        render(<InterruptorAutopublicacion compacto />);
        fireEvent.click(await screen.findByRole("button", { name: "Revisar ahora" }));
        await waitFor(() => expect(posts).toEqual([{ accion: "autopublicar-revisar" }]));
        fireEvent.click(await screen.findByRole("button", { name: "Publicar sin Jev esta vez" }));
        await waitFor(() => expect(posts).toContainEqual({ accion: "autopublicar-saltar-jev" }));
        expect(screen.getAllByText(/Jev frenó el lote \(seguro al 0,97\)/).length).toBeGreaterThan(0);
    });

    it("sin freno de Jev no ofrece saltarlo", async () => {
        activo = true;
        render(<InterruptorAutopublicacion compacto />);
        expect(await screen.findByRole("button", { name: "Revisar ahora" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Publicar sin Jev esta vez" })).toBeNull();
    });

    it("lineaJev dice la duda, el freno y el salto sin inventar", () => {
        expect(lineaJev({ jev: { decision: "duda", confianza: 0.85 } })).toContain("Jev dudaba (0,85)");
        expect(lineaJev({ jev: { decision: "frena", confianza: 0.97 } })).toBe("Jev frenó el lote (seguro al 0,97).");
        expect(lineaJev({ jev: { decision: "saltado" } })).toContain("saltado");
        expect(lineaJev({ jev: { decision: "sigue", confianza: 0.9 } })).toBeNull();
        expect(lineaJev(null)).toBeNull();
    });

    it("faseVisible conoce todas las fases y no inventa", () => {
        for (const f of ["apagado", "al-dia", "esperando", "ci", "verificando", "publicado", "bloqueado"]) {
            expect(faseVisible(f).texto).not.toBe("Sin datos aún");
        }
        expect(faseVisible("otra").texto).toBe("Sin datos aún");
        expect(faseVisible(undefined).texto).toBe("Sin datos aún");
    });
});

/**
 * (2026-10-08) Alex: «el botón de Publicar Astraura 1.58 (Commits pendientes) no funciona».
 * El medidor manda `pedidoPublicar="astraura"` y el panel abre él solo el diálogo de publicar
 * ese repo; la firma escrita sigue siendo de Alex. Sin commits, lo dice en vez de no hacer nada.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { PanelPublicaciones } from "@/components/mando/panel-publicaciones";

function repo(nombre: string, id: "os" | "astraura", commits: number) {
    return {
        repo: id,
        nombre,
        ruta: "~/x",
        rama: "main",
        remoto: "origin/main",
        base: { sha: "a".repeat(40), corto: "aaaaaaa", fecha: "2026-10-08T10:00:00Z" },
        delante: commits,
        detras: 0,
        remotoMovido: false,
        arbolLimpio: true,
        enjambreEscribiendo: false,
        aviso: null,
        commits: Array.from({ length: commits }, (_, i) => ({
            sha: String(i).repeat(40).slice(0, 40),
            corto: String(i).repeat(7),
            asunto: `cambio ${i}`,
            fecha: "2026-10-08T10:00:00Z",
            autor: "Alex",
            ola: null,
            tarea: null,
            titulo: `cambio ${i}`,
            archivos: 1,
            mas: 0,
        })),
        porOla: [],
        enlaces: { github: null, comparar: null, vercel: null, paquete: null },
    };
}

function servir(astrauraCommits: number) {
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
            if (String(url).startsWith("/api/mando/publicaciones")) {
                return new Response(
                    JSON.stringify({
                        t: "2026-10-08T10:00:00Z",
                        repos: [repo("StarSeed OS", "os", 0), repo("Astraura 1.58", "astraura", astrauraCommits)],
                        bitacora: [],
                        vistaPrevia: { url: "http://localhost:9002", buildCommit: "a".repeat(40), buildT: null, head: "a".repeat(40), atrasado: false, sirviendo: true },
                    }),
                    { status: 200, headers: { "Content-Type": "application/json" } },
                );
            }
            return new Response("{}", { status: 404 });
        }),
    );
}

describe("PanelPublicaciones · pedido desde el medidor", () => {
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it("con pedido «astraura» abre el diálogo de publicar Astraura y avisa de que lo atendió", async () => {
        servir(11);
        const atendido = vi.fn();
        render(<PanelPublicaciones pedidoPublicar="astraura" alAtenderPedido={atendido} />);
        const dialogo = await screen.findByRole("dialog");
        expect(dialogo).toHaveTextContent("Astraura 1.58");
        await waitFor(() => expect(atendido).toHaveBeenCalled());
    });

    it("sin commits pendientes lo dice y no abre nada", async () => {
        servir(0);
        render(<PanelPublicaciones pedidoPublicar="astraura" alAtenderPedido={() => undefined} />);
        expect(await screen.findByText(/no tiene commits pendientes de publicar/)).toBeInTheDocument();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("sin pedido no abre ningún diálogo", async () => {
        servir(11);
        render(<PanelPublicaciones />);
        await waitFor(() => expect(screen.queryByText(/Midiendo los commits pendientes/)).not.toBeInTheDocument());
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
});

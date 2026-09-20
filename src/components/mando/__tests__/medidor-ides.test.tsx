import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PastillaIdes } from "../medidor-ides";

const fetchOriginal = globalThis.fetch;

afterEach(() => {
    cleanup();
    globalThis.fetch = fetchOriginal;
});

describe("PastillaIdes", () => {
    it("con dos IDEs de fixture (uno al día, uno atrasado) muestra '1 atrasado', tono ámbar, abre al click y cierra con Esc", async () => {
        const fixture = {
            detalle: {
                titulo: "IDEs vinculados",
                resumen: "1 de 2 al día",
                filas: [
                    { id: "ide1", titulo: "VS Code", estado: "al día", porque: "sincronizado", puntero: "v1.0" },
                    { id: "ide2", titulo: "Cursor", estado: "atrasado", porque: "hace 2 días", puntero: "v0.9" },
                ],
            },
        };

        globalThis.fetch = (async (url: RequestInfo | URL) => {
            const path = typeof url === "string" ? url : url.toString();
            if (path.includes("/api/mando/ides")) {
                return new Response(JSON.stringify(fixture), { status: 200 });
            }
            return new Response("{}", { status: 404 });
        }) as typeof fetch;

        render(
            <ul>
                <PastillaIdes />
            </ul>,
        );

        // 1. Verifica que la pastilla muestre «1 atrasado» y tono ámbar
        const botonPastilla = await screen.findByRole("button", { name: /IDEs/i });
        expect(botonPastilla).toHaveTextContent("1 atrasado");
        expect(botonPastilla.className).toContain("mc-neon--aviso");

        // 2. Al hacer click aparecen las dos filas
        fireEvent.click(botonPastilla);
        expect(await screen.findByText("VS Code")).toBeInTheDocument();
        expect(screen.getByText("Cursor")).toBeInTheDocument();

        // 3. Esc las cierra
        fireEvent.keyDown(window, { key: "Escape" });
        await waitFor(() => {
            expect(screen.queryByText("VS Code")).not.toBeInTheDocument();
        });
        expect(screen.queryByText("Cursor")).not.toBeInTheDocument();
    });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { PanelIdes, PastillaIdes } from "../medidor-ides";

const fetchOriginal = globalThis.fetch;

afterEach(() => {
    cleanup();
    globalThis.fetch = fetchOriginal;
});

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

function ComponenteConEstado() {
    const [abierto, setAbierto] = useState(false);
    return (
        <div>
            <ul>
                <li>
                    <PastillaIdes abierto={abierto} alPulsar={() => setAbierto((a) => !a)} />
                </li>
            </ul>
            {abierto ? <PanelIdes alCerrar={() => setAbierto(false)} /> : null}
        </div>
    );
}

describe("PastillaIdes y PanelIdes", () => {
    it("PastillaIdes muestra '1 atrasado', tono ámbar, NO lleva col-span-full y llama a alPulsar", async () => {
        globalThis.fetch = (async (url: RequestInfo | URL) => {
            const path = typeof url === "string" ? url : url.toString();
            if (path.includes("/api/mando/ides")) {
                return new Response(JSON.stringify(fixture), { status: 200 });
            }
            return new Response("{}", { status: 404 });
        }) as typeof fetch;

        const alPulsar = vi.fn();
        const { rerender, container } = render(<PastillaIdes abierto={false} alPulsar={alPulsar} />);

        const botonPastilla = await screen.findByRole("button", { name: /IDEs/i });
        expect(botonPastilla).toHaveTextContent("1 atrasado");
        expect(botonPastilla.className).toContain("mc-neon--aviso");
        expect(container.querySelector(".col-span-full")).toBeNull();

        fireEvent.click(botonPastilla);
        expect(alPulsar).toHaveBeenCalledTimes(1);

        rerender(<PastillaIdes abierto={true} alPulsar={alPulsar} />);
        expect(container.querySelector(".col-span-full")).toBeNull();
    });

    it("PanelIdes muestra las filas del fixture, su ✕ llama a alCerrar y Esc llama a alCerrar", async () => {
        globalThis.fetch = (async (url: RequestInfo | URL) => {
            const path = typeof url === "string" ? url : url.toString();
            if (path.includes("/api/mando/ides")) {
                return new Response(JSON.stringify(fixture), { status: 200 });
            }
            return new Response("{}", { status: 404 });
        }) as typeof fetch;

        const alCerrar = vi.fn();
        render(<PanelIdes alCerrar={alCerrar} />);

        expect(await screen.findByText("VS Code")).toBeInTheDocument();
        expect(screen.getByText("Cursor")).toBeInTheDocument();

        const botonCerrar = screen.getByRole("button", { name: "Cerrar" });
        fireEvent.click(botonCerrar);
        expect(alCerrar).toHaveBeenCalledTimes(1);

        fireEvent.keyDown(window, { key: "Escape" });
        expect(alCerrar).toHaveBeenCalledTimes(2);
    });

    it("con dos IDEs de fixture (uno al día, uno atrasado) muestra '1 atrasado', abre al click y cierra con Esc", async () => {
        globalThis.fetch = (async (url: RequestInfo | URL) => {
            const path = typeof url === "string" ? url : url.toString();
            if (path.includes("/api/mando/ides")) {
                return new Response(JSON.stringify(fixture), { status: 200 });
            }
            return new Response("{}", { status: 404 });
        }) as typeof fetch;

        render(<ComponenteConEstado />);

        const botonPastilla = await screen.findByRole("button", { name: /IDEs/i });
        expect(botonPastilla).toHaveTextContent("1 atrasado");

        fireEvent.click(botonPastilla);
        expect(await screen.findByText("VS Code")).toBeInTheDocument();
        expect(screen.getByText("Cursor")).toBeInTheDocument();

        fireEvent.keyDown(window, { key: "Escape" });
        await waitFor(() => {
            expect(screen.queryByText("VS Code")).not.toBeInTheDocument();
        });
        expect(screen.queryByText("Cursor")).not.toBeInTheDocument();
    });
});

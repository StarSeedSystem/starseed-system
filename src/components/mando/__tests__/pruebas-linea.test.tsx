import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { AppearanceProvider } from "@/context/appearance-context";
import { LineaDePruebas as Base } from "../pruebas-linea";

const LineaDePruebas = (p: { alAbrir?: () => void }) => (
    <AppearanceProvider>
        <Base {...p} />
    </AppearanceProvider>
);

const fetchOriginal = globalThis.fetch;
afterEach(() => {
    cleanup();
    globalThis.fetch = fetchOriginal;
});

describe("LineaDePruebas (PRB1111V)", () => {
    it("dice el resumen y lleva al medidor Pruebas", async () => {
        globalThis.fetch = (async () => new Response(JSON.stringify({ resumen: "prueba.40 · compilando" }), { status: 200 })) as typeof fetch;
        const abrir = vi.fn();
        render(<LineaDePruebas alAbrir={abrir} />);
        await waitFor(() => expect(screen.getByTestId("linea-pruebas")).toHaveTextContent("prueba.40 · compilando"));
        fireEvent.click(screen.getByRole("button", { name: "Abrir Pruebas" }));
        expect(abrir).toHaveBeenCalledOnce();
    });
    it("si no se puede leer, la línea sigue llevando a Pruebas", async () => {
        globalThis.fetch = (async () => { throw new Error("sin red"); }) as typeof fetch;
        render(<LineaDePruebas alAbrir={() => {}} />);
        expect(screen.getByTestId("linea-pruebas")).toHaveTextContent(/medidor Pruebas/);
    });
});

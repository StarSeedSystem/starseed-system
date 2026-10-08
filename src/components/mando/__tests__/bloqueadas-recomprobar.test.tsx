/**
 * (2026-10-08) «Recomprobar todas con los directores» en el medidor «Bloqueadas»: manda la acción
 * al servidor y enseña lo que decidieron (cuántas cerradas, reabiertas y por qué siguen otras).
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { BloqueadasPanel, itemDesdeFilaMedidor } from "@/components/mando/bloqueadas-panel";

const filas = [
    { id: "RM3", titulo: "Radar de memoria", estado: "bloqueante", porque: "escalada agotada", acciones: [] },
    { id: "CU3br", titulo: "Cuenta", estado: "bloqueada", porque: "no tocó sus archivos", acciones: [] },
];

describe("BloqueadasPanel · recomprobar todas", () => {
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it("manda «recomprobar-bloqueadas» y enseña el resumen de los directores", async () => {
        const cuerpos: unknown[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (_url: string, init?: RequestInit) => {
                cuerpos.push(JSON.parse(String(init?.body)));
                return new Response(
                    JSON.stringify({ ok: true, resumen: "2 bloqueadas recomprobadas · 1 vuelven a la cola\n· CU3br: falla la propia tarea" }),
                    { status: 200, headers: { "Content-Type": "application/json" } },
                );
            }),
        );
        const alHecho = vi.fn();
        render(<BloqueadasPanel items={filas.map((f) => itemDesdeFilaMedidor(f, filas.map((x) => x.id)))} alHecho={alHecho} />);
        fireEvent.click(screen.getByRole("button", { name: /Recomprobar todas con los directores \(2\)/ }));
        await waitFor(() => expect(cuerpos).toEqual([{ clave: "bloqueadas", accion: "recomprobar-bloqueadas" }]));
        expect(await screen.findByText(/1 vuelven a la cola/)).toBeInTheDocument();
        expect(alHecho).toHaveBeenCalled();
    });

    it("si el servidor falla lo dice, sin inventar un resultado", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(JSON.stringify({ error: "No pude recomprobar las bloqueadas: x" }), { status: 500 })),
        );
        render(<BloqueadasPanel items={filas.map((f) => itemDesdeFilaMedidor(f, filas.map((x) => x.id)))} />);
        fireEvent.click(screen.getByTestId("recomprobar-todas"));
        expect(await screen.findByText(/No pude recomprobar/)).toBeInTheDocument();
    });
});

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { VerificarProcesos, segundosDesde } from "@/components/mando/verificar-procesos";

function reporteDemo() {
    return {
        t: "2026-09-20T12:00:00.000Z",
        veredicto: "Atención: proceso de orquestador caído",
        peor: "fallo",
        puntos: [
            { nombre: "Mando", estado: "ok", dato: "9002 escuchando", porque: "Sin él no hay verificación." },
            { nombre: "Enjambre", estado: "aviso", dato: "sin trabajadores", porque: "Las tareas esperan sin escribir." },
            { nombre: "Orquestador", estado: "fallo", dato: "proceso muerto", porque: "El orquestador python no responde." },
        ],
    };
}

describe("VerificarProcesos · panel flotante del reporte", () => {
    beforeEach(() => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(JSON.stringify(reporteDemo()), { status: 200 })),
        );
    });
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("pinta cada punto con su «por qué» y distingue puntos en rojo, amarillo y verde", async () => {
        render(<VerificarProcesos />);
        fireEvent.click(screen.getByRole("button", { name: /verificar procesos/i }));
        await waitFor(() => expect(screen.getByRole("dialog", { name: /reporte/i })).toBeInTheDocument());
        
        expect(screen.getByText(/orquestador caído/i)).toBeInTheDocument();
        expect(screen.getByText("Sin él no hay verificación.")).toBeInTheDocument();
        expect(screen.getByText("Las tareas esperan sin escribir.")).toBeInTheDocument();
        expect(screen.getByText("El orquestador python no responde.")).toBeInTheDocument();

        const dialog = screen.getByRole("dialog");
        expect(dialog.querySelector(".text-emerald-300")).toBeInTheDocument();
        expect(dialog.querySelector(".text-amber-300")).toBeInTheDocument();
        expect(dialog.querySelector(".text-rose-300")).toBeInTheDocument();

        expect(dialog.className).toContain("absolute");
        expect(dialog.className).toContain("z-30");
    });

    it("«Cerrar» oculta el panel y «Ver último reporte» lo reabre sin volver a pedirlo", async () => {
        render(<VerificarProcesos />);
        fireEvent.click(screen.getByRole("button", { name: /verificar procesos/i }));
        await screen.findByRole("dialog");

        fireEvent.click(screen.getByRole("button", { name: /cerrar reporte/i }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /ver último reporte/i }));
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("Esc y clic fuera cierran el panel", async () => {
        render(
            <div>
                <div data-testid="fuera">Fuera</div>
                <VerificarProcesos />
            </div>
        );
        fireEvent.click(screen.getByRole("button", { name: /verificar procesos/i }));
        await screen.findByRole("dialog");

        fireEvent.mouseDown(screen.getByTestId("fuera"));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /ver último reporte/i }));
        await screen.findByRole("dialog");

        fireEvent.keyDown(document, { key: "Escape" });
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("despliega mensaje de error cuando la API devuelve respuesta no exitosa o falla la red", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(null, { status: 500 })),
        );
        render(<VerificarProcesos />);
        fireEvent.click(screen.getByRole("button", { name: /verificar procesos/i }));
        await waitFor(() => expect(screen.getByText(/respondió 500/i)).toBeInTheDocument());

        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new Error("network error");
            }),
        );
        fireEvent.click(screen.getByRole("button", { name: /verificar procesos/i }));
        await waitFor(() => expect(screen.getByText(/no se pudo verificar/i)).toBeInTheDocument());
    });

    it("segundosDesde cuenta hacia atrás y nunca da negativos ni NaN", () => {
        const t = "2026-09-20T12:00:00.000Z";
        const ahora = new Date("2026-09-20T12:01:30.000Z").getTime();
        expect(segundosDesde(t, ahora)).toBe(90);
        expect(segundosDesde(t, new Date("2026-09-20T11:00:00.000Z").getTime())).toBe(0);
        expect(segundosDesde("no-es-fecha", ahora)).toBe(0);
    });
});

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { VerificarProcesos, segundosDesde } from "@/components/mando/verificar-procesos";

/**
 * Pruebas unitarias para VerificarProcesos y helper puro segundosDesde.
 * 
 * POR QUÉ:
 * 1. La verificación frontend debe probarse sin llamar a /api/mando/verificacion real
 *    para evitar ejecutar comandos del sistema (ps, launchctl, df) durante las pruebas.
 * 2. Muestra el 'por qué' de cada punto y aplica estilos diferenciados (emerald/amber/rose)
 *    para garantizar que los problemas de severidad crítica destaquen visualmente.
 * 3. Garantiza que fetch se ejecuta exactamente una vez y reutiliza el reporte en aperturas subsecuentes.
 */

function reporteDemo() {
    return {
        t: "2026-09-20T12:00:00.000Z",
        veredicto: "Atención: proceso de orquestador caído",
        peor: "fallo" as const,
        puntos: [
            { nombre: "Mando", estado: "ok" as const, dato: "9002 escuchando", porque: "Sin él no hay verificación." },
            { nombre: "Enjambre", estado: "aviso" as const, dato: "sin trabajadores", porque: "Las tareas esperan sin escribir." },
            { nombre: "Orquestador", estado: "fallo" as const, dato: "proceso muerto", porque: "El orquestador python no responde." },
        ],
    };
}

describe("VerificarProcesos · verificación de interfaz y estados", () => {
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

    it("pide la verificación una sola vez al hacer clic y muestra cada punto con su 'por qué' y color", async () => {
        render(<VerificarProcesos />);
        // Inicialmente el botón indica que ejecutará la verificación.
        const boton = screen.getByRole("button", { name: /verificar procesos y generar reporte/i });
        fireEvent.click(boton);

        // Se espera a que abra el modal del reporte.
        await waitFor(() => expect(screen.getByRole("dialog", { name: /reporte de procesos/i })).toBeInTheDocument());

        // Verificamos que se llamó a fetch exactamente una vez.
        expect(fetch).toHaveBeenCalledTimes(1);

        // Verifica que se muestra el veredicto y el 'por qué' de cada punto de control.
        expect(screen.getByText(/orquestador caído/i)).toBeInTheDocument();
        expect(screen.getByText("Sin él no hay verificación.")).toBeInTheDocument();
        expect(screen.getByText("Las tareas esperan sin escribir.")).toBeInTheDocument();
        expect(screen.getByText("El orquestador python no responde.")).toBeInTheDocument();

        // Comprueba la diferenciación de colores por severidad (verde, amarillo, rojo).
        const dialog = screen.getByRole("dialog");
        expect(dialog.querySelector(".text-emerald-300")).toBeInTheDocument();
        expect(dialog.querySelector(".text-amber-300")).toBeInTheDocument();
        expect(dialog.querySelector(".text-rose-300")).toBeInTheDocument();
    });

    it("permite cerrar el reporte y volver a abrirlo sin realizar peticiones redundantes", async () => {
        render(<VerificarProcesos />);
        fireEvent.click(screen.getByRole("button", { name: /verificar procesos y generar reporte/i }));
        await screen.findByRole("dialog");

        // Al presionar Cerrar, el cuadro de diálogo desaparece.
        fireEvent.click(screen.getByRole("button", { name: /cerrar reporte/i }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

        // Al hacer clic en 'Ver último reporte', reabre sin lanzar un nuevo fetch.
        fireEvent.click(screen.getByRole("button", { name: /ver último reporte/i }));
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("cierra el diálogo al hacer clic fuera o presionar la tecla Escape", async () => {
        render(
            <div>
                <div data-testid="fuera">Área Externa</div>
                <VerificarProcesos />
            </div>
        );
        fireEvent.click(screen.getByRole("button", { name: /verificar procesos y generar reporte/i }));
        await screen.findByRole("dialog");

        // Clic fuera de la tarjeta cierra el diálogo. El oyente se engancha en un efecto
        // (después de pintar): con la máquina cargada el primer clic podía llegar antes.
        await waitFor(() => {
            fireEvent.mouseDown(screen.getByTestId("fuera"));
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });

        // Reabrir y verificar que la tecla Escape también lo cierra.
        fireEvent.click(screen.getByRole("button", { name: /ver último reporte/i }));
        await screen.findByRole("dialog");

        await waitFor(() => {
            fireEvent.keyDown(document, { key: "Escape" });
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
    });

    it("muestra mensaje de error si el servidor responde con error o falla la conexión", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(null, { status: 500 })),
        );
        render(<VerificarProcesos />);
        fireEvent.click(screen.getByRole("button", { name: /verificar procesos y generar reporte/i }));
        await waitFor(() => expect(screen.getByText(/respondió 500/i)).toBeInTheDocument());

        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new Error("fallo de red");
            }),
        );
        fireEvent.click(screen.getByRole("button", { name: /verificar procesos y generar reporte/i }));
        await waitFor(() => expect(screen.getByText(/no se pudo verificar/i)).toBeInTheDocument());
    });

    it("calcula los segundos transcurridos correctamente con la función pura segundosDesde", () => {
        const t = "2026-09-20T12:00:00.000Z";
        const ahora = new Date("2026-09-20T12:01:30.000Z").getTime();
        expect(segundosDesde(t, ahora)).toBe(90);
        // Garantiza que no devuelve valores negativos ni NaN con fechas inválidas o futuras.
        expect(segundosDesde(t, new Date("2026-09-20T11:00:00.000Z").getTime())).toBe(0);
        expect(segundosDesde("fecha-invalida", ahora)).toBe(0);
    });
});

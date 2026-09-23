/**
 * «Comprobar ahora» espera a que la comprobación termine y ENSEÑA lo que encontró (2026-09-23).
 *
 * Alex: «no funciona la autoverificación». La comprobación terminaba en 17 s, pero el panel
 * preguntaba una sola vez, justo al lanzarla, veía «sin terminar» y no volvía a preguntar;
 * y aunque hubiera vuelto, solo enseñaba la hora, nunca el veredicto.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PanelMedidor } from "@/components/mando/medidor-abrible";
import type { DetalleMedidor } from "@/lib/mando/medidores";

const detalle: DetalleMedidor = {
    clave: "en-curso",
    titulo: "Tareas en curso",
    resumen: "1 en marcha · 4 agente(s) sobre ellas",
    filas: [],
    acciones: [],
    vacio: "nada",
};

const fetchOriginal = globalThis.fetch;
let lecturas = 0;

beforeEach(() => {
    lecturas = 0;
    globalThis.fetch = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
        const url = String(entrada);
        if (url.startsWith("/api/mando/medidores")) return new Response(JSON.stringify({ detalle }));
        if (url.startsWith("/api/mando/comprobar") && init?.method === "POST") {
            return new Response(JSON.stringify({ lanzado: true }));
        }
        if (url.startsWith("/api/mando/comprobar")) {
            lecturas += 1;
            // Las dos primeras lecturas la ven sin terminar: tiene que seguir preguntando.
            const terminada = lecturas > 2;
            return new Response(
                JSON.stringify({
                    comprobacion: {
                        empezado: "2026-09-23T01:00:00Z",
                        terminado: terminada ? "2026-09-23T01:00:17Z" : null,
                        resumen: "Comprobación de «en-curso» terminada: 1 colgado(s), 1 vivo(s)",
                        veredictos: [
                            { proceso: "Medidor", estado: "vivo", detalle: "contesta" },
                            {
                                proceso: "Agentes medidos",
                                estado: "colgado",
                                detalle: "el medidor dice 0; medido ahora: 0 en la Mac + 4 en la nube = 4 · NO COINCIDEN",
                            },
                        ],
                    },
                }),
            );
        }
        return new Response("{}");
    }) as typeof fetch;
});

afterEach(() => {
    globalThis.fetch = fetchOriginal;
});

describe("Comprobar ahora", () => {
    it("sigue preguntando hasta que termina y enseña cada veredicto", async () => {
        render(<PanelMedidor clave="en-curso" alCerrar={() => undefined} />);
        await screen.findByText("Tareas en curso");
        await userEvent.click(screen.getByRole("button", { name: /Comprobar ahora/ }));
        await waitFor(() => expect(screen.getByTestId("veredictos-comprobacion")).toBeTruthy(), { timeout: 8_000 });
        expect(screen.getByText(/NO COINCIDEN/)).toBeTruthy();
        expect(screen.getByText(/1 colgado\(s\), 1 vivo\(s\)/)).toBeTruthy();
        expect(lecturas).toBeGreaterThan(2);
    }, 12_000);
});

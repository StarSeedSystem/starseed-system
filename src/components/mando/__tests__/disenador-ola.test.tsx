import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { DisenadorOla } from "@/components/mando/disenador-ola";
import type { ColaCompleta } from "@/lib/mando/colas";

const fetchOriginal = globalThis.fetch;

const colaPropuesta: ColaCompleta = {
    nombre: "suenos-2026-09-29",
    archivo: "starseed_memory_root/olas/cola-suenos-2026-09-29.json",
    tareas: [
        {
            id: "SP092928",
            ola: "Ola 125",
            titulo: "Propuesta de la imaginación profunda",
            archivos: ["src/lib/ejemplo.ts"],
            prompt: "Comprueba si sigue haciendo falta; si ya está, NO APLICA.",
            depende: [],
        },
    ],
    modificada: "2026-09-29T00:00:00.000Z",
};

const otraCola: ColaCompleta = {
    nombre: "124",
    archivo: "starseed_memory_root/olas/cola-124.json",
    tareas: [],
    modificada: "2026-10-01T00:00:00.000Z",
};

/** Instala un fetch de pruebas: estado vacío y las dos colas de arriba. */
function instalarFetch(colas: ColaCompleta[]) {
    globalThis.fetch = (async (entrada: RequestInfo | URL) => {
        const url = typeof entrada === "string" ? entrada : entrada.toString();
        if (url.includes("/api/mando/estado")) return new Response("{}", { status: 200 });
        if (url.includes("/api/mando/colas")) {
            return new Response(JSON.stringify({ colas, modelos: [], lanzadorNube: false }), { status: 200 });
        }
        return new Response("{}", { status: 404 });
    }) as typeof fetch;
}

afterEach(() => {
    cleanup();
    globalThis.fetch = fetchOriginal;
});

const noop = () => {};

describe("DisenadorOla · colaInicial (imaginación profunda)", () => {
    it("al importar la cola propuesta, el aviso dice «imaginación profunda» y nunca «imaginación diaria»", async () => {
        instalarFetch([otraCola, colaPropuesta]);
        render(<DisenadorOla onCerrar={noop} colaInicial="suenos-2026-09-29" />);

        const aviso = await screen.findByText(/Importadas 1 tareas de la propuesta de la imaginación profunda \(cola-suenos-2026-09-29\)/);
        expect(aviso).toBeInTheDocument();
        expect(screen.queryByText(/imaginación diaria/)).toBeNull();
        // La sugerencia va aparte del texto: nombre único con el prefijo `suenos-` intacto.
        expect(screen.getByDisplayValue("125-suenos-2026-09-29")).toBeInTheDocument();
    });

    it("sin colaInicial sugiere el siguiente número sin el sufijo de la propuesta", async () => {
        instalarFetch([otraCola]);
        render(<DisenadorOla onCerrar={noop} />);

        expect(await screen.findByDisplayValue("125-nueva")).toBeInTheDocument();
        expect(screen.queryByText(/Importadas/)).toBeNull();
    });
});

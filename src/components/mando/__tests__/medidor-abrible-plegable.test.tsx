/**
 * UIG1029E: las ventanas de los medidores agrupan sus filas por estado en
 * secciones plegables. Cerrada, la sección deja su resumen; el botón dice
 * «Cerrar lista» o «Abrir lista» y conserva el estado por medidor y estado.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { PanelMedidor, agruparFilasPorEstado } from "@/components/mando/medidor-abrible";
import type { DetalleMedidor, FilaMedidor } from "@/lib/mando/medidores";

const filas: FilaMedidor[] = [
    { id: "A1", titulo: "Escribe uno", estado: "escribiendo", acciones: [] },
    { id: "A2", titulo: "Escribe dos", estado: "escribiendo", acciones: [] },
    { id: "A3", titulo: "Espera turno", estado: "pendiente", acciones: [] },
    { id: "A4", titulo: "Sin estado conocido", acciones: [] },
    { id: "A5", titulo: "Cerrada de ayer", estado: "integrada", historica: true, acciones: [] },
];

const detalle: DetalleMedidor = {
    clave: "agentes",
    titulo: "Agentes trabajando",
    resumen: "4 filas",
    filas,
    acciones: [],
    vacio: "Ningún agente está escribiendo ahora mismo.",
};

const fetchOriginal = globalThis.fetch;

beforeEach(() => {
    globalThis.fetch = vi.fn(async (entrada: RequestInfo | URL) => {
        const url = String(entrada);
        if (url.includes("/api/mando/comprobar")) {
            return new Response(JSON.stringify({ comprobacion: null }), { status: 200 });
        }
        return new Response(JSON.stringify({ detalle }), { status: 200 });
    }) as unknown as typeof fetch;
});

afterEach(() => {
    cleanup();
    window.localStorage.clear();
    globalThis.fetch = fetchOriginal;
});

describe("agruparFilasPorEstado", () => {
    it("agrupa por estado, cuenta cada grupo y deja «sin estado» para las filas mudas", () => {
        const grupos = agruparFilasPorEstado(filas.filter((f) => !f.historica));
        expect(grupos.map((g) => g.estado)).toEqual(["escribiendo", "pendiente", "sin estado"]);
        expect(grupos[0].titulo).toBe("Escribiendo");
        expect(grupos[0].resumen).toBe("2 filas en escribiendo");
        expect(grupos[0].filas.map((f) => f.id)).toEqual(["A1", "A2"]);
        expect(grupos[1].resumen).toBe("1 fila en pendiente");
        expect(grupos[2].resumen).toBe("1 fila en sin estado");
    });

    it("pone primero lo que pide atención aunque sea menos numeroso", () => {
        const grupos = agruparFilasPorEstado([
            { id: "B1", titulo: "Espera", estado: "pendiente", acciones: [] },
            { id: "B2", titulo: "Falla", estado: "fallo_tsc", acciones: [] },
            { id: "B3", titulo: "Falla otra", estado: "fallo_tsc", acciones: [] },
        ]);
        expect(grupos.map((g) => g.estado)).toEqual(["fallo_tsc", "pendiente"]);
    });
});

describe("PanelMedidor con secciones plegables", () => {
    it("enseña una sección por estado con su contador y su «Cerrar lista»", async () => {
        render(<PanelMedidor clave="agentes" alCerrar={() => undefined} />);
        await screen.findByText("Agentes trabajando");

        const escribiendo = await screen.findByRole("region", { name: "Escribiendo" });
        expect(within(escribiendo).getByText("Escribe uno")).toBeInTheDocument();
        expect(within(escribiendo).getByText("Escribe dos")).toBeInTheDocument();
        expect(within(escribiendo).getByText("2")).toBeInTheDocument();
        expect(within(escribiendo).getByRole("button", { name: /Cerrar lista/ })).toBeInTheDocument();

        expect(screen.getByRole("region", { name: "Pendiente" })).toBeInTheDocument();
        expect(screen.getByRole("region", { name: "Sin estado" })).toBeInTheDocument();
    });

    it("al cerrar una lista se queda su resumen y se puede volver a abrir", async () => {
        render(<PanelMedidor clave="agentes" alCerrar={() => undefined} />);
        const escribiendo = await screen.findByRole("region", { name: "Escribiendo" });

        fireEvent.click(within(escribiendo).getByRole("button", { name: /Cerrar lista/ }));

        expect(within(escribiendo).queryByText("Escribe uno")).not.toBeInTheDocument();
        expect(within(escribiendo).getByText("2 filas en escribiendo")).toBeInTheDocument();
        const abrir = within(escribiendo).getByRole("button", { name: /Abrir lista/ });
        expect(abrir).toHaveAttribute("aria-expanded", "false");

        fireEvent.click(abrir);
        expect(within(escribiendo).getByText("Escribe uno")).toBeInTheDocument();
        expect(window.localStorage.getItem("starseed.seccion-plegable.medidor-agentes-escribiendo")).toBe(
            "abierta",
        );
    });

    it("las olas cerradas van en su propia sección, cerrada por defecto con el resumen", async () => {
        render(<PanelMedidor clave="agentes" alCerrar={() => undefined} />);
        const cerradas = await screen.findByRole("region", { name: "De olas cerradas" });

        expect(within(cerradas).queryByText("Cerrada de ayer")).not.toBeInTheDocument();
        expect(within(cerradas).getByText("1 fila de olas cerradas")).toBeInTheDocument();
        const abrir = within(cerradas).getByRole("button", { name: /Abrir lista/ });
        expect(abrir).toHaveAttribute("aria-expanded", "false");

        fireEvent.click(abrir);
        await waitFor(() => expect(within(cerradas).getByText("Cerrada de ayer")).toBeInTheDocument());
    });
});

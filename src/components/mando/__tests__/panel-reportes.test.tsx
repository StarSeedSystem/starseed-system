import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

import { PanelReportes } from "../panel-reportes";
import type { Reporte } from "@/lib/mando/reportes";

// Reportes de fábrica: cada uno fuerza un camino del filtrado.
function reporte(parcial: Partial<Reporte> & Pick<Reporte, "id">): Reporte {
    return {
        t: "2026-09-14T10:00:00Z",
        clase: "cambio",
        importancia: "normal",
        relevancia: 50,
        titulo: `Reporte ${parcial.id}`,
        contexto: "Contexto completo en prosa.",
        enlaces: [],
        pruebas: [],
        ...parcial,
    };
}

const BANDEJA: Reporte[] = [
    reporte({
        id: "espera-1",
        clase: "espera",
        importancia: "critica",
        relevancia: 90,
        titulo: "Tarea zN4 espera aprobación",
        contexto: "La tarea zN4 necesita una decisión de una persona.",
        ola: "zN4",
        enlaces: [{ clase: "local", texto: "Abrir en localhost", url: "http://localhost:9002/mando" }],
    }),
    reporte({
        id: "cambio-1",
        clase: "cambio",
        importancia: "normal",
        relevancia: 40,
        titulo: "Commit integrado: panel de voz",
        contexto: "Toca 2 archivos en src/components/mando.",
        enlaces: [
            { clase: "diff", texto: "Diff a1b2c3d", url: "https://github.com/x/commit/a1b2c3d" },
            { clase: "local", texto: "Probar /voz", url: "http://localhost:9002/voz" },
        ],
    }),
    reporte({
        id: "nota-1",
        clase: "nota",
        importancia: "baja",
        relevancia: 10,
        titulo: "Nota menor del enjambre",
    }),
];

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

/** Simula la API local con la bandeja dada. */
function simularApi(lista: Reporte[]) {
    vi.stubGlobal("fetch", vi.fn(async () =>
        new Response(JSON.stringify({ reportes: lista }), { status: 200 }),
    ));
}

describe("PanelReportes", () => {
    it("pinta los reportes que llegan de /api/mando/reportes", async () => {
        simularApi(BANDEJA);
        render(<PanelReportes />);
        expect(await screen.findByText("Tarea zN4 espera aprobación")).toBeInTheDocument();
        expect(screen.getByText("Commit integrado: panel de voz")).toBeInTheDocument();
        expect(screen.getByText("Nota menor del enjambre")).toBeInTheDocument();
    });

    it("subir el umbral de relevancia esconde los de menos puntos", async () => {
        simularApi(BANDEJA);
        render(<PanelReportes />);
        await screen.findByText("Tarea zN4 espera aprobación");
        const deslizador = screen.getByRole("slider", { name: /relevancia mínima/i });
        // Umbral en 50: solo queda el de relevancia 90.
        // (fireEvent basta: es un input nativo; no hace falta interacción de puntero.)
        const { fireEvent } = await import("@testing-library/react");
        fireEvent.change(deslizador, { target: { value: "50" } });
        expect(screen.queryByText("Commit integrado: panel de voz")).not.toBeInTheDocument();
        expect(screen.queryByText("Nota menor del enjambre")).not.toBeInTheDocument();
        expect(screen.getByText("Tarea zN4 espera aprobación")).toBeInTheDocument();
        // El vacío honesto cuenta lo escondido.
        expect(screen.getByText(/2 reportes quedan por debajo de los filtros/)).toBeInTheDocument();
    });

    it("el filtro de importancia «Críticas» deja solo las críticas", async () => {
        simularApi(BANDEJA);
        const usuario = userEvent.setup();
        render(<PanelReportes />);
        await screen.findByText("Tarea zN4 espera aprobación");
        const boton = screen.getByRole("button", { name: /Críticas/ });
        expect(boton).toHaveAttribute("aria-pressed", "false");
        await usuario.click(boton);
        expect(boton).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByText("Tarea zN4 espera aprobación")).toBeInTheDocument();
        expect(screen.queryByText("Commit integrado: panel de voz")).not.toBeInTheDocument();
        expect(screen.queryByText("Nota menor del enjambre")).not.toBeInTheDocument();
    });

    it("los enlaces de una tarjeta se abren en pestaña nueva", async () => {
        simularApi([BANDEJA[1]]);
        render(<PanelReportes />);
        const diff = await screen.findByRole("link", { name: /Diff a1b2c3d/ });
        expect(diff).toHaveAttribute("target", "_blank");
        expect(diff).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
        const local = screen.getByRole("link", { name: /Probar \/voz/ });
        expect(local).toHaveAttribute("target", "_blank");
    });

    it("con todos filtrados, dice cuántos quedan por debajo (vacío honesto)", async () => {
        simularApi([BANDEJA[2]]);
        render(<PanelReportes />);
        await screen.findByText("Nota menor del enjambre");
        const { fireEvent } = await import("@testing-library/react");
        fireEvent.change(screen.getByRole("slider", { name: /relevancia mínima/i }), { target: { value: "60" } });
        await waitFor(() => {
            expect(screen.getByText(/quedan por debajo del umbral/)).toBeInTheDocument();
        });
    });
});

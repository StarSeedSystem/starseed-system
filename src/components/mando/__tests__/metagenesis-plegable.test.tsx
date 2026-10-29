/**
 * UIG1029F: los paneles propios de MetaGenesis que quedaban abiertos también se
 * pliegan. Medios de cómputo y el reporte de procesos conservan su cabecera y su
 * cierre, y su detalle se recoge a una línea con el resumen a la vista.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { BotonMedios } from "@/components/mando/medios-computo";
import { VerificarProcesos } from "@/components/mando/verificar-procesos";
import type { ResumenMedios } from "@/lib/mando/medios-computo";

const medios: ResumenMedios = {
    generado: "2026-10-29T10:00:00.000Z",
    medios: [
        { id: "mac", nombre: "MacBook Pro Alex", estado: "listo", capacidad: "3 agentes · 8 GB", detalle: "Local", siguiente_paso: "" },
        { id: "oracle", nombre: "Oracle Free Tier", estado: "usable", capacidad: "3 OCPU · 16 GB", detalle: "Nube", siguiente_paso: "ssh ubuntu@oracle" },
        { id: "vps", nombre: "VPS Alex", estado: "requiere_alex", capacidad: "4 vCPU · 16 GB", detalle: "Falta SSH", siguiente_paso: "preparar.sh" },
        { id: "hf", nombre: "HuggingFace Space", estado: "no_disponible", capacidad: "0 agentes", detalle: "PRO", siguiente_paso: "" },
    ],
    resumen: { listos: 1, usables: 1, porHacer: 2, agentesAhora: 3 },
};

const reporte = {
    t: "2026-10-29T10:00:00.000Z",
    veredicto: "Atención: proceso de orquestador caído",
    peor: "fallo" as const,
    puntos: [
        { nombre: "Genesis", estado: "ok" as const, dato: "9002 escuchando", porque: "Sin él no hay verificación." },
        { nombre: "Enjambre", estado: "aviso" as const, dato: "sin trabajadores", porque: "Las tareas esperan sin escribir." },
        { nombre: "Orquestador", estado: "fallo" as const, dato: "proceso muerto", porque: "El orquestador python no responde." },
    ],
};

beforeEach(() => {
    vi.stubGlobal(
        "fetch",
        vi.fn(async (entrada: RequestInfo | URL) => {
            const url = String(entrada);
            if (url.includes("/api/mando/medios")) {
                return new Response(JSON.stringify(medios), { status: 200 });
            }
            return new Response(JSON.stringify(reporte), { status: 200 });
        }),
    );
});

afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("Paneles plegables de MetaGenesis", () => {
    it("los medios de cómputo se pliegan y dejan el conteo a la vista", async () => {
        render(<BotonMedios />);
        fireEvent.click(screen.getByRole("button", { name: /comprobar medios/i }));
        await screen.findByRole("dialog");

        const seccion = await screen.findByRole("region", { name: "Medios disponibles" });
        expect(within(seccion).queryByText("MacBook Pro Alex")).not.toBeInTheDocument();
        expect(within(seccion).getByText(/1 listos · 1 usables · 2 por preparar/i)).toBeInTheDocument();

        fireEvent.click(within(seccion).getByRole("button", { name: /abrir lista/i }));
        expect(within(seccion).getByText("MacBook Pro Alex")).toBeInTheDocument();

        fireEvent.click(within(seccion).getByRole("button", { name: /cerrar lista/i }));
        expect(within(seccion).queryByText("MacBook Pro Alex")).not.toBeInTheDocument();
        expect(window.localStorage.getItem("starseed.seccion-plegable.mando.medios-computo")).toBe("cerrada");
    });

    it("el reporte de procesos se pliega sin perder el veredicto ni su cierre", async () => {
        render(<VerificarProcesos />);
        fireEvent.click(screen.getByRole("button", { name: /verificar procesos y generar reporte/i }));
        const dialogo = await screen.findByRole("dialog", { name: /reporte de procesos/i });
        const seccion = within(dialogo).getByRole("region", { name: "Puntos verificados" });

        expect(within(seccion).getByText("Genesis")).toBeInTheDocument();
        fireEvent.click(within(seccion).getByRole("button", { name: /cerrar lista/i }));

        expect(within(seccion).queryByText("Genesis")).not.toBeInTheDocument();
        expect(within(seccion).getByText(/orquestador caído/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /cerrar reporte/i })).toBeInTheDocument();
        expect(window.localStorage.getItem("starseed.seccion-plegable.mando.verificar-procesos")).toBe("cerrada");
    });
});

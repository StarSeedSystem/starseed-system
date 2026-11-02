/**
 * IMG1102D · el filtro de entrada de Astraura se ve en el medidor: función pura que lo interpreta
 * (del `propuestas.json → filtro_astraura` que escribe el director) y la línea pintada en el panel.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { PanelImaginacion } from "@/components/mando/panel-imaginacion";
import { AJUSTES_POR_DEFECTO, filtroAstraura, type PropuestaNormalizada } from "@/lib/mando/imaginacion-tipos";

const HOY = new Date(2026, 10, 2, 10, 0); // 02-11-2026, reloj por parámetro
const crudo = {
    fecha: "2026-11-02", tope_dia: 3, ventana_dias: 7, vistas: 12, entran: 8,
    filtradas: { "familia repetida": 303, "tipo de archivo": 320, tope: 59 },
    autorizacion_inventada: 2, por_id: { a: "entra" },
};

describe("filtroAstraura (pura)", () => {
    it("interpreta lo del disco: cuenta por motivo y una línea lista para el medidor", () => {
        expect(filtroAstraura(crudo, HOY)).toEqual({
            fecha: "2026-11-02", hoy: true, vistas: 12, entran: 8,
            filtradas: { "familia repetida": 303, "tipo de archivo": 320, tope: 59 },
            autorizacionInventada: 2,
            linea: "Filtradas de Astraura hoy: 682 (familia 303 · tipo 320 · tope 59)",
        });
    });
    it("otro día no cuenta como hoy; lo que falta o no es número es 0; lo malo es null", () => {
        const v = filtroAstraura({ ...crudo, fecha: "2026-11-01", filtradas: {} }, HOY);
        expect(v?.hoy).toBe(false);
        expect(v?.filtradas).toEqual({ "familia repetida": 0, "tipo de archivo": 0, tope: 0 });
        expect(filtroAstraura({ fecha: "   " }, HOY)).toBeNull();
        expect(filtroAstraura(null, HOY)).toBeNull();
        expect(filtroAstraura([crudo], HOY)).toBeNull();
    });
});

describe("PanelImaginacion · la línea del filtro", () => {
    const prop: PropuestaNormalizada = {
        id: "p", fuente: "agentes", titulo: "Propuesta", cuerpo: "", archivos: [], utilidad: 0.7, importancia: "media",
        estado: "esperando-aprobacion", motivo: "", t: HOY.toISOString(), tipo: "codigo", ambito: "metagenesis", referencias: [], version: 1,
    };
    const panel = (filtro: unknown) => {
        cleanup();
        // La ruta interpreta ANTES de mandar: al panel llega ya la interpretada (con `hoy` y `linea`).
        const datos = { propuestas: [prop], ajustes: AJUSTES_POR_DEFECTO, filtroAstraura: filtro };
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(JSON.stringify(datos), { status: 200, headers: { "Content-Type": "application/json" } })),
        );
        render(<PanelImaginacion ambito="metagenesis" />);
        return waitFor(() => screen.getByTestId("panel-imaginacion"));
    };
    it("de hoy se pinta; de otro día no", async () => {
        const deHoy = filtroAstraura(crudo, HOY);
        expect(deHoy).not.toBeNull();
        await panel(deHoy);
        expect(screen.getByTestId("imaginacion-filtro-astraura")).toHaveTextContent("Filtradas de Astraura hoy: 682 (familia 303 · tipo 320 · tope 59)");
        cleanup();
        await panel(filtroAstraura({ ...crudo, fecha: "2026-01-02" }, HOY));
        expect(screen.queryByTestId("imaginacion-filtro-astraura")).toBeNull();
    });
    it("sin filtro en la respuesta no rompe", async () => {
        await panel(undefined);
        expect(screen.queryByTestId("imaginacion-filtro-astraura")).toBeNull();
    });
});


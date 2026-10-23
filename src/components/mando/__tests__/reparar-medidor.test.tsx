/**
 * «Reparar» junto a «Comprobar ahora» (2026-10-23). Alex: «agrega un botón de reparar junto al de
 * comprobar en los medidores… aun así agrégalo para poder hacerlo manualmente».
 * El botón lanza la reparación, pregunta hasta que termina y enseña qué hizo cada acción; y la
 * última reparación de los directores se ve al abrir el medidor.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PanelMedidor } from "@/components/mando/medidor-abrible";
import type { DetalleMedidor } from "@/lib/mando/medidores";
import { reparacionVigente, tonoReparacion } from "@/lib/mando/reparacion-tipos";

const detalle: DetalleMedidor = {
    clave: "agentes",
    titulo: "Agentes",
    resumen: "6 en total",
    filas: [],
    acciones: [],
    vacio: "nada",
};

const fetchOriginal = globalThis.fetch;
let lecturas = 0;
let lanzadas = 0;
let previa: unknown = null;

function terminada(origen = "boton") {
    return {
        medidor: "agentes",
        origen,
        empezado: new Date(Date.now() - 30_000).toISOString(),
        terminado: new Date(Date.now() - 2_000).toISOString(),
        resultado: "reparado",
        resumen: "«agentes» reparado · 2 de 2 acción(es) bien · ahora: todos vivos",
        acciones: [
            { accion: "enjambre", titulo: "Curar el enjambre", por_que: "x", ok: true, resultado: "orden de refrescar" },
            { accion: "carril_nube", titulo: "Devolver sesiones", por_que: "x", ok: false, resultado: "no terminó en 170 s" },
        ],
    };
}

beforeEach(() => {
    lecturas = 0;
    lanzadas = 0;
    previa = null;
    globalThis.fetch = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
        const url = String(entrada);
        if (url.startsWith("/api/mando/medidores")) return new Response(JSON.stringify({ detalle }));
        if (url.startsWith("/api/mando/reparar") && init?.method === "POST") {
            lanzadas += 1;
            return new Response(JSON.stringify({ lanzado: true }));
        }
        if (url.startsWith("/api/mando/reparar")) {
            if (!lanzadas) return new Response(JSON.stringify({ reparacion: previa }));
            lecturas += 1;
            const r = lecturas > 2 ? terminada() : { medidor: "agentes", empezado: new Date().toISOString(),
                terminado: null, resumen: "Reparando…", paso: "reparando: Curar el enjambre", acciones: [] };
            return new Response(JSON.stringify({ reparacion: r }));
        }
        if (url.startsWith("/api/mando/comprobar")) return new Response(JSON.stringify({ comprobacion: null }));
        return new Response("{}");
    }) as typeof fetch;
});

afterEach(() => {
    cleanup();
    globalThis.fetch = fetchOriginal;
});

describe("Reparar", () => {
    it("está junto a «Comprobar ahora», sigue preguntando y enseña cada acción", async () => {
        render(<PanelMedidor clave="agentes" alCerrar={() => undefined} />);
        await screen.findByText("Agentes");
        expect(screen.getByRole("button", { name: /Comprobar ahora/ })).toBeTruthy();
        await userEvent.click(screen.getByRole("button", { name: /Reparar/ }));
        expect(await screen.findByTestId("reparacion-en-curso")).toBeTruthy();
        await waitFor(() => expect(screen.getByTestId("resultado-reparacion")).toBeTruthy(), { timeout: 9_000 });
        expect(screen.getByText(/reparado · 2 de 2/)).toBeTruthy();
        expect(screen.getByText(/✓ Curar el enjambre: orden de refrescar/)).toBeTruthy();
        expect(screen.getByText(/✗ Devolver sesiones: no terminó/)).toBeTruthy();
        expect(screen.getByText(/por ti$/)).toBeTruthy();
        expect(lanzadas).toBe(1);
        expect(lecturas).toBeGreaterThan(2);
    }, 14_000);

    it("al abrir enseña la última reparación de los directores", async () => {
        previa = terminada("directores");
        render(<PanelMedidor clave="agentes" alCerrar={() => undefined} />);
        await waitFor(() => expect(screen.getByTestId("resultado-reparacion")).toBeTruthy(), { timeout: 4_000 });
        expect(screen.getByText(/los directores \(automática\)/)).toBeTruthy();
        expect(lanzadas).toBe(0);
    });
});

describe("reparacion-tipos", () => {
    it("tono y vigencia", () => {
        expect(tonoReparacion("reparado")).toBe("ok");
        expect(tonoReparacion("sigue")).toBe("peligro");
        expect(tonoReparacion("mejorado")).toBe("aviso");
        expect(reparacionVigente({ terminado: new Date(Date.now() - 61 * 60_000).toISOString() })).toBe(false);
        expect(reparacionVigente({ terminado: new Date().toISOString() })).toBe(true);
        expect(reparacionVigente({ terminado: null })).toBe(false);
    });
});

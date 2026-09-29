import * as React from "react";
import { act, cleanup, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
    contadores: { porRuta: {} as Record<string, { n: number; bytes: number }>, total: 0, frenos: 0, corteHasta: null as number | null, hoy: 0, presupuestoDia: 8000, bloqueadas: 0, frenoLocalHasta: null, frenoRemoto: false },
    aviso: { corte: false, corteHasta: null, frenoLocalHasta: null, diaAgotado: false },
}));
vi.mock("next/link", () => ({ default: ({ href, children, prefetch: _p, ...r }: any) => <a href={String(href)} {...r}>{children}</a> }));
vi.mock("@/lib/consumo/guardian", () => ({ leerContadores: () => h.contadores, leerAvisoConsumo: () => h.aviso, suscribirConsumo: () => () => {} }));
vi.mock("@/lib/consumo/freno", () => ({ useFreno: () => ({ activo: false, motivo: null, hasta: null }) }));

import { entornoNavegador, montarEn, TODAS } from "../pruebas-render";
import { nombreRuta, saludDe } from "../telemetria";
import { LiveDataWidget } from "../../live-data-widget";

beforeAll(entornoNavegador);
beforeEach(() => {
    h.contadores = { porRuta: {}, total: 0, frenos: 0, corteHasta: null, hoy: 0, presupuestoDia: 8000, bloqueadas: 0, frenoLocalHasta: null, frenoRemoto: false };
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});
afterEach(cleanup);

const red = (x: Partial<{ enLinea: boolean; latenciaMs: number | null }> = {}) => ({ enLinea: true, tipo: "4g", bajadaMbps: 10, latenciaMs: 80, ahorro: false, ...x });
const nube = (x: Record<string, unknown> = {}) => ({ hoy: 100, presupuesto: 8000, pestana: 10, bloqueadas: 0, frenos: 0, corteHasta: null, frenoRemoto: false, diaAgotado: false, rutas: [], ...x }) as any;

describe("telemetría pura", () => {
    it("el semáforo dice la verdad", () => {
        expect(saludDe(red(), nube()).nivel).toBe("bien");
        expect(saludDe(red({ enLinea: false }), nube()).texto).toBe("Sin conexión");
        expect(saludDe(red(), nube({ corteHasta: Date.now() + 60_000 })).nivel).toBe("mal");
        expect(saludDe(red(), nube({ hoy: 6000 })).texto).toMatch(/75 %/);
        expect(saludDe(red({ latenciaMs: 900 }), nube()).texto).toBe("Red lenta");
    });
    it("acorta las rutas de Supabase", () => {
        expect(nombreRuta("/rest/v1/os_mesh_relay")).toBe("os_mesh_relay");
        expect(nombreRuta("/rest/v1/rpc/merge_user_prefs")).toBe("merge_user_prefs");
        expect(nombreRuta("/auth/v1/user")).toBe("user");
    });
});

describe("Telemetría de esta neurona", () => {
    it.each(TODAS)("se pinta en %s", async (clase) => {
        let r!: ReturnType<typeof montarEn>;
        await act(async () => { r = montarEn(clase, <LiveDataWidget />); });
        expect(r.container.querySelector("[data-widget-e='LIVE_DATA']")?.getAttribute("data-clase")).toBe(clase);
    });

    it("sin peticiones lo dice y no inventa latencia si el navegador no la da", async () => {
        await act(async () => { montarEn("l", <LiveDataWidget />); });
        expect(screen.getByText(/aún no ha pedido nada a la nube/)).toBeTruthy();
        expect(screen.getAllByText("sin dato").length).toBeGreaterThan(0);
    });

    it("enseña las rutas que más piden y el presupuesto real de hoy", async () => {
        h.contadores = { ...h.contadores, hoy: 4000, total: 42, porRuta: { "/rest/v1/os_pages": { n: 30, bytes: 1 }, "/auth/v1/user": { n: 12, bytes: 1 } } };
        await act(async () => { montarEn("l", <LiveDataWidget />); });
        expect(screen.getByRole("img", { name: "Peticiones a la nube hoy: 4000 de 8000" })).toBeTruthy();
        expect(screen.getByText("os_pages")).toBeTruthy();
        expect(screen.getByText("50 %")).toBeTruthy();
    });
});

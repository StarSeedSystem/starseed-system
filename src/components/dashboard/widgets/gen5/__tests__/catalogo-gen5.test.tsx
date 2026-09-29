import * as React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaseTamano } from "@/lib/widgets/forma/tamanos";

// ── Tamaño medido forzado (el marco publica la clase; aquí también la medida) ──
let medida = { width: 380, height: 325 };
vi.mock("@/components/dashboard/kit/use-element-size", () => ({
    useElementSize: () => ({ ref: { current: null }, size: { ...medida, tier: "regular", vTier: "regular", landscape: true } }),
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: any) => <a href={String(href)} {...r}>{children}</a> }));
let ubicacion: any = null;
vi.mock("@/modules/weather/context/weather-location-context", () => ({
    useWeatherLocationOpcional: () => ubicacion,
    WeatherLocationProvider: ({ children }: any) => children,
}));

import { EnMarco, MEDIDAS } from "../_catalogo/prueba-marco";
import { FlowDirectorWidget } from "../flow-director-widget";
import { QUICK_TASKS_KEY } from "@/lib/tasks/quick-tasks";
import { CLAVE_SESION } from "../flow-director-partes";

function pintar(ui: React.ReactElement, clase: ClaseTamano) {
    medida = MEDIDAS[clase];
    return render(<EnMarco clase={clase}>{ui}</EnMarco>);
}

beforeEach(() => { localStorage.clear(); ubicacion = null; });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Director de Flujo", () => {
    it.each(["micro", "s", "m", "l", "xl", "panoramico", "torre"] as ClaseTamano[])("se pinta en %s sin romperse y con nombre accesible", (clase) => {
        pintar(<FlowDirectorWidget />, clase);
        expect(screen.getByRole("region").getAttribute("aria-label")).toMatch(/Director de flujo/);
    });
    it("sin bloques hoy lo dice y ofrece empezar; al empezar guarda la sesión con la tarea preferida", () => {
        localStorage.setItem(QUICK_TASKS_KEY, JSON.stringify({ v: 1, items: [
            { id: "t1", text: "Revisar propuesta", done: false, createdAt: 1 },
            { id: "t2", text: "Regar el huerto", done: false, createdAt: 2, priority: "alta" },
        ] }));
        pintar(<FlowDirectorWidget />, "xl");
        expect(screen.getByText(/registro vacío/)).toBeTruthy();
        expect(screen.getByText("Regar el huerto")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /Empezar 25 minutos de enfoque/ }));
        const s = JSON.parse(localStorage.getItem(CLAVE_SESION)!);
        expect(s.modo).toBe("enfoque");
        expect(s.duracionMs).toBe(25 * 60_000);
        expect(s.tareaTexto).toBe("Regar el huerto");
        expect(screen.getByRole("button", { name: /Pausar la sesión/ })).toBeTruthy();
        expect(screen.getByText("25:00")).toBeTruthy();
    });
    it("en micro la esfera entera es el botón de empezar/pausar", () => {
        pintar(<FlowDirectorWidget />, "micro");
        fireEvent.click(screen.getByRole("button", { name: /Empezar 25 minutos/ }));
        expect(screen.getByRole("button", { name: /Pausar la sesión/ })).toBeTruthy();
    });
    it("al terminar el bloque lo anota y ofrece marcar la tarea y descansar", () => {
        vi.useFakeTimers();
        localStorage.setItem(QUICK_TASKS_KEY, JSON.stringify({ v: 1, items: [{ id: "t1", text: "Escribir el acta", done: false, createdAt: 1 }] }));
        pintar(<FlowDirectorWidget />, "l");
        fireEvent.click(screen.getByRole("button", { name: /Empezar 25 minutos/ }));
        act(() => { vi.advanceTimersByTime(25 * 60_000 + 1000); });
        expect(screen.getByText(/Bloque completado/)).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /Marcar «Escribir el acta» como hecha/ }));
        const tareas = JSON.parse(localStorage.getItem(QUICK_TASKS_KEY)!).items;
        expect(tareas[0].done).toBe(true);
        expect(screen.getAllByText(/25 min/).length).toBeGreaterThan(0);
    });
    it("con ubicación dibuja la luz del día real (orto/ocaso)", () => {
        ubicacion = { location: { lat: 40.4, lon: -3.7, name: "Madrid" } };
        pintar(<FlowDirectorWidget />, "l");
        expect(screen.getByText(/de luz|Amanece|Sin orto/)).toBeTruthy();
    });
});

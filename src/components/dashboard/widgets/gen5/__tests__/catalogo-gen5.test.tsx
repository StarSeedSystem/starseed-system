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
import { ProjectSwarmWidget } from "../project-swarm-widget";
import { IdeaForgeWidget } from "../idea-forge-widget";
import { QUICK_NOTES_KEY } from "@/lib/notes/quick-notes";
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

const tareas = (items: any[]) => localStorage.setItem(QUICK_TASKS_KEY, JSON.stringify({ v: 1, items }));
const leerTareas = () => JSON.parse(localStorage.getItem(QUICK_TASKS_KEY)!).items as any[];

describe("Enjambre de Propósitos", () => {
    it.each(["micro", "s", "m", "l", "xl", "panoramico", "torre"] as ClaseTamano[])("en %s pinta el vacío honesto sin romperse", (clase) => {
        pintar(<ProjectSwarmWidget />, clase);
        expect(screen.getByRole("region").getAttribute("aria-label")).toMatch(/Enjambre de propósitos/);
        if (clase !== "micro") expect(screen.getByText("Aún no tienes proyectos")).toBeTruthy();
    });
    it("una tarea con #etiqueta crea el proyecto y aparece en el panal", () => {
        pintar(<ProjectSwarmWidget />, "l");
        fireEvent.change(screen.getByRole("textbox"), { target: { value: "Preparar semilleros #huerto" } });
        fireEvent.submit(screen.getByRole("textbox").closest("form")!);
        expect(leerTareas()[0].text).toBe("Preparar semilleros #huerto");
        expect(screen.getByRole("button", { name: /#huerto: 0 de 1 tareas hechas/ })).toBeTruthy();
    });
    it("sin #etiqueta y sin proyectos avisa en vez de crear una tarea suelta", () => {
        pintar(<ProjectSwarmWidget />, "m");
        fireEvent.change(screen.getByRole("textbox"), { target: { value: "Algo sin etiqueta" } });
        fireEvent.submit(screen.getByRole("textbox").closest("form")!);
        expect(screen.getByRole("alert").textContent).toMatch(/#nombre/);
        expect(localStorage.getItem(QUICK_TASKS_KEY)).toBeNull();
    });
    it.each(["m", "l", "xl", "panoramico", "torre", "s", "micro"] as ClaseTamano[])("con proyectos se pinta en %s", (clase) => {
        tareas([{ id: "a", text: "Riego #huerto", done: false, createdAt: 1 }, { id: "b", text: "Compost #huerto", done: true, createdAt: 2 }]);
        pintar(<ProjectSwarmWidget />, clase);
        expect(screen.getByRole("region").getAttribute("aria-label")).toMatch(/1 proyectos|#huerto va al 50/);
    });
    it("elige un proyecto, completa su siguiente tarea y añade otra con su etiqueta", () => {
        tareas([
            { id: "a", text: "Riego #huerto", done: false, createdAt: 1 },
            { id: "b", text: "Acta #asamblea", done: false, createdAt: 3 },
            { id: "c", text: "Convocar #asamblea", done: true, createdAt: 2, doneAt: 5 },
        ]);
        pintar(<ProjectSwarmWidget />, "xl");
        fireEvent.click(screen.getByRole("button", { name: /#huerto: 0 de 1/ }));
        fireEvent.click(screen.getByRole("button", { name: "Completar la próxima tarea: Riego" }));
        expect(leerTareas().find((t) => t.id === "a").done).toBe(true);
        fireEvent.change(screen.getByRole("textbox"), { target: { value: "Comprar mangueras" } });
        fireEvent.submit(screen.getByRole("textbox").closest("form")!);
        expect(leerTareas()[0].text).toBe("Comprar mangueras #huerto");
        const proponer = screen.getByRole("link", { name: /Proponer #huerto a la red/ });
        expect(proponer.getAttribute("href")).toMatch(/^\/decisiones\?nueva=1&title=Proyecto/);
    });
});

const leerNotas = () => (JSON.parse(localStorage.getItem(QUICK_NOTES_KEY) || '{"items":[]}').items as any[]);

describe("Incubadora de Quimeras", () => {
    it.each(["micro", "s", "m", "l", "xl", "panoramico", "torre"] as ClaseTamano[])("se pinta en %s con la chispa del día", (clase) => {
        pintar(<IdeaForgeWidget />, clase);
        expect(screen.getByRole("region").getAttribute("aria-label")).toMatch(/Incubadora de quimeras: chispa de hoy .+ por .+\. 0 ideas/);
    });
    it("apunta una idea en las Notas con #idea y la lleva a la red como propuesta", () => {
        pintar(<IdeaForgeWidget />, "xl");
        expect(screen.getByText(/bloc vacío/)).toBeTruthy();
        fireEvent.change(screen.getByRole("textbox", { name: /Nueva idea/ }), { target: { value: "Biblioteca de semillas en cada plaza" } });
        fireEvent.submit(screen.getByRole("textbox", { name: /Nueva idea/ }).closest("form")!);
        expect(leerNotas()[0].text).toBe("Biblioteca de semillas en cada plaza #idea");
        expect(screen.getByText(/Guardada en tus Notas/)).toBeTruthy();
        const enlace = screen.getByRole("link", { name: /Proponer a la red: Biblioteca de semillas en cada plaza/ });
        expect(enlace.getAttribute("href")).toContain("/decisiones?nueva=1");
        expect(decodeURIComponent(enlace.getAttribute("href")!.replace(/\+/g, " "))).toContain("title=Biblioteca de semillas en cada plaza");
    });
    it("guardar la chispa, anclar y borrar con deshacer", () => {
        pintar(<IdeaForgeWidget />, "xl");
        fireEvent.click(screen.getByRole("button", { name: "Guardar esta chispa como idea" }));
        expect(leerNotas()).toHaveLength(1);
        expect(leerNotas()[0].text).toMatch(/ × .+: .+ #idea$/);
        fireEvent.click(screen.getByRole("button", { name: /^Anclar:/ }));
        expect(leerNotas()[0].pinned).toBe(true);
        fireEvent.click(screen.getByRole("button", { name: /^Borrar:/ }));
        expect(leerNotas()).toHaveLength(0);
        fireEvent.click(screen.getByRole("button", { name: /Deshacer el borrado/ }));
        expect(leerNotas()).toHaveLength(1);
    });
    it("las notas sin #idea no cuentan como ideas", () => {
        localStorage.setItem(QUICK_NOTES_KEY, JSON.stringify({ v: 1, items: [{ id: "a", text: "Comprar pan", createdAt: 1, updatedAt: 1 }] }));
        pintar(<IdeaForgeWidget />, "l");
        expect(screen.getByRole("region").getAttribute("aria-label")).toMatch(/0 ideas/);
    });
    it("barajar cambia la chispa", () => {
        pintar(<IdeaForgeWidget />, "m");
        const antes = screen.getByRole("region").getAttribute("aria-label");
        let distinta = false;
        for (let i = 0; i < 4 && !distinta; i++) {
            fireEvent.click(screen.getByRole("button", { name: "Barajar otra chispa" }));
            distinta = screen.getByRole("region").getAttribute("aria-label") !== antes;
        }
        expect(distinta).toBe(true);
    });
});

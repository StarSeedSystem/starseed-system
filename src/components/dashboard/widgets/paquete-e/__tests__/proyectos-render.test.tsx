import * as React from "react";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
    uid: "u1" as string | null,
    proyectos: [] as any[],
    tareas: [] as any[],
    fallo: false,
    rutas: {} as Record<string, any[]>,
    paginas: [] as any[],
}));

vi.mock("next/link", () => ({ default: ({ href, children, prefetch: _p, ...r }: any) => <a href={String(href)} {...r}>{children}</a> }));
vi.mock("@/lib/consumo/usuario", () => ({ uidActual: async () => h.uid }));
vi.mock("@/lib/consumo/guardian", () => ({ leerAvisoConsumo: () => ({ corte: false, corteHasta: null, frenoLocalHasta: null, diaAgotado: false }), mensajePausa: () => "pausa" }));
vi.mock("@/lib/consumo/freno", () => ({ frenoActivo: () => false }));
vi.mock("@/utils/supabase/client", () => ({
    createClient: () => ({
        from: (tabla: string) => {
            const r = () => Promise.resolve(h.fallo ? { data: null, error: { message: "sin red" } } : { data: tabla === "study_projects" ? h.proyectos : h.tareas, error: null });
            const q: any = { select: () => q, order: () => q, limit: () => r() };
            return q;
        },
    }),
}));
const toggleTask = vi.fn(async () => true);
vi.mock("@/lib/education/study", () => ({ toggleTask: (...a: any[]) => (toggleTask as any)(...a), updateProject: vi.fn(async () => true), createProject: vi.fn(async (i: any) => ({ id: "nuevo", owner: "u1", title: i.title, description: "", status: "activo", topic: null, links: [], created_at: "", updated_at: "" })) }));
vi.mock("@/lib/sync/entity-state", () => ({ getEntityStateChecked: async () => (h.fallo ? { row: null, error: "sin red" } : { row: { value: h.rutas }, error: null }) }));
const toggleLearningStep = vi.fn(async (_t: string, id: string) => (h.rutas["top-fisica"] ?? []).map((s: any) => (s.id === id ? { ...s, done: !s.done } : s)));
vi.mock("@/lib/education/progress", () => ({ toggleLearningStep: (...a: any[]) => (toggleLearningStep as any)(...a), addLearningStep: vi.fn(async () => []) }));
vi.mock("@/lib/os-social", () => ({ fetchPages: async () => { if (h.fallo) throw new Error("sin red"); return h.paginas; }, fetchGroups: async () => [], fetchEvents: async () => [] }));

import { entornoNavegador, montarEn, TODAS } from "../pruebas-render";
import { _vaciarCacheE } from "../cache";
import { ActiveProjectsWidget } from "../../active-projects-widget";
import { LearningPathWidget } from "../../learning-path-widget";
import { CollabProjectsWidget } from "../../collab-projects-widget";

beforeAll(entornoNavegador);
beforeEach(() => { h.uid = "u1"; h.fallo = false; h.proyectos = []; h.tareas = []; h.rutas = {}; h.paginas = []; });
afterEach(() => { cleanup(); window.localStorage.clear(); _vaciarCacheE(); toggleTask.mockClear(); toggleLearningStep.mockClear(); });

async function montar(clase: any, nodo: React.ReactElement) {
    let r!: ReturnType<typeof montarEn>;
    await act(async () => { r = montarEn(clase, nodo); });
    await act(async () => { await new Promise((ok) => setTimeout(ok, 0)); });
    return r;
}

describe("Génesis activa (proyectos del estudio)", () => {
    it.each(TODAS)("sin proyectos invita a crear en %s", async (clase) => {
        await montar(clase, <ActiveProjectsWidget />);
        expect(screen.getByText("Aún no tienes proyectos")).toBeTruthy();
    });

    it("sin sesión pide entrar", async () => {
        h.uid = null;
        await montar("m", <ActiveProjectsWidget />);
        expect(screen.getByText("Entra para ver tus proyectos")).toBeTruthy();
    });

    it("un fallo de red se dice como fallo, no como lista vacía", async () => {
        h.fallo = true;
        await montar("m", <ActiveProjectsWidget />);
        expect(screen.getByRole("alert").textContent).toMatch(/No se pudieron leer tus proyectos/);
    });

    it("en m muestra el avance real y marca hecha la siguiente tarea", async () => {
        h.proyectos = [{ id: "p1", owner: "u1", title: "Huerto comunitario", description: "", status: "activo", topic: "huerto", links: [], created_at: "2026-09-01", updated_at: "2026-09-02" }];
        h.tareas = [
            { id: "t1", owner: "u1", title: "Medir la parcela", notes: "", done: true, due_at: null, topic: "Huerto", group_id: null, guide_id: null, source: "user", created_at: "2026-09-01" },
            { id: "t2", owner: "u1", title: "Comprar semillas", notes: "", done: false, due_at: null, topic: "huerto", group_id: null, guide_id: null, source: "user", created_at: "2026-09-02" },
        ];
        await montar("m", <ActiveProjectsWidget />);
        expect(screen.getByText("Huerto comunitario")).toBeTruthy();
        expect(screen.getByRole("img", { name: /Avance de Huerto comunitario/ })).toBeTruthy();
        expect(screen.getByText("1/2")).toBeTruthy();
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Marcar hecho: Comprar semillas" })); });
        expect(toggleTask).toHaveBeenCalledWith("t2", true);
        expect(screen.getByText("2/2")).toBeTruthy();
    });

    it("en l lista los proyectos con su estado y un menú vertical", async () => {
        h.proyectos = [
            { id: "p1", owner: "u1", title: "Huerto", description: "", status: "activo", topic: null, links: [], created_at: "2026-09-01", updated_at: "2026-09-02" },
            { id: "p2", owner: "u1", title: "Radio libre", description: "", status: "pausado", topic: null, links: [], created_at: "2026-09-01", updated_at: "2026-09-01" },
        ];
        await montar("l", <ActiveProjectsWidget />);
        expect(screen.getByText("En pausa")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Acciones de Radio libre" }));
        expect(screen.getByRole("menuitem", { name: "Marcar activo" })).toBeTruthy();
        expect(screen.getByRole("textbox", { name: "Nombre del proyecto nuevo" })).toBeTruthy();
    });
});

describe("Ruta de aprendizaje (education:progress)", () => {
    it.each(TODAS)("sin rutas lo dice en %s", async (clase) => {
        await montar(clase, <LearningPathWidget />);
        expect(screen.getByText("Todavía no sigues ningún camino")).toBeTruthy();
    });

    it("pinta el sendero y marca el siguiente paso", async () => {
        h.rutas = { "top-fisica": [{ id: "a", title: "Leer a Newton", done: true, createdAt: "" }, { id: "b", title: "Problemas de palancas", done: false, createdAt: "" }] };
        await montar("l", <LearningPathWidget />);
        expect(screen.getByText("Física")).toBeTruthy();
        expect(screen.getByRole("group", { name: "Sendero de pasos" })).toBeTruthy();
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Marcar hecho: Problemas de palancas" })); });
        expect(toggleLearningStep).toHaveBeenCalledWith("top-fisica", "b");
        expect(screen.getByText(/Ruta completa/)).toBeTruthy();
    });
});

describe("Proyectos de la red (os_pages)", () => {
    it.each(TODAS)("sin proyectos invita a crear el primero en %s", async (clase) => {
        h.paginas = [{ id: "x", slug: "c", name: "Comunidad", kind: "comunidad", description: "", tags: [], accent: "#fff", memberCount: 3 }];
        await montar(clase, <CollabProjectsWidget />);
        expect(screen.getByText("La red aún no tiene proyectos publicados")).toBeTruthy();
    });

    it("cuenta, ordena por gente y enlaza a la página del proyecto", async () => {
        h.paginas = [
            { id: "1", slug: "solar", name: "Cooperativa solar", kind: "proyecto", description: "Placas en el barrio", tags: ["energia"], accent: "#ffbf00", memberCount: 12 },
            { id: "2", slug: "radio", name: "Radio libre", kind: "proyecto", description: "", tags: ["cultura"], accent: "#ec4899", memberCount: 30 },
        ];
        await montar("m", <CollabProjectsWidget />);
        const enlaces = screen.getAllByRole("link").filter((a) => a.getAttribute("href")?.startsWith("/pagina/"));
        expect(enlaces[0].getAttribute("href")).toBe("/pagina/radio");
        expect(screen.getByText(/2 · 42 personas/)).toBeTruthy();
    });

    it("un fallo se dice con reintento", async () => {
        h.fallo = true;
        await montar("l", <CollabProjectsWidget />);
        await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/No se pudieron leer/));
    });
});

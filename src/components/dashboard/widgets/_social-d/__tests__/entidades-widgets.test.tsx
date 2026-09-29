import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { EnMarco, preparaDom } from "../pruebas/prueba-marco";
import type { EstadoOsLive } from "../pruebas/os-live-falso";
import { actividadPorEntidad, puntuar, entidadDePagina, rolLegible } from "../entidades";

preparaDom();

const estado = vi.hoisted(() => ({
    uid: "yo", paginas: [], grupos: [], posts: [], eventos: [], membresias: [], cargando: false, propias: {},
    seguidas: [] as string[], uniones: [] as string[],
}) as EstadoOsLive & { seguidas: string[]; uniones: string[] });

vi.mock("@/lib/widget-data/os-live", async () => (await import("../pruebas/os-live-falso")).osLiveFalso(estado));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/os-social", () => ({
    setMembership: vi.fn(async (slug: string) => { estado.uniones.push(slug); return { ok: true }; }),
    setFollow: vi.fn(async (slug: string) => { estado.seguidas.push(slug); return { ok: true }; }),
}));

import { MyPagesWidget } from "../../my-pages-widget";
import { CommunitiesWidget } from "../../communities-widget";
import { MyGroupsWidget } from "../../my-groups-widget";
import { FederatedEntitiesWidget } from "../../federated-entities-widget";
import { pagina, grupo } from "../pruebas/os-live-falso";

const iso = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

beforeEach(() => {
    estado.uid = "yo"; estado.paginas = []; estado.grupos = []; estado.posts = []; estado.membresias = [];
    estado.seguidas = []; estado.uniones = [];
});
afterEach(() => cleanup());

describe("Entidades · piezas puras", () => {
    it("la actividad sale de las publicaciones reales y explica el orden", () => {
        const act = actividadPorEntidad([{ id: "1", author_id: "a", author_name: "A", entity_type: "page", entity_slug: "sangha", body: "", media_url: null, created_at: iso(1) }], Date.now());
        const p = puntuar(entidadDePagina(pagina("sangha", { created_at: iso(24) })), act.get("pagina:sangha") ?? null, new Map(), Date.now());
        expect(p.motivos).toEqual(["12 miembros", "1 publicación esta semana", "nueva"]);
        expect(p.actividad?.serie[6]).toBeGreaterThanOrEqual(0);
        expect(rolLegible("admin")).toBe("Administras");
    });
});

describe("Mis Páginas", () => {
    it("vacío con la acción real de crear", () => {
        render(<EnMarco clase="m"><MyPagesWidget /></EnMarco>);
        expect(screen.getByRole("button", { name: "Crear página" })).toBeInTheDocument();
    });
    it("m: lo que fundaste y los grupos en los que estás, con tu rol", () => {
        estado.paginas = [pagina("mi-huerto", { owner_id: "yo" }), pagina("ajena")];
        estado.grupos = [grupo("circulo", { owner_id: "otra" })];
        estado.membresias = [{ user_id: "yo", group_slug: "circulo", role: "moderador", created_at: null }];
        render(<EnMarco clase="m"><MyPagesWidget /></EnMarco>);
        const lista = screen.getByRole("list", { name: "Tus espacios" });
        expect(within(lista).getAllByRole("listitem")).toHaveLength(2);
        expect(screen.getByText(/Moderas/)).toBeInTheDocument();
        expect(screen.queryByText("ajena")).toBeNull();
    });
});

describe("Comunidades", () => {
    it("l: ordena y sigue de verdad", async () => {
        estado.paginas = [pagina("sangha-mar", { member_count: 3 }), pagina("sangha-rio", { member_count: 40 }), pagina("proyecto", { kind: "proyecto" })];
        render(<EnMarco clase="l"><CommunitiesWidget /></EnMarco>);
        fireEvent.click(screen.getByRole("button", { name: "Más grandes" }));
        const filas = within(screen.getByRole("list", { name: "Comunidades" })).getAllByRole("listitem");
        expect(filas).toHaveLength(2);
        expect(filas[0]).toHaveTextContent("sangha rio");
        fireEvent.click(screen.getByRole("button", { name: "Seguir a sangha rio" }));
        await waitFor(() => expect(estado.seguidas).toEqual(["sangha-rio"]));
    });
});

describe("Mis Grupos", () => {
    it("sin sesión y vacío honestos", () => {
        estado.uid = null;
        render(<EnMarco clase="m"><MyGroupsWidget /></EnMarco>);
        expect(screen.getByText("Entra en tu cuenta")).toBeInTheDocument();
        cleanup();
        estado.uid = "yo";
        estado.grupos = [grupo("otro")];
        render(<EnMarco clase="m"><MyGroupsWidget /></EnMarco>);
        expect(screen.getByRole("link", { name: "Explorar grupos" })).toHaveAttribute("href", "/explorer");
    });
    it("l: «Descubrir» y unirse", async () => {
        estado.grupos = [grupo("mio"), grupo("otro")];
        estado.membresias = [{ user_id: "yo", group_slug: "mio", role: "miembro", created_at: null }];
        render(<EnMarco clase="l"><MyGroupsWidget /></EnMarco>);
        fireEvent.click(screen.getByRole("button", { name: /Descubrir/ }));
        fireEvent.click(screen.getByRole("button", { name: "Unirme a otro" }));
        await waitFor(() => expect(estado.uniones).toEqual(["otro"]));
    });
});

describe("Entidades Federativas", () => {
    it("s: solo entidades reales, con su acción", () => {
        estado.paginas = [pagina("ef-valle", { kind: "entidad" }), pagina("sangha", { kind: "comunidad" })];
        render(<EnMarco clase="s"><FederatedEntitiesWidget /></EnMarco>);
        expect(screen.getByRole("link", { name: /ef valle, Entidad federativa/ })).toHaveAttribute("href", "/entidad/ef-valle");
        expect(screen.getByRole("button", { name: "Seguir a ef valle" })).toBeInTheDocument();
    });
    it("vacío con «Registrar una entidad»", () => {
        render(<EnMarco clase="m"><FederatedEntitiesWidget /></EnMarco>);
        expect(screen.getByRole("button", { name: "Registrar una entidad" })).toBeInTheDocument();
    });
});

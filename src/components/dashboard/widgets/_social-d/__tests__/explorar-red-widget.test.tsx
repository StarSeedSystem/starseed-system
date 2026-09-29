import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { EnMarco, preparaDom } from "../pruebas/prueba-marco";
import type { EstadoOsLive } from "../pruebas/os-live-falso";

preparaDom();

const estado = vi.hoisted(() => ({
    uid: "yo", paginas: [], grupos: [], posts: [], eventos: [], membresias: [], cargando: false, propias: {},
    uniones: [] as string[],
}) as EstadoOsLive & { uniones: string[] });

vi.mock("@/lib/widget-data/os-live", async () => (await import("../pruebas/os-live-falso")).osLiveFalso(estado));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/os-social", () => ({
    setMembership: vi.fn(async (slug: string) => { estado.uniones.push(slug); return { ok: true }; }),
    setFollow: vi.fn(async () => ({ ok: true })),
}));

import { ExploreNetworkWidget } from "../../explore-network-widget";
import { pagina, grupo } from "../pruebas/os-live-falso";

beforeEach(() => {
    estado.paginas = [];
    estado.grupos = [];
    estado.posts = [];
    estado.membresias = [];
    estado.uniones = [];
    estado.cargando = false;
});
afterEach(() => cleanup());

describe("Explorar Red · descubrimiento honesto", () => {
    it("vacío con la acción de fundar (el diálogo real)", () => {
        render(<EnMarco clase="m"><ExploreNetworkWidget /></EnMarco>);
        expect(screen.getByTestId("marco-widget")).toHaveAttribute("data-estado", "vacio");
        expect(screen.getByRole("button", { name: "Fundar una comunidad" })).toBeInTheDocument();
    });

    it("m: explica por qué aparece cada entidad y deja unirse de verdad", async () => {
        estado.grupos = [grupo("huerto-norte", { member_count: 40 })];
        estado.paginas = [pagina("sangha-mar", { member_count: 3 })];
        estado.posts = [{ id: "p1", author_id: "a", author_name: "A", entity_type: "group", entity_slug: "huerto-norte", body: "hola", media_url: null, created_at: new Date().toISOString() }];
        render(<EnMarco clase="m"><ExploreNetworkWidget /></EnMarco>);
        const enlace = screen.getByRole("link", { name: /huerto norte, Círculo\. 40 miembros, 1 publicación esta semana/ });
        expect(enlace).toHaveAttribute("href", "/grupo/huerto-norte");
        fireEvent.click(screen.getByRole("button", { name: "Unirme a huerto norte" }));
        await waitFor(() => expect(estado.uniones).toEqual(["huerto-norte"]));
        expect(await screen.findByLabelText("Miembro: huerto norte")).toBeInTheDocument();
    });

    it("l: filtros por tipo", () => {
        estado.grupos = [grupo("huerto-norte")];
        estado.paginas = [pagina("sangha-mar")];
        render(<EnMarco clase="l"><ExploreNetworkWidget /></EnMarco>);
        fireEvent.click(screen.getByRole("button", { name: /Grupos/ }));
        expect(screen.queryByRole("link", { name: /sangha mar/ })).toBeNull();
        expect(screen.getByRole("link", { name: /huerto norte/ })).toBeInTheDocument();
    });

    it("s: la entidad destacada con su acción", () => {
        estado.paginas = [pagina("sangha-mar")];
        render(<EnMarco clase="s"><ExploreNetworkWidget /></EnMarco>);
        expect(screen.getByRole("button", { name: "Seguir a sangha mar" })).toBeInTheDocument();
    });
});

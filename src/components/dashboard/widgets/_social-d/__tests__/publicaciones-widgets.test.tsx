import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { EnMarco, preparaDom } from "../pruebas/prueba-marco";
import { _reiniciarFuentesParaPruebas } from "../fuente-compartida";
import type { FeedRed, PublicacionRed } from "../feed-red-datos";
import type { CreacionCafe } from "../cafe-datos";

preparaDom();

const estado = vi.hoisted(() => ({
    feed: { publicaciones: [], noDisponible: false } as FeedRed,
    cafe: [] as CreacionCafe[],
    falloCafe: false,
    falloRed: false,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/os-social", () => ({ toggleLike: vi.fn(async () => ({ ok: true, active: true, count: 1 })) }));
vi.mock("../feed-red-datos", async (importOriginal) => {
    const real = await importOriginal<typeof import("../feed-red-datos")>();
    return { ...real, cargarFeedRed: async () => (estado.falloRed ? { fallo: { status: 503, message: "no responde" } } : { datos: estado.feed }) };
});
vi.mock("../cafe-datos", async (importOriginal) => {
    const real = await importOriginal<typeof import("../cafe-datos")>();
    return { ...real, cargarCafe: async () => (estado.falloCafe ? { fallo: { status: 503, message: "no responde" } } : { datos: estado.cafe }) };
});

import { RelevantPostsWidget } from "../../relevant-posts-widget";
import { CulturalFeedWidget } from "../../cultural-feed-widget";

const hace = (h: number) => Date.now() - h * 3_600_000;

function red(id: string, extra: Partial<PublicacionRed> = {}): PublicacionRed {
    return { id, autorId: "u", autor: `Voz ${id}`, handle: null, avatar: null, texto: `Texto ${id}`, media: null, tipoMedia: null, nMedia: 0, reacciones: 0, meGusta: false, comentarios: 0, area: null, ms: hace(1), ...extra };
}
function obra(id: string, extra: Partial<CreacionCafe> = {}): CreacionCafe {
    return { id, autor: `Artista ${id}`, avatar: null, titulo: `Obra ${id}`, texto: `Descripción larga de la obra ${id}`, tipo: "obra", rama: null, acento: null, media: null, tipoMedia: null, nMedia: 0, reacciones: 0, comentarios: 0, etiquetas: [], ms: hace(2), ...extra };
}

beforeEach(() => {
    _reiniciarFuentesParaPruebas();
    estado.feed = { publicaciones: [], noDisponible: false };
    estado.cafe = [];
    estado.falloCafe = false;
    estado.falloRed = false;
});
afterEach(() => cleanup());

describe("Publicaciones Relevantes · orden por señales reales", () => {
    it("m: el podio pone arriba lo que tiene reacciones y comentarios reales", async () => {
        estado.feed = { publicaciones: [red("tranquila", { reacciones: 0, ms: hace(1) }), red("viva", { reacciones: 9, comentarios: 3, ms: hace(3) })], noDisponible: false };
        render(<EnMarco clase="m"><RelevantPostsWidget /></EnMarco>);
        const podio = await screen.findByRole("list", { name: "Podio de publicaciones" });
        const filas = within(podio).getAllByRole("listitem");
        expect(filas[0]).toHaveTextContent("Voz viva");
        expect(within(filas[0]).getByLabelText("Puesto 1")).toBeInTheDocument();
    });

    it("l: una creación del Café se lee dentro del widget", async () => {
        estado.cafe = [obra("luz", { reacciones: 4 })];
        render(<EnMarco clase="l"><RelevantPostsWidget /></EnMarco>);
        fireEvent.click(await screen.findByRole("button", { name: /Artista luz: Obra luz/ }));
        expect(screen.getByRole("article", { name: "Leyendo la publicación de Artista luz" })).toBeInTheDocument();
        expect(screen.getByText("Descripción larga de la obra luz")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Volver a la lista" }));
        expect(screen.getByRole("list", { name: "Podio de publicaciones" })).toBeInTheDocument();
    });

    it("con una fuente caída enseña la otra; con las dos, el error con reintento", async () => {
        estado.falloRed = true;
        estado.cafe = [obra("sola")];
        render(<EnMarco clase="m"><RelevantPostsWidget /></EnMarco>);
        expect(await screen.findByText(/Artista sola/)).toBeInTheDocument();
        cleanup();
        _reiniciarFuentesParaPruebas();
        estado.falloCafe = true;
        render(<EnMarco clase="m"><RelevantPostsWidget /></EnMarco>);
        await waitFor(() => expect(screen.getByTestId("marco-widget")).toHaveAttribute("data-estado", "error"));
        expect(screen.getByRole("button", { name: /Reintentar/ })).toBeInTheDocument();
    });
});

describe("Corriente Cultural · sala de obras", () => {
    it("m: sala 2×2 con las obras reales", async () => {
        estado.cafe = [obra("a"), obra("b", { tipo: "elixir" }), obra("c")];
        render(<EnMarco clase="m"><CulturalFeedWidget /></EnMarco>);
        expect(await screen.findByRole("list", { name: "Obras" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Elixir de Artista b/ })).toBeInTheDocument();
    });

    it("l: filtra por tipo", async () => {
        estado.cafe = [obra("a"), obra("b", { tipo: "elixir" })];
        render(<EnMarco clase="l"><CulturalFeedWidget /></EnMarco>);
        const tipos = await screen.findByRole("group", { name: "Tipo de creación" });
        fireEvent.click(within(tipos).getByRole("button", { name: /Elixir/ }));
        expect(screen.queryByRole("button", { name: /Obra de Artista a/ })).toBeNull();
        expect(screen.getByRole("button", { name: /Elixir de Artista b/ })).toBeInTheDocument();
    });

    it("s: la última obra enlaza a Cultura", async () => {
        estado.cafe = [obra("a")];
        render(<EnMarco clase="s"><CulturalFeedWidget /></EnMarco>);
        expect(await screen.findByRole("link", { name: /Obra de Artista a/ })).toHaveAttribute("href", "/network/culture");
    });
});

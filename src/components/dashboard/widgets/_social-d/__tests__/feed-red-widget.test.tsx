import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { EnMarco, preparaDom } from "../pruebas/prueba-marco";
import { _reiniciarFuentesParaPruebas } from "../fuente-compartida";
import type { FeedRed, PublicacionRed } from "../feed-red-datos";

preparaDom();

const estado = vi.hoisted(() => ({ feed: { publicaciones: [], noDisponible: false } as FeedRed, likes: 0 }));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/os-social", () => ({
    toggleLike: vi.fn(async () => { estado.likes += 1; return { ok: true, active: true, count: 8 }; }),
}));
vi.mock("../feed-red-datos", async (importOriginal) => {
    const real = await importOriginal<typeof import("../feed-red-datos")>();
    return { ...real, cargarFeedRed: async () => ({ datos: estado.feed }) };
});

import { NetworkFeedWidget } from "../../network-feed-widget";

function pub(id: string, extra: Partial<PublicacionRed> = {}): PublicacionRed {
    return {
        id, autorId: `u-${id}`, autor: `Autora ${id}`, handle: null, avatar: null,
        texto: `Semillas del huerto ${id}`, media: null, tipoMedia: null, nMedia: 0,
        reacciones: 7, meGusta: false, comentarios: 2, area: null, ms: Date.now() - 3_600_000, ...extra,
    };
}

beforeEach(() => { _reiniciarFuentesParaPruebas(); estado.likes = 0; });
afterEach(() => cleanup());

describe("Feed de la Red · Lienzo real por tamaño", () => {
    it("vacío honesto con «Publicar»", async () => {
        estado.feed = { publicaciones: [], noDisponible: false };
        render(<EnMarco clase="m"><NetworkFeedWidget /></EnMarco>);
        await waitFor(() => expect(screen.getByTestId("marco-widget")).toHaveAttribute("data-estado", "vacio"));
        expect(screen.getByRole("link", { name: "Publicar" })).toHaveAttribute("href", "/publicar");
    });

    it("dice que no está disponible cuando la tabla no existe (sin fingir un feed vacío)", async () => {
        estado.feed = { publicaciones: [], noDisponible: true };
        render(<EnMarco clase="m"><NetworkFeedWidget /></EnMarco>);
        expect(await screen.findByText("El feed no está disponible aquí")).toBeInTheDocument();
    });

    it("s: la última publicación enlaza a su página", async () => {
        estado.feed = { publicaciones: [pub("a"), pub("b")], noDisponible: false };
        render(<EnMarco clase="s"><NetworkFeedWidget /></EnMarco>);
        const enlace = await screen.findByRole("link", { name: /Autora a: Semillas del huerto a/ });
        expect(enlace).toHaveAttribute("href", "/post/a");
    });

    it("m: la corriente con reacciones reales", async () => {
        estado.feed = { publicaciones: [pub("a"), pub("b", { media: "https://cdn.starseed.red/img/foto.jpg", tipoMedia: "imagen", nMedia: 1 })], noDisponible: false };
        render(<EnMarco clase="m"><NetworkFeedWidget /></EnMarco>);
        expect(await screen.findByRole("link", { name: /Autora b: Semillas del huerto b/ })).toBeInTheDocument();
        expect(screen.getByRole("region", { name: "Feed de la Red" })).toBeInTheDocument();
    });

    it("l: resonar llama a la acción real y corrige el recuento", async () => {
        estado.feed = { publicaciones: [pub("a")], noDisponible: false };
        render(<EnMarco clase="l"><NetworkFeedWidget /></EnMarco>);
        fireEvent.click(await screen.findByRole("button", { name: /Resonar con esta publicación \(7\)/ }));
        await waitFor(() => expect(estado.likes).toBe(1));
        await waitFor(() => expect(screen.getByRole("button", { name: /Quitar resonancia \(8\)/ })).toBeInTheDocument());
    });
});

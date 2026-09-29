import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { EnMarco, preparaDom } from "../pruebas/prueba-marco";
import { _reiniciarFuentesParaPruebas } from "../fuente-compartida";

preparaDom();

const estado = vi.hoisted(() => ({ uid: "yo" as string | null, items: [] as Array<Record<string, unknown>> }));

vi.mock("@/lib/widget-data/os-live", () => ({ useCurrentUid: () => ({ uid: estado.uid, ready: true }) }));
vi.mock("@/lib/library/entity-library", () => ({
    listLibrary: async () => ({ items: estado.items }),
    readLibrarySnapshot: () => ({ items: [] }),
}));

import { RecentGalleryWidget } from "../../recent-gallery-widget";

const hace = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const foto = (id: string, h: number, mime = "image/jpeg") => ({ id, type: "file", title: `Toma ${id}`, url: `https://cdn.starseed.red/${id}.jpg`, mime, tags: [], addedAt: hace(h), addedBy: "yo" });

beforeEach(() => { _reiniciarFuentesParaPruebas(); estado.uid = "yo"; estado.items = []; });
afterEach(() => cleanup());

describe("Galería reciente", () => {
    it("vacío con «Abrir Cámara»", async () => {
        render(<EnMarco clase="m"><RecentGalleryWidget /></EnMarco>);
        await waitFor(() => expect(screen.getByTestId("marco-widget")).toHaveAttribute("data-estado", "vacio"));
        expect(screen.getByRole("link", { name: "Abrir Cámara" })).toHaveAttribute("href", "/camara");
    });

    it("l: bento con la última a lo grande y visor con anterior/siguiente", async () => {
        estado.items = [foto("a", 1), foto("b", 2), foto("c", 3), foto("d", 4, "video/mp4"), { id: "doc", type: "file", title: "PDF", mime: "application/pdf", tags: [], addedAt: hace(1), addedBy: "yo" }];
        render(<EnMarco clase="l"><RecentGalleryWidget /></EnMarco>);
        fireEvent.click(await screen.findByRole("button", { name: "Ver Foto: Toma a" }));
        expect(screen.getByRole("region", { name: "Visor: Toma a (1 de 4)" })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
        expect(screen.getByRole("region", { name: "Visor: Toma b (2 de 4)" })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Volver al mosaico" }));
        expect(screen.getByRole("button", { name: "Ver Vídeo: Toma d" })).toBeInTheDocument();
    });

    it("s: mosaico que abre la Galería; sin sesión honesta", async () => {
        estado.items = [foto("a", 1)];
        render(<EnMarco clase="s"><RecentGalleryWidget /></EnMarco>);
        expect(await screen.findByRole("link", { name: "Foto: Toma a. Abrir la Galería" })).toHaveAttribute("href", "/galeria");
        cleanup();
        estado.uid = null;
        render(<EnMarco clase="s"><RecentGalleryWidget /></EnMarco>);
        expect(screen.getByText("Entra en tu cuenta")).toBeInTheDocument();
    });
});

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { EnMarco, preparaDom } from "../pruebas/prueba-marco";
import type { EstadoOsLive } from "../pruebas/os-live-falso";
import { construirActividad, resumirActividad } from "../actividad";

preparaDom();

const estado = vi.hoisted(() => ({ uid: "yo", paginas: [], grupos: [], posts: [], eventos: [], membresias: [], cargando: false, propias: {} }) as EstadoOsLive);
vi.mock("@/lib/widget-data/os-live", async () => (await import("../pruebas/os-live-falso")).osLiveFalso(estado));

import { RecentActivityWidget } from "../../recent-activity-widget";
import { ActivitySummaryWidget } from "../../activity-summary-widget";
import { pagina, grupo } from "../pruebas/os-live-falso";

const iso = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const post = (id: string, h: number, autor = "otra", slug: string | null = "huerto") =>
    ({ id, author_id: autor, author_name: autor === "yo" ? "Yo" : "Luz", entity_type: "group", entity_slug: slug, body: `Mensaje ${id}`, media_url: null, created_at: iso(h) });

beforeEach(() => {
    estado.paginas = []; estado.grupos = []; estado.posts = []; estado.eventos = []; estado.membresias = []; estado.cargando = false;
});
afterEach(() => cleanup());

describe("Actividad · piezas puras", () => {
    it("ordena la línea de tiempo y enlaza cada cosa a su página", () => {
        const a = construirActividad({ posts: [post("1", 5), post("2", 1)], eventos: [], paginas: [pagina("sangha", { created_at: iso(3) })], grupos: [] });
        expect(a.map((x) => x.id)).toEqual(["post-2", "pag-id-sangha", "post-1"]);
        expect(a[0].href).toBe("/grupo/huerto");
    });

    it("no inventa variaciones sin base", () => {
        const r = resumirActividad({ posts: [post("1", 2)], eventos: [], paginas: [], grupos: [] }, Date.now());
        expect(r.ultimas24).toBe(1);
        expect(r.variacion).toBeNull();
        expect(r.publicaciones7[6]).toBeGreaterThanOrEqual(0);
    });
});

describe("Actividad Reciente · por tamaño", () => {
    it("vacío con «Publicar»", () => {
        render(<EnMarco clase="m"><RecentActivityWidget /></EnMarco>);
        expect(screen.getByTestId("marco-widget")).toHaveAttribute("data-estado", "vacio");
        expect(screen.getByRole("link", { name: "Publicar" })).toHaveAttribute("href", "/publicar");
    });

    it("m: agrupada por día", () => {
        estado.posts = [post("1", 1), post("2", 30)];
        render(<EnMarco clase="m"><RecentActivityWidget /></EnMarco>);
        expect(within(screen.getByRole("region", { name: "Hoy" })).getByRole("link", { name: /Luz publicó en huerto/ })).toBeInTheDocument();
        expect(screen.getAllByRole("link", { name: /Luz publicó en huerto/ })).toHaveLength(2);
    });

    it("l: «Tuya» filtra lo que hiciste tú", () => {
        estado.posts = [post("1", 1), post("2", 2, "yo")];
        render(<EnMarco clase="l"><RecentActivityWidget /></EnMarco>);
        fireEvent.click(within(screen.getByRole("group", { name: "De quién" })).getByRole("button", { name: /Tuya/ }));
        expect(screen.queryByRole("link", { name: /Luz publicó/ })).toBeNull();
        expect(screen.getByRole("link", { name: /Yo publicó/ })).toBeInTheDocument();
    });

    it("panorámico: la semana en columnas", () => {
        estado.posts = [post("1", 1)];
        render(<EnMarco clase="panoramico"><RecentActivityWidget /></EnMarco>);
        expect(screen.getByRole("list", { name: "La semana en la Red" })).toBeInTheDocument();
    });
});

describe("Resumen de Actividad · por tamaño", () => {
    it("m: la semana y sus cifras reales", () => {
        estado.posts = [post("1", 1), post("2", 2)];
        estado.grupos = [grupo("huerto")];
        render(<EnMarco clase="m"><ActivitySummaryWidget /></EnMarco>);
        expect(screen.getByRole("figure", { name: /Publicaciones por día/ })).toBeInTheDocument();
        expect(screen.getByText("Grupos")).toBeInTheDocument();
    });

    it("l: empieza en «Tú» si tienes actividad propia", () => {
        estado.posts = [post("1", 1, "yo"), post("2", 2)];
        render(<EnMarco clase="l"><ActivitySummaryWidget /></EnMarco>);
        expect(within(screen.getByRole("group", { name: "De quién" })).getByRole("button", { name: "Tú" })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByText("Tus publicaciones · 7 días")).toBeInTheDocument();
    });

    it("micro: las publicaciones de las últimas 24 h", () => {
        estado.posts = [post("1", 1), post("2", 3)];
        render(<EnMarco clase="micro"><ActivitySummaryWidget /></EnMarco>);
        expect(screen.getByRole("link", { name: "2 publicaciones en las últimas 24 horas" })).toBeInTheDocument();
    });
});

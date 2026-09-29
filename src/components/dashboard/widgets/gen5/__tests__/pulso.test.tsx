import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaseTamano } from "@/lib/widgets/forma/tamanos";

let medida = { width: 380, height: 325 };
vi.mock("@/components/dashboard/kit/use-element-size", () => ({
    useElementSize: () => ({ ref: { current: null }, size: { ...medida, tier: "regular", vTier: "regular", landscape: true } }),
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: any) => <a href={String(href)} {...r}>{children}</a> }));
const vivo = { posts: [] as any[], grupos: [] as any[], eventos: [] as any[], cargando: false, limite: 0 };
vi.mock("@/lib/widget-data/os-live", () => ({
    useLivePosts: (limite: number) => { vivo.limite = limite; return { rows: vivo.posts, loading: vivo.cargando, reload: async () => undefined }; },
    useLiveGroups: () => ({ rows: vivo.grupos, loading: vivo.cargando, reload: async () => undefined }),
    useLiveEvents: () => ({ rows: vivo.eventos, loading: vivo.cargando, reload: async () => undefined }),
    rowAccent: (a: string | null) => a || "#7FB8FF",
}));

import { EnMarco, MEDIDAS } from "../_catalogo/prueba-marco";
import { SocietyPulseWidget } from "../society-pulse-widget";
import { comunidades, latidos, latiendo, muestraLlena, proximos, voces } from "../society-pulse-partes";

const AHORA = Date.parse("2026-09-29T12:00:00");
const h = (x: number) => new Date(AHORA - x * 3_600_000).toISOString();
function pintar(clase: ClaseTamano) {
    medida = MEDIDAS[clase];
    return render(<EnMarco clase={clase}><SocietyPulseWidget /></EnMarco>);
}
beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(AHORA);
    vivo.cargando = false;
    vivo.posts = [0.5, 3, 30, 50, 100, 200].map((x, i) => ({ id: `p${i}`, author_id: `a${i % 4}`, author_name: null, created_at: h(x) }));
    vivo.grupos = [{ id: "g1", slug: "huerto", name: "Huerto", member_count: 42, accent: null }, { id: "g2", slug: "asamblea", name: "Asamblea", member_count: 88, accent: "#DC143C" }];
    vivo.eventos = [{ id: "e1", slug: "siembra", title: "Siembra de otoño", starts_at: h(-26) }, { id: "e0", slug: "pasado", title: "Pasado", starts_at: h(40) }];
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const TODAS: ClaseTamano[] = ["micro", "s", "m", "l", "xl", "panoramico", "torre"];

describe("Pulso de la Sociedad", () => {
    it.each(TODAS)("(%s) el latido real de la red con los hooks en vivo del OS", (clase) => {
        pintar(clase);
        expect(screen.getByRole("region").getAttribute("aria-label")).toMatch(/5 publicaciones en 7 días \(2 hoy\) de 4 voces distintas; 2 comunidades con 130 miembros; 1 encuentro en los próximos 7 días, el primero «Siembra de otoño»\. Hubo actividad en la última hora/);
        expect(vivo.limite).toBe(24);
    });

    it("enlaza encuentros y comunidades a sus páginas", () => {
        pintar("xl");
        expect(screen.getByRole("link", { name: /Siembra de otoño/ }).getAttribute("href")).toBe("/evento/siembra");
        expect(screen.getByRole("link", { name: /Asamblea/ }).getAttribute("href")).toBe("/grupo/asamblea");
    });

    it("si la muestra se llena lo dice como «al menos»", () => {
        vivo.posts = Array.from({ length: 24 }, (_, i) => ({ id: `p${i}`, author_id: "a", created_at: h(i) }));
        pintar("l");
        expect(screen.getByRole("region").getAttribute("aria-label")).toMatch(/al menos 24 publicaciones/);
        expect(screen.getByText(/hay al menos estas/)).toBeTruthy();
    });

    it("cargando y la red en calma (vacío)", () => {
        vivo.posts = []; vivo.grupos = []; vivo.eventos = []; vivo.cargando = true;
        pintar("m");
        expect(screen.getByRole("region").getAttribute("aria-label")).toMatch(/cargando/);
        cleanup();
        vivo.cargando = false;
        pintar("m");
        expect(screen.getByRole("region").getAttribute("aria-label")).toMatch(/vacío, la red está en calma/);
        expect(screen.getByRole("link", { name: "Publicar en la red" }).getAttribute("href")).toBe("/red-feed");
    });
});

describe("Pulso · lógica", () => {
    it("cuenta por días, voces, encuentros y comunidades", () => {
        const posts = [{ created_at: h(1) }, { created_at: h(25) }, { created_at: h(24 * 8) }, { created_at: "roto" }, { created_at: h(-5) }];
        const d = latidos(posts, AHORA);
        expect(d).toHaveLength(7);
        expect(d[6].n).toBe(1);
        expect(d.reduce((s, x) => s + x.n, 0)).toBe(2);
        expect(voces([{ created_at: h(1), author_id: "a", author_name: null }, { created_at: h(2), author_id: "a", author_name: null }, { created_at: h(3), author_id: null, author_name: "Ana" }], AHORA)).toBe(2);
        expect(muestraLlena([{ created_at: h(1) }], 1, AHORA - 7 * 86_400_000)).toBe(true);
        expect(muestraLlena([{ created_at: h(1) }], 2, AHORA - 7 * 86_400_000)).toBe(false);
        expect(proximos([{ id: "a", starts_at: h(-2) } as any, { id: "b", starts_at: h(-24 * 9) } as any], AHORA).map((e) => e.id)).toEqual(["a"]);
        expect(comunidades([{ member_count: 3 } as any, { member_count: null } as any]).miembros).toBe(3);
        expect(latiendo([{ created_at: h(0.5) }], AHORA)).toBe(true);
        expect(latiendo([{ created_at: h(2) }], AHORA)).toBe(false);
    });
});

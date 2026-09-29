import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaseTamano } from "@/lib/widgets/forma/tamanos";

let medida = { width: 380, height: 325 };
vi.mock("@/components/dashboard/kit/use-element-size", () => ({
    useElementSize: () => ({ ref: { current: null }, size: { ...medida, tier: "regular", vTier: "regular", landscape: true } }),
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: any) => <a href={String(href)} {...r}>{children}</a> }));
let usuario: any = null;
vi.mock("@/lib/consumo/usuario", () => ({ uidActual: async () => usuario?.id ?? null, usuarioActual: async () => usuario }));
let tablas: Record<string, any[]> = {};
let fallo: string | null = null;
const peticiones: string[] = [];
function consulta(tabla: string): any {
    const res = () => (fallo ? { data: null, error: { message: fallo } } : { data: tablas[tabla] ?? [], error: null });
    const b: any = new Proxy(function () {}, {
        get: (_t, p) => (p === "then" ? (ok: any) => ok(res()) : p === "maybeSingle" ? async () => (fallo ? res() : { data: (tablas[tabla] ?? [])[0] ?? null, error: null }) : b),
        apply: () => b,
    });
    return b;
}
vi.mock("@/utils/supabase/client", () => ({ createClient: () => ({ from: (t: string) => { peticiones.push(t); return consulta(t); } }) }));

import { EnMarco, MEDIDAS } from "../_catalogo/prueba-marco";
import { _vaciarCompartidos } from "../_catalogo/recurso";
import { MeritGalleryWidget } from "../merit-gallery-widget";
import { cristaleria, hexagono, siguiente } from "../merit-gallery-partes";

const B = [
    { id: "b1", code: "verified", name: "Identidad verificada", description: "Cuenta verificada", area: "general" },
    { id: "b2", code: "creator", name: "Creadora", description: "Publicó en la Tienda", area: "cultura" },
    { id: "b4", code: "scholar", name: "Erudita", description: "Aporta conocimiento", area: "educacion" },
    { id: "b5", code: "legislator", name: "Legisladora", description: null, area: "politica" },
];
function pintar(clase: ClaseTamano) {
    medida = MEDIDAS[clase];
    return render(<EnMarco clase={clase}><MeritGalleryWidget /></EnMarco>);
}
beforeEach(() => {
    localStorage.clear();
    _vaciarCompartidos();
    usuario = null;
    fallo = null;
    peticiones.length = 0;
    tablas = { badges: B, profiles: [{ id: "p1" }], profile_badges: [{ awarded_at: "2026-09-20T10:00:00Z", awarded_by: "u1", badge: B[1] }, { awarded_at: "2026-08-02T10:00:00Z", awarded_by: "u7", badge: [B[2]] }] };
});
afterEach(() => { cleanup(); });

const TODAS: ClaseTamano[] = ["micro", "s", "m", "l", "xl", "panoramico", "torre"];

describe("Cristalería de Mérito", () => {
    it.each(TODAS)("(%s) tus insignias reales frente al catálogo", async (clase) => {
        usuario = { id: "u1" };
        pintar(clase);
        await screen.findByRole("region", { name: /2 de 4 insignias \(Creadora, Erudita\)\. Siguiente: Legisladora/ });
        expect(peticiones).toEqual(["badges", "profiles", "profile_badges"]);
    });

    it("cada cristal dice si es tuyo, avalado o por ganar, y a dónde ir para ganarlo", async () => {
        usuario = { id: "u1" };
        pintar("xl");
        fireEvent.click(await screen.findByRole("button", { name: "Erudita: avalada por la comunidad" }));
        expect(screen.getByText(/reconocida por la comunidad/)).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Legisladora: por ganar" }));
        expect(screen.getByRole("link", { name: /Ir a Decisiones para ganar «Legisladora»/ }).getAttribute("href")).toBe("/decisiones");
        expect(screen.getByRole("list", { name: "Insignias por ganar" })).toBeTruthy();
    });

    it("sin sesión enseña el catálogo y no busca tu perfil", async () => {
        pintar("l");
        await screen.findByRole("region", { name: /Cristalería de mérito: sin sesión/ });
        expect(peticiones).toEqual(["badges"]);
        expect(screen.getByRole("link", { name: "Entrar" }).getAttribute("href")).toBe("/login");
    });

    it("catálogo vacío y error, dichos como tales", async () => {
        usuario = { id: "u1" };
        tablas.badges = [];
        tablas.profile_badges = [];
        pintar("m");
        await screen.findByRole("region", { name: /vacío, el catálogo de insignias aún no tiene ninguna/ });
        cleanup();
        localStorage.clear();
        _vaciarCompartidos();
        fallo = "sin red";
        pintar("m");
        expect(await screen.findByRole("region", { name: /error, no se pudieron leer las insignias/ })).toBeTruthy();
    });
});

describe("Mérito · lógica", () => {
    it("ordena: ganadas (la más reciente antes) y luego pendientes por área", () => {
        const c = cristaleria(B, [{ awarded_at: "2026-01-01T00:00:00Z", awarded_by: "u1", badge: B[0] }, { awarded_at: "2026-05-01T00:00:00Z", awarded_by: "u9", badge: B[1] }], "u1");
        expect(c.map((x) => x.code)).toEqual(["creator", "verified", "legislator", "scholar"]);
        expect(c[0].avalada).toBe(true);
        expect(c[1].avalada).toBe(false);
        expect(siguiente(c)!.code).toBe("legislator");
        expect(cristaleria([{ nada: 1 }], [{ badge: { id: "x", name: "Suelta", area: "rara" } }], null)[0]).toMatchObject({ id: "x", area: "general" });
        expect(hexagono(10, 10, 5).split(" ")).toHaveLength(6);
    });
});

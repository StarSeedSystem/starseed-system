import * as React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ContextoMarco, type ContextoMarcoUnificado } from "@/components/dashboard/kit/contexto-marco";
import { ESPACIADO_MARCO } from "@/components/widgets-libres/marco-unificado";
import type { ClaseTamano } from "@/lib/widgets/forma/tamanos";
import type { DashboardWidget } from "@/components/dashboard/dashboard-types";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace() {}, back() {}, prefetch() {} }), usePathname: () => "/dashboard" }));
vi.mock("next/link", () => ({ default: ({ href, children, prefetch: _p, ...r }: any) => <a href={String(href)} {...r}>{children}</a> }));

import { AppLauncherWidget } from "../../app-launcher-widget";
import { CLAVE_FIJADAS, _reiniciarLanzadorLocal } from "../lanzador";

beforeAll(() => {
    (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as any;
});
afterEach(() => { cleanup(); window.localStorage.clear(); _reiniciarLanzadorLocal(); push.mockReset(); });

function marco(clase: ClaseTamano): ContextoMarcoUnificado {
    const base = clase === "panoramico" || clase === "torre" ? "m" : clase;
    return { acento: "#a3e635", acento2: "#7c5cff", clase, base, horizontal: clase === "panoramico", espaciado: ESPACIADO_MARCO[base] };
}

function lanzador(settings: Record<string, unknown> = {}): DashboardWidget {
    return { id: "w-lanzador", dashboard_id: "d", widget_type: "APP_LAUNCHER", layout: { x: 0, y: 0, w: 12, h: 2, i: "w" }, settings, created_at: "" } as DashboardWidget;
}

function montar(clase: ClaseTamano, settings?: Record<string, unknown>) {
    return render(<ContextoMarco.Provider value={marco(clase)}><AppLauncherWidget widget={lanzador(settings)} /></ContextoMarco.Provider>);
}

describe("Lanzador de apps por tamaño", () => {
    it.each(["micro", "s", "m", "l", "xl", "panoramico", "torre"] as ClaseTamano[])("se pinta en %s sin romperse", (clase) => {
        const { container } = montar(clase);
        const raiz = container.querySelector("[data-widget-e='APP_LAUNCHER']");
        expect(raiz).not.toBeNull();
        expect(raiz!.getAttribute("data-clase")).toBe(clase);
        expect(screen.getAllByRole("region", { name: /Lanzador/ }).length).toBe(1);
    });

    it("micro es un solo glifo que abre el cajón con todas", () => {
        montar("micro");
        fireEvent.click(screen.getByRole("button", { name: /apps$/ }));
        expect(screen.getByRole("dialog", { name: /todas las apps/ })).toBeTruthy();
        expect(screen.getByRole("searchbox", { name: "Buscar apps" })).toBeTruthy();
    });

    it("en m busca mientras escribes e Intro abre la primera", () => {
        montar("m");
        const buscar = screen.getByRole("searchbox", { name: "Buscar apps" });
        fireEvent.change(buscar, { target: { value: "mensa" } });
        const celdas = screen.getAllByRole("gridcell");
        expect(celdas[0].getAttribute("aria-label")).toMatch(/Mensajes/);
        fireEvent.keyDown(buscar, { key: "Enter" });
        expect(push).toHaveBeenCalledWith("/messages");
    });

    it("dice la verdad cuando nada coincide", () => {
        montar("l");
        fireEvent.change(screen.getByRole("searchbox", { name: "Buscar apps" }), { target: { value: "qqqzz" } });
        expect(screen.getByRole("status").textContent).toMatch(/Ninguna app coincide/);
    });

    it("el menú es vertical y fija la app para todos los lanzadores", () => {
        montar("l");
        const primera = screen.getAllByRole("gridcell")[0];
        fireEvent.contextMenu(primera, { clientX: 10, clientY: 10 });
        const menu = screen.getByRole("menu");
        expect(menu.className).toMatch(/flex-col/);
        act(() => { fireEvent.click(screen.getByRole("menuitem", { name: /Fijar arriba/ })); });
        expect(JSON.parse(window.localStorage.getItem(CLAVE_FIJADAS) ?? "[]").length).toBe(1);
    });

    it("las flechas mueven el foco dentro de la rejilla", () => {
        montar("l");
        const celdas = screen.getAllByRole("gridcell");
        celdas[0].focus();
        fireEvent.keyDown(celdas[0], { key: "ArrowRight" });
        expect(document.activeElement).toBe(celdas[1]);
    });

    it("una colección vacía invita a elegir apps", () => {
        montar("m", { collection: "custom", appIds: [] });
        expect(screen.getByText("Este lanzador está vacío")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Elegir apps" })).toBeTruthy();
    });

    it("la variante de una sola app pinta su tesela grande", () => {
        montar("m", { variant: "single", collection: "custom", appIds: ["clima"] });
        expect(screen.getByRole("button", { name: /Abrir Clima/ })).toBeTruthy();
    });
});

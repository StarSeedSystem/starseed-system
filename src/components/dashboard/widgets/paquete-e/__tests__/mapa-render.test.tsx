import * as React from "react";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
    ubic: null as any,
    puntos: { paginas: [] as any[], grupos: [] as any[], eventos: [] as any[] },
    marcadores: [] as { titulo: string; ficha: HTMLElement | null }[],
    fallaMapa: false,
}));

vi.mock("next/link", () => ({ default: ({ href, children, prefetch: _p, ...r }: any) => <a href={String(href)} {...r}>{children}</a> }));
vi.mock("@/modules/weather/context/weather-location-context", () => ({ useWeatherLocationOpcional: () => h.ubic }));
vi.mock("@/lib/os-social", () => ({ fetchPages: async () => h.puntos.paginas, fetchGroups: async () => h.puntos.grupos, fetchEvents: async () => h.puntos.eventos }));
vi.mock("@/lib/map/leaflet-loader", () => ({
    loadLeaflet: async () => {
        if (h.fallaMapa) throw new Error("sin red");
        const capa = () => ({ addTo() { return this; }, remove() {}, clearLayers() {} });
        return {
            map: () => ({ remove() {}, invalidateSize() {}, setView() {}, getZoom: () => 12 }),
            layerGroup: () => ({ addTo() { return this; }, clearLayers() {} }),
            tileLayer: () => capa(),
            divIcon: (o: any) => o,
            marker: (_ll: any, o: any) => {
                const m: any = { ficha: null as HTMLElement | null, addTo() { h.marcadores.push({ titulo: o.title ?? "yo", ficha: m.ficha }); return m; }, bindPopup(f: HTMLElement) { m.ficha = f; return m; }, setLatLng() {} };
                return m;
            },
        };
    },
}));

import { entornoNavegador, montarEn, TODAS } from "../pruebas-render";
import { _vaciarCacheE } from "../cache";
import { distanciaKm, formatearDistancia, ordenarPorCercania } from "../geo";
import { MapWidget } from "../../map-widget";

beforeAll(entornoNavegador);
beforeEach(() => {
    h.ubic = { location: { lat: 40.4168, lon: -3.7038, name: "Madrid" }, requestGeolocation: vi.fn(async () => {}) };
    h.puntos = { paginas: [], grupos: [], eventos: [] };
    h.marcadores = [];
    h.fallaMapa = false;
});
afterEach(() => { cleanup(); window.localStorage.clear(); _vaciarCacheE(); });

async function montar(clase: any) {
    let r!: ReturnType<typeof montarEn>;
    await act(async () => { r = montarEn(clase, <MapWidget />, "#14b8a6"); });
    await act(async () => { await new Promise((ok) => setTimeout(ok, 0)); });
    await act(async () => { await new Promise((ok) => setTimeout(ok, 0)); });
    return r;
}

describe("geografía pura", () => {
    it("mide y formatea distancias", () => {
        const madrid = { lat: 40.4168, lng: -3.7038 }, toledo = { lat: 39.8628, lng: -4.0273 };
        expect(distanciaKm(madrid, toledo)).toBeGreaterThan(65);
        expect(distanciaKm(madrid, toledo)).toBeLessThan(70);
        expect(formatearDistancia(0.234)).toBe("230 m");
        expect(formatearDistancia(3.26)).toBe("3,3 km");
        expect(formatearDistancia(1234)).toBe("1.234 km");
        expect(ordenarPorCercania([toledo, madrid], madrid, 10)).toHaveLength(1);
    });
});

describe("Mapa", () => {
    it.each(TODAS)("se pinta en %s", async (clase) => {
        const { container } = await montar(clase);
        expect(container.querySelector("[data-widget-e='MAP_LOCATION']")?.getAttribute("data-clase")).toBe(clase);
    });

    it("dice que la ubicación es por defecto y la pide con un toque", async () => {
        await montar("m");
        expect(screen.getByText("ubicación por defecto")).toBeTruthy();
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Usar mi ubicación" })); });
        expect(h.ubic.requestGeolocation).toHaveBeenCalled();
    });

    it("solo pinta lugares con coordenadas reales, ordenados por cercanía", async () => {
        window.localStorage.setItem("starseed_weather_location", "{}");
        h.puntos.paginas = [
            { id: "1", slug: "huerta", name: "Huerta del Retiro", kind: "comunidad", description: "", tags: [], accent: "#fff", memberCount: 5, lat: 40.41, lng: -3.68, placeLabel: "Retiro" },
            { id: "2", slug: "sin-geo", name: "Sin coordenadas", kind: "comunidad", description: "", tags: [], accent: "#fff", memberCount: 5 },
        ];
        h.puntos.eventos = [{ id: "e", slug: "asamblea", title: "Asamblea en Toledo", kind: "asamblea", description: "", startsAt: null, location: "Toledo", organizerSlug: "", tags: [], attendeeCount: 0, lat: 39.86, lng: -4.02 }];
        await montar("xl");
        const lista = screen.getByRole("region", { name: "Cerca de ti" });
        const nombres = Array.from(lista.querySelectorAll("button")).map((b) => b.textContent);
        expect(nombres[0]).toMatch(/Huerta del Retiro/);
        expect(nombres[1]).toMatch(/Asamblea en Toledo/);
        expect(lista.textContent).not.toMatch(/Sin coordenadas/);
        expect(screen.queryByText("ubicación por defecto")).toBeNull();
    });

    it("las fichas de los marcadores son texto, no HTML de la red", async () => {
        h.puntos.paginas = [{ id: "x", slug: "x", name: "<img src=x onerror=alert(1)>", kind: "comunidad", description: "", tags: [], accent: "#fff", memberCount: 1, lat: 40.41, lng: -3.7 }];
        await montar("l");
        const m = h.marcadores.find((x) => x.titulo.startsWith("<img"));
        expect(m?.ficha?.querySelector("img")).toBeNull();
        expect(m?.ficha?.textContent).toContain("<img src=x onerror=alert(1)>");
    });

    it("sin lugares lo dice", async () => {
        await montar("l");
        expect(screen.getByRole("region", { name: "Cerca de ti" }).textContent).toMatch(/Vacío por ahora/);
    });

    it("si el mapa no carga, ofrece reintentar", async () => {
        h.fallaMapa = true;
        await montar("m");
        expect(screen.getByRole("alert").textContent).toMatch(/No se pudo cargar el mapa/);
    });
});

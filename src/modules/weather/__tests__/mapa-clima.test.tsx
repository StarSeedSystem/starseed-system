import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    analizarRadar, analizarRejilla, centroRejilla, fuenteRadar, fuenteRejilla, rejillaAlrededor, rumboHacia, urlRejilla, urlTeselaRadar,
} from "../datos/mapa";

// Leaflet no pinta en jsdom: se sustituye por piezas que dejan ver qué capa se monta.
vi.mock("react-leaflet", () => ({
    MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="mapa">{children}</div>,
    TileLayer: ({ url }: { url: string }) => <i data-testid="tesela" data-url={url} />,
    Marker: ({ title }: { title?: string }) => <i data-testid="marcador" data-titulo={title ?? ""} />,
    ZoomControl: () => null,
    useMap: () => ({ flyTo: vi.fn(), setView: vi.fn(), getZoom: () => 7 }),
}));
vi.mock("leaflet", () => ({ default: { divIcon: (o: { html: string }) => ({ html: o.html }) } }));
vi.mock("leaflet/dist/leaflet.css", () => ({}));

import ClimateMapInternal, { resumenRejilla } from "../components/widgets/terrestrial/climate-map-internal";

const RADAR = {
    version: "2.0", generated: 1759180000, host: "https://tilecache.rainviewer.com",
    radar: { past: [{ time: 1759176000, path: "/v2/radar/1759176000" }, { time: 1759176600, path: "/v2/radar/1759176600" }, { time: 1759177200, path: "/v2/radar/1759177200" }] },
};
const rejillaJson = (n: number) => Array.from({ length: n }, (_, i) => ({ current: { temperature_2m: 14 + i * 0.4, wind_speed_10m: 8 + i, wind_direction_10m: 225, weather_code: 2 } }));

let falla = false;
beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("starseed_weather_location", JSON.stringify({ lat: 39.47, lon: -0.38, name: "València", timezone: "Europe/Madrid" }));
    fuenteRadar._vaciar();
    fuenteRejilla._vaciar();
    falla = false;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
        if (falla) throw new Error("red caída");
        if (String(url).includes("rainviewer")) return { ok: true, status: 200, json: async () => RADAR };
        return { ok: true, status: 200, json: async () => rejillaJson(25) };
    }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Mapa del clima · datos puros", () => {
    it("radar de RainViewer: fotos ordenadas y teselas sin tocar el color", () => {
        const d = analizarRadar(RADAR);
        expect(d.fotos).toHaveLength(3);
        expect(d.fotos[2].t).toBe(1759177200_000);
        expect(urlTeselaRadar(d, d.fotos[2])).toBe("https://tilecache.rainviewer.com/v2/radar/1759177200/256/{z}/{x}/{y}/4/1_1.png");
        expect(() => analizarRadar({ radar: { past: [] } })).toThrow(/sin imágenes/);
        // Un host o una ruta raros no se cuelan en la URL.
        const raro = analizarRadar({ host: "javascript:alert(1)", radar: { past: [{ time: 5, path: "/../../x" }] } });
        expect(urlTeselaRadar(raro, raro.fotos[0])).toBe("https://tilecache.rainviewer.com/v2/radar/5/256/{z}/{x}/{y}/4/1_1.png");
    });
    it("rejilla de 25 puntos alrededor, una URL y huecos honestos", () => {
        const c = centroRejilla(39.47, -0.38);
        expect(c).toEqual({ lat: 39.5, lon: -0.5 });
        const p = rejillaAlrededor(c);
        expect(p).toHaveLength(25);
        expect(p[12]).toEqual({ lat: 39.5, lon: -0.5 });
        expect(rejillaAlrededor({ lat: 0, lon: 179.5 }, 3, 1).some((x) => x.lon < -179)).toBe(true);
        expect(urlRejilla(p.slice(0, 2))).toContain("latitude=37.9,37.9&longitude=-2.1,-1.3");
        const r = analizarRejilla([{ current: { temperature_2m: 20 } }, {}], p.slice(0, 2));
        expect(r[0].temp).toBe(20);
        expect(r[1].temp).toBeNull();
        expect(analizarRejilla({ current: { wind_speed_10m: 5 } }, p.slice(0, 1))[0].viento).toBe(5);
        expect(rumboHacia(225)).toBe(45);
        expect(rumboHacia(null)).toBeNull();
    });
    it("resumen en texto de cada capa", () => {
        const puntos = analizarRejilla(rejillaJson(25), rejillaAlrededor({ lat: 39.5, lon: -0.5 }));
        expect(resumenRejilla(puntos, "temperature", { temp: "c", viento: "kmh" })).toBe("De 14° a 24° a unos 150 km a la redonda; en tu zona, 19°.");
        expect(resumenRejilla(puntos, "wind", { temp: "c", viento: "kmh" })).toBe("Viento de 8 a 32 km/h; en tu zona sopla del sudoeste.");
    });
});

describe("Mapa del clima · capas reales", () => {
    it("lluvia por defecto: el último radar con su hora y reproducción a demanda", async () => {
        render(<ClimateMapInternal />);
        expect(await screen.findByText(/Radar de las .* · el último/)).toBeInTheDocument();
        const teselas = screen.getAllByTestId("tesela").map((t) => t.getAttribute("data-url"));
        expect(teselas).toContain("https://tilecache.rainviewer.com/v2/radar/1759177200/256/{z}/{x}/{y}/4/1_1.png");
        expect(teselas.some((u) => u?.includes("openweathermap"))).toBe(false);
        fireEvent.change(screen.getByRole("slider", { name: "Hora del radar" }), { target: { value: "0" } });
        expect(screen.getAllByTestId("tesela").some((t) => t.getAttribute("data-url")?.includes("/1759176000/"))).toBe(true);
        expect(screen.getByRole("button", { name: "Ver las últimas 2 horas del radar" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Volver a mi sitio" })).toBeInTheDocument();
    });

    it("temperatura: 25 puntos de Open-Meteo en una petición y su resumen", async () => {
        render(<ClimateMapInternal activeOverlay="temperature" />);
        expect(await screen.findByText(/De 14° a 24° a unos 150 km/)).toBeInTheDocument();
        expect(screen.getAllByTestId("marcador").length).toBe(26);
        const llamadas = (fetch as unknown as { mock: { calls: string[][] } }).mock.calls.filter(([u]) => String(u).includes("open-meteo"));
        expect(llamadas).toHaveLength(1);
        fireEvent.click(screen.getByRole("button", { name: /Viento/ }));
        expect(await screen.findByText(/sopla del sudoeste/)).toBeInTheDocument();
    });

    it("la vista manda: apagar su capa deja el mapa sin capa", async () => {
        const { rerender } = render(<ClimateMapInternal />);
        await screen.findByText(/Radar de las/);
        rerender(<ClimateMapInternal activeOverlay="wind" />);
        expect(screen.getByRole("button", { name: /Viento/ })).toHaveAttribute("aria-pressed", "true");
        rerender(<ClimateMapInternal activeOverlay={undefined} />);
        expect(screen.getByText(/Sin capa/)).toBeInTheDocument();
    });

    it("sin sitio no pide la rejilla: lo ofrece", async () => {
        localStorage.clear();
        render(<ClimateMapInternal activeOverlay="wind" />);
        expect(await screen.findByRole("button", { name: "Usar mi ubicación" })).toBeInTheDocument();
        expect((fetch as unknown as { mock: { calls: string[][] } }).mock.calls.filter(([u]) => String(u).includes("open-meteo"))).toHaveLength(0);
    });

    it("si RainViewer falla, lo dice y ofrece reintentar; sin capa, lo explica", async () => {
        falla = true;
        render(<ClimateMapInternal />);
        expect(await screen.findByRole("button", { name: /Reintentar/ })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /Lluvia/ }));
        expect(screen.getByText(/Sin capa/)).toBeInTheDocument();
    });
});

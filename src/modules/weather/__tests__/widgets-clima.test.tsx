import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextoMarco, type ContextoMarcoUnificado } from "@/components/dashboard/kit/contexto-marco";
import { ESPACIADO_MARCO } from "@/components/widgets-libres/marco-unificado";
import type { ClaseTamano } from "@/lib/widgets/forma/tamanos";
import { disenoDe } from "@/components/widgets-libres/familias/comun";
import { respuestaPara } from "../__pruebas__/fixtures";
import { fuenteAire, fuentePronostico } from "../datos/open-meteo";

vi.mock("next/link", () => ({ default: ({ href, children, ...r }: any) => <a href={String(href)} {...r}>{children}</a> }));

import { WeatherBasicWidget } from "../components/widgets/terrestrial/weather-basic-widget";
import { WeatherBasicAuroraWidget } from "../components/widgets/terrestrial/weather-basic-aurora";
import { WeatherBasicCrystallineWidget } from "../components/widgets/terrestrial/weather-basic-crystalline";
import { WeatherBasicFluidWidget } from "../components/widgets/terrestrial/weather-basic-fluid";
import { WeatherBasicFloraWidget } from "../components/widgets/terrestrial/weather-basic-flora";
import { WeatherOmniClimateWidget } from "../components/widgets/terrestrial/weather-omni-climate";
import { WeatherTemperatureWidget } from "../components/widgets/terrestrial/weather-temperature-widget";
import { WeatherWindWidget } from "../components/widgets/terrestrial/weather-wind-widget";
import { WeatherHumidityWidget } from "../components/widgets/terrestrial/weather-humidity-widget";
import { WeatherUvWidget } from "../components/widgets/terrestrial/weather-uv-widget";
import { WeatherAirQualityWidget } from "../components/widgets/terrestrial/weather-air-quality-widget";
import { WeatherAstronomyWidget } from "../components/widgets/terrestrial/weather-astronomy-widget";
import { WeatherHolisticWidget } from "../components/widgets/terrestrial/weather-holistic-widget";

function marco(clase: ClaseTamano): ContextoMarcoUnificado {
    const { base, horizontal } = disenoDe(clase);
    return { acento: "#38bdf8", acento2: "#fde047", clase, base, horizontal, espaciado: ESPACIADO_MARCO[base] };
}

function pintar(el: React.ReactElement, clase: ClaseTamano) {
    return render(<ContextoMarco.Provider value={marco(clase)}>{el}</ContextoMarco.Provider>);
}

let falla = false;
beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("starseed_weather_location", JSON.stringify({ lat: 39.47, lon: -0.38, name: "València", country: "España", timezone: "Europe/Madrid" }));
    fuentePronostico._vaciar();
    fuenteAire._vaciar();
    falla = false;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
        if (falla) throw new Error("red caída");
        return { ok: true, status: 200, json: async () => respuestaPara(String(url)) };
    }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const TAMANOS: ClaseTamano[] = ["micro", "s", "m", "l", "xl", "panoramico", "torre"];

describe("El tiempo (WEATHER_BASIC) · un diseño por tamaño", () => {
    it.each(TAMANOS)("pinta datos reales en %s sin romperse", async (clase) => {
        pintar(<WeatherBasicWidget />, clase);
        expect(await screen.findAllByText(/22°/)).not.toHaveLength(0);
        if (clase !== "micro") expect(screen.getAllByText(/Parcialmente nuboso/).length).toBeGreaterThan(0);
        if (clase === "m" || clase === "l" || clase === "xl") expect(screen.getByRole("button", { name: "Acciones del clima" })).toBeInTheDocument();
        if (clase === "l") expect(screen.getByRole("img", { name: /Temperatura de/ })).toBeInTheDocument();
        if (clase === "xl") expect(screen.getByRole("img", { name: /Viento SE/ })).toBeInTheDocument();
    });

    it("sin ubicación pide una en vez de inventar", async () => {
        localStorage.clear();
        pintar(<WeatherBasicWidget />, "m");
        expect(await screen.findByText("Elige dónde mirar el cielo")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Usar mi ubicación" })).toBeInTheDocument();
    });

    it("si Open-Meteo falla, lo dice y ofrece reintentar", async () => {
        falla = true;
        pintar(<WeatherBasicWidget />, "m");
        expect(await screen.findByRole("button", { name: /Reintentar/ })).toBeInTheDocument();
    });

    it("una sola petición para varios widgets del mismo sitio", async () => {
        pintar(<><WeatherBasicWidget /><WeatherTemperatureWidget /><WeatherWindWidget /></>, "m");
        await screen.findAllByText(/22°/);
        const llamadas = (fetch as unknown as { mock: { calls: string[][] } }).mock.calls.filter(([u]) => String(u).includes("api.open-meteo.com"));
        expect(llamadas).toHaveLength(1);
    });

    it.each([
        ["aurora", WeatherBasicAuroraWidget], ["cristal", WeatherBasicCrystallineWidget], ["fluido", WeatherBasicFluidWidget],
        ["flora", WeatherBasicFloraWidget], ["omni", WeatherOmniClimateWidget],
    ] as const)("la variante %s comparte datos y cambia el estilo", async (_n, W) => {
        pintar(<W />, "m");
        expect(await screen.findAllByText(/22°/)).not.toHaveLength(0);
    });
});

describe("Widgets del tiempo por magnitud", () => {
    it.each(["s", "m", "l"] as const)("temperatura en %s", async (clase) => {
        pintar(<WeatherTemperatureWidget />, clase);
        expect(await screen.findAllByText(/22°/)).not.toHaveLength(0);
        expect(screen.getAllByText(/Sensación/).length).toBeGreaterThan(0);
    });
    it.each(["s", "m", "l"] as const)("viento en %s", async (clase) => {
        pintar(<WeatherWindWidget />, clase);
        expect(await screen.findByRole("img", { name: /Viento SE a 14 km\/h/ })).toBeInTheDocument();
    });
    it.each(["s", "m", "l"] as const)("humedad en %s", async (clase) => {
        pintar(<WeatherHumidityWidget />, clase);
        expect(await screen.findAllByText(/56\s?%/)).not.toHaveLength(0);
    });
    it.each(["s", "m", "l"] as const)("UV en %s", async (clase) => {
        pintar(<WeatherUvWidget />, clase);
        expect(await screen.findByRole("img", { name: /Índice UV 6: Alto/ })).toBeInTheDocument();
    });
    it.each(["s", "m", "l"] as const)("aire en %s", async (clase) => {
        pintar(<WeatherAirQualityWidget />, clase);
        expect(await screen.findByRole("img", { name: /Calidad del aire razonable, índice 34/ })).toBeInTheDocument();
    });
    it.each(["micro", "s", "m", "l"] as const)("astronomía en %s", async (clase) => {
        pintar(<WeatherAstronomyWidget />, clase);
        expect(await screen.findByRole("img", { name: /iluminada al \d+ %/ })).toBeInTheDocument();
        if (clase === "m" || clase === "l") expect(screen.getByRole("img", { name: /Sale el sol a las/ })).toBeInTheDocument();
    });
    it.each(["s", "m", "l", "xl"] as const)("esfera holística en %s", async (clase) => {
        pintar(<WeatherHolisticWidget />, clase);
        expect(await screen.findByRole("img", { name: /Esfera del tiempo/ })).toBeInTheDocument();
    });
});

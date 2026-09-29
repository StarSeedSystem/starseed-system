import * as React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextoMarco, type ContextoMarcoUnificado } from "@/components/dashboard/kit/contexto-marco";
import { ESPACIADO_MARCO } from "@/components/widgets-libres/marco-unificado";
import { disenoDe } from "@/components/widgets-libres/familias/comun";
import type { ClaseTamano } from "@/lib/widgets/forma/tamanos";
import { respuestaPara } from "../__pruebas__/fixtures";
import { fuenteAire, fuentePronostico, type DiaClima, type HoraClima } from "../datos/open-meteo";
import {
    aPresion, cambioVisibilidad, causaVisibilidad, contrasteA, fraseSemana, horasDelDia, lecturaBarometro, nivelVisibilidad, riesgoNiebla,
    tendenciaPresion, textoCambio, textoDistancia, textoLuz, textoPresion, zonaBarometro,
} from "../datos/barometro";

vi.mock("next/link", () => ({ default: ({ href, children, ...r }: any) => <a href={String(href)} {...r}>{children}</a> }));

import { WeatherPressureWidget } from "../components/widgets/terrestrial/weather-pressure-widget";
import { WeatherVisibilityWidget, hastaDondeSeVe } from "../components/widgets/terrestrial/weather-visibility-widget";
import { WeatherForecastWidget } from "../components/widgets/terrestrial/weather-forecast-widget";

function marco(clase: ClaseTamano): ContextoMarcoUnificado {
    const { base, horizontal } = disenoDe(clase);
    return { acento: "#a5b4fc", acento2: "#fcd34d", clase, base, horizontal, espaciado: ESPACIADO_MARCO[base] };
}
const pintar = (el: React.ReactElement, clase: ClaseTamano) => render(<ContextoMarco.Provider value={marco(clase)}>{el}</ContextoMarco.Provider>);
const TAMANOS: ClaseTamano[] = ["micro", "s", "m", "l", "xl", "panoramico", "torre"];

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

// ── Lógica pura ───────────────────────────────────────────────────────

const H = 3_600_000;
function serie(presiones: (number | null)[], t0 = Date.parse("2026-09-29T00:00:00Z")): HoraClima[] {
    return presiones.map((p, i) => ({
        t: t0 + i * H, temp: 20, sensacion: 20, humedad: 60, rocio: 12, probLluvia: 0, lluvia: 0, codigo: 1, nubes: 10,
        visibilidad: 24000, viento: 10, dirViento: 90, rachas: 20, uv: 3, esDia: true, presion: p,
    }));
}

describe("Barómetro · lógica pura", () => {
    it("tendencia de 3 h con los tramos de la Met Office", () => {
        const t0 = Date.parse("2026-09-29T00:00:00Z");
        const ahora = t0 + 4 * H + 60_000;
        expect(tendenciaPresion(serie([1015, 1015, 1015, 1015, 1015.05]), ahora)?.tipo).toBe("estable");
        expect(tendenciaPresion(serie([1015, 1015, 1015, 1015, 1016]), ahora)?.texto).toBe("Sube despacio");
        expect(tendenciaPresion(serie([1015, 1015, 1015, 1015, 1012.5]), ahora)?.texto).toBe("Baja");
        expect(tendenciaPresion(serie([1015, 1015, 1015, 1015, 1010]), ahora)?.tipo).toBe("baja-rapido");
        expect(tendenciaPresion(serie([1015, 1015, 1015, 1015, 1022]), ahora)?.texto).toBe("Sube muy deprisa");
        expect(tendenciaPresion(serie([1015, 1015, 1015, 1015, 1016]), ahora)?.antes).toBe(1015);
        // Sin 3 h de historia o con un hueco no se inventa tendencia.
        expect(tendenciaPresion(serie([1015, 1016]), t0 + H)).toBeNull();
        expect(tendenciaPresion(serie([1015, null, 1015, 1015, 1016]), ahora)).toBeNull();
    });
    it("lectura del barómetro y zonas de la esfera", () => {
        expect(lecturaBarometro(null, null)).toMatch(/Sin lectura/);
        const baja = tendenciaPresion(serie([1010, 1010, 1010, 1010, 1005]), Date.parse("2026-09-29T04:01:00Z"));
        expect(lecturaBarometro(1005, baja)).toMatch(/borrasca/);
        expect(lecturaBarometro(1030, null)).toMatch(/Alta presión/);
        expect(zonaBarometro(1017)?.nombre).toBe("Buen tiempo");
        expect(zonaBarometro(965)?.nombre).toBe("Tempestad");
        expect(zonaBarometro(1060)?.nombre).toBe("Muy seco");
        expect(zonaBarometro(null)).toBeNull();
    });
    it("unidades de presión", () => {
        expect(textoPresion(1013.25, "hpa")).toBe("1013");
        expect(textoPresion(1013.25, "mmhg")).toBe("760");
        expect(textoPresion(1013.25, "inhg")).toBe("29,92");
        expect(textoPresion(null, "hpa")).toBe("—");
        expect(textoCambio(-1.24, "hpa")).toBe("−1,2");
        expect(textoCambio(0, "hpa")).toBe("±0,0");
        expect(aPresion(1000, "mmhg")).toBeCloseTo(750.06, 1);
    });
});

describe("Visibilidad · lógica pura", () => {
    it("niveles, distancias y causas", () => {
        expect(nivelVisibilidad(500)?.texto).toBe("Muy mala");
        expect(nivelVisibilidad(39460)?.texto).toBe("Muy buena");
        expect(nivelVisibilidad(null)).toBeNull();
        expect(textoDistancia(347)).toBe("350 m");
        expect(textoDistancia(4200)).toBe("4,2 km");
        expect(textoDistancia(24000)).toBe("24 km");
        expect(causaVisibilidad(600, 99, 45)).toBe("Niebla");
        expect(causaVisibilidad(3000, 95, 2)).toMatch(/Neblina/);
        expect(causaVisibilidad(3000, 40, 2)).toMatch(/Calima/);
        expect(causaVisibilidad(3000, 95, 63)).toMatch(/lluvia/);
        expect(causaVisibilidad(30000, 95, 2)).toBeNull();
    });
    it("riesgo de niebla por el margen hasta el rocío", () => {
        expect(riesgoNiebla(10, 9.4, 4)?.nivel).toBe("alto");
        expect(riesgoNiebla(10, 8, 20)?.nivel).toBe("posible");
        expect(riesgoNiebla(22.4, 14.2, 14)?.nivel).toBe("bajo");
        expect(riesgoNiebla(null, 10, 3)).toBeNull();
    });
    it("Koschmieder: contraste y hasta dónde se ve", () => {
        expect(contrasteA(10, 10000)).toBeCloseTo(0.02, 3);
        expect(contrasteA(1, null)).toBe(0);
        expect(hastaDondeSeVe(60000)).toBe(5);
        expect(hastaDondeSeVe(800)).toBe(0);
        expect(hastaDondeSeVe(300)).toBe(-1);
        expect(hastaDondeSeVe(null)).toBe(-1);
    });
    it("próximo cambio de visibilidad", () => {
        const h = serie([1015, 1015, 1015, 1015]);
        h[2].visibilidad = 600;
        expect(cambioVisibilidad(h, () => "02:00")).toBe("Niebla prevista hacia las 02:00");
        h[0].visibilidad = 400; h[3].visibilidad = 8000;
        expect(cambioVisibilidad(h, () => "03:00")).toBe("Se despeja hacia las 03:00");
    });
});

describe("Pronóstico · lógica pura", () => {
    const dia = (i: number, codigo: number, prob: number, max: number): DiaClima => ({
        t: Date.parse("2026-09-29T00:00:00Z") + i * 86_400_000, codigo, max, min: max - 10, orto: null, ocaso: null, luzSeg: null,
        uvMax: null, lluviaMm: null, probLluvia: prob, vientoMax: null, rachasMax: null, dirDominante: null,
    });
    const nombre = () => "jue";
    it("la semana en una frase", () => {
        expect(fraseSemana([dia(0, 2, 5, 27), dia(1, 3, 10, 26), dia(2, 95, 90, 23), dia(3, 61, 60, 22), dia(4, 0, 0, 24)], nombre))
            .toBe("Tormenta el jue (90 %); lluvia el jue · mejor día: el jue.");
        expect(fraseSemana([dia(0, 0, 0, 20), dia(1, 1, 5, 22), dia(2, 1, 0, 25)], nombre)).toMatch(/máximas suben de 20° a 25°/);
        expect(fraseSemana([dia(0, 0, 0, 20), dia(1, 1, 5, 21)], nombre)).toMatch(/Semana seca y estable/);
        expect(fraseSemana([dia(0, 61, 80, 15), dia(1, 63, 90, 14)], nombre)).toBe("Lluvia hoy y mañana.");
        expect(fraseSemana([dia(0, 0, 0, 20)], nombre)).toBeNull();
    });
    it("horas de luz y horas de un día", () => {
        expect(textoLuz(42600)).toBe("11 h 50 min");
        expect(textoLuz(null)).toBe("—");
        const d0 = dia(0, 0, 0, 20), d1 = dia(1, 0, 0, 20);
        expect(horasDelDia(serie(Array.from({ length: 30 }, () => 1015)), d0, d1)).toHaveLength(24);
    });
});

// ── Composición por tamaño ────────────────────────────────────────────

describe("Presión · un barómetro por tamaño con datos reales", () => {
    it.each(TAMANOS)("pinta la presión real en %s", async (clase) => {
        pintar(<WeatherPressureWidget />, clase);
        if (clase === "micro") {
            expect(await screen.findByRole("img", { name: /Presión 1017 hPa, estable/ })).toBeInTheDocument();
            return;
        }
        expect(await screen.findByRole("img", { name: /Barómetro: 1017 hPa, zona «Buen tiempo»; hace 3 h marcaba 1016/ })).toBeInTheDocument();
        if (clase !== "s") expect(screen.getByRole("button", { name: "Acciones del clima" })).toBeInTheDocument();
        if (clase === "l" || clase === "xl" || clase === "panoramico" || clase === "torre") expect(screen.getByRole("img", { name: /Presión de .* ahora 1016 hPa/ })).toBeInTheDocument();
        if (clase === "xl") expect(screen.getByText("Mínima prevista")).toBeInTheDocument();
    });

    it("la unidad elegida (mmHg) se aplica a todos los barómetros", async () => {
        localStorage.setItem("starseed.clima.presion.v1", "mmhg");
        pintar(<WeatherPressureWidget />, "m");
        expect(await screen.findByRole("img", { name: /Barómetro: 763 mmHg/ })).toBeInTheDocument();
    });

    it("sin ubicación pide una y si Open-Meteo falla ofrece reintentar", async () => {
        localStorage.clear();
        pintar(<WeatherPressureWidget />, "m");
        expect(await screen.findByRole("button", { name: "Usar mi ubicación" })).toBeInTheDocument();
        cleanup();
        localStorage.setItem("starseed_weather_location", JSON.stringify({ lat: 39.47, lon: -0.38, name: "València" }));
        falla = true;
        pintar(<WeatherPressureWidget />, "m");
        expect(await screen.findByRole("button", { name: /Reintentar/ })).toBeInTheDocument();
    });
});

describe("Visibilidad · el horizonte por tamaño", () => {
    it.each(TAMANOS)("pinta la visibilidad real en %s", async (clase) => {
        pintar(<WeatherVisibilityWidget />, clase);
        if (clase === "micro") {
            expect(await screen.findByRole("img", { name: /Visibilidad 39 km, muy buena/ })).toBeInTheDocument();
            return;
        }
        expect(await screen.findByRole("img", { name: /Horizonte: se distingue hasta la cresta a 22 km/ })).toBeInTheDocument();
        expect(screen.getAllByText("39 km").length).toBeGreaterThan(0);
        if (clase === "l" || clase === "xl" || clase === "torre") expect(screen.getByText(/Sin riesgo de niebla/)).toBeInTheDocument();
        if (clase === "l" || clase === "xl") expect(screen.getByRole("img", { name: /Visibilidad de las próximas 24 horas/ })).toBeInTheDocument();
    });

    it("si Open-Meteo falla, lo dice y ofrece reintentar", async () => {
        falla = true;
        pintar(<WeatherVisibilityWidget />, "l");
        expect(await screen.findByRole("button", { name: /Reintentar/ })).toBeInTheDocument();
    });
});

describe("Pronóstico · la semana por tamaño", () => {
    it.each(TAMANOS)("pinta el pronóstico real en %s", async (clase) => {
        pintar(<WeatherForecastWidget />, clase);
        if (clase === "micro") {
            expect(await screen.findByRole("img", { name: /Hoy: Parcialmente nuboso, de 16° a 27°/ })).toBeInTheDocument();
            return;
        }
        if (clase === "s") {
            expect(await screen.findByLabelText(/Mañana: Cubierto, de 15° a 26°/)).toBeInTheDocument();
            return;
        }
        expect((await screen.findAllByText(/Tormenta .* \(90 %\); lluvia .* · mejor día/)).length).toBeGreaterThan(0);
    });

    it("en l cambia de días a horas y de temperatura a lluvia", async () => {
        pintar(<WeatherForecastWidget />, "l");
        fireEvent.click(await screen.findByRole("tab", { name: "48 horas" }));
        expect(screen.getByRole("img", { name: /Temperatura de/ })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("tab", { name: /Lluvia/ }));
        expect(screen.getByRole("img", { name: /Probabilidad de lluvia por horas/ })).toBeInTheDocument();
    });

    it("en xl tocar un día enseña su detalle", async () => {
        pintar(<WeatherForecastWidget />, "xl");
        const lista = await screen.findByRole("list", { name: "Próximos días" });
        const botones = within(lista).getAllByRole("button");
        expect(botones[0]).toHaveAttribute("aria-pressed", "true");
        fireEvent.click(botones[2]);
        expect(botones[2]).toHaveAttribute("aria-pressed", "true");
        const detalle = screen.getByRole("region", { name: /Detalle de/ });
        expect(within(detalle).getByText("Tormenta")).toBeInTheDocument();
        expect(within(detalle).getByText(/12,4 mm/)).toBeInTheDocument();
    });

    it("comparte la petición con el resto del clima", async () => {
        pintar(<><WeatherForecastWidget /><WeatherPressureWidget /><WeatherVisibilityWidget /></>, "m");
        await screen.findAllByRole("img", { name: /Barómetro/ });
        const llamadas = (fetch as unknown as { mock: { calls: string[][] } }).mock.calls.filter(([u]) => String(u).includes("api.open-meteo.com"));
        expect(llamadas).toHaveLength(1);
    });
});

import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextoMarco, type ContextoMarcoUnificado } from "@/components/dashboard/kit/contexto-marco";
import { ESPACIADO_MARCO } from "@/components/widgets-libres/marco-unificado";
import { disenoDe } from "@/components/widgets-libres/familias/comun";
import type { ClaseTamano } from "@/lib/widgets/forma/tamanos";
import { respuestaPara } from "../__pruebas__/fixtures";
import { fuentePronostico } from "../datos/open-meteo";
import { fuenteEscalas, fuenteKp } from "../datos/noaa";
import { analizarNoticias, analizarSismos, distanciaKm, fuenteNoticiasEspacio, fuenteSismos } from "../datos/planeta";

vi.mock("next/link", () => ({ default: ({ href, children, ...r }: any) => <a href={String(href)} {...r}>{children}</a> }));

import { OfficialDataWidget } from "@/components/dashboard/widgets/data/official-data-widget";

function marco(clase: ClaseTamano): ContextoMarcoUnificado {
    const { base, horizontal } = disenoDe(clase);
    return { acento: "#38bdf8", acento2: "#a78bfa", clase, base, horizontal, espaciado: ESPACIADO_MARCO[base] };
}
const pintar = (clase: ClaseTamano) => render(<ContextoMarco.Provider value={marco(clase)}><OfficialDataWidget /></ContextoMarco.Provider>);

let falla = false;
beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("starseed_weather_location", JSON.stringify({ lat: 36.5, lon: -6.3, name: "Cádiz" }));
    for (const f of [fuentePronostico, fuenteKp, fuenteEscalas, fuenteSismos, fuenteNoticiasEspacio]) f._vaciar();
    falla = false;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
        if (falla) throw new Error("red caída");
        return { ok: true, status: 200, json: async () => respuestaPara(String(url)) };
    }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Datos oficiales · analizadores", () => {
    it("sismos de USGS ordenados y solo con enlaces https", () => {
        const l = analizarSismos(respuestaPara("https://earthquake.usgs.gov/x"));
        expect(l.map((x) => x.magnitud)).toEqual([5.8, 4.6]);
        expect(l[0].url).toMatch(/^https:/);
        expect(analizarSismos({ features: [{ properties: { mag: 5, time: 1, url: "javascript:alert(1)" }, geometry: { coordinates: [0, 0] } }] })[0].url).toBeNull();
        expect(() => analizarSismos({})).toThrow();
    });
    it("noticias válidas y distancia de gran círculo", () => {
        expect(analizarNoticias(respuestaPara("https://api.spaceflightnewsapi.net/x"))).toHaveLength(1);
        expect(analizarNoticias({ results: [{ title: "x", url: "http://inseguro", published_at: "2026-09-29T10:00:00Z" }] })).toHaveLength(0);
        expect(Math.round(distanciaKm(40.4168, -3.7038, 41.3874, 2.1686))).toBeGreaterThan(480);
    });
});

describe("Datos oficiales · un diseño por tamaño", () => {
    it("micro: la cifra de la fuente elegida", async () => {
        pintar("micro");
        expect(await screen.findByRole("img", { name: "Tiempo: 22°" })).toBeInTheDocument();
    });
    it("m: el tiempo de TU sitio y cambio de fuente en una lista vertical", async () => {
        pintar("m");
        expect(await screen.findByText("Cádiz")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /Fuente: Tiempo/ }));
        fireEvent.click(await screen.findByRole("option", { name: /Sismos/ }));
        expect(await screen.findByText("sismos 4,5+ en 24 h")).toBeInTheDocument();
        expect(screen.getByText(/a 3[0-9]{2} km|el más fuerte/)).toBeInTheDocument();
        expect(localStorage.getItem("starseed.datos-oficiales.fuente.v1")).toBe("sismos");
    });
    it("l: pestañas con las cuatro fuentes", async () => {
        pintar("l");
        fireEvent.click(await screen.findByRole("tab", { name: /Noticias/ }));
        const enlace = await screen.findByRole("link", { name: /Lanzamiento de una sonda solar/ });
        expect(enlace).toHaveAttribute("rel", "noopener noreferrer");
        fireEvent.click(screen.getByRole("tab", { name: /Espacio/ }));
        expect(await screen.findByText(/Sin tormenta/)).toBeInTheDocument();
    });
    it("xl: las cuatro a la vez, con su procedencia", async () => {
        pintar("xl");
        expect(await screen.findByText("sismos 4,5+ en 24 h")).toBeInTheDocument();
        expect((await screen.findAllByText(/^(Open-Meteo|NOAA SWPC|USGS|Spaceflight News)/)).length).toBeGreaterThanOrEqual(4);
    });
    it("si la fuente falla, error con reintento", async () => {
        falla = true;
        pintar("m");
        expect(await screen.findByRole("button", { name: /Reintentar/ })).toBeInTheDocument();
    });
});

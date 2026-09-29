import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaseTamano } from "@/lib/widgets/forma/tamanos";

let medida = { width: 380, height: 325 };
vi.mock("@/components/dashboard/kit/use-element-size", () => ({
    useElementSize: () => ({ ref: { current: null }, size: { ...medida, tier: "regular", vTier: "regular", landscape: true } }),
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: any) => <a href={String(href)} {...r}>{children}</a> }));
let ubicacion: any = null;
vi.mock("@/modules/weather/context/weather-location-context", () => ({ useWeatherLocationOpcional: () => ubicacion }));

import { EnMarco, MEDIDAS } from "../_catalogo/prueba-marco";
import { _vaciarCompartidos } from "../_catalogo/recurso";
import { analizarEntorno, cercanos, consultaEntorno, distancia, minutosAPie, rumbo, tipoDeEtiquetas } from "../_catalogo/entorno";
import { AbundanceRadarWidget } from "../abundance-radar-widget";

const LAT = 40.42, LON = -3.7;
/** Un nodo a `d` metros y `rb` grados de rumbo desde (LAT, LON). */
function nodo(id: number, tags: Record<string, string>, d: number, rb: number) {
    const a = (rb * Math.PI) / 180;
    return { type: "node", id, lat: LAT + (Math.cos(a) * d) / 111_195, lon: LON + (Math.sin(a) * d) / (111_195 * Math.cos((LAT * Math.PI) / 180)), tags };
}
const OSM = {
    elements: [
        nodo(1, { amenity: "drinking_water" }, 120, 0),
        nodo(2, { amenity: "public_bookcase", name: "Estantería del mercado" }, 260, 90),
        nodo(3, { leisure: "garden", "garden:type": "community", name: "Huerto de Adelfas" }, 650, 180),
        nodo(4, { emergency: "defibrillator" }, 1500, 45),
        nodo(5, { highway: "bus_stop", name: "Atocha" }, 140, 70),
        nodo(6, { amenity: "restaurant", name: "No cuenta" }, 50, 10),
    ],
};

const pedidas: string[] = [];
let respuesta: { status: number; cuerpo: unknown } = { status: 200, cuerpo: OSM };
function pintar(ui: React.ReactElement, clase: ClaseTamano) {
    medida = MEDIDAS[clase];
    return render(<EnMarco clase={clase}>{ui}</EnMarco>);
}

beforeEach(() => {
    localStorage.clear();
    _vaciarCompartidos();
    ubicacion = null;
    pedidas.length = 0;
    respuesta = { status: 200, cuerpo: OSM };
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
        pedidas.push(String(u));
        return new Response(JSON.stringify(respuesta.cuerpo), { status: respuesta.status });
    }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const TODAS: ClaseTamano[] = ["micro", "s", "m", "l", "xl", "panoramico", "torre"];

describe("Radar de Abundancia", () => {
    it.each(TODAS)("sin ubicación (%s) lo dice y no consulta el mapa", (clase) => {
        pintar(<AbundanceRadarWidget />, clase);
        expect(screen.getByRole("region").getAttribute("aria-label")).toMatch(/vacío, sin ubicación/);
        expect(pedidas).toHaveLength(0);
    });

    it.each(TODAS)("(%s) enseña los nodos comunes reales a 1 km, del más cercano al más lejano", async (clase) => {
        ubicacion = { location: { lat: LAT, lon: LON, name: "Madrid" } };
        pintar(<AbundanceRadarWidget />, clase);
        await screen.findByRole("region", { name: /3 nodos a 1 km de Madrid \(1 agua potable, 1 libros libres, 1 huerto comunitario\)\. El más cercano: Agua potable a 120 m\. Datos de OpenStreetMap/ });
        expect(pedidas).toHaveLength(1);
        expect(decodeURIComponent(pedidas[0])).toContain("amenity=drinking_water");
    });

    it("cada nodo abre en OpenStreetMap y se puede filtrar por tipo", async () => {
        ubicacion = { location: { lat: LAT, lon: LON, name: "Madrid" } };
        pintar(<AbundanceRadarWidget />, "xl");
        const enlace = await screen.findByRole("link", { name: /Estantería del mercado, libros libres a 260 m: ver en OpenStreetMap/ });
        expect(enlace.getAttribute("href")).toBe("https://www.openstreetmap.org/node/2");
        expect(enlace.getAttribute("rel")).toContain("noopener");
        fireEvent.click(screen.getByRole("button", { name: /Huertos comunitarios/ }));
        expect(screen.getByRole("list", { name: "Huertos comunitarios cerca" })).toBeTruthy();
        expect(screen.queryByRole("link", { name: /Estantería del mercado/ })).toBeNull();
        expect(screen.getByRole("link", { name: "OpenStreetMap" }).getAttribute("href")).toContain("/copyright");
    });

    it("zona sin nodos: lo dice e invita a añadirlos al mapa común", async () => {
        ubicacion = { location: { lat: LAT, lon: LON, name: "Madrid" } };
        respuesta = { status: 200, cuerpo: { elements: [] } };
        pintar(<AbundanceRadarWidget />, "m");
        expect(await screen.findByText(/Nada común mapeado/)).toBeTruthy();
        expect(screen.getByRole("link", { name: /Abrir el mapa/ }).getAttribute("href")).toContain("openstreetmap.org/#map=17/40.42000/-3.70000");
    });

    it("si el mapa común no responde, lo dice (error)", async () => {
        ubicacion = { location: { lat: LAT, lon: LON, name: "Madrid" } };
        respuesta = { status: 504, cuerpo: {} };
        pintar(<AbundanceRadarWidget />, "l");
        expect(await screen.findByRole("region", { name: /error, el mapa común no respondió/ })).toBeTruthy();
    });
});

describe("Entorno · lógica", () => {
    it("clasifica las etiquetas de OSM", () => {
        expect(tipoDeEtiquetas({ amenity: "drinking_water" })).toBe("agua");
        expect(tipoDeEtiquetas({ railway: "subway_entrance" })).toBe("metro");
        expect(tipoDeEtiquetas({ railway: "halt" })).toBe("tren");
        expect(tipoDeEtiquetas({ amenity: "bicycle_rental" })).toBe("bici");
        expect(tipoDeEtiquetas({ amenity: "restaurant" })).toBeNull();
    });
    it("lee la respuesta (nodos y centros de vías) y descarta lo que no sirve", () => {
        const r = analizarEntorno({ elements: [...OSM.elements, { type: "way", id: 9, center: { lat: LAT, lon: LON }, tags: { amenity: "library", name: "Biblioteca" } }, { type: "node", id: 10, tags: { amenity: "toilets" } }] });
        expect(r.map((s) => s.id)).toEqual(["node/1", "node/2", "node/3", "node/4", "node/5", "way/9"]);
        expect(() => analizarEntorno({})).toThrow();
    });
    it("mide distancia y rumbo, y cuenta una vez las dos aceras de una parada", () => {
        expect(distancia(LAT, LON, LAT + 1 / 111.195, LON)).toBeCloseTo(1000, -1);
        expect(rumbo(LAT, LON, LAT + 0.01, LON)).toBeCloseTo(0, 0);
        expect(rumbo(LAT, LON, LAT, LON + 0.01)).toBeCloseTo(90, 0);
        const s = analizarEntorno({ elements: [nodo(1, { highway: "bus_stop", name: "Atocha" }, 150, 0), nodo(2, { highway: "bus_stop", name: "atocha" }, 90, 180), nodo(3, { amenity: "drinking_water" }, 60, 0), nodo(4, { amenity: "drinking_water" }, 70, 0)] });
        const c = cercanos(s, LAT, LON);
        expect(c.map((x) => x.id)).toEqual(["node/3", "node/4", "node/2"]);
        expect(minutosAPie(400)).toBe(6);
        expect(consultaEntorno(LAT, LON)).toContain("around:1600,40.42000,-3.70000");
    });
});

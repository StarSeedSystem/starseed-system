import { describe, expect, it } from "vitest";
import type { DestinoPortal, PortalMundo, ZonaMundo } from "../mundo-tipos";
import {
    HISTERESIS_M, SIN_EFECTOS, cambiosDeZona, colorDeDestino, dentroDePortal, dentroDeZona,
    destinoDePortal, efectosActivos, portalesCruzados,
} from "../zonas";

const zona = (id: string, extra: Partial<ZonaMundo> = {}): ZonaMundo => ({
    id, nombre: extra.nombre ?? id, forma: extra.forma ?? "caja",
    pos: extra.pos ?? [0, 0, 0], tam: extra.tam ?? [2, 2, 2], efecto: extra.efecto ?? "nada",
});
const portal = (destino: DestinoPortal, extra: Partial<PortalMundo> = {}): PortalMundo => ({
    id: "p1", nombre: "Portal", pos: [0, 0, 0], rot: [0, 0, 0], radio: 1, destino, ...extra,
});
const ahora = (...ids: string[]) => new Set(ids);

describe("dentroDeZona", () => {
    it("esfera: dentro hasta el radio y fuera un poco más allá", () => {
        const z = zona("e", { forma: "esfera", tam: [2, 2, 2] });
        expect(dentroDeZona(z, [0, 0, 0.99])).toBe(true);
        expect(dentroDeZona(z, [0, 1.01, 0])).toBe(false);
    });
    it("caja alineada: cada eje cuenta y el margen amplía el borde", () => {
        const z = zona("c", { tam: [2, 1, 2] });
        expect(dentroDeZona(z, [0.9, 0.4, 0.9])).toBe(true);
        expect(dentroDeZona(z, [0.9, 0.6, 0.9])).toBe(false);
        expect(dentroDeZona(z, [0.9, 0.53, 0.9], HISTERESIS_M)).toBe(true);
    });
});

describe("cambiosDeZona", () => {
    it("entra al pisar una zona nueva", () => {
        const r = cambiosDeZona([zona("a")], ahora(), [0, 0, 0]);
        expect(r.entra).toEqual(["a"]);
        expect(r.sale).toEqual([]);
        expect(r.ahora.has("a")).toBe(true);
    });
    it("sale al alejarse más de la histéresis", () => {
        const z = zona("a", { tam: [2, 2, 2] });
        expect(cambiosDeZona([z], ahora("a"), [0, 0, 1.03]).sale).toEqual([]);
        expect(cambiosDeZona([z], ahora("a"), [0, 0, 1.06]).sale).toEqual(["a"]);
    });
    it("no parpadea en el borde: dentro con 5 cm de margen", () => {
        const z = zona("a", { tam: [2, 2, 2] });
        const r = cambiosDeZona([z], ahora("a"), [0, 0, 1.04]);
        expect(r.entra).toEqual([]);
        expect(r.sale).toEqual([]);
        expect(r.ahora.has("a")).toBe(true);
    });
    it("una zona borrada del mundo también se abandona", () => {
        expect(cambiosDeZona([], ahora("vieja", "otra"), [0, 0, 0]).sale).toEqual(["vieja", "otra"]);
    });
});

describe("efectosActivos", () => {
    it("punto-reunión se anuncia pero no cambia ningún efecto", () => {
        const z = zona("reunion", { efecto: "punto-reunion" });
        const r = cambiosDeZona([z], ahora(), [0, 0, 0]);
        expect(r.entra).toEqual(["reunion"]);
        expect(efectosActivos([z], r.ahora)).toEqual(SIN_EFECTOS);
    });
    it("varios efectos a la vez y sólo de las zonas activas", () => {
        const zs = [
            zona("s", { efecto: "silencio" }), zona("ap", { efecto: "audio-privado" }),
            zona("g0", { efecto: "gravedad-cero" }), zona("seg", { efecto: "zona-segura" }),
            zona("esc", { efecto: "escenario" }), zona("fuera", { efecto: "silencio" }),
        ];
        const e = efectosActivos(zs, ahora("s", "ap", "g0", "seg", "esc"));
        expect(e).toEqual({ silencio: true, audioPrivado: "ap", gravedadCero: true, zonaSegura: true, escenario: "esc" });
    });
});

describe("destinoDePortal", () => {
    it("portal a un spawn del propio mundo", () => {
        expect(destinoDePortal(portal({ tipo: "punto", spawn: "spawn-2" }))).toEqual({ tipo: "punto", spawn: "spawn-2" });
    });
    it("portal a una sala usa su ruta real", () => {
        expect(destinoDePortal(portal({ tipo: "sala", id: "sala azul" }))).toEqual({ tipo: "ruta", ruta: "/sala-xr/sala%20azul", privado: true });
    });
    it("portal a un mundo usa rutaSalaXr", () => {
        expect(destinoDePortal(portal({ tipo: "mundo", id: "m1" }))).toEqual({ tipo: "ruta", ruta: "/sala-xr/m1", privado: true });
    });
    it("estación y servidor llevan a sus rutas existentes", () => {
        expect(destinoDePortal(portal({ tipo: "estacion", id: "cumbre" }))).toMatchObject({ tipo: "ruta", ruta: "/estaciones/cumbre" });
        expect(destinoDePortal(portal({ tipo: "servidor", id: "s1" }))).toMatchObject({ tipo: "ruta", ruta: "/servidores" });
    });
    it("un destino público se marca privado:false", () => {
        const r = destinoDePortal(portal({ tipo: "sala", id: "plaza" }), [{ tipo: "sala", id: "plaza", publico: true }]);
        expect(r).toEqual({ tipo: "ruta", ruta: "/sala-xr/plaza", privado: false });
    });
    it("un destino que ya no está en el catálogo no se inventa", () => {
        const r = destinoDePortal(portal({ tipo: "mundo", id: "borrado" }), [{ tipo: "sala", id: "otra" }]);
        expect(r.tipo).toBe("no-disponible");
        if (r.tipo === "no-disponible") expect(r.motivo).toContain("borrado");
    });
    it("portal sin id, sin spawn o con tipo desconocido no está disponible", () => {
        expect(destinoDePortal(portal({ tipo: "sala", id: "" })).tipo).toBe("no-disponible");
        expect(destinoDePortal(portal({ tipo: "punto", spawn: "" })).tipo).toBe("no-disponible");
        const roto = { tipo: "agujero-de-gusano", id: "x" } as unknown as DestinoPortal;
        expect(destinoDePortal(portal(roto)).tipo).toBe("no-disponible");
    });
});

describe("portales", () => {
    it("el anillo se cruza al entrar y no se repite mientras se está dentro", () => {
        const p = portal({ tipo: "mundo", id: "m1" }, { radio: 0.5 });
        expect(dentroDePortal(p, [0.4, 0, 0])).toBe(true);
        expect(dentroDePortal(p, [0.6, 0, 0])).toBe(false);
        expect(portalesCruzados([p], ahora(), [0.4, 0, 0]).entran.map((x) => x.id)).toEqual(["p1"]);
        expect(portalesCruzados([p], ahora("p1"), [0.4, 0, 0]).entran).toEqual([]);
    });
    it("cada destino tiene el color de su nodo, sin colores a mano", () => {
        expect(colorDeDestino({ tipo: "mundo", id: "m" })).toBe("#007FFF");
        expect(colorDeDestino({ tipo: "estacion", id: "e" })).toBe("#39FF14");
        expect(colorDeDestino({ tipo: "servidor", id: "s" })).toBe("#FFBF00");
        expect(colorDeDestino({ tipo: "sala", id: "r" })).toBe("#DC143C");
    });
});

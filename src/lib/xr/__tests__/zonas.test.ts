import { describe, expect, it } from "vitest";
import type { PortalMundo, ZonaMundo } from "../mundo-tipos";
import {
    acentoDeDestino, anuncioDeZona, cambiosDeZona, dentroDeZona, efectosActivos, eventosDeZona,
    destinoDePortal, nodoDeDestino, portalesAlcanzados, privadoDePortal, radioDeZona, requiereConfirmacion,
} from "../zonas";
const zona = (extra: Partial<ZonaMundo> = {}): ZonaMundo => ({ id: "z", nombre: "Zona", forma: "caja", pos: [0, 0, 0], tam: [2, 2, 2], efecto: "nada", ...extra });
const portal = (destino: PortalMundo["destino"], extra: Partial<PortalMundo> = {}): PortalMundo => ({
    id: "p", nombre: "Portal", pos: [0, 0, 0], rot: [0, 0, 0], radio: 0.5, destino, ...extra,
});
const ids = (...lista: string[]) => new Set(lista);
describe("dentroDeZona", () => {
    it("una caja alineada usa la mitad de tam en cada eje", () => {
        const caja = zona();
        expect(dentroDeZona(caja, [0, 0, 0])).toBe(true);
        expect(dentroDeZona(caja, [0.99, 0.99, 0.99])).toBe(true);
        expect(dentroDeZona(caja, [1.01, 0, 0])).toBe(false);
        expect(dentroDeZona(caja, [0, 1.2, 0])).toBe(false);
    });
    it("una esfera envuelve la caja declarada", () => {
        const esfera = zona({ forma: "esfera", tam: [2, 2, 2] });
        expect(radioDeZona(esfera)).toBe(1);
        expect(dentroDeZona(esfera, [0.7, 0.7, 0])).toBe(true);
        expect(dentroDeZona(esfera, [0.8, 0.8, 0])).toBe(false);
    });
});
describe("cambiosDeZona", () => {
    it("al empezar dentro entra y deja `ahora` con la zona", () => {
        const r = cambiosDeZona([zona()], ids(), [0, 0, 0]);
        expect(r.entra).toEqual(["z"]);
        expect(r.sale).toEqual([]);
        expect([...r.ahora]).toEqual(["z"]);
    });
    it("al alejarse sale y `ahora` queda vacío", () => {
        const r = cambiosDeZona([zona()], ids("z"), [9, 0, 0]);
        expect(r.entra).toEqual([]);
        expect(r.sale).toEqual(["z"]);
        expect(r.ahora.size).toBe(0);
    });
    it("la histéresis de 5 cm evita el parpadeo en el borde", () => {
        expect(cambiosDeZona([zona()], ids(), [0.98, 0, 0]).entra).toEqual([]);
        expect(cambiosDeZona([zona()], ids("z"), [1.04, 0, 0]).sale).toEqual([]);
        expect(cambiosDeZona([zona()], ids("z"), [1.06, 0, 0]).sale).toEqual(["z"]);
    });
    it("distingue qué zona se gana y cuál se pierde a la vez", () => {
        const a = zona({ id: "a", pos: [0, 0, 0] });
        const b = zona({ id: "b", pos: [10, 0, 0] });
        const r = cambiosDeZona([a, b], ids("a"), [10, 0, 0]);
        expect(r.entra).toEqual(["b"]);
        expect(r.sale).toEqual(["a"]);
    });
    it("emite disparadores entra-zona/sale-zona para el motor de reglas", () => {
        expect(eventosDeZona({ entra: ["a"], sale: ["b"] })).toEqual([
            { tipo: "entra-zona", zona: "a" }, { tipo: "sale-zona", zona: "b" },
        ]);
    });
});
describe("efectosActivos", () => {
    it("suma varios efectos a la vez y nombra la zona de cada uno", () => {
        const zonas = [
            zona({ id: "s", efecto: "silencio" }),
            zona({ id: "audio", efecto: "audio-privado" }),
            zona({ id: "g", efecto: "gravedad-cero" }),
            zona({ id: "segura", efecto: "zona-segura" }),
            zona({ id: "esc", efecto: "escenario" }),
        ];
        expect(efectosActivos(zonas, ids("s", "audio", "g", "segura", "esc"))).toEqual({
            silencio: true, audioPrivado: "audio", gravedadCero: true, zonaSegura: true, escenario: "esc",
        });
        expect(efectosActivos(zonas, ids("s"))).toEqual({
            silencio: true, audioPrivado: null, gravedadCero: false, zonaSegura: false, escenario: null,
        });
    });
    it("un punto de reunión no cambia nada, pero se anuncia", () => {
        const reunion = zona({ id: "r", nombre: "Fuente", efecto: "punto-reunion" });
        expect(efectosActivos([reunion], ids("r"))).toEqual({
            silencio: false, audioPrivado: null, gravedadCero: false, zonaSegura: false, escenario: null,
        });
        expect(anuncioDeZona(reunion)).toBe("Estás en el punto de reunión «Fuente».");
        expect(anuncioDeZona(zona())).toBeNull();
    });
});
describe("destinoDePortal", () => {
    it("un portal a un punto devuelve su spawn", () => {
        expect(destinoDePortal(portal({ tipo: "punto", spawn: "entrada" }))).toEqual({ tipo: "punto", spawn: "entrada" });
    });
    it("mundo y sala abren la ruta real de la sala XR", () => {
        expect(destinoDePortal(portal({ tipo: "mundo", id: "m1" }))).toEqual({ tipo: "ruta", ruta: "/sala-xr/m1", privado: false });
        expect(destinoDePortal(portal({ tipo: "sala", id: "s 1" }))).toEqual({ tipo: "ruta", ruta: "/sala-xr/s%201", privado: false });
    });
    it("estación y servidor van a sus páginas existentes", () => {
        expect(destinoDePortal(portal({ tipo: "estacion", id: "cumbre" }))).toEqual({ tipo: "ruta", ruta: "/estaciones/cumbre", privado: false });
        expect(destinoDePortal(portal({ tipo: "servidor", id: "srv" }))).toEqual({ tipo: "ruta", ruta: "/servidores", privado: false });
    });
    it("sin id válido no se inventa ruta: se declara no disponible", () => {
        const r = destinoDePortal(portal({ tipo: "estacion", id: "" }));
        expect(r.tipo).toBe("no-disponible");
        if (r.tipo === "no-disponible") expect(r.motivo).toMatch(/destino/i);
    });
    it("sólo es privado si lo declara; un portal público marca privado: false", () => {
        const publica = portal({ tipo: "sala", id: "x" });
        const privada = portal({ tipo: "sala", id: "x" }, { privado: true } as Partial<PortalMundo>);
        expect(privadoDePortal(publica)).toBe(false);
        expect(requiereConfirmacion(publica, destinoDePortal(publica))).toBe(true);
        expect(requiereConfirmacion(privada, destinoDePortal(privada))).toBe(false);
    });
    it("cada destino tiene su acento y su cardinal", () => {
        expect(nodoDeDestino({ tipo: "punto", spawn: "a" })).toBe("zenith");
        expect(nodoDeDestino({ tipo: "estacion", id: "e" })).toBe("horizon");
        expect(nodoDeDestino({ tipo: "servidor", id: "s" })).toBe("logic");
        expect(acentoDeDestino({ tipo: "mundo", id: "m" })).toBe("#DC143C");
    });
});
describe("portalesAlcanzados", () => {
    it("sólo devuelve los portales cuyo radio contiene el punto", () => {
        const cerca = portal({ tipo: "punto", spawn: "a" }, { id: "c", radio: 1 });
        const lejos = portal({ tipo: "punto", spawn: "b" }, { id: "f", pos: [5, 0, 0] });
        expect(portalesAlcanzados([cerca, lejos], [0.5, 0, 0]).map((p) => p.id)).toEqual(["c"]);
    });
});

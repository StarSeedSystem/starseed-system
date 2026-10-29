import { describe, expect, it } from "vitest";
import { anuncioDeEntrada, cambiosDeZona, dentroDeZona, destinoDePortal, efectosActivos, HISTERESIS_M } from "../zonas";
import type { PortalMundo, ZonaMundo } from "../mundo-tipos";

const zona = (id: string, extra: Partial<ZonaMundo> = {}): ZonaMundo =>
    ({ id, nombre: id, forma: "caja", pos: [0, 1, 0], tam: [2, 2, 2], efecto: "nada", ...extra });
const portal = (destino: PortalMundo["destino"], extra: Partial<PortalMundo> = {}): PortalMundo =>
    ({ id: "p1", nombre: "Portal", pos: [0, 0, -2], rot: [0, 0, 0], radio: 1, destino, ...extra });
const set = (...ids: string[]) => new Set(ids);
const caja = zona("caja");
const esfera = zona("esfera", { forma: "esfera" });

describe("dentroDeZona", () => {
    it("la esfera usa su mayor lado como diámetro y respeta el borde", () => {
        expect(dentroDeZona(esfera, [0, 1, 0])).toBe(true);
        expect(dentroDeZona(esfera, [1, 1, 0])).toBe(true);
        expect(dentroDeZona(esfera, [1.01, 1, 0])).toBe(false);
        expect(dentroDeZona(esfera, [0, 2.01, 0])).toBe(false);
    });
    it("la caja alineada usa tam como tamaño completo", () => {
        expect(dentroDeZona(caja, [0, 1, 0])).toBe(true);
        expect(dentroDeZona(caja, [1, 2, 1])).toBe(true);
        expect(dentroDeZona(caja, [1.01, 1, 0])).toBe(false);
        expect(dentroDeZona(caja, [0, 2.01, 0])).toBe(false);
    });
});

describe("cambiosDeZona", () => {
    it("entra al cruzar y sale al alejarse", () => {
        const entra = cambiosDeZona([caja], set(), [0, 1, 0]);
        expect(entra.entra).toEqual(["caja"]);
        expect(entra.sale).toEqual([]);
        const sale = cambiosDeZona([caja], entra.ahora, [5, 1, 0]);
        expect(sale.entra).toEqual([]);
        expect(sale.sale).toEqual(["caja"]);
        expect(sale.ahora.size).toBe(0);
    });
    it("la histéresis de 5 cm evita el parpadeo en el borde", () => {
        const fueraCerca: [number, number, number] = [1 + HISTERESIS_M / 2, 1, 0];
        expect(cambiosDeZona([caja], set(), fueraCerca).ahora.has("caja")).toBe(false);
        expect(cambiosDeZona([caja], set("caja"), fueraCerca).ahora.has("caja")).toBe(true);
        const fueraLejos: [number, number, number] = [1 + HISTERESIS_M * 2, 1, 0];
        expect(cambiosDeZona([caja], set("caja"), fueraLejos).sale).toEqual(["caja"]);
    });
    it("seguir dentro no repite el aviso de entrada", () => {
        const r = cambiosDeZona([caja], set("caja"), [0, 1, 0]);
        expect(r.entra).toEqual([]);
        expect(r.sale).toEqual([]);
    });
    it("varias zonas a la vez y una que ya no existe", () => {
        const otra = zona("otra", { pos: [0, 1, -1] });
        const r = cambiosDeZona([caja, otra], set("caja", "fantasma"), [0, 1, -0.9]);
        expect(r.entra).toEqual(["otra"]);
        expect(r.sale).toEqual(["fantasma"]);
    });
});

describe("efectosActivos", () => {
    it("sin zonas activas todo está apagado", () => {
        expect(efectosActivos([caja], set())).toEqual({ silencio: false, audioPrivado: null, gravedadCero: false, zonaSegura: false, escenario: null });
    });
    it("varios efectos a la vez se suman", () => {
        const zonas = [zona("s", { efecto: "silencio" }), zona("a", { efecto: "audio-privado" }), zona("g", { efecto: "gravedad-cero" }), zona("z", { efecto: "zona-segura" }), zona("e", { efecto: "escenario" })];
        expect(efectosActivos(zonas, set("s", "a", "g", "z", "e"))).toEqual({ silencio: true, audioPrivado: "a", gravedadCero: true, zonaSegura: true, escenario: "e" });
    });
    it("punto-reunion no cambia nada pero se anuncia", () => {
        const reunion = zona("reunion", { nombre: "Fuente", efecto: "punto-reunion" });
        expect(efectosActivos([reunion], set("reunion"))).toEqual(efectosActivos([], set()));
        expect(anuncioDeEntrada(reunion)).toContain("Fuente");
        expect(anuncioDeEntrada(caja)).toBeNull();
    });
});

describe("destinoDePortal", () => {
    it("un punto de reunión devuelve su spawn", () => {
        expect(destinoDePortal(portal({ tipo: "punto", spawn: "entrada" }))).toEqual({ tipo: "punto", spawn: "entrada" });
    });
    it("mundo y sala abren la sala XR real", () => {
        expect(destinoDePortal(portal({ tipo: "mundo", id: "mundo-1" }))).toEqual({ tipo: "ruta", ruta: "/sala-xr/mundo-1", privado: false });
        expect(destinoDePortal(portal({ tipo: "sala", id: "sala 1" }))).toEqual({ tipo: "ruta", ruta: "/sala-xr/sala%201", privado: false });
    });
    it("estación y servidor usan sus páginas existentes", () => {
        expect(destinoDePortal(portal({ tipo: "estacion", id: "cumbre" }))).toEqual({ tipo: "ruta", ruta: "/estaciones/cumbre", privado: false });
        expect(destinoDePortal(portal({ tipo: "servidor", id: "cualquiera" }))).toEqual({ tipo: "ruta", ruta: "/servidores", privado: false });
    });
    it("un portal público se marca privado: false", () => {
        const r = destinoDePortal(portal({ tipo: "sala", id: "abierta" }));
        expect(r.tipo === "ruta" && r.privado).toBe(false);
    });
    it("un portal privado se marca privado: true", () => {
        const p = { ...portal({ tipo: "servidor", id: "privado" }), privado: true } as PortalMundo;
        expect(destinoDePortal(p)).toEqual({ tipo: "ruta", ruta: "/servidores", privado: true });
    });
    it("sin ruta conocida devuelve no-disponible", () => {
        expect(destinoDePortal(portal({ tipo: "sala", id: "  " })).tipo).toBe("no-disponible");
        const raro = portal({ tipo: "holograma", id: "x" } as unknown as PortalMundo["destino"]);
        const r = destinoDePortal(raro);
        expect(r.tipo).toBe("no-disponible");
        if (r.tipo === "no-disponible") expect(r.motivo.length).toBeGreaterThan(0);
    });
});

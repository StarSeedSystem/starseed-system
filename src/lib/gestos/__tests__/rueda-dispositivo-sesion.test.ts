import { afterEach, describe, expect, it, vi } from "vitest";
import {
    acumularRueda,
    cancelarSesionBorde,
    decidirRueda,
    deltaRuedaHaciaCierre,
    esGestoLateral,
    formatoPantalla,
    iniciarSesionBorde,
    liberarSesionBorde,
    moverSesionBorde,
    normalizarDelta,
    perfilDeEntrada,
    reiniciarSesionesBorde,
    sesionBordeActiva,
    soltarSesionBorde,
    suscribirSesionBorde,
    tamanoObjetivo,
} from "@/lib/gestos";

describe("rueda y trackpad", () => {
    it("normaliza líneas y páginas a píxeles", () => {
        expect(normalizarDelta(3, 0)).toBe(3);
        expect(normalizarDelta(3, 1)).toBe(48);
        expect(normalizarDelta(1, 2)).toBe(800);
    });

    it("solo cuenta gestos claramente horizontales", () => {
        expect(esGestoLateral(20, 4)).toBe(true);
        expect(esGestoLateral(10, 10)).toBe(false);
        expect(esGestoLateral(0.2, 0)).toBe(false);
    });

    it("el panel sigue a los dedos en cada lado", () => {
        expect(deltaRuedaHaciaCierre("izquierda", 12, 0)).toBe(12);
        expect(deltaRuedaHaciaCierre("derecha", 12, 0)).toBe(-12);
        expect(deltaRuedaHaciaCierre("arriba", 0, 9)).toBe(9);
        expect(deltaRuedaHaciaCierre("abajo", 0, 9)).toBe(-9);
    });

    it("acumula con tope y decide al terminar", () => {
        let a = 0;
        for (let i = 0; i < 10; i++) a = acumularRueda(a, 20, 400);
        expect(a).toBe(200);
        expect(decidirRueda(a, 400)).toBe("cerrado");
        expect(decidirRueda(80, 400)).toBe("abierto");
        expect(acumularRueda(0, -500, 400)).toBe(-60);
        expect(acumularRueda(390, 50, 400)).toBe(400);
    });
});

describe("autodetección de dispositivo", () => {
    it("clasifica el perfil de entrada por punteros disponibles, no por «móvil»", () => {
        expect(perfilDeEntrada({ punteroGrueso: true, punteroFino: false, algunHover: false })).toBe("tactil");
        expect(perfilDeEntrada({ punteroGrueso: false, punteroFino: true, algunHover: true })).toBe("raton");
        expect(perfilDeEntrada({ punteroGrueso: true, punteroFino: true, algunHover: true })).toBe("hibrido");
    });

    it("objetivos táctiles de al menos 44 px salvo con ratón puro", () => {
        expect(tamanoObjetivo("tactil")).toBeGreaterThanOrEqual(44);
        expect(tamanoObjetivo("hibrido")).toBeGreaterThanOrEqual(44);
    });

    it("formato por ancho, corregido por la altura en apaisado", () => {
        expect(formatoPantalla(390, 844)).toMatchObject({ formato: "estrecho", orientacion: "vertical" });
        expect(formatoPantalla(820, 1180).formato).toBe("medio");
        expect(formatoPantalla(1440, 900).formato).toBe("amplio");
        expect(formatoPantalla(1100, 430)).toMatchObject({ formato: "medio", orientacion: "horizontal" });
    });
});

describe("sesión de arrastre desde el borde", () => {
    afterEach(() => reiniciarSesionesBorde());

    it("publica inicio, movimiento y soltar a quien escucha", () => {
        const oyente = vi.fn();
        const baja = suscribirSesionBorde(oyente);
        iniciarSesionBorde("logic", { x: 380, y: 300, t: 0 }, 56);
        moverSesionBorde({ x: 300, y: 302, t: 16 });
        soltarSesionBorde({ x: 250, y: 304, t: 32 });
        expect(oyente).toHaveBeenCalledTimes(3);
        const ultima = oyente.mock.calls[2][0];
        expect(ultima.fase).toBe("soltada");
        expect(ultima.muestras).toHaveLength(3);
        expect(ultima.umbralAperturaPx).toBe(56);
        baja();
    });

    it("una cortina que se monta tarde recoge la sesión (aunque ya se haya soltado)", () => {
        iniciarSesionBorde("horizon", { x: 12, y: 300, t: 0 });
        soltarSesionBorde({ x: 160, y: 300, t: 60 });
        const s = sesionBordeActiva("horizon", 100);
        expect(s?.fase).toBe("soltada");
        expect(sesionBordeActiva("logic", 100)).toBeNull();
        liberarSesionBorde(s!.id);
        expect(sesionBordeActiva("horizon", 100)).toBeNull();
    });

    it("caduca y no se mueve después de cancelada", () => {
        iniciarSesionBorde("zenith", { x: 200, y: 5, t: 0 });
        expect(sesionBordeActiva("zenith", 10_000)).toBeNull();
        cancelarSesionBorde();
        moverSesionBorde({ x: 200, y: 200, t: 20 });
        expect(sesionBordeActiva("zenith", 30)?.actual.y).toBe(5);
    });
});

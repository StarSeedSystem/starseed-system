import { describe, expect, it } from "vitest";
import {
    cerradezArrastre,
    decidirDestino,
    elastico,
    registrarMuestra,
    velocidad,
    type Muestra,
} from "@/lib/gestos";

describe("elastico (goma al pasar el límite)", () => {
    it("no mueve nada sin exceso y conserva el signo", () => {
        expect(elastico(0, 400)).toBe(0);
        expect(elastico(50, 400)).toBeGreaterThan(0);
        expect(elastico(-50, 400)).toBeLessThan(0);
        expect(elastico(-50, 400)).toBeCloseTo(-elastico(50, 400));
    });

    it("se resiste: siempre avanza menos que el puntero y cada vez menos", () => {
        const a = elastico(40, 400);
        const b = elastico(80, 400);
        const c = elastico(400, 400);
        expect(a).toBeLessThan(40);
        expect(b).toBeLessThan(80);
        expect(b - a).toBeLessThan(a); // rendimiento decreciente
        expect(c).toBeLessThan(400);
    });

    it("con dimensión 0 no hace nada (panel aún sin medir)", () => {
        expect(elastico(100, 0)).toBe(0);
    });
});

describe("velocidad (ventana corta de muestras)", () => {
    const m = (x: number, t: number, y = 0): Muestra => ({ x, y, t });

    it("calcula px/ms en el eje con las muestras de la ventana", () => {
        const muestras = [m(0, 0), m(10, 20), m(40, 60), m(100, 100)];
        expect(velocidad(muestras, "x", 100)).toBeCloseTo(1); // 100 px en 100 ms
    });

    it("ignora el tramo lento viejo: un latigazo final cuenta como latigazo", () => {
        const muestras = [m(0, 0), m(2, 300), m(4, 600), m(64, 640), m(124, 680)];
        expect(velocidad(muestras, "x", 100)).toBeCloseTo(120 / 80);
    });

    it("es 0 si el puntero se quedó quieto antes de soltar", () => {
        const muestras = [m(0, 0), m(100, 50)];
        expect(velocidad(muestras, "x", 100, 400)).toBe(0);
    });

    it("con eventos espaciados (equipo lento) usa la muestra previa en vez de dar 0", () => {
        const muestras = [m(0, 0, 50), m(0, 130, 20), m(0, 260, 4)];
        expect(velocidad(muestras, "y", 100, 280)).toBeCloseTo(-16 / 130);
        // pero no mira más de tres ventanas atrás
        expect(velocidad([m(0, 0), m(90, 500)], "x", 100, 510)).toBe(0);
    });

    it("es 0 con menos de dos muestras", () => {
        expect(velocidad([m(5, 5)], "x")).toBe(0);
    });

    it("registrarMuestra conserva solo las últimas", () => {
        let lista: Muestra[] = [];
        for (let i = 0; i < 20; i++) lista = registrarMuestra(lista, m(i, i), 5);
        expect(lista).toHaveLength(5);
        expect(lista[0].x).toBe(15);
    });
});

describe("cerradezArrastre (seguimiento 1:1 con goma)", () => {
    it("sigue 1:1 dentro del recorrido", () => {
        expect(cerradezArrastre("abierto", 120, 400)).toBe(120);
        expect(cerradezArrastre("cerrado", -150, 400)).toBe(250);
    });

    it("topa en cerrado y estira con resistencia más allá de abierto", () => {
        expect(cerradezArrastre("abierto", 900, 400)).toBe(400);
        const estiron = cerradezArrastre("abierto", -100, 400);
        expect(estiron).toBeLessThan(0);
        expect(estiron).toBeGreaterThan(-100);
    });
});

describe("decidirDestino (soltar)", () => {
    it("un latigazo hacia el otro estado cambia aunque el recorrido sea corto", () => {
        expect(decidirDestino({ origen: "abierto", recorrido: 20, velocidad: 0.9, tam: 400 })).toBe("cerrado");
    });

    it("un latigazo de vuelta conserva el estado aunque se haya recorrido mucho", () => {
        expect(decidirDestino({ origen: "abierto", recorrido: 300, velocidad: -0.9, tam: 400 })).toBe("abierto");
    });

    it("sin latigazo decide por la posición proyectada", () => {
        expect(decidirDestino({ origen: "abierto", recorrido: 60, velocidad: 0, tam: 400 })).toBe("abierto");
        expect(decidirDestino({ origen: "abierto", recorrido: 180, velocidad: 0, tam: 400 })).toBe("cerrado");
        // 100 px + 0,3 px/ms × 160 ms = 148 px → 37 % ≥ 35 %
        expect(decidirDestino({ origen: "abierto", recorrido: 100, velocidad: 0.3, tam: 400 })).toBe("cerrado");
    });

    it("abrir desde el borde respeta el umbral configurado", () => {
        const base = { origen: "cerrado" as const, velocidad: 0, tam: 400 };
        expect(decidirDestino({ ...base, recorrido: 60, umbralCambio: 56 / 400 })).toBe("abierto");
        expect(decidirDestino({ ...base, recorrido: 40, umbralCambio: 56 / 400 })).toBe("cerrado");
    });

    it("un estirón al revés nunca cambia de estado", () => {
        expect(decidirDestino({ origen: "abierto", recorrido: -40, velocidad: 0, tam: 400 })).toBe("abierto");
    });
});

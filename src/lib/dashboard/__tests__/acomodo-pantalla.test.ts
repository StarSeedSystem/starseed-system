import { describe, expect, it } from "vitest";
import { acomodoPara, acomodosPorPantalla, anchoEn, COLUMNAS, type ItemRejilla } from "../acomodo-pantalla";

// El «Inicio» de escritorio: reloj L + eventos L, clima M + tareas M + accesos S, radar y feed a lo ancho.
const INICIO: ItemRejilla[] = [
    { i: "reloj", x: 0, y: 0, w: 6, h: 5 }, { i: "eventos", x: 6, y: 0, w: 6, h: 5 },
    { i: "clima", x: 0, y: 5, w: 4, h: 4 }, { i: "tareas", x: 4, y: 5, w: 4, h: 4 }, { i: "accesos", x: 8, y: 5, w: 4, h: 4 },
    { i: "radar", x: 0, y: 9, w: 12, h: 5 }, { i: "feed", x: 0, y: 14, w: 12, h: 6, minH: 4 },
];

const solapan = (a: ItemRejilla, b: ItemRejilla) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("acomodo automático por pantalla", () => {
    it("escritorio se respeta tal cual", () => {
        expect(acomodosPorPantalla(INICIO).lg).toBe(INICIO);
    });
    it("tablet (6 col): lo ancho llena la fila y lo mediano va de dos en dos", () => {
        expect(anchoEn("sm", 12)).toBe(6);
        expect(anchoEn("sm", 6)).toBe(3);
        expect(anchoEn("sm", 4)).toBe(3);
        const sm = acomodoPara("sm", INICIO);
        const reloj = sm.find((x) => x.i === "reloj")!, eventos = sm.find((x) => x.i === "eventos")!;
        expect([reloj.w, eventos.w]).toEqual([3, 3]);
        expect(reloj.y).toBe(eventos.y); // lado a lado
        expect(sm.find((x) => x.i === "feed")!.w).toBe(6);
    });
    it("móvil (2 col): L y XL llenan, M y S de dos en dos", () => {
        expect(anchoEn("xxs", 6)).toBe(2);
        expect(anchoEn("xxs", 4)).toBe(1);
    });
    it("en ninguna pantalla hay solapes ni nada se sale de las columnas", () => {
        for (const [p, items] of Object.entries(acomodosPorPantalla(INICIO))) {
            const c = COLUMNAS[p as keyof typeof COLUMNAS];
            for (const a of items) {
                expect(a.x + a.w).toBeLessThanOrEqual(c);
                for (const b of items) if (a !== b) expect(solapan(a, b)).toBe(false);
            }
        }
    });
    it("se conserva el orden de lectura y la altura mínima", () => {
        const xs = acomodoPara("xs", INICIO);
        expect(xs.map((x) => x.i)).toEqual(["reloj", "eventos", "clima", "tareas", "accesos", "radar", "feed"]);
        expect(xs.find((x) => x.i === "feed")!.h).toBeGreaterThanOrEqual(4);
    });
});

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

// (2026-09-29) Papeles, filas por pantalla y alturas en píxeles: cada pantalla tiene su diseño.
import { altoFila, anchoParaRol, FILA_PX, puntoParaAncho, rolDe } from "../acomodo-pantalla";

const CLIMA: ItemRejilla[] = [
    { i: "heroe", x: 0, y: 0, w: 6, h: 6 },
    { i: "t", x: 6, y: 0, w: 3, h: 3 }, { i: "hum", x: 9, y: 0, w: 3, h: 3 },
    { i: "v", x: 6, y: 3, w: 3, h: 3 }, { i: "uv", x: 9, y: 3, w: 3, h: 3 },
    { i: "aire", x: 0, y: 6, w: 6, h: 4 }, { i: "astro", x: 6, y: 6, w: 6, h: 4 },
    { i: "banda", x: 0, y: 10, w: 12, h: 2 },
];

describe("acomodo por papeles y dispositivo", () => {
    it("deduce el papel de la huella de escritorio", () => {
        expect(rolDe({ w: 6, h: 6 })).toBe("heroe");
        expect(rolDe({ w: 3, h: 3 })).toBe("dato");
        expect(rolDe({ w: 12, h: 2 })).toBe("franja");
        expect(rolDe({ w: 4, h: 4 })).toBe("apoyo");
    });
    it("el punto de corte y el alto de fila siguen al ancho (la TV crece, el móvil encoge)", () => {
        expect(puntoParaAncho(390)).toBe("xxs");
        expect(puntoParaAncho(820)).toBe("sm");
        expect(puntoParaAncho(1440)).toBe("lg");
        expect(altoFila(1440)).toBe(65);
        expect(altoFila(3840)).toBeGreaterThan(120);
        expect(altoFila(390)).toBe(FILA_PX.xxs);
        expect(FILA_PX.xxs).toBeLessThan(FILA_PX.lg);
    });
    it("los datos se vuelven teselas: tres por fila en tablet, dos en el móvil", () => {
        expect(anchoParaRol("sm", { w: 3, h: 3 })).toBe(2);
        expect(anchoParaRol("xxs", { w: 3, h: 3 })).toBe(1);
        const sm = acomodoPara("sm", CLIMA);
        const datos = sm.filter((x) => ["t", "hum", "v", "uv"].includes(x.i));
        expect(datos.every((d) => d.w === 2)).toBe(true);
        const movil = acomodoPara("xxs", CLIMA, { anchoPx: 390 });
        const heroe = movil.find((x) => x.i === "heroe")!;
        const dato = movil.find((x) => x.i === "t")!;
        expect(heroe.w).toBe(2);
        expect(dato.w).toBe(1);
        // En píxeles: el héroe es claramente más alto que un dato, y ninguno se aplasta.
        expect(heroe.h * FILA_PX.xxs).toBeGreaterThanOrEqual(260);
        expect(dato.h * FILA_PX.xxs).toBeLessThanOrEqual(200);
        expect(movil.find((x) => x.i === "banda")!.w).toBe(2);
    });
    it("sin solapes ni desbordes con el ancho real", () => {
        for (const [p, ancho] of [["xxs", 360], ["xs", 560], ["sm", 900], ["md", 1100]] as const) {
            const items = acomodoPara(p, CLIMA, { anchoPx: ancho });
            for (const a of items) {
                expect(a.x + a.w).toBeLessThanOrEqual(COLUMNAS[p]);
                for (const b of items) if (a !== b) expect(solapan(a, b)).toBe(false);
            }
        }
    });
});

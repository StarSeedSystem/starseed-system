/** XR1010V · pruebas del módulo puro del render del mundo (sin three, sin WebGL). */
import { describe, expect, it } from "vitest";
import {
    PAISAJE, COLOR_ZONA, ARGS_PRIMITIVA, alturaTerreno, segmentosTerreno, materialObjeto, estrellasActivas,
    lucesParaNivel, spawnsParaNivel, alTope, visualDe, altoPantalla,
    type EntradaTerreno,
} from "../mundo-render-puro";
import type { NivelCalidad } from "@/lib/xr/tipos";
import { LIMITES, type MundoSpec } from "@/lib/xr/mundo-tipos";
import { validarMundo } from "@/lib/xr/mundo-spec";

const NIVELES = ["minima", "baja", "media", "alta", "maxima"] as const satisfies readonly NivelCalidad[];

const obj = (i: number, prioridad: 0 | 1 | 2 | 3 = 1) => ({
    id: `o${i}`, nombre: `objeto ${i}`, fuente: { tipo: "primitiva", forma: "caja" }, pos: [0, 0, 0], rot: [0, 0, 0], esc: [1, 1, 1], color: "#7c5cff", prioridad,
});

const BRUTO: Record<string, unknown> = {
    tipo: "mundo-xr", version: 1, nombre: "Bosque de noche", modo: "vr",
    entorno: { cielo: "noche", terreno: "colinas", tamano: 40, colorSuelo: "#1c1b2e", semilla: 42, alturaMax: 2 },
    fisica: { gravedad: -9.81 }, maxJugadores: 12,
    spawns: [{ id: "entrada", pos: [0, 0, 0], yaw: 0 }, { id: "segunda", pos: [3, 0, 0], yaw: 1.5 }, { id: "tercera", pos: [5, 0, 0], yaw: 2 }],
    luces: [
        { id: "l1", clase: "ambiente", pos: [0, 5, 0], color: "#ffffff", intensidad: 0.5, alcance: 0 },
        { id: "l2", clase: "direccional", pos: [1, 10, 2], color: "#ffffff", intensidad: 1, alcance: 0 },
        { id: "l3", clase: "puntual", pos: [2, 2, 2], color: "#ffffff", intensidad: 2, alcance: 10 },
        { id: "l4", clase: "puntual", pos: [4, 2, 2], color: "#ffffff", intensidad: 2, alcance: 10 },
        { id: "l5", clase: "foco", pos: [0, 3, 0], color: "#ffffff", intensidad: 3, alcance: 5 },
    ],
    objetos: Array.from({ length: 18 }, (_, i) => obj(i)),
    portales: [{ id: "p1", nombre: "salida", pos: [0, 1, -4], rot: [0, 0, 0], radio: 1, destino: { tipo: "punto", spawn: "entrada" } }],
    zonas: [{ id: "z1", nombre: "escenario", forma: "caja", pos: [0, 1, 3], tam: [4, 2, 4], efecto: "escenario" }],
    pantallas: [{ id: "v1", pos: [0, 2, -6], rot: [0, 0, 0], ancho: 3.2, fuente: { tipo: "llamada" }, sonido: "espacial" }],
    pizarras: [{ id: "pz1", pos: [2, 1.5, 0], rot: [0, 0, 0], ancho: 2, alto: 1.2 }],
    reglas: [],
};

const MUNDO: MundoSpec = validarMundo(BRUTO).mundo as MundoSpec;
const TERRENO: EntradaTerreno = { terreno: "colinas", semilla: 42, tamano: 40, alturaMax: 2 };

describe("paleta de cielos", () => {
    it("cada cielo del vocabulario tiene su paisaje, y «ninguno» no pinta estrellas", () => {
        for (const cielo of ["nebulosa", "amanecer", "mediodia", "atardecer", "noche", "estudio"] as const) {
            expect(PAISAJE[cielo].arriba).toMatch(/^#[0-9a-f]{6}$/i);
            expect(PAISAJE[cielo].niebla).toMatch(/^#[0-9a-f]{6}$/i);
        }
        expect(PAISAJE.estudio.estrellas).toBe(false);
        expect(PAISAJE.ninguno.estrellas).toBe(false);
    });

    it("el color de zona existe para cada efecto y los args de primitiva para cada forma", () => {
        expect(Object.keys(COLOR_ZONA)).toEqual(["nada", "punto-reunion", "escenario", "audio-privado", "silencio", "gravedad-cero", "zona-segura"]);
        expect(Object.keys(ARGS_PRIMITIVA)).toEqual(["caja", "esfera", "cilindro", "cono", "toro", "plano", "capsula"]);
        for (const args of Object.values(ARGS_PRIMITIVA)) expect(args.length).toBeGreaterThanOrEqual(2);
    });
});

describe("terreno procedural por semilla", () => {
    it("es determinista: misma semilla, misma altura", () => {
        expect(alturaTerreno(3.5, 7.25, TERRENO)).toBe(alturaTerreno(3.5, 7.25, TERRENO));
    });

    it("cambia con la semilla y respeta los tipos planos y el tope de altura", () => {
        expect(alturaTerreno(3.5, 7.25, TERRENO)).not.toBe(alturaTerreno(3.5, 7.25, { ...TERRENO, semilla: 99 }));
        expect(alturaTerreno(3.5, 7.25, { ...TERRENO, terreno: "plano" })).toBe(0);
        expect(alturaTerreno(3.5, 7.25, { ...TERRENO, terreno: "agua" })).toBe(0);
        expect(alturaTerreno(3.5, 7.25, { ...TERRENO, terreno: "colinas", alturaMax: 0 })).toBe(0);
        const h = alturaTerreno(3.5, 7.25, TERRENO);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThanOrEqual(TERRENO.alturaMax);
    });

    it("las islas caen a 0 fuera del radio y suben en el centro", () => {
        const islas: EntradaTerreno = { terreno: "islas", semilla: 7, tamano: 40, alturaMax: 4 };
        const centro = alturaTerreno(0, 0, islas);
        const borde = alturaTerreno(21, 0, islas);
        expect(centro).toBeGreaterThan(0);
        expect(borde).toBe(0);
    });
});

describe("recortes por nivel de calidad", () => {
    it("segmentos del terreno crecen con el nivel y no se saltan ninguno", () => {
        const segs = NIVELES.map(segmentosTerreno);
        expect(segs).toEqual([...segs].sort((a, b) => a - b));
        expect(segs[0]).toBe(16);
        expect(segs[NIVELES.length - 1]).toBe(128);
    });

    it("material: mínima usa básico (sin dependencia de luces) y el resto estándar", () => {
        expect(materialObjeto("minima")).toBe("meshBasicMaterial");
        for (const n of NIVELES.slice(1)) expect(materialObjeto(n)).toBe("meshStandardMaterial");
    });

    it("sólo la mínima pierde las estrellas (cero partículas); noche y nebulosa en baja ya las tienen", () => {
        expect(estrellasActivas("minima", "noche")).toBe(false);
        expect(estrellasActivas("baja", "noche")).toBe(true);
        expect(estrellasActivas("maxima", "nebulosa")).toBe(true);
        expect(estrellasActivas("maxima", "mediodia")).toBe(false);
    });

    it("altoPantalla: 16:9", () => {
        expect(altoPantalla(3.2)).toBeCloseTo(1.8);
    });
});

describe("luces para el nivel", () => {
    it("ambiente y direccional se quedan siempre; puntual/foco entran según el presupuesto", () => {
        const c = lucesParaNivel(MUNDO.luces, "minima");
        const clases = c.visibles.map((l) => l.clase);
        expect(clases).toContain("ambiente");
        expect(clases).toContain("direccional");
        expect(c.visibles.length).toBeLessThanOrEqual(1 + c.visibles.filter((l) => l.clase === "ambiente" || l.clase === "direccional").length);
        expect(c.quitadas).toBe(5 - c.visibles.length);
    });

    it("en máxima caben todas las luces del mundo de prueba", () => {
        const c = lucesParaNivel(MUNDO.luces, "maxima");
        expect(c.visibles.length).toBe(5);
        expect(c.quitadas).toBe(0);
    });
});

describe("recortes de listas por límite del nivel", () => {
    it("alTope conserva el orden y cuenta lo quitado", () => {
        const c = alTope(["a", "b", "c"], 2);
        expect(c.visibles).toEqual(["a", "b"]);
        expect(c.quitadas).toBe(1);
        expect(alTope(["a"], 5)).toEqual({ visibles: ["a"], quitadas: 0 });
    });

    it("spawns: la mínima admite 4 marcas", () => {
        expect(spawnsParaNivel(MUNDO.spawns, "minima").visibles.length).toBe(3);
        const muchos = Array.from({ length: 9 }, (_, i) => ({ id: `s${i}`, pos: [0, 0, 0], yaw: 0 }));
        expect(spawnsParaNivel(muchos, "minima").quitadas).toBe(9 - LIMITES.minima.jugadores);
    });
});

describe("visualDe: el mundo completo al nivel", () => {
    it("adapta el spec y recorta cada lista al tope de su límite", () => {
        for (const n of NIVELES) {
            const v = visualDe(MUNDO, n);
            expect(v.mundo.spawns.length).toBe(MUNDO.spawns.length);
            expect(v.portales.visibles.length).toBeLessThanOrEqual(LIMITES[n].portales);
            expect(v.pantallas.visibles.length).toBeLessThanOrEqual(LIMITES[n].pantallas);
            expect(v.luces.visibles.length).toBeLessThanOrEqual(MUNDO.luces.length);
            expect(v.recortes).toBeInstanceOf(Array);
        }
    });

    it("con un mundo enorme y nivel mínimo, los objetos se podan con explicación", () => {
        const grande = validarMundo({ ...BRUTO, objetos: Array.from({ length: 300 }, (_, i) => obj(i, 0)) }).mundo as MundoSpec;
        const v = visualDe(grande, "minima");
        expect(v.mundo.objetos.length).toBe(LIMITES.minima.objetos);
        expect(v.recortes.some((r) => r.includes("objetos"))).toBe(true);
        // El recorte respeta la prioridad declarada: los de prioridad 3 sobreviven antes que los 0.
        expect(v.mundo.objetos.every((o) => o.prioridad === 0)).toBe(true);
    });
});


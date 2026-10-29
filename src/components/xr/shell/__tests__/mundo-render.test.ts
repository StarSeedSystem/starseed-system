import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { validarMundo } from "@/lib/xr/mundo-spec";
import { CIELOS_MUNDO, LIMITES } from "@/lib/xr/mundo-tipos";
import { CRISTAL } from "@/lib/xr/tokens-3d";
import { NIVELES_CALIDAD } from "@/lib/xr/tipos";
import {
    COLOR_AGUA, COLOR_MARCADOR, PALETAS_CIELO, SEGMENTOS_TERRENO,
    alturaTerreno, planificarMundo, type MundoPlano,
} from "../mundo-render-plan";
import { MundoRender } from "../mundo-render";

const OBJETO = (i: number) => ({
    id: `o${i}`, nombre: `objeto ${i}`, fuente: { tipo: "primitiva", forma: "caja" },
    pos: [(i % 9) - 4, 0.5, Math.floor(i / 9) - 3], rot: [0, 0, 0], esc: [1, 1, 1],
    color: "#7c5cff", prioridad: i % 4,
});
const MUNDO = {
    version: 1, tipo: "mundo-xr", nombre: "Bosque de prueba", modo: "vr",
    entorno: { cielo: "noche", terreno: "colinas", tamano: 40, colorSuelo: "#1c1b2e", semilla: 7, alturaMax: 2 },
    fisica: { gravedad: -9.81, suelo: true },
    interaccion: { tocar: "observador", agarrar: "dueno" },
    maxJugadores: 4,
    spawns: [{ id: "p1", pos: [2, 0, 2], yaw: 1 }, { id: "p2", pos: [-2, 0, -2], yaw: 0 }],
    luces: [
        { id: "l1", clase: "ambiente", pos: [0, 3, 0], color: "#ffffff", intensidad: 0.6, alcance: 0 },
        { id: "l2", clase: "puntual", pos: [4, 2, 4], color: "#39FF14", intensidad: 2, alcance: 12 },
        { id: "l3", clase: "foco", pos: [-4, 4, 0], color: "#007FFF", intensidad: 3, alcance: 20 },
        { id: "l4", clase: "direccional", pos: [0, 8, 0], color: "#ffffff", intensidad: 1, alcance: 0 },
    ],
    objetos: Array.from({ length: 60 }, (_, i) => OBJETO(i)),
    portales: [], zonas: [], pizarras: [], pantallas: [], reglas: [],
};

const entornoDe = (terreno: "vacio" | "plano" | "colinas" | "islas" | "agua", semilla = 7) =>
    ({ cielo: "noche" as const, terreno, tamano: 40, colorSuelo: "#1c1b2e", semilla, alturaMax: 2 });
/** El plan de un mundo que ya sabemos válido (tsc no puede asumirlo solo). */
const planDe = (bruto: unknown, nivel: Parameters<typeof planificarMundo>[1]): MundoPlano =>
    planificarMundo(bruto, nivel).plan as MundoPlano;

describe("paletas y constantes del plan", () => {
    it("hay paleta para cada cielo y `ninguno` no pinta fondo (AR: el cielo es tu cuarto)", () => {
        for (const cielo of CIELOS_MUNDO) {
            expect(PALETAS_CIELO[cielo].arriba).toMatch(/^#[0-9a-f]{6}$/);
            expect(PALETAS_CIELO[cielo].abajo).toMatch(/^#[0-9a-f]{6}$/);
        }
        expect(PALETAS_CIELO.ninguno.sinFondo).toBe(true);
        expect(PALETAS_CIELO.noche.sinFondo).toBeUndefined();
    });
    it("los segmentos del terreno cubren los cinco niveles y crecen con el nivel", () => {
        const s = NIVELES_CALIDAD.map((n) => SEGMENTOS_TERRENO[n]);
        expect([...s].sort((a, b) => a - b)).toEqual(s);
    });
    it("el marcador sale del token de texto secundario y el mar es dato del plan", () => {
        expect(COLOR_MARCADOR).toBe(CRISTAL.textoSecundario);
        expect(COLOR_AGUA).toMatch(/^#[0-9a-f]{6}$/);
    });
});

describe("alturaTerreno · procedural determinista por semilla", () => {
    it("vacio y plano a 0; agua bajo el nivel del mar", () => {
        expect(alturaTerreno(entornoDe("vacio"), 5, 5)).toBe(0);
        expect(alturaTerreno(entornoDe("plano"), 5, 5)).toBe(0);
        expect(alturaTerreno(entornoDe("agua"), 0, 0)).toBeLessThan(0);
    });
    it("misma semilla, misma altura; semilla distinta cambia el paisaje", () => {
        expect(alturaTerreno(entornoDe("colinas"), 13.7, -8.2)).toBe(alturaTerreno(entornoDe("colinas"), 13.7, -8.2));
        expect(alturaTerreno(entornoDe("colinas", 7), 13.7, -8.2)).not.toBe(alturaTerreno(entornoDe("colinas", 9), 13.7, -8.2));
    });
    it("colinas queda dentro de [−0,35 × alturaMax, +0,65 × alturaMax] por diseño", () => {
        for (let i = 0; i < 80; i++) {
            const h = alturaTerreno(entornoDe("colinas"), i * 3.17 - 90, i * 7.3 - 200);
            expect(h).toBeGreaterThanOrEqual(-0.71);
            expect(h).toBeLessThanOrEqual(1.31);
        }
    });
    it("islas: el centro sube sobre el lecho y el borde cae EXACTO al fondo marino", () => {
        const e = entornoDe("islas");
        expect(alturaTerreno(e, 0, 0)).toBeGreaterThan(-0.5);
        expect(alturaTerreno(e, 30, 0)).toBeCloseTo(-0.5, 9);
    });
});

describe("planificarMundo · recorte honesto por nivel", () => {
    it("un mundo roto no se pinta y explica por qué", () => {
        const { plan, problemas } = planificarMundo({ tipo: "otra-cosa" }, "media");
        expect(plan).toBeNull();
        expect(problemas.length).toBeGreaterThan(0);
    });
    it("en mínima se recorta a LIMITES (objetos y luces) y los recortes viajan en el plan", () => {
        const plan = planDe(MUNDO, "minima");
        expect(plan.objetos).toHaveLength(LIMITES.minima.objetos);
        expect(plan.luces).toHaveLength(LIMITES.minima.luces);
        expect(plan.recortes.join(" ")).toContain("objetos decorativos quitados");
        expect(plan.recortes.join(" ")).toContain("luces quitadas");
        expect(plan.cristal).toBe("plano");
        expect(plan.sombras.activas).toBe(false);
        expect(plan.mar).toBe(false);
        expect(plan.spawns.map((s) => s.id)).toEqual(["p1", "p2"]);
    });
    it("en máxima caben los 60 objetos y las 4 luces, con cristal de transmisión completa", () => {
        const plan = planDe(MUNDO, "maxima");
        expect(plan.objetos).toHaveLength(60);
        expect(plan.luces).toHaveLength(4);
        expect(plan.cristal).toBe("transmision-completa");
        expect(plan.sombras.activas).toBe(true);
        expect(plan.radioCielo).toBe(64);
    });
    it("los objetos ocultos viven en el mundo pero no entran al plan", () => {
        const conOculto = validarMundo({ ...MUNDO, objetos: [...MUNDO.objetos, { ...OBJETO(60), id: "secreto", oculto: true }] }).mundo;
        const plan = planDe(conOculto, "maxima");
        expect(plan.mundo.objetos.some((o) => o.id === "secreto")).toBe(true);
        expect(plan.objetos.some((o) => o.id === "secreto")).toBe(false);
    });
    it("islas traen mar, vacío no trae terreno y sin spawns se añade la entrada al centro", () => {
        const islas = validarMundo({ ...MUNDO, entorno: { ...MUNDO.entorno, terreno: "islas" } }).mundo;
        expect(planDe(islas, "media").mar).toBe(true);
        const vacio = validarMundo({ ...MUNDO, entorno: { ...MUNDO.entorno, terreno: "vacio" } }).mundo;
        const p = planDe(vacio, "media");
        expect(p.terreno).toBeNull();
        expect(p.mar).toBe(false);
        const sinSpawns = validarMundo({ ...MUNDO, spawns: [] }).mundo;
        expect(planDe(sinSpawns, "media").spawns.map((s) => s.id)).toEqual(["entrada"]);
    });
});

describe("humo de render (sin WebGL): el plan se pinta como primitivas de R3F", () => {
    it("un mundo válido produce cúpula, terreno, objetos, luces y anillos de spawn", () => {
        const html = renderToStaticMarkup(createElement(MundoRender, { mundo: validarMundo(MUNDO).mundo, nivel: "media" }));
        expect(html).toContain("sphereGeometry");
        expect(html).toContain("meshStandardMaterial");
    });
    it("un mundo inválido no pinta NADA", () => {
        expect(renderToStaticMarkup(createElement(MundoRender, { mundo: { tipo: "malo" } }))).toBe("");
    });
});

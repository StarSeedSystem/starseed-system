import { describe, expect, it } from "vitest";

import {
    FUENTE_MOTIONSITES,
    LICENCIA_MOTIONSITES,
    REPO_MOTIONSITES,
    RUBRICA,
    TECNICAS,
    TIPOS_DE_PAGINA,
    tecnicasPara,
} from "../motionsites";

const REPO = "https://github.com/Motionsites-AI/claude-skill";
const LIMITE = 200;

describe("catálogo de técnicas de MotionSites", () => {
    it("carga las 58 recetas del índice con ids únicos y sin huecos", () => {
        expect(TECNICAS).toHaveLength(58);
        expect(new Set(TECNICAS.map((t) => t.id)).size).toBe(TECNICAS.length);
        for (const t of TECNICAS) {
            expect(t.id.trim().length, t.id).toBeGreaterThan(0);
            expect(t.nombre.trim().length, t.id).toBeGreaterThan(0);
            expect(t.cuandoUsarla.trim().length, t.id).toBeGreaterThan(20);
        }
    });

    it("ningún texto de una entrada supera 200 caracteres", () => {
        for (const t of TECNICAS) {
            for (const [campo, valor] of Object.entries(t)) {
                expect(valor.length, `${t.id}.${campo}`).toBeLessThanOrEqual(LIMITE);
            }
        }
    });

    it("todas las recetas enlazan al repo original y no a una copia local", () => {
        for (const t of TECNICAS) {
            expect(t.enlace.startsWith(`${REPO}/`), t.id).toBe(true);
            expect(t.enlace, t.id).toMatch(/\/references\/techniques\/[a-z0-9-]+\.md$/);
        }
    });

    it("declara el origen y la licencia real, con el aviso de © para prompts y medios", () => {
        expect(REPO_MOTIONSITES).toBe("Motionsites-AI/claude-skill");
        expect(FUENTE_MOTIONSITES).toBe(REPO);
        expect(LICENCIA_MOTIONSITES).toContain("MIT");
        expect(LICENCIA_MOTIONSITES).toContain("© MotionSites");
    });
});

describe("rúbrica de revisión visual", () => {
    it("son diez preguntas con ids únicos y enunciados breves", () => {
        expect(RUBRICA).toHaveLength(10);
        expect(new Set(RUBRICA.map((r) => r.id)).size).toBe(RUBRICA.length);
        for (const r of RUBRICA) {
            expect(r.pregunta.trim().length, r.id).toBeGreaterThan(20);
            expect(r.pregunta.length, r.id).toBeLessThanOrEqual(LIMITE);
            expect(r.pregunta.endsWith("?"), r.id).toBe(true);
        }
    });
});

describe("tecnicasPara por tipo de página", () => {
    it("cada contexto recibe una selección no vacía, sin repetidos y del catálogo", () => {
        const porId = new Map(TECNICAS.map((t) => [t.id, t]));
        for (const tipo of TIPOS_DE_PAGINA) {
            const lista = tecnicasPara(tipo);
            expect(lista.length, tipo).toBeGreaterThanOrEqual(3);
            expect(lista.length, tipo).toBeLessThanOrEqual(6);
            expect(new Set(lista.map((t) => t.id)).size, tipo).toBe(lista.length);
            for (const t of lista) expect(porId.get(t.id), `${tipo}:${t.id}`).toBe(t);
        }
    });

    it("devuelve objetos del catálogo en orden estable y no altera el catálogo", () => {
        const antes = TECNICAS.length;
        const primera = tecnicasPara("landing")[0];
        expect(TECNICAS).toContain(primera);
        expect(primera.id).toBe("video-fondo-cinematico");
        expect(tecnicasPara("landing").map((t) => t.id).slice(0, 3)).toEqual([
            "video-fondo-cinematico",
            "velo-borde-fundido",
            "superficie-cristal-liquido",
        ]);
        expect(TECNICAS).toHaveLength(antes);
    });

    it("los seis tipos son estables y cada uno tiene su propia combinación", () => {
        expect(TIPOS_DE_PAGINA).toEqual([
            "publicacion",
            "grupo",
            "comunidad",
            "ficha-libreria",
            "lienzo",
            "landing",
        ]);
        const firmas = TIPOS_DE_PAGINA.map((tipo) => tecnicasPara(tipo).map((t) => t.id).join(","));
        expect(new Set(firmas).size).toBe(TIPOS_DE_PAGINA.length);
    });
});

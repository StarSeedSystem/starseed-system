// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { fichasIaConUpstreamGitHub, urlDeConsulta, validarPatronTag } from "../actualizaciones";
import { install, isInstalled } from "../packages";
import {
    CONTRATO_1027,
    DECISIONES_1027,
    FICHAS_REPOS_1027,
    IDS_SIEMBRA_1027,
    LICENCIAS_VERIFICADAS_1027,
    TANDA_1027_FICHAS,
} from "../repos-1027";

const RAIZ = path.resolve(__dirname, "../../../..");

const ficha = (id: string) => FICHAS_REPOS_1027.find((p) => p.id === id)!;

describe("tanda 1027 · las cuentas", () => {
    it("3 fichas tal cual vienen del JSON: OpenMausBot, Insomnia y Colibri", () => {
        expect(TANDA_1027_FICHAS).toHaveLength(3);
        expect(FICHAS_REPOS_1027.map((p) => p.id).sort()).toEqual(["lib-colibri", "lib-insomnia", "lib-openmausbot"]);
        expect(FICHAS_REPOS_1027.map((p) => p.author).sort()).toEqual(["JustVugg", "krishhgg", "milind-soni"]);
    });

    it("el JSON explica qué se decidió y de dónde sale cada licencia (nada se ejecutó el 2026-10-27)", () => {
        expect(DECISIONES_1027.length).toBeGreaterThanOrEqual(3);
        expect(Object.keys(LICENCIAS_VERIFICADAS_1027).sort()).toEqual(["agentes", "ia-local", "neuronas"]);
        for (const texto of Object.values(LICENCIAS_VERIFICADAS_1027)) expect(texto).toMatch(/2026-10-27/);
    });

    it("todas se siembran por defecto (regla de Alex: preinstaladas)", () => {
        expect([...IDS_SIEMBRA_1027].sort()).toEqual(["lib-colibri", "lib-insomnia", "lib-openmausbot"]);
    });
});

describe("tanda 1027 · cada ficha", () => {
    it("el kind es EL DE LA FICHA (tool o ai-source), no «project»", () => {
        expect(ficha("lib-openmausbot").kind).toBe("tool");
        expect(ficha("lib-insomnia").kind).toBe("tool");
        expect(ficha("lib-colibri").kind).toBe("ai-source");
    });

    it("trae repo de GitHub, canal, licencia, versión, aviso, upstream y contrato", () => {
        for (const p of FICHAS_REPOS_1027) {
            expect(p.id, p.id).toMatch(/^lib-[a-z0-9-]+$/);
            expect(String(p.payload.upstream), p.id).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
            expect(p.payload.externalUrl, p.id).toBe(p.payload.upstream);
            expect(p.payload.canal, p.id).toBe("tags");
            expect(String(p.payload.licencia).length, p.id).toBeGreaterThan(1);
            expect(p.version.length, p.id).toBeGreaterThan(0);
            expect(p.version, p.id).not.toMatch(/\s/);
            expect(String(p.payload.aviso).length, p.id).toBeGreaterThan(10);
            expect(p.description.length, p.id).toBeGreaterThan(40);
            expect(p.payload.contrato, p.id).toBe(CONTRATO_1027);
            expect(String(p.payload.requisitos).length, p.id).toBeGreaterThan(10);
            expect(p.free, p.id).toBe(true);
        }
        expect(ficha("lib-openmausbot").version).toBe("v0.1.130");
        expect(ficha("lib-insomnia").version).toBe("v0.1.0");
        expect(ficha("lib-colibri").version).toBe("v2.0.0");
    });

    it("instalar solo registra el enlace y NINGUNA ficha dice que corre aquí", () => {
        for (const p of FICHAS_REPOS_1027) {
            expect(p.payload.route, p.id).toBeUndefined();
            expect(p.payload.skillId, p.id).toBeUndefined();
            expect(p.comingSoon, p.id).toBeFalsy();
            expect(p.payload.corre_aqui, p.id).toBe(false);
        }
        for (const f of TANDA_1027_FICHAS) expect(f.corre_aqui, f.id).toBe(false);
    });

    it("las licencias son las verificadas, con lo que cada una exige", () => {
        expect(String(ficha("lib-openmausbot").payload.licencia)).toMatch(/^Apache-2\.0/);
        expect(String(ficha("lib-openmausbot").payload.licencia)).toMatch(/enterprise\/ .*licencia propia|enterprise\/ \(licencia propia/);
        expect(String(ficha("lib-insomnia").payload.licencia)).toMatch(/^MIT/);
        expect(String(ficha("lib-colibri").payload.licencia)).toMatch(/^Apache-2\.0/);
        expect(String(ficha("lib-colibri").payload.licencia)).toMatch(/no comercial/);
    });

    it("cada icono existe en el mapa de la tienda (incluidos los nuevos MousePointer2 y Bird)", () => {
        const tienda = readFileSync(path.join(RAIZ, "src/components/library/package-store.tsx"), "utf8");
        const bloque = /const ICON_MAP[^=]*=\s*\{([\s\S]*?)\n\};/.exec(tienda)?.[1] ?? "";
        const conocidos = new Set(bloque.replace(/\/\/[^\n]*/g, "").split(/[\s,]+/).filter(Boolean));
        expect(conocidos.has("MousePointer2"), "MousePointer2 en ICON_MAP").toBe(true);
        expect(conocidos.has("Bird"), "Bird en ICON_MAP").toBe(true);
        for (const p of FICHAS_REPOS_1027) expect(conocidos.has(p.icon), `${p.id}: icono «${p.icon}»`).toBe(true);
    });

    it("el texto visible no usa los nombres prohibidos de Genesis ni emojis", () => {
        const todo = JSON.stringify([...FICHAS_REPOS_1027]);
        expect(todo).not.toMatch(new RegExp(["Puente de", "Centro de"].map((p) => `${p} ${["Man", "do"].join("")}`).join("|")));
        expect(todo).not.toMatch(/\p{Extended_Pictographic}/u);
    });

    it("ninguna clave ni ruta del disco en las fichas: solo el nombre de la variable de entorno si hiciera falta", () => {
        const texto = readFileSync(path.join(RAIZ, "config/repos-libreria-1027.json"), "utf8");
        expect(texto).not.toMatch(/\b(sk|ghp|gsk|xox[bp])[-_][A-Za-z0-9]{16,}/);
    });
});

describe("tanda 1027 · el canal de versiones de cada una", () => {
    it("la comprobación llega a las tres: URL de GitHub y patrón de etiqueta válido", () => {
        for (const p of FICHAS_REPOS_1027) {
            const url = urlDeConsulta(String(p.payload.upstream), p.payload as Record<string, unknown> & { patronTag?: unknown });
            expect(url, p.id).toBe(`https://api.github.com/repos/${p.author === "milind-soni" ? "milind-soni/OpenMausBot" : p.id === "lib-insomnia" ? "krishhgg/Insomnia" : "JustVugg/colibri"}/tags?per_page=100`);
            expect(validarPatronTag(p.payload.patronTag).error, p.id).toBeNull();
        }
        expect(fichasIaConUpstreamGitHub(FICHAS_REPOS_1027)).toHaveLength(3);
    });

    it("el patrón casa con la versión real y no con nocturnas ni candidatas (Insomnia sí publica nocturnas)", () => {
        const patron = validarPatronTag(ficha("lib-insomnia").payload.patronTag).patron!;
        expect(patron.test("v0.1.0")).toBe(true);
        for (const ruido of ["nightly-20261027-b8e7e20d617f", "v0.1.0-rc.1", "v0.1"]) expect(patron.test(ruido), ruido).toBe(false);
        const patronMaus = validarPatronTag(ficha("lib-openmausbot").payload.patronTag).patron!;
        expect(patronMaus.test("v0.1.130")).toBe(true);
        expect(patronMaus.test("v1")).toBe(false);
    });
});

describe("tanda 1027 · instalar guarda el enlace", () => {
    afterEach(() => localStorage.clear());

    it("instalar marca la ficha como instalada sin abrir rutas del OS", async () => {
        for (const f of FICHAS_REPOS_1027) {
            localStorage.clear();
            const res = await install(f);
            expect(res.ok, f.id).toBe(true);
            expect(res.action, f.id).toBe("external");
            expect(res.href, f.id).toBe(f.payload.externalUrl);
            expect(isInstalled(f.id), f.id).toBe(true);
        }
    });
});

describe("tanda 1027 · el módulo es puro (CLAUDE.md, trampa 11)", () => {
    it("no usa node:*, ni «use client», ni lee el disco: entra al paquete del navegador y al servidor", () => {
        const fuente = readFileSync(path.join(RAIZ, "src/lib/library/repos-1027.ts"), "utf8");
        expect(fuente).not.toMatch(/^\s*import[^;]*from\s+["']node:/m);
        expect(fuente).not.toMatch(/^\s*["']use client["']/m);
        expect(fuente).not.toMatch(/\breadFileSync\b|\bfs\./);
        expect(fuente).toMatch(/from "..\/..\/..\/config\/repos-libreria-1027\.json"/);
    });
});

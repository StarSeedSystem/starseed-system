// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { compararVersiones, urlDeConsulta, validarPatronTag } from "../actualizaciones";
import { fichasIaConUpstreamGitHub } from "../fuentes-ia-locales";
import { RECOMMENDED_PACKAGE_IDS } from "../defaults-seed";
import { allPackages, findPackage, install, isInstalled, STARSEED_IA_TOOLS_REPO, STARSEED_LABS_REPO } from "../packages";
import {
    FICHAS_REPOS_1025,
    FICHAS_VIEJAS_SEGUIMIENTO_1025,
    FUSIONADAS_1025,
    IDS_SIEMBRA_1025,
    TANDA_1025_FICHAS,
    YA_EN_PROTOMOLECULA_1025,
    versionCorta,
} from "../repos-1025";

const RAIZ = path.resolve(__dirname, "../../../..");

describe("tanda 1025 · las cuentas", () => {
    it("33 fichas = 26 nuevas + 3 fusionadas con fichas viejas + 4 que ya viven en la Protomolécula", () => {
        expect(TANDA_1025_FICHAS).toHaveLength(33);
        expect(FICHAS_REPOS_1025).toHaveLength(26);
        expect(Object.keys(FUSIONADAS_1025).sort()).toEqual(["lib-agent-reach", "lib-crewai", "lib-taste-skill"]);
        expect(Object.keys(YA_EN_PROTOMOLECULA_1025).sort()).toEqual(["lib-deckcraft", "lib-figcraft", "lib-gridcraft", "lib-rare"]);
    });

    it("ningún id se repite, ni dentro de la tanda ni contra el resto de la Biblioteca", () => {
        const ids = TANDA_1025_FICHAS.map((f) => f.id);
        expect(new Set(ids).size).toBe(ids.length);
        const catalogo = allPackages().map((p) => p.id);
        expect(new Set(catalogo).size).toBe(catalogo.length);
        // Las nuevas están una sola vez en el catálogo; las fusionadas y las `proto-*` no se crean otra vez.
        for (const f of FICHAS_REPOS_1025) expect(catalogo.filter((id) => id === f.id)).toHaveLength(1);
        for (const id of [...Object.keys(FUSIONADAS_1025), ...Object.keys(YA_EN_PROTOMOLECULA_1025)]) {
            expect(catalogo, id).not.toContain(id);
        }
    });

    it("las fusionadas actualizan la ficha vieja en su sitio (no hay segunda ficha)", () => {
        for (const [nuevo, viejo] of Object.entries(FUSIONADAS_1025)) {
            expect(FICHAS_REPOS_1025.find((f) => f.id === nuevo), nuevo).toBeUndefined();
            const ficha = STARSEED_IA_TOOLS_REPO.packages.find((p) => p.id === viejo);
            expect(ficha, viejo).toBeDefined();
            expect(String(ficha?.payload.upstream), viejo).toMatch(/^https:\/\/github\.com\//);
            expect(ficha?.version, viejo).not.toBe("1.0.0");
            expect(["releases", "tags", "commits"]).toContain(ficha?.payload.canal);
        }
        // La skill de Aurora y su enlace de referencia siguen donde estaban.
        expect(findPackage("iatool-taste-skill")?.payload.skillId).toBe("aurora-taste");
        expect(findPackage("iatool-agent-reach")?.payload.skillId).toBe("aurora-web-senses");
    });
});

describe("tanda 1025 · cada ficha", () => {
    it("trae repo de GitHub, canal, licencia, versión y aviso", () => {
        for (const p of FICHAS_REPOS_1025) {
            expect(p.kind, p.id).toBe("project");
            expect(p.id, p.id).toMatch(/^lib-[a-z0-9-]+$/);
            expect(String(p.payload.upstream), p.id).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
            expect(p.payload.externalUrl, p.id).toBe(p.payload.upstream);
            expect(["releases", "tags", "commits"], p.id).toContain(p.payload.canal);
            expect(String(p.payload.licencia).length, p.id).toBeGreaterThan(1);
            expect(p.version.length, p.id).toBeGreaterThan(0);
            expect(p.version, p.id).not.toMatch(/\s/);
            expect(String(p.payload.aviso).length, p.id).toBeGreaterThan(10);
            expect(p.description.length, p.id).toBeGreaterThan(40);
            expect(p.payload.contrato, p.id).toBe("architecture/repos-libreria-1025.md");
        }
    });

    it("cada icono existe en el mapa de la tienda (si no, la tarjeta cae al icono genérico)", () => {
        const tienda = readFileSync(path.join(RAIZ, "src/components/library/package-store.tsx"), "utf8");
        const bloque = /const ICON_MAP[^=]*=\s*\{([\s\S]*?)\n\};/.exec(tienda)?.[1] ?? "";
        const conocidos = new Set(bloque.replace(/\/\/[^\n]*/g, "").split(/[\s,]+/).filter(Boolean));
        expect(conocidos.size).toBeGreaterThan(40);
        for (const p of FICHAS_REPOS_1025) expect(conocidos.has(p.icon), `${p.id}: icono «${p.icon}»`).toBe(true);
    });

    it("instalar solo registra el enlace: sin ruta, sin skill, sin «próximamente», sin código que corra aquí", () => {
        for (const p of FICHAS_REPOS_1025) {
            expect(p.payload.route, p.id).toBeUndefined();
            expect(p.payload.skillId, p.id).toBeUndefined();
            expect(p.comingSoon, p.id).toBeFalsy();
            expect(p.payload.corre_aqui, p.id).toBe(false);
        }
    });

    it("la comprobación de versión llega a todas: URL de consulta de GitHub y patrón de etiqueta válido", () => {
        expect(fichasIaConUpstreamGitHub(FICHAS_REPOS_1025)).toHaveLength(FICHAS_REPOS_1025.length);
        expect(fichasIaConUpstreamGitHub(FICHAS_VIEJAS_SEGUIMIENTO_1025)).toHaveLength(3);
        for (const p of [...FICHAS_REPOS_1025, ...FICHAS_VIEJAS_SEGUIMIENTO_1025]) {
            const payload = p.payload as { canal?: unknown; patronTag?: unknown };
            const url = urlDeConsulta(String(p.payload.upstream), payload);
            expect(url, p.id).toMatch(/^https:\/\/api\.github\.com\/repos\//);
            if (payload.patronTag !== undefined) {
                expect(validarPatronTag(payload.patronTag).error, p.id).toBeNull();
                expect(url, p.id).toMatch(/\/tags\?/);
            }
        }
    });

    it("en el canal de commits la versión es el SHA corto y se compara contra el remoto", () => {
        const porCommits = FICHAS_REPOS_1025.filter((p) => p.payload.canal === "commits");
        expect(porCommits.length).toBeGreaterThan(3);
        for (const p of porCommits) {
            expect(p.version, p.id).toMatch(/^[0-9a-f]{7}$/);
            expect(compararVersiones(p.version, `${p.version}aaaaaaaaaaaa`), p.id).toBe("igual");
            expect(compararVersiones(p.version, "0000000000000000000000000000000000000000"), p.id).toBe("hay-actualizacion");
        }
    });

    it("versionCorta limpia la etiqueta y extrae el SHA de los textos largos", () => {
        expect(versionCorta("commits", "commit 45c9f7d (Open Strata 1.0.2)")).toBe("45c9f7d");
        expect(versionCorta("commits", "main@33d44a4 (última etiqueta v8.0.0)")).toBe("33d44a4");
        expect(versionCorta("commits", "sin versiones publicadas (sin tags ni releases) · HEAD 8bd56d6")).toBe("8bd56d6");
        expect(versionCorta("commits", "3b605320d2f0c1d6")).toBe("3b60532");
        expect(versionCorta("releases", "v0.9.5 (main avanza: 2026-10-21)")).toBe("v0.9.5");
        expect(versionCorta("tags", "0.7.0")).toBe("0.7.0");
    });

    it("Cloudflare Computer sigue las etiquetas de su paquete @cloudflare/computer", () => {
        const cf = FICHAS_REPOS_1025.find((p) => p.id === "lib-cloudflare-computer")!;
        expect(cf.payload.upstream).toBe("https://github.com/cloudflare/computer");
        expect(cf.payload.licencia).toBe("MIT");
        expect(cf.payload.canal).toBe("tags");
        expect(String(cf.payload.patronTag)).toContain("@cloudflare/computer@");
        expect(String(cf.payload.aviso)).toMatch(/Workers/i);
    });
});

describe("tanda 1025 · en la Biblioteca y preinstaladas", () => {
    afterEach(() => localStorage.clear());

    it("las 26 viven en el repo de laboratorio y se encuentran por id", () => {
        for (const f of FICHAS_REPOS_1025) {
            expect(STARSEED_LABS_REPO.packages.find((p) => p.id === f.id), f.id).toBeDefined();
            expect(findPackage(f.id), f.id).toBeDefined();
        }
    });

    it("todas se siembran por defecto (la regla de Alex: preinstaladas)", () => {
        for (const id of IDS_SIEMBRA_1025) expect(RECOMMENDED_PACKAGE_IDS).toContain(id);
        for (const f of FICHAS_REPOS_1025) expect(RECOMMENDED_PACKAGE_IDS, f.id).toContain(f.id);
    });

    it("instalar guarda el enlace y marca la ficha como instalada sin abrir rutas del OS", async () => {
        const ficha = findPackage("lib-nanobot")!;
        const res = await install(ficha);
        expect(res.ok).toBe(true);
        expect(res.action).toBe("external");
        expect(res.href).toBe(ficha.payload.externalUrl);
        expect(isInstalled("lib-nanobot")).toBe(true);
    });
});

describe("tanda 1025 · el módulo es puro (CLAUDE.md, trampa 11)", () => {
    it("no usa node:*, ni «use client», ni lee el disco: entra al paquete del navegador y al servidor", () => {
        const fuente = readFileSync(path.join(RAIZ, "src/lib/library/repos-1025.ts"), "utf8");
        // La cabecera comenta la regla; lo que no puede haber es un import o una directiva reales.
        expect(fuente).not.toMatch(/^\s*import[^;]*from\s+["']node:/m);
        expect(fuente).not.toMatch(/^\s*["']use client["']/m);
        expect(fuente).not.toMatch(/\breadFileSync\b|\bfs\./);
        expect(fuente).toMatch(/from "..\/..\/..\/config\/repos-libreria-1025\.json"/);
    });
});

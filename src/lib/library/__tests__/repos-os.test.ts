// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { fichasIaConUpstreamGitHub } from "../fuentes-ia-locales";
import { findPackage, install, isInstalled } from "../packages";
import { FICHAS_REPOS_OS } from "../repos-os";

describe("repos que Alex trajo para el OS", () => {
    it("Hono entra con su versión, licencia y comprobación por releases", () => {
        const hono = FICHAS_REPOS_OS.find((p) => p.id === "repo-hono");
        expect(hono?.kind).toBe("project");
        expect(hono?.payload.canal).toBe("releases");
        expect(String(hono?.payload.servicio)).toContain("servicios/servidor-ia");
        // Instalar lleva a Recursos de IA (no promete un «instalado» que no existe).
        expect(hono?.payload.route).toBe("/agent?tab=recursos-ia");
    });

    it("Zalo Kit va como «próximamente» con el motivo a la vista (no es un modelo de IA)", () => {
        const zalo = FICHAS_REPOS_OS.find((p) => p.id === "repo-react-native-zalo-kit");
        expect(zalo?.comingSoon).toBe(true);
        expect(String(zalo?.payload.note)).toMatch(/Tauri/);
    });

    it("las dos entran en la comprobación automática de versión", () => {
        expect(fichasIaConUpstreamGitHub(FICHAS_REPOS_OS).map((p) => p.id)).toEqual(FICHAS_REPOS_OS.map((p) => p.id));
        expect(FICHAS_REPOS_OS.map((p) => p.id)).toEqual(expect.arrayContaining([
            "repo-hono", "repo-filee", "repo-codegraph", "repo-manimgx", "repo-earshot",
            "repo-agno", "repo-langgraph", "repo-pydantic-ai", "repo-openai-agents-python", "repo-react-native-zalo-kit", "repo-blender",
        ]));
    });
});

describe("instalar desde la Biblioteca", () => {
    afterEach(() => localStorage.clear());

    it("Hono se instala de verdad: queda registrado y abre Recursos de IA", async () => {
        const hono = findPackage("repo-hono")!;
        expect(hono).toBeDefined();
        const res = await install(hono);
        expect(res.ok).toBe(true);
        expect(res.action).toBe("route");
        expect(res.href).toBe("/agent?tab=recursos-ia");
        expect(res.message).not.toMatch(/skill/i);
        expect(isInstalled("repo-hono")).toBe(true);
    });

    it("Filee se instala y abre el conversor del OS", async () => {
        const filee = findPackage("repo-filee")!;
        expect(filee.payload.upstream).toBe("https://github.com/KnifeLemon/Filee");
        expect(filee.payload.licencia).toBe("MIT");
        const res = await install(filee);
        expect(res.ok).toBe(true);
        expect(res.href).toBe("/convertir");
        expect(isInstalled("repo-filee")).toBe(true);
    });

    it("Zalo Kit está en el catálogo pero no se instala por error", () => {
        const zalo = findPackage("repo-react-native-zalo-kit")!;
        expect(zalo.comingSoon).toBe(true);
        expect(zalo.payload.route).toBeUndefined();
    });
});

describe("tanda del 2026-10-23 (3D, contexto, oído y motores de agentes)", () => {
    it("lo que aún no corre en el OS va «próximamente» con su motivo y su licencia", () => {
        for (const id of ["repo-manimgx", "repo-earshot", "repo-agno", "repo-langgraph", "repo-pydantic-ai", "repo-openai-agents-python"]) {
            const p = FICHAS_REPOS_OS.find((x) => x.id === id)!;
            expect(p.comingSoon, id).toBe(true);
            expect(String(p.payload.note), id).toMatch(/ola 1023/);
            expect(String(p.payload.licencia), id).toMatch(/MIT|Apache/);
        }
    });

    it("CodeGraph ya corre (contexto de los agentes de MetaGenesis) y no manda datos fuera", () => {
        const cg = FICHAS_REPOS_OS.find((x) => x.id === "repo-codegraph")!;
        expect(cg.comingSoon).toBeFalsy();
        expect(cg.payload.route).toBe("/metagenesis");
        expect(String(cg.payload.requisitos)).toMatch(/Telemetría apagada/);
    });

    it("Blender entra con su licencia GPL, su comprobación por etiquetas 5.2.x y el motivo a la vista", () => {
        const bl = FICHAS_REPOS_OS.find((x) => x.id === "repo-blender")!;
        expect(bl.kind).toBe("project");
        expect(bl.comingSoon).toBe(true);
        expect(bl.payload.upstream).toBe("https://github.com/blender/blender");
        expect(bl.payload.canal).toBe("tags");
        expect(String(bl.payload.licencia)).toMatch(/GPL-3\.0-or-later/);
        expect(String(bl.payload.note)).toMatch(/ola 1025B/);
        // El patrón de etiqueta casa con la serie 5.2 y no con otras ni con candidatas.
        const re = new RegExp(String(bl.payload.patronTag));
        expect(["v5.2.0", "v5.2.3", "v5.2.10"].every((t) => re.test(t))).toBe(true);
        expect(["v5.1.0", "v6.0.0", "v5.2.3-rc1", "5.2.3"].some((t) => re.test(t))).toBe(false);
    });

    it("ids únicos en toda la Biblioteca", () => {
        const ids = FICHAS_REPOS_OS.map((p) => p.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe("tanda del 2026-10-24 (Cloudroom, servidor de agentes local y en la nube)", () => {
    it("entra con su licencia, lo gratis, los enlaces y la comprobación por releases", () => {
        const cr = FICHAS_REPOS_OS.find((p) => p.id === "repo-cloudroom")!;
        expect(cr.name).toBe("Cloudroom");
        expect(cr.kind).toBe("project");
        expect(cr.comingSoon).toBeFalsy();
        expect(cr.payload.upstream).toBe("https://github.com/davidondrej/cloudroom-gui");
        expect(cr.payload.canal).toBe("releases");
        expect(cr.payload.externalUrl).toBe("https://www.cloudroom.dev");
        expect(String(cr.payload.licencia)).toMatch(/código abierto \(núcleo cloudroom-core\)/);
        expect(String(cr.payload.gratis)).toMatch(/local sin límite/);
        expect(String(cr.payload.gratis)).toMatch(/100 agentes en la nube cada 30 días/);
    });

    it("declara sus plataformas y las que faltan honestas (próximamente)", () => {
        const cr = FICHAS_REPOS_OS.find((p) => p.id === "repo-cloudroom")!;
        const reqs = String(cr.payload.requisitos);
        expect(reqs).toMatch(/macOS Apple Silicon ≥13/);
        expect(reqs).toMatch(/Linux x64 \(alfa\)/);
        expect(reqs).toMatch(/Windows: próximamente \(sin versión oficial\)/);
        expect(reqs).toMatch(/móvil: próximamente \(sin app oficial\)/);
        expect(String(cr.payload.servicio)).toContain("room-cli");
    });

    it("abrir la ficha lleva a la sección de contenedores de agentes de MetaGenesis", () => {
        const cr = FICHAS_REPOS_OS.find((p) => p.id === "repo-cloudroom")!;
        expect(cr.payload.route).toBe("/metagenesis");
        expect(FICHAS_REPOS_OS.map((p) => p.id)).toContain("repo-cloudroom");
    });
});

describe("tanda del 2026-10-25 (Soup, Hermes3D y ECC)", () => {
    it("Soup va «próximamente»: Apache-2.0, comprobación por commits, requisitos honestos y sin ruta", () => {
        const soup = FICHAS_REPOS_OS.find((p) => p.id === "repo-soup")!;
        expect(soup.kind).toBe("project");
        expect(soup.comingSoon).toBe(true);
        expect(soup.payload.upstream).toBe("https://github.com/MakazhanAlpamys/Soup");
        expect(soup.payload.canal).toBe("commits");
        expect(soup.payload.licencia).toBe("Apache-2.0");
        // El canal de commits usa el SHA corto de main; la versión de PyPI va aparte, a la vista.
        expect(soup.version).toMatch(/^[0-9a-f]{7}$/);
        expect(String(soup.payload.versionPublicada)).toMatch(/0\.76\.1/);
        // No promete nada que no corra aquí.
        expect(soup.payload.corre_aqui).toBe(false);
        expect(soup.payload.route).toBeUndefined();
        expect(soup.payload.externalUrl).toBeUndefined();
        const reqs = String(soup.payload.requisitos);
        expect(reqs).toMatch(/Python 3\.11 o 3\.12/);
        expect(reqs).toMatch(/no instala en 3\.13/);
        expect(reqs).toMatch(/pip install "soup-cli\[train\]"/);
        expect(String(soup.payload.note)).toMatch(/ola 1025U/);
        expect(String(soup.payload.note)).toMatch(/no se carga sobre el BitNet 1\.58/);
        expect(soup.description).toMatch(/la Mac de 8 GB y el A1 de Oracle \(sin GPU\) no entrenan/);
    });

    it("Soup no se instala por error", async () => {
        const soup = findPackage("repo-soup")!;
        expect(soup).toBeDefined();
        const res = await install(soup);
        expect(res.ok).toBe(false);
        expect(res.message).toMatch(/próximamente/);
        expect(isInstalled("repo-soup")).toBe(false);
    });

    it("Hermes3D sigue los commits de main, es MIT y abre el Mundo de los avatares", async () => {
        const h = findPackage("repo-hermes3d")!;
        expect(h.payload.upstream).toBe("https://github.com/iamlukethedev/Hermes3D");
        expect(h.payload.canal).toBe("commits");
        expect(h.payload.licencia).toBe("MIT");
        expect(h.version).toMatch(/^[0-9a-f]{7}$/);
        expect(h.comingSoon).toBeFalsy();
        expect(h.payload.corre_aqui).toBe(false);
        expect(String(h.payload.note)).toMatch(/LICENSE-hermes3d\.md/);
        const res = await install(h);
        expect(res.ok).toBe(true);
        expect(res.action).toBe("route");
        expect(res.href).toBe("/mundo-avatares");
        expect(isInstalled("repo-hermes3d")).toBe(true);
    });

    it("ECC va por releases (v*), es MIT y al instalar guarda el enlace sin fingir que corre en el OS", async () => {
        const ecc = findPackage("repo-ecc")!;
        expect(ecc.payload.upstream).toBe("https://github.com/affaan-m/ECC");
        expect(ecc.payload.canal).toBe("releases");
        expect(ecc.payload.licencia).toBe("MIT");
        expect(ecc.version).toBe("2.2.3");
        // El patrón de las etiquetas de sus releases es informativo: no fuerza el canal de etiquetas.
        expect(ecc.payload.patronRelease).toBe("v*");
        expect(ecc.payload.patronTag).toBeUndefined();
        expect(`v${ecc.version}`).toMatch(/^v\d+\.\d+\.\d+$/);
        expect(ecc.payload.corre_aqui).toBe(false);
        expect(String(ecc.payload.note)).toMatch(/ecc-starseed/);
        expect(ecc.description).toMatch(/24 skills y 12 agentes/);
        const res = await install(ecc);
        expect(res.ok).toBe(true);
        expect(res.action).toBe("external");
        expect(res.href).toBe("https://github.com/affaan-m/ECC");
    });

    it("las tres entran en la comprobación de versión upstream y tienen un icono que existe", () => {
        const ids = fichasIaConUpstreamGitHub(FICHAS_REPOS_OS).map((p) => p.id);
        expect(ids).toEqual(expect.arrayContaining(["repo-soup", "repo-hermes3d", "repo-ecc"]));
        const fuente = readFileSync(join(process.cwd(), "src/components/library/package-store.tsx"), "utf8");
        const mapa = fuente.slice(fuente.indexOf("const ICON_MAP"), fuente.indexOf("const IA_TOOLS_REPO_ID"));
        for (const id of ["repo-soup", "repo-hermes3d", "repo-ecc"]) {
            const icono = FICHAS_REPOS_OS.find((p) => p.id === id)!.icon;
            expect(mapa, `${id}: ${icono}`).toMatch(new RegExp(`\\b${icono}\\b`));
        }
    });
});

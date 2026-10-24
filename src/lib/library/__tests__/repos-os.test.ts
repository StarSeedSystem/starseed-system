// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { urlDeConsulta } from "../actualizaciones";
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
            "repo-agno", "repo-langgraph", "repo-pydantic-ai", "repo-openai-agents-python", "repo-react-native-zalo-kit",
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

    it("ids únicos en toda la Biblioteca", () => {
        const ids = FICHAS_REPOS_OS.map((p) => p.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe("tanda del 2026-10-24 (Cloudroom, servidor de agentes local y en la nube)", () => {
    it("entra con su licencia, lo gratis, los enlaces y la comprobación por releases", () => {
        const cr = FICHAS_REPOS_OS.find((p) => p.id === "repo-cloudroom")!;
        expect(cr.kind).toBe("project");
        expect(cr.comingSoon).toBeFalsy();
        expect(cr.name).toMatch(/^Cloudroom/);
        expect(String(cr.description)).toMatch(/rama de git por agente/);
        expect(cr.payload.upstream).toBe("https://github.com/davidondrej/cloudroom-gui");
        expect(cr.payload.canal).toBe("releases");
        expect(urlDeConsulta(String(cr.payload.upstream), cr.payload)).toBe(
            "https://api.github.com/repos/davidondrej/cloudroom-gui/releases/latest",
        );
        expect(cr.payload.externalUrl).toBe("https://www.cloudroom.dev");
        expect(String(cr.payload.licencia)).toMatch(/código abierto \(núcleo cloudroom-core\)/);
        expect(String(cr.payload.gratis)).toMatch(/local sin límite/);
        expect(String(cr.payload.gratis)).toMatch(/100 agentes en la nube cada 30 días/);
    });

    it("declara sus plataformas y las que faltan honestas (próximamente)", () => {
        const cr = FICHAS_REPOS_OS.find((p) => p.id === "repo-cloudroom")!;
        const reqs = String(cr.payload.requisitos);
        expect(reqs).toMatch(/macOS Apple Silicon 13\+/);
        expect(reqs).toMatch(/Linux x64 \(alfa\)/);
        expect(reqs).toMatch(/próximamente/);
        expect(String(cr.payload.servicio)).toContain("room-cli");
    });

    it("abrir la ficha lleva a la sección de contenedores de agentes de Genesis (MetaGenesis)", () => {
        const cr = FICHAS_REPOS_OS.find((p) => p.id === "repo-cloudroom")!;
        expect(cr.payload.route).toBe("/metagenesis");
        expect(FICHAS_REPOS_OS.map((p) => p.id)).toContain("repo-cloudroom");
    });
});

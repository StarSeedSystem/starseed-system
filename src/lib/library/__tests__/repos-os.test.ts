// @vitest-environment jsdom
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
        expect(fichasIaConUpstreamGitHub(FICHAS_REPOS_OS).map((p) => p.id)).toEqual(["repo-hono", "repo-filee", "repo-react-native-zalo-kit"]);
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

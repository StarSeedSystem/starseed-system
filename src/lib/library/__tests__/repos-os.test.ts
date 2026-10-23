import { describe, expect, it } from "vitest";

import { fichasIaConUpstreamGitHub } from "../fuentes-ia-locales";
import { FICHAS_REPOS_OS } from "../repos-os";

describe("repos que Alex trajo para el OS", () => {
    it("Hono entra con su versión, licencia y comprobación por releases", () => {
        const hono = FICHAS_REPOS_OS.find((p) => p.id === "repo-hono");
        expect(hono?.kind).toBe("function");
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
        expect(fichasIaConUpstreamGitHub(FICHAS_REPOS_OS).map((p) => p.id)).toEqual(["repo-hono", "repo-react-native-zalo-kit"]);
    });
});

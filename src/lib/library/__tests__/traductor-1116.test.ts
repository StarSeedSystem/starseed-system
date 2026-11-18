import { describe, expect, it } from "vitest";

import { PAQUETE_TRADUCTOR, IDS_SIEMBRA_TRADUCTOR } from "../traductor-1116";
import {
    FONDO_SHADER_REPO,
    STARSEED_AGENTS_REPO,
    STARSEED_CORE_REPO,
    STARSEED_DESIGN_ELEMENTS_REPO,
    STARSEED_IA_TOOLS_REPO,
    STARSEED_LABS_REPO,
    STARSEED_THEMES_REPO,
} from "../packages";

const ALL_PACKAGES = [
    STARSEED_CORE_REPO,
    FONDO_SHADER_REPO,
    STARSEED_LABS_REPO,
    STARSEED_IA_TOOLS_REPO,
    STARSEED_AGENTS_REPO,
    STARSEED_THEMES_REPO,
    STARSEED_DESIGN_ELEMENTS_REPO,
].flatMap((r) => r.packages);

describe("traductor-1116 · Traductor Universal", () => {
    it("exporta PAQUETE_TRADUCTOR con la forma esperada", () => {
        expect(PAQUETE_TRADUCTOR).toBeDefined();
        expect(PAQUETE_TRADUCTOR.id).toBe("app-traductor");
        expect(PAQUETE_TRADUCTOR.kind).toBe("app");
        expect(PAQUETE_TRADUCTOR.name).toBe("Traductor");
        expect(PAQUETE_TRADUCTOR.icon).toBe("Languages");
        expect(PAQUETE_TRADUCTOR.tags).toEqual(["app", "traducción", "idiomas"]);
        expect(PAQUETE_TRADUCTOR.version).toBe("1.0.0");
        expect(PAQUETE_TRADUCTOR.author).toBe("StarSeed Core");
        expect(PAQUETE_TRADUCTOR.sourceRepoId).toBe("starseed-core");
        expect(PAQUETE_TRADUCTOR.free).toBe(true);
        expect(PAQUETE_TRADUCTOR.featured).toBe(true);
    });

    it("payload tiene route y los campos específicos del traductor", () => {
        const payload = PAQUETE_TRADUCTOR.payload as Record<string, unknown>;
        expect(payload.route).toBe("/traductor");
        expect(payload.herramienta).toBe("traductor-universal");
        expect(payload.sinInternet).toBe("con descarga de idiomas");
    });

    it("IDS_SIEMBRA_TRADUCTOR contiene solo el id del traductor", () => {
        expect(IDS_SIEMBRA_TRADUCTOR).toEqual(["app-traductor"]);
    });

    it("el id es único en todo el catálogo de la Biblioteca", () => {
        const duplicados = ALL_PACKAGES.filter((p) => p.id === "app-traductor");
        expect(duplicados).toHaveLength(1);
        expect(duplicados[0]).toBe(PAQUETE_TRADUCTOR);
    });

    it("la ruta declarada existe como texto (sin leer sistema de archivos)", () => {
        const payload = PAQUETE_TRADUCTOR.payload as Record<string, unknown>;
        expect(typeof payload.route).toBe("string");
        expect(payload.route).toBe("/traductor");
        expect(payload.route.startsWith("/")).toBe(true);
    });
});
import { describe, expect, it } from "vitest";

import {
    CONTRATO_1027,
    DECISIONES_1027,
    FICHAS_REPOS_1027,
    IDS_SIEMBRA_1027,
    TANDA_1027_FICHAS,
} from "../repos-1027";

const porId = (id: string) => FICHAS_REPOS_1027.find((p) => p.id === id)!;

describe("tanda 1027 · las cuentas", () => {
    it("son 4 fichas y ningún id se repite", () => {
        expect(TANDA_1027_FICHAS).toHaveLength(4);
        expect(FICHAS_REPOS_1027.map((p) => p.id).sort()).toEqual([
            "lib-colibri",
            "lib-insomnia",
            "lib-openmausbot",
            "mbt1027-mausbot",
        ]);
        const ids = TANDA_1027_FICHAS.map((f) => f.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("las cuatro se siembran por defecto y el contrato es el del Mausbot", () => {
        expect([...IDS_SIEMBRA_1027].sort()).toEqual([
            "lib-colibri",
            "lib-insomnia",
            "lib-openmausbot",
            "mbt1027-mausbot",
        ]);
        expect(CONTRATO_1027).toBe("architecture/mausbot-astraura.md");
    });

    it("el JSON explica qué decidir y de dónde sale cada licencia", () => {
        expect(DECISIONES_1027.length).toBeGreaterThanOrEqual(4);
    });
});

describe("tanda 1027 · cada ficha", () => {
    it("trae licencia, versión, aviso y el upstream de GitHub", () => {
        for (const p of FICHAS_REPOS_1027) {
            expect(String(p.payload.upstream), p.id).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
            expect(p.payload.externalUrl, p.id).toBe(p.payload.upstream);
            expect(String(p.payload.licencia).length, p.id).toBeGreaterThan(1);
            expect(p.version.length, p.id).toBeGreaterThan(0);
            expect(p.version, p.id).not.toMatch(/\s/);
            expect(String(p.payload.aviso).length, p.id).toBeGreaterThan(10);
            expect(p.description.length, p.id).toBeGreaterThan(40);
            expect(p.payload.contrato, p.id).toBe(CONTRATO_1027);
            expect(p.payload.corre_aqui, p.id).toBe(false);
            expect(p.payload.route, p.id).toBeUndefined();
            expect(p.payload.skillId, p.id).toBeUndefined();
        }
    });

    it("conserva el tipo de la ficha: dos herramientas, una fuente de IA y una adaptación", () => {
        expect(porId("lib-openmausbot").kind).toBe("tool");
        expect(porId("lib-insomnia").kind).toBe("tool");
        expect(porId("lib-colibri").kind).toBe("ai-source");
        expect(porId("mbt1027-mausbot").kind).toBe("tool");
        for (const p of FICHAS_REPOS_1027) expect(p.kind, p.id).not.toBe("project");
    });

    it("las licencias y versiones son las verificadas el 2026-10-27", () => {
        expect(porId("lib-openmausbot").version).toBe("v0.1.130");
        expect(String(porId("lib-openmausbot").payload.licencia)).toMatch(/^Apache-2\.0/);
        expect(porId("lib-insomnia").version).toBe("v0.1.0");
        expect(String(porId("lib-insomnia").payload.licencia)).toMatch(/^MIT/);
        expect(porId("lib-colibri").version).toBe("v2.0.0");
        expect(String(porId("lib-colibri").payload.licencia)).toMatch(/^Apache-2\.0/);
        expect(porId("mbt1027-mausbot").version).toBe("v0.1.0");
        expect(String(porId("mbt1027-mausbot").payload.licencia)).toMatch(/^Apache-2\.0/);
    });

    it("su canal de versiones es por etiquetas vX.Y.Z", () => {
        for (const p of FICHAS_REPOS_1027) {
            expect(p.payload.canal, p.id).toBe("tags");
            expect(String(p.payload.patronTag), p.id).toBe("^v\\d+\\.\\d+\\.\\d+$");
        }
    });
});

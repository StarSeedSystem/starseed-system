import { describe, expect, it } from "vitest";

import {
    CONTRATO_1027B,
    DECISIONES_1027B,
    FICHAS_REPOS_1027B,
    IDS_SIEMBRA_1027B,
    LICENCIAS_VERIFICADAS_1027B,
    TANDA_1027B_FICHAS,
} from "../repos-1027b";

const porId = (id: string) => FICHAS_REPOS_1027B.find((p) => p.id === id)!;

describe("tanda 1027b · las cuentas", () => {
    it("son 2 fichas y ningún id se repite", () => {
        expect(TANDA_1027B_FICHAS).toHaveLength(2);
        expect(FICHAS_REPOS_1027B.map((p) => p.id).sort()).toEqual([
            "lib-memvid",
            "lib-meta-n",
        ]);
        const ids = TANDA_1027B_FICHAS.map((f) => f.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("las dos se siembran por defecto y el contrato es el de Meta^n", () => {
        expect([...IDS_SIEMBRA_1027B].sort()).toEqual([
            "lib-memvid",
            "lib-meta-n",
        ]);
        expect(CONTRATO_1027B).toBe("architecture/automejora-meta-n.md");
    });

    it("el JSON explica qué decidir y de dónde sale cada licencia", () => {
        expect(DECISIONES_1027B.length).toBeGreaterThanOrEqual(2);
        expect(Object.keys(LICENCIAS_VERIFICADAS_1027B).sort()).toEqual([
            "automejora",
            "memorias",
        ]);
        for (const texto of Object.values(LICENCIAS_VERIFICADAS_1027B)) {
            expect(texto).toMatch(/2026-10-27/);
        }
    });
});

describe("tanda 1027b · cada ficha", () => {
    it("trae licencia, versión, aviso y el upstream de GitHub", () => {
        for (const p of FICHAS_REPOS_1027B) {
            expect(String(p.payload.upstream), p.id).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
            expect(p.payload.externalUrl, p.id).toBe(p.payload.upstream);
            expect(String(p.payload.licencia).length, p.id).toBeGreaterThan(1);
            expect(p.version.length, p.id).toBeGreaterThan(0);
            expect(p.version, p.id).not.toMatch(/\s/);
            expect(String(p.payload.aviso).length, p.id).toBeGreaterThan(10);
            expect(p.description.length, p.id).toBeGreaterThan(40);
            expect(p.payload.contrato, p.id).toBe(CONTRATO_1027B);
            expect(p.payload.corre_aqui, p.id).toBe(false);
            expect(p.payload.route, p.id).toBeUndefined();
            expect(p.payload.skillId, p.id).toBeUndefined();
        }
    });

    it("ambas son fuentes de IA", () => {
        expect(porId("lib-meta-n").kind).toBe("ai-source");
        expect(porId("lib-memvid").kind).toBe("ai-source");
        for (const p of FICHAS_REPOS_1027B) expect(p.kind, p.id).not.toBe("project");
    });

    it("sus licencias y versiones son las verificadas el 2026-10-27", () => {
        expect(porId("lib-meta-n").version).toBe("b708184");
        expect(String(porId("lib-meta-n").payload.licencia)).toMatch(/^MIT/);
        expect(porId("lib-memvid").version).toBe("v2.0.140");
        expect(String(porId("lib-memvid").payload.licencia)).toMatch(/^Apache-2\.0/);
    });

    it("sus canales de versiones son los declarados", () => {
        expect(porId("lib-meta-n").payload.canal).toBe("commits");
        expect(porId("lib-meta-n").payload.patronTag).toBeUndefined();
        expect(porId("lib-memvid").payload.canal).toBe("tags");
        expect(String(porId("lib-memvid").payload.patronTag)).toBe("^v\\d+\\.\\d+\\.\\d+$");
    });
});
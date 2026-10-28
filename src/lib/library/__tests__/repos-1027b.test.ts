import { describe, expect, it } from "vitest";

import {
    CONTRATO_1027B,
    CONTRATOS_1027B,
    DECISIONES_1027B,
    FICHAS_REPOS_1027B,
    IDS_SIEMBRA_1027B,
    LICENCIAS_VERIFICADAS_1027B,
    TANDA_1027B_FICHAS,
    contratoDe1027B,
    iconoDeLaBiblioteca1027B,
} from "../repos-1027b";

const porId = (id: string) => FICHAS_REPOS_1027B.find((p) => p.id === id)!;

describe("tanda 1027b · las cuentas", () => {
    it("son 2 fichas y ningún id se repite", () => {
        expect(TANDA_1027B_FICHAS).toHaveLength(2);
        expect(FICHAS_REPOS_1027B.map((p) => p.id).sort()).toEqual(["lib-memvid", "lib-meta-n"]);
        const ids = TANDA_1027B_FICHAS.map((f) => f.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("las dos se siembran por defecto", () => {
        expect([...IDS_SIEMBRA_1027B].sort()).toEqual(["lib-memvid", "lib-meta-n"]);
    });
});

describe("tanda 1027b · cada ficha", () => {
    it("trae licencia, versión, aviso, upstream y el contrato de su grupo", () => {
        for (const p of FICHAS_REPOS_1027B) {
            expect(p.kind, p.id).toBe("ai-source");
            expect(String(p.payload.upstream), p.id).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
            expect(p.payload.externalUrl, p.id).toBe(p.payload.upstream);
            expect(String(p.payload.licencia).length, p.id).toBeGreaterThan(1);
            expect(p.version.length, p.id).toBeGreaterThan(0);
            expect(p.version, p.id).not.toMatch(/\s/);
            expect(String(p.payload.aviso).length, p.id).toBeGreaterThan(10);
            expect(p.description.length, p.id).toBeGreaterThan(40);
            expect(p.payload.contrato, p.id).toBe(contratoDe1027B(TANDA_1027B_FICHAS.find((f) => f.id === p.id)!));
            expect(p.payload.corre_aqui, p.id).toBe(false);
            expect(p.payload.route, p.id).toBeUndefined();
            expect(p.payload.skillId, p.id).toBeUndefined();
            expect(p.comingSoon, p.id).toBeFalsy();
        }
    });

    it("cada grupo apunta a su contrato", () => {
        expect(CONTRATOS_1027B.automejora).toBe("architecture/automejora-meta-n.md");
        expect(CONTRATOS_1027B.memorias).toBe("architecture/memvid-capsulas.md");
        expect(CONTRATO_1027B).toBe("architecture/automejora-meta-n.md");
        expect(porId("lib-meta-n").payload.contrato).toBe("architecture/automejora-meta-n.md");
        expect(porId("lib-memvid").payload.contrato).toBe("architecture/memvid-capsulas.md");
    });

    it("los iconos ausentes caen al de ai-source", () => {
        expect(iconoDeLaBiblioteca1027B("Repeat")).toBe("BrainCircuit");
        expect(iconoDeLaBiblioteca1027B("Film")).toBe("BrainCircuit");
        expect(iconoDeLaBiblioteca1027B("Brain")).toBe("Brain");
        expect(porId("lib-meta-n").icon).toBe("BrainCircuit");
        expect(porId("lib-memvid").icon).toBe("BrainCircuit");
    });

    it("las licencias y versiones son las verificadas el 2026-10-27", () => {
        expect(porId("lib-meta-n").version).toBe("b708184");
        expect(String(porId("lib-meta-n").payload.licencia)).toMatch(/^MIT/);
        expect(porId("lib-memvid").version).toBe("v2.0.140");
        expect(String(porId("lib-memvid").payload.licencia)).toMatch(/^Apache-2\.0/);
        expect(Object.keys(LICENCIAS_VERIFICADAS_1027B).sort()).toEqual(["automejora", "memorias"]);
        for (const texto of Object.values(LICENCIAS_VERIFICADAS_1027B)) {
            expect(texto).toMatch(/2026-10-27/);
        }
    });
});

describe("tanda 1027b · canales de versión", () => {
    it("Meta^n va por commits (SHA corto) y Memvid por etiquetas vX.Y.Z", () => {
        const meta = porId("lib-meta-n");
        expect(meta.payload.canal).toBe("commits");
        expect(meta.payload.patronTag).toBeUndefined();
        expect(meta.version).toMatch(/^[0-9a-f]{7}$/);

        const memvid = porId("lib-memvid");
        expect(memvid.payload.canal).toBe("tags");
        expect(String(memvid.payload.patronTag)).toBe("^v\\d+\\.\\d+\\.\\d+$");
        expect(memvid.version).toBe("v2.0.140");
    });

    it("lo que Alex debe decidir está explicado en el JSON", () => {
        expect(DECISIONES_1027B.length).toBeGreaterThanOrEqual(2);
        for (const texto of DECISIONES_1027B) expect(texto.length).toBeGreaterThan(20);
    });
});

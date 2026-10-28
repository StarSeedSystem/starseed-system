import { describe, expect, it } from "vitest";

import {
    CONTRATO_1028,
    CONTRATOS_1028,
    DECISIONES_1028,
    FICHAS_REPOS_1028,
    IDS_SIEMBRA_1028,
    LICENCIAS_VERIFICADAS_1028,
    TANDA_1028_FICHAS,
    contratoDe1028,
    iconoDeLaBiblioteca1028,
} from "../repos-1028";

const porId = (id: string) => FICHAS_REPOS_1028.find((p) => p.id === id)!;

describe("tanda 1028 · la ficha única", () => {
    it("es 1 ficha (LEANN), su id no se repite y la siembra la instala por defecto", () => {
        expect(TANDA_1028_FICHAS).toHaveLength(1);
        expect(FICHAS_REPOS_1028.map((p) => p.id)).toEqual(["lib-leann"]);
        expect([...IDS_SIEMBRA_1028]).toEqual(["lib-leann"]);
    });

    it("trae licencia, versión, aviso, upstream y el contrato de su grupo", () => {
        for (const p of FICHAS_REPOS_1028) {
            expect(p.kind, p.id).toBe("ai-source");
            expect(String(p.payload.upstream), p.id).toBe("https://github.com/StarTrail-org/LEANN");
            expect(p.payload.externalUrl, p.id).toBe(p.payload.upstream);
            expect(String(p.payload.licencia), p.id).toMatch(/^MIT/);
            expect(p.version, p.id).toBe("v0.3.8");
            expect(p.version, p.id).not.toMatch(/\s/);
            expect(String(p.payload.aviso).length, p.id).toBeGreaterThan(10);
            expect(p.description.length, p.id).toBeGreaterThan(40);
            expect(p.payload.contrato, p.id).toBe(contratoDe1028(TANDA_1028_FICHAS.find((f) => f.id === p.id)!));
            expect(p.payload.corre_aqui, p.id).toBe(false);
            expect(p.payload.route, p.id).toBeUndefined();
            expect(p.payload.skillId, p.id).toBeUndefined();
            expect(p.comingSoon, p.id).toBeFalsy();
        }
    });

    it("el grupo memorias apunta al contrato del recuerdo semántico", () => {
        expect(CONTRATOS_1028.memorias).toBe("architecture/leann-recuerdo-semantico.md");
        expect(CONTRATO_1028).toBe("architecture/leann-recuerdo-semantico.md");
        expect(porId("lib-leann").payload.contrato).toBe("architecture/leann-recuerdo-semantico.md");
    });

    it("el icono Search no está en el mapa de la tienda y cae al de ai-source", () => {
        expect(iconoDeLaBiblioteca1028("Search")).toBe("BrainCircuit");
        expect(iconoDeLaBiblioteca1028("Brain")).toBe("Brain");
        expect(porId("lib-leann").icon).toBe("BrainCircuit");
    });

    it("la licencia MIT queda verificada el 2026-10-28 en el grupo memorias", () => {
        expect(Object.keys(LICENCIAS_VERIFICADAS_1028)).toEqual(["memorias"]);
        for (const texto of Object.values(LICENCIAS_VERIFICADAS_1028)) {
            expect(texto).toMatch(/2026-10-28/);
            expect(texto).toMatch(/MIT/);
        }
    });
});

describe("tanda 1028 · canal de versión", () => {
    it("LEANN va por etiquetas vX.Y.Z con su patrón declarado", () => {
        const leann = porId("lib-leann");
        expect(leann.payload.canal).toBe("tags");
        expect(String(leann.payload.patronTag)).toBe("^v\\d+\\.\\d+\\.\\d+$");
        expect(leann.version).toBe("v0.3.8");
    });

    it("lo que Alex debe decidir está explicado en el JSON (hoy: nada pendiente)", () => {
        for (const texto of DECISIONES_1028) expect(texto.length).toBeGreaterThan(20);
    });
});

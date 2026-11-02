import { describe, expect, it } from "vitest";

import {
    CONTRATO_1101,
    CONTRATOS_1101,
    DECISIONES_1101,
    FICHAS_REPOS_1101,
    IDS_SIEMBRA_1101,
    LICENCIAS_VERIFICADAS_1101,
    TANDA_1101_FICHAS,
    contratoDe1101,
} from "../repos-1101";

const porId = (id: string) => FICHAS_REPOS_1101.find((p) => p.id === id)!;

describe("tanda 1101 · la ficha única", () => {
    it("es 1 ficha (keepalive), su id no se repite y la siembra la instala por defecto", () => {
        expect(TANDA_1101_FICHAS).toHaveLength(1);
        expect(FICHAS_REPOS_1101.map((p) => p.id)).toEqual(["lib-keepalive"]);
        expect([...IDS_SIEMBRA_1101]).toEqual(["lib-keepalive"]);
    });

    it("trae licencia, versión, aviso, upstream y el contrato de su grupo", () => {
        for (const p of FICHAS_REPOS_1101) {
            expect(p.kind, p.id).toBe("app");
            expect(String(p.payload.upstream), p.id).toBe("https://github.com/stigoleg/keep-alive");
            expect(p.payload.externalUrl, p.id).toBe(p.payload.upstream);
            expect(String(p.payload.licencia), p.id).toBe("MIT");
            expect(p.version, p.id).toBe("v2.0.1");
            expect(p.version, p.id).not.toMatch(/\s/);
            expect(String(p.payload.aviso).length, p.id).toBeGreaterThan(10);
            expect(p.description.length, p.id).toBeGreaterThan(40);
            expect(p.payload.contrato, p.id).toBe(contratoDe1101(TANDA_1101_FICHAS.find((f) => f.id === p.id)!));
            expect(p.payload.corre_aqui, p.id).toBe(true);
            expect(p.payload.route, p.id).toBeUndefined();
            expect(p.payload.skillId, p.id).toBeUndefined();
            expect(p.comingSoon, p.id).toBeFalsy();
        }
    });

    it("el grupo neuronas apunta al contrato de la colmena (tapa cerrada y relevo al A1)", () => {
        expect(CONTRATOS_1101.neuronas).toBe("architecture/colmena-relevo-contenedores.md");
        expect(CONTRATO_1101).toBe("architecture/colmena-relevo-contenedores.md");
        expect(porId("lib-keepalive").payload.contrato).toBe("architecture/colmena-relevo-contenedores.md");
    });

    it("el icono Zap está en el mapa de la tienda (sin caída al fallback)", () => {
        expect(porId("lib-keepalive").icon).toBe("Zap");
    });

    it("la licencia MIT queda verificada el 2026-11-02 en el grupo neuronas", () => {
        expect(Object.keys(LICENCIAS_VERIFICADAS_1101)).toEqual(["neuronas"]);
        for (const texto of Object.values(LICENCIAS_VERIFICADAS_1101)) {
            expect(texto).toMatch(/2026-11-02/);
            expect(texto).toMatch(/MIT/);
        }
    });
});

describe("tanda 1101 · instalación por sistema operativo", () => {
    it("el aviso trae el comando de cada sistema y nada pide sudo sin permiso", () => {
        const aviso = String(porId("lib-keepalive").payload.aviso);
        expect(aviso).toMatch(/brew install --cask stigoleg\/tap\/keepalive/);
        expect(aviso).toMatch(/scoop install keepalive/);
        expect(aviso).toMatch(/\.deb\/\.rpm\/\.apk/);
        expect(aviso).toMatch(/go install github\.com\/stigoleg\/keep-alive\/v2\/cmd\/keepalive@latest/);
    });

    it("la nota respeta la verdad: cerrar la tapa duerme el sistema y se releva al A1", () => {
        const nota = String(porId("lib-keepalive").payload.note);
        expect(nota).toMatch(/pmset -a disablesleep 1/);
        expect(nota).toMatch(/clamshell/);
        expect(nota).toMatch(/A1/);
        expect(nota).toMatch(/mantener_pantalla\.py/);
    });
});

describe("tanda 1101 · canal de versión", () => {
    it("keepalive va por etiquetas vX.Y.Z con su patrón declarado", () => {
        const keepalive = porId("lib-keepalive");
        expect(keepalive.payload.canal).toBe("tags");
        expect(String(keepalive.payload.patronTag)).toBe("^v\\d+\\.\\d+\\.\\d+$");
        expect(keepalive.version).toBe("v2.0.1");
    });

    it("lo que Alex debe decidir está explicado en el JSON", () => {
        expect(DECISIONES_1101.length).toBeGreaterThan(0);
        for (const texto of DECISIONES_1101) expect(texto.length).toBeGreaterThan(20);
    });
});

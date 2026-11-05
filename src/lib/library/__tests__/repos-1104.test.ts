import { describe, expect, it } from "vitest";

import {
    CONTRATO_1104,
    CONTRATOS_1104,
    DECISIONES_1104,
    FICHAS_REPOS_1104,
    IDS_SIEMBRA_1104,
    LICENCIAS_VERIFICADAS_1104,
    TANDA_1104_FICHAS,
    contratoDe1104,
} from "../repos-1104";
import {
    FONDO_SHADER_REPO,
    STARSEED_AGENTS_REPO,
    STARSEED_CORE_REPO,
    STARSEED_DESIGN_ELEMENTS_REPO,
    STARSEED_IA_TOOLS_REPO,
    STARSEED_LABS_REPO,
    STARSEED_THEMES_REPO,
} from "../packages";
import { RECOMMENDED_PACKAGE_IDS } from "../defaults-seed";

const PACKAGES = [
    STARSEED_CORE_REPO,
    FONDO_SHADER_REPO,
    STARSEED_LABS_REPO,
    STARSEED_IA_TOOLS_REPO,
    STARSEED_AGENTS_REPO,
    STARSEED_THEMES_REPO,
    STARSEED_DESIGN_ELEMENTS_REPO,
].flatMap((r) => r.packages);

const IDS = ["lib-egm", "lib-openui", "lib-bama", "lib-motionsites", "lib-deeptutor"];
const porId = (id: string) => FICHAS_REPOS_1104.find((p) => p.id === id)!;

describe("tanda 1104 · las cinco fichas", () => {
    it("son 5, sus ids no se repiten y la siembra las instala por defecto", () => {
        expect(TANDA_1104_FICHAS).toHaveLength(5);
        expect(FICHAS_REPOS_1104.map((p) => p.id)).toEqual(IDS);
        expect([...IDS_SIEMBRA_1104]).toEqual(IDS);
    });

    it("ningún id choca con una ficha que ya estuviera en la Biblioteca", () => {
        for (const id of IDS) {
            expect(PACKAGES.filter((p) => p.id === id), id).toHaveLength(1);
        }
    });

    it("la siembra las ofrece a todas las cuentas (y recupera keepalive, que se había quedado fuera)", () => {
        for (const id of [...IDS, "lib-keepalive"]) expect(RECOMMENDED_PACKAGE_IDS, id).toContain(id);
    });

    it("cada una trae licencia, versión sin espacios, aviso, upstream y su contrato; instalar solo enlaza", () => {
        for (const p of FICHAS_REPOS_1104) {
            const f = TANDA_1104_FICHAS.find((x) => x.id === p.id)!;
            expect(["app", "tool"].includes(String(p.kind)), p.id).toBe(true);
            expect(String(p.payload.upstream), p.id).toBe(`https://github.com/${f.repo}`);
            expect(p.payload.externalUrl, p.id).toBe(p.payload.upstream);
            expect(String(p.payload.licencia).length, p.id).toBeGreaterThan(2);
            expect(p.version, p.id).not.toMatch(/\s/);
            expect(String(p.payload.aviso).length, p.id).toBeGreaterThan(10);
            expect(p.description.length, p.id).toBeGreaterThan(40);
            expect(p.payload.contrato, p.id).toBe(contratoDe1104(f));
            expect(p.payload.contrato, p.id).toBe(CONTRATO_1104);
            expect(p.payload.route, p.id).toBeUndefined();
            expect(p.payload.skillId, p.id).toBeUndefined();
            expect(p.comingSoon, p.id).toBeFalsy();
            expect(p.tags, p.id).toContain("ola-1104");
            expect(p.free, p.id).toBe(true);
        }
    });

    it("los cinco grupos apuntan al contrato de la tanda", () => {
        expect(Object.keys(CONTRATOS_1104).sort()).toEqual(
            ["agentes", "apps-nativas", "diseno", "educacion", "respuestas"],
        );
        for (const c of Object.values(CONTRATOS_1104)) expect(c).toBe("architecture/repos-libreria-1104.md");
    });

    it("las licencias quedan verificadas el 2026-11-04 en cada grupo", () => {
        expect(Object.keys(LICENCIAS_VERIFICADAS_1104).sort()).toEqual(
            ["agentes", "apps-nativas", "diseno", "educacion", "respuestas"],
        );
        for (const texto of Object.values(LICENCIAS_VERIFICADAS_1104)) expect(texto).toMatch(/2026-11-04/);
        expect(porId("lib-egm").payload.licencia).toBe("Apache-2.0");
        expect(porId("lib-openui").payload.licencia).toBe("MIT");
        expect(porId("lib-bama").payload.licencia).toBe("MIT");
        expect(String(porId("lib-motionsites").payload.licencia)).toMatch(/MIT/);
        expect(String(porId("lib-motionsites").payload.licencia)).toMatch(/©/);
        expect(porId("lib-deeptutor").payload.licencia).toBe("Apache-2.0");
    });
});

describe("tanda 1104 · canal de versión", () => {
    it("EGM, MotionSites y DeepTutor por releases vX.Y.Z; OpenUI por la etiqueta de react-lang; BAMA por commits", () => {
        expect(porId("lib-egm").payload.canal).toBe("releases");
        expect(porId("lib-egm").version).toBe("v0.1.0");
        expect(porId("lib-motionsites").version).toBe("v1.0.0");
        expect(porId("lib-deeptutor").version).toBe("v1.7.1");
        const openui = porId("lib-openui");
        expect(openui.payload.canal).toBe("tags");
        expect(String(openui.payload.patronTag)).toBe("^@openuidev/react-lang@\\d+\\.\\d+\\.\\d+$");
        expect(new RegExp(String(openui.payload.patronTag)).test("@openuidev/react-lang@1.1.0")).toBe(true);
        expect(new RegExp(String(openui.payload.patronTag)).test("@openuidev/browser-bundle@0.2.2")).toBe(false);
        expect(openui.version).toBe("1.1.0");
        const bama = porId("lib-bama");
        expect(bama.payload.canal).toBe("commits");
        expect(bama.version).toBe("639893c");
    });
});

describe("tanda 1104 · la verdad de cada ficha", () => {
    it("EGM se explica como patrón de revisión con memoria, no como un modelo que se entrene", () => {
        const nota = String(porId("lib-egm").payload.note);
        expect(nota).toMatch(/cerebro/);
        expect(nota).toMatch(/No es un modelo que se entrene/);
        expect(String(porId("lib-egm").payload.aviso)).toMatch(/claude plugin install egm@egm/);
    });

    it("OpenUI entra con la telemetría de instalación apagada y sin la pasarela de pago", () => {
        const aviso = String(porId("lib-openui").payload.aviso);
        expect(aviso).toMatch(/OPENUI_TELEMETRY_DISABLED=1/);
        expect(aviso).toMatch(/DO_NOT_TRACK=1/);
        expect(aviso).toMatch(/Gateway/);
        expect(porId("lib-openui").payload.corre_aqui).toBe(true);
    });

    it("BAMA declara macOS 26 y Xcode 26 y no corre aquí hasta que Alex instale Xcode", () => {
        const bama = porId("lib-bama");
        expect(bama.payload.corre_aqui).toBe(false);
        expect(String(bama.payload.aviso)).toMatch(/Xcode 26/);
        expect(String(bama.payload.requisitos)).toMatch(/macos/);
    });

    it("MotionSites no copia sus medios ni sus prompts (© MotionSites)", () => {
        expect(String(porId("lib-motionsites").payload.note)).toMatch(/NO se copian/);
    });

    it("DeepTutor es un servicio: no corre en la Mac y usa los modelos gratuitos del OS", () => {
        const dt = porId("lib-deeptutor");
        expect(dt.payload.corre_aqui).toBe(false);
        expect(String(dt.payload.aviso)).toMatch(/3782/);
        expect(String(dt.payload.gratisMotivo)).toMatch(/gratuitos/);
    });

    it("lo que Alex debe saber está explicado en el JSON", () => {
        expect(DECISIONES_1104).toHaveLength(5);
        for (const texto of DECISIONES_1104) expect(texto.length).toBeGreaterThan(40);
    });
});

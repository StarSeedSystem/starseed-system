import { describe, expect, it } from "vitest";

import {
    CONTRATO_1101,
    DECISIONES_1101,
    FICHAS_REPOS_1101,
    IDS_SIEMBRA_1101,
    LICENCIAS_VERIFICADAS_1101,
    TANDA_1101_FICHAS,
    comandoInstalacionDe,
    despiertaConTapaCerrada,
} from "../repos-1101";

const ficha = FICHAS_REPOS_1101[0];
const original = TANDA_1101_FICHAS[0];

describe("tanda 1101 · la ficha única de keepalive", () => {
    it("es 1 ficha (lib-keepalive) y la siembra la instala por defecto", () => {
        expect(TANDA_1101_FICHAS).toHaveLength(1);
        expect(FICHAS_REPOS_1101.map((p) => p.id)).toEqual(["lib-keepalive"]);
        expect([...IDS_SIEMBRA_1101]).toEqual(["lib-keepalive"]);
    });

    it("kind válido (`app`),MIT, versión limpia y upstream que es el enlace que se registra", () => {
        expect(ficha.kind).toBe("app");
        expect(ficha.author).toBe("stigoleg");
        expect(String(ficha.payload.licencia)).toMatch(/^MIT/);
        expect(ficha.version).toBe("v2.0.1");
        expect(ficha.version).not.toMatch(/\s/);
        expect(String(ficha.payload.upstream)).toBe("https://github.com/stigoleg/keep-alive");
        expect(ficha.payload.externalUrl).toBe(ficha.payload.upstream);
        expect(ficha.payload.route).toBeUndefined();
        expect(ficha.payload.skillId).toBeUndefined();
        expect(ficha.comingSoon).toBeFalsy();
        expect(ficha.description.length).toBeGreaterThan(40);
        expect(ficha.payload.contrato).toBe(CONTRATO_1101);
        expect(ficha.payload.corre_aqui).toBe(true);
    });

    it("declara canal releases con su patrón de etiqueta y el aviso de la verdad del portátil", () => {
        expect(ficha.payload.canal).toBe("releases");
        expect(String(ficha.payload.patronTag)).toBe("^v\\d+\\.\\d+\\.\\d+$");
        const aviso = String(ficha.payload.aviso);
        expect(aviso).toContain("tapa");
        expect(aviso).toContain("clamshell");
        expect(aviso).toContain("A1");
        expect(Array.isArray(ficha.payload.flags)).toBe(true);
    });

    it("es la licencia del grupo sistemas, verificada el 2026-11-01", () => {
        expect(Object.keys(LICENCIAS_VERIFICADAS_1101)).toEqual(["sistemas"]);
        for (const texto of Object.values(LICENCIAS_VERIFICADAS_1101)) {
            expect(texto).toMatch(/2026-11-01/);
            expect(texto).toMatch(/MIT/);
        }
        for (const texto of DECISIONES_1101) expect(texto.length).toBeGreaterThan(20);
    });
});

describe("tanda 1101 · instalación por sistema operativo", () => {
    it("brew en macOS, scoop en Windows y paquetes/go en Linux", () => {
        const f = original.instalacion;
        expect(comandoInstalacionDe(f, "macos")).toBe("brew install --cask stigoleg/tap/keepalive");
        expect(comandoInstalacionDe(f, "darwin")).toBe("brew install --cask stigoleg/tap/keepalive");
        expect(comandoInstalacionDe(f, "Windows")).toBe("scoop install keepalive");
        expect(comandoInstalacionDe(f, "linux")).toBe(
            "descarga .deb/.rpm/.apk de releases, o go install github.com/stigoleg/keep-alive/v2/cmd/keepalive@latest",
        );
    });

    it("fuera de los tres sistemas cae a go install y sin go devuelve vacío (nunca lanza nada)", () => {
        const f = original.instalacion;
        expect(comandoInstalacionDe(f, " FreeBSD ")).toBe(f.go);
        expect(f.go).toContain("github.com/stigoleg/keep-alive/v2/cmd/keepalive@latest");
        expect(comandoInstalacionDe({}, "macos")).toBe("");
    });
});

describe("tanda 1101 · la verdad del portátil (pura, sin sistema)", () => {
    it("solo clamshell (corriente + pantalla externa) o disablesleep mantienen vivas las tareas de una neurona con la tapa cerrada", () => {
        expect(despiertaConTapaCerrada(true, true, false)).toBe(true);
        expect(despiertaConTapaCerrada(false, true, false)).toBe(false);
        expect(despiertaConTapaCerrada(true, false, false)).toBe(false);
        expect(despiertaConTapaCerrada(false, false, false)).toBe(false);
        expect(despiertaConTapaCerrada(false, false, true)).toBe(true);
    });
});

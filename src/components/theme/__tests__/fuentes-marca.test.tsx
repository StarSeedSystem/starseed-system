import { describe, it, expect } from "vitest";
import { getFontVariables, shouldLoadSatoshi, shouldLoadQuicksand, getFontLink, DEFAULT_FONT_STACK } from "../fuentes-marca";

describe("fuentes-marca", () => {
    it("devuelve Satoshi cuando no es natural", () => {
        const vars = getFontVariables(false);
        expect(vars.display).toContain("Satoshi");
        expect(vars.titular).toContain("Satoshi");
    });

    it("devuelve Quicksand cuando es natural", () => {
        const vars = getFontVariables(true);
        expect(vars.display).toContain("Quicksand");
        expect(vars.titular).toContain("Quicksand");
    });

    it("organica siempre es Quicksand", () => {
        const vars = getFontVariables(false);
        expect(vars.organica).toContain("Quicksand");
    });

    it("respaldos usan Inter", () => {
        const vars = getFontVariables(false);
        expect(vars.display).toContain(DEFAULT_FONT_STACK);
    });

    it("carga Satoshi solo por papel display editorial", () => {
        expect(shouldLoadSatoshi("display-editorial")).toBe(true);
        expect(shouldLoadSatoshi("otro")).toBe(false);
        expect(shouldLoadSatoshi(undefined)).toBe(false);
    });

    it("carga Quicksand para tema Natural", () => {
        expect(shouldLoadQuicksand("Natural")).toBe(true);
        expect(shouldLoadQuicksand("dark")).toBe(false);
    });

    it("enlaces correctos", () => {
        expect(getFontLink("satoshi")).toContain("fontshare.com");
        expect(getFontLink("quicksand")).toContain("fonts.googleapis.com");
    });
});

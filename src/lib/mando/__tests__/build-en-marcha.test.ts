import { describe, it, expect } from "vitest";

import { esBuildDeNext, hayBuildDeNext } from "@/lib/mando/build-en-marcha";

describe("esBuildDeNext", () => {
    it("cuenta builds de Next reales por ejecutable", () => {
        expect(esBuildDeNext("node /x/node_modules/.bin/next build")).toBe(true);
        expect(esBuildDeNext("node /x/node_modules/next/dist/bin/next build --no-lint")).toBe(true);
        expect(esBuildDeNext("npx next build")).toBe(true);
    });

    it("no cuenta procesos que solo mencionan «next build» en su texto", () => {
        expect(esBuildDeNext("/Users/alex/.opencode/bin/opencode run RAIZ ... nunca next build con el enjambre vivo")).toBe(false);
        expect(esBuildDeNext("python3 reconstruir_mando.py")).toBe(false);
    });

    it("no cuenta otros modos de next ni la línea vacía", () => {
        expect(esBuildDeNext("node /x/node_modules/.bin/next start -p 9002")).toBe(false);
        expect(esBuildDeNext("next-server (v15)")).toBe(false);
        expect(esBuildDeNext("")).toBe(false);
    });
});

describe("hayBuildDeNext", () => {
    it("devuelve false con lista vacía o sin builds", () => {
        expect(hayBuildDeNext([])).toBe(false);
        expect(hayBuildDeNext(["python3 reconstruir_mando.py", "next-server (v15)"])).toBe(false);
    });

    it("devuelve true si alguna línea es una build real", () => {
        expect(hayBuildDeNext(["zsh", "npx next build"])).toBe(true);
    });
});

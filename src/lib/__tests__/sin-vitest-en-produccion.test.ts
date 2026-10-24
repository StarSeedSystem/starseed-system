/**
 * Guardia (Ola 1024F, OPF1024D): ningún módulo de PRODUCCIÓN de `src/` importa `vitest`.
 *
 * `src/lib/astraura/laya/privacidad-laya.ts` abría con `import { describe, it, expect } from
 * "vitest"`: tsc y las pruebas pasaban, pero ese import de valor arrastra el corredor de
 * pruebas al grafo del navegador (paquete más gordo o `next build` roto). Lo de las pruebas
 * vive en las pruebas: `__tests__/`, `*.test.*`, `*.spec.*` y sus `__fixtures__`/`__mocks__`
 * (solo los importan pruebas). `import type` no cuenta: no deja nada en el paquete.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.join(process.cwd(), "src");
const CARPETAS_DE_PRUEBA = new Set(["__tests__", "__fixtures__", "__mocks__", "node_modules"]);
const ES_PRUEBA = /\.(test|spec)\.[cm]?[jt]sx?$/;
const ES_CODIGO = /\.[cm]?[jt]sx?$/;
// `import … from "vitest"`, `import "vitest"`, `import("vitest")`, `require("vitest")`,
// también `vitest/…` y `@vitest/…`. Se salta `import type` / `export type`.
const IMPORTA_VITEST =
    /(?:^|\n)\s*(?:import|export)\s+(?!type\s)[^'";]*?from\s+["'](?:@?vitest)(?:\/[^"']*)?["']|(?:^|\n)\s*import\s+["'](?:@?vitest)(?:\/[^"']*)?["']|\b(?:import|require)\s*\(\s*["'](?:@?vitest)(?:\/[^"']*)?["']\s*\)/;

function archivosDeProduccion(dir: string, fuera: string[] = []): string[] {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) {
            if (!CARPETAS_DE_PRUEBA.has(e.name)) archivosDeProduccion(path.join(dir, e.name), fuera);
        } else if (e.isFile() && ES_CODIGO.test(e.name) && !ES_PRUEBA.test(e.name)) {
            fuera.push(path.join(dir, e.name));
        }
    }
    return fuera;
}

describe("guardia: vitest solo en pruebas", () => {
    it("la expresión reconoce los imports de valor y deja pasar los de tipo", () => {
        expect(IMPORTA_VITEST.test('import { describe } from "vitest";')).toBe(true);
        expect(IMPORTA_VITEST.test("import { vi } from 'vitest'")).toBe(true);
        expect(IMPORTA_VITEST.test('const v = await import("vitest");')).toBe(true);
        expect(IMPORTA_VITEST.test('import { defineConfig } from "vitest/config";')).toBe(true);
        expect(IMPORTA_VITEST.test('import type { Mock } from "vitest";')).toBe(false);
        expect(IMPORTA_VITEST.test('import { x } from "./vitest-ayuda";')).toBe(false);
    });

    it("ningún archivo de producción de src/ importa vitest", () => {
        const archivos = archivosDeProduccion(SRC);
        expect(archivos.length).toBeGreaterThan(100);
        const culpables = archivos
            .filter((a) => IMPORTA_VITEST.test(readFileSync(a, "utf8")))
            .map((a) => path.relative(process.cwd(), a));
        expect(culpables).toEqual([]);
    });
});

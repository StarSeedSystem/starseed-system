import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("guía · tamaño mínimo de texto en las demos", () => {
    it("ninguna etiqueta de aurora-guide-demos baja de 11px", () => {
        const fuente = readFileSync(resolve(__dirname, "../aurora-guide-demos.tsx"), "utf8");
        const tamanos = [...fuente.matchAll(/text-\[(\d+)px\]/g)].map((m) => Number(m[1]));
        expect(tamanos.length).toBeGreaterThan(0);
        for (const t of tamanos) expect(t).toBeGreaterThanOrEqual(11);
    });
});

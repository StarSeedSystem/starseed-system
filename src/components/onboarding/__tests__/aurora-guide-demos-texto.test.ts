import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("aurora-guide-demos · tamaño mínimo de texto", () => {
    it("ninguna etiqueta usa menos de 11px (WCAG 1.4.4)", () => {
        const fuente = readFileSync(join(__dirname, "..", "aurora-guide-demos.tsx"), "utf8");
        const tamanos = [...fuente.matchAll(/text-\[(\d+)px\]/g)].map((m) => Number(m[1]));
        expect(tamanos.length).toBeGreaterThan(0);
        for (const t of tamanos) expect(t).toBeGreaterThanOrEqual(11);
    });
});

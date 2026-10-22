import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("aurora-guide-demos · tamaño mínimo de texto", () => {
  it("ninguna etiqueta baja de 11px", () => {
    const src = readFileSync(join(__dirname, "..", "aurora-guide-demos.tsx"), "utf8");
    const tamanos = [...src.matchAll(/text-\[(\d+)px\]/g)].map((m) => Number(m[1]));
    expect(tamanos.length).toBeGreaterThan(0);
    for (const t of tamanos) expect(t).toBeGreaterThanOrEqual(11);
  });
});

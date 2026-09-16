import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Estas cuatro páginas se reexportan en paneles.ts y el Hub las monta dentro
// de una pestaña. Si dejan de ser componentes de cliente autocontenidos,
// el Hub ya no podría montarlas sin copiarlas.
const PAGINAS: ReadonlyArray<readonly [string, string]> = [
  ["panorama", "src/app/(app)/network/page.tsx"],
  ["política", "src/app/(app)/network/politics/page.tsx"],
  ["educación", "src/app/(app)/network/education/page.tsx"],
  ["cultura", "src/app/(app)/network/culture/page.tsx"],
];

function leer(ruta: string): string {
  return readFileSync(join(process.cwd(), ruta), "utf8");
}

describe("paneles de la Red montables en el Hub", () => {
  for (const [nombre, ruta] of PAGINAS) {
    it(`${nombre}: se declara "use client" en las primeras líneas`, () => {
      const cabecera = leer(ruta).split("\n").slice(0, 3).join("\n");
      expect(
        /["']use client["']/.test(cabecera),
        `el Hub ya no podría montar esta página en una pestaña: ${ruta} perdió "use client"`,
      ).toBe(true);
    });

    it(`${nombre}: no exporta metadata (debe seguir siendo componente de cliente)`, () => {
      const texto = leer(ruta);
      expect(
        /export\s+(const\s+metadata|async\s+function\s+generateMetadata|function\s+generateMetadata)/.test(texto),
        `el Hub ya no podría montar esta página en una pestaña: ${ruta} exporta metadata`,
      ).toBe(false);
    });

    it(`${nombre}: no depende de la ruta (sin usePathname/useSearchParams/useRouter)`, () => {
      const texto = leer(ruta);
      expect(
        /\busePathname\b|\buseSearchParams\b|\buseRouter\b/.test(texto),
        `el Hub ya no podría montar esta página en una pestaña: ${ruta} usa hooks de enrutado`,
      ).toBe(false);
    });
  }
});

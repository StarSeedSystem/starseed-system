// @vitest-environment node
// (1106F) El next build no debe depender de Google Fonts: las cinco fuentes viven en src/app/fonts.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const APP = join(process.cwd(), "src", "app");
const layout = readFileSync(join(APP, "layout.tsx"), "utf8");

describe("fuentes locales del layout (1106F)", () => {
  it("no descarga fuentes de Google al compilar", () => {
    expect(layout).not.toMatch(/next\/font\/google/);
    expect(layout).toMatch(/from "next\/font\/local"/);
  });

  it("cada fuente existe en el repo, es woff2 y tiene su licencia", () => {
    const rutas = [...layout.matchAll(/src: "\.\/fonts\/([a-z-]+)-latin\.woff2"/g)].map((m) => m[1]);
    expect(rutas).toEqual(["inter", "roboto", "outfit", "space-grotesk", "source-code-pro"]);
    for (const nombre of rutas) {
      const datos = readFileSync(join(APP, "fonts", `${nombre}-latin.woff2`));
      expect(datos.subarray(0, 4).toString("latin1")).toBe("wOF2");
      expect(datos.length).toBeGreaterThan(10_000);
      expect(readFileSync(join(APP, "fonts", "licencias", `${nombre}-OFL.txt`), "utf8")).toMatch(/SIL OPEN FONT LICENSE/i);
    }
  });

  it("mantiene las cinco variables CSS que usa el tema", () => {
    for (const v of ["--font-inter", "--font-roboto", "--font-outfit", "--font-headline", "--font-code"]) {
      expect(layout).toContain(`variable: "${v}"`);
    }
  });
});

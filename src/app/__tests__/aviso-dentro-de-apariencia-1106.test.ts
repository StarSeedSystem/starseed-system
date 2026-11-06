// @vitest-environment node
// (AVS1106A) La ventana «Hay una versión nueva» usa Dialog y Button (leen la apariencia): debe montarse DENTRO de
// <AppearanceProvider>. Fuera, las apps instaladas morían al abrir con «useAppearance must be used within an
// AppearanceProvider».
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const layout = readFileSync(join(process.cwd(), "src", "app", "layout.tsx"), "utf8");

describe("layout · el aviso de actualización vive dentro de la apariencia", () => {
  it("<AvisoActualizacion /> está entre <AppearanceProvider> y </AppearanceProvider>, una sola vez", () => {
    const abre = layout.indexOf("<AppearanceProvider>");
    const cierra = layout.indexOf("</AppearanceProvider>");
    const aviso = layout.indexOf("<AvisoActualizacion />");
    expect(abre).toBeGreaterThan(-1);
    expect(aviso).toBeGreaterThan(abre);
    expect(aviso).toBeLessThan(cierra);
    expect(layout.split("<AvisoActualizacion />").length - 1).toBe(1);
  });
});

/**
 * Guarda de código (no de render): las etiquetas del mapa 3D viven en el DOM sobre el
 * lienzo, vía drei `Html`, y por defecto drei deja SUS contenedores con
 * `pointer-events: auto`. Medido en un navegador real: una etiqueta de apuntado (la
 * que crece al pasar el ratón) quedaba encima del marcador y se tragaba el clic, y las
 * etiquetas robaban los arrastres de la cámara. Dentro de un lienzo no se puede
 * montar `Html` sin WebGL, así que se vigila que esas tres salvaguardas sigan puestas.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const fuente = readFileSync(path.join(__dirname, "..", "etiqueta-3d.tsx"), "utf8");

describe("Etiqueta3D no captura el puntero", () => {
  it("el contenedor interior de drei ignora el puntero", () => {
    expect(fuente).toContain('pointerEvents="none"');
  });
  it("el contenedor exterior de drei ignora el puntero", () => {
    expect(fuente).toContain('wrapperClass="pointer-events-none"');
  });
  it("el elemento transformado de drei ignora el puntero", () => {
    expect(fuente).toMatch(/SIN_PUNTERO\s*=\s*\{\s*pointerEvents:\s*"none"\s*\}/);
    expect(fuente).toContain("style={SIN_PUNTERO}");
  });
});

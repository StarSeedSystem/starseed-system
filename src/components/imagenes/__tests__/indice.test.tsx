// @vitest-environment jsdom
/**
 * IMG1011J · el punto único `src/components/imagenes/index.ts` reexporta las dos tarjetas
 * (opciones de generación y sugerencias de instalación) sin duplicarlas.
 */
import { describe, expect, it } from "vitest";
import Indice, { SugerenciasInstalacion, TarjetaImagenes } from "../index";

describe("index de las tarjetas de imagen", () => {
  it("exporta la tarjeta por default y por nombre, y las sugerencias", () => {
    expect(typeof Indice).toBe("function");
    expect(Indice).toBe(TarjetaImagenes);
    expect(typeof SugerenciasInstalacion).toBe("function");
  });
});

/**
 * RTAGF1023G · la puerta común de la guía en Node/SSR.
 *
 * `abrirGuia` se llama también desde código que puede ejecutarse en el servidor o en una
 * prueba sin DOM. Allí no hay `window` ni `CustomEvent`: debe devolver `false` y no lanzar,
 * para que ninguna pantalla se rompa por no poder lanzar el evento.
 */
import { describe, expect, it } from "vitest";

import { abrirGuia } from "../guia-acceso";

describe("abrirGuia · sin navegador", () => {
  it("en Node o SSR no lanza ni despacha y devuelve false", () => {
    expect(typeof window).toBe("undefined");
    expect(() => abrirGuia({ desde: "login" })).not.toThrow();
    expect(abrirGuia({ desde: "login" })).toBe(false);
  });
});
